"""One-time data fix: re-walk Medium-imported articles whose
codeBlock text content was collapsed by the pre-fix walker.

Background
----------

Until commit ed4b8ae the walker called BeautifulSoup's
``get_text()`` on each ``<pre>`` element. BeautifulSoup silently
strips ``<br>`` tags, which is how Medium encodes line breaks
inside ``<pre>`` blocks. Result: every multi-line code block
imported before that fix collapsed to a single line in the
TipTap ``codeBlock`` node's text content.

Fix shipped in walker.py's ``_extract_pre_text()`` walks the
descendants explicitly and emits ``\\n`` per ``<br>`` tag.
Fresh imports under the patched walker are correct (verified
end-to-end: 48/48 code blocks in the user's reference post
preserve their original newline counts after import + Markdown
export).

This script re-walks the source HTML for each Medium-imported
article and replaces ``content_json`` ONLY when the re-walk
produces MORE newlines inside codeBlock nodes than the current
content carries. Articles with no code blocks, or code blocks
that were always single-line, are no-ops.

Properties
----------

- **Scoped via ArticleImportSource.** Only Medium-imported rows
  are read or written. Native Bibliogon articles are never
  touched.
- **Specific gate.** Re-walk wins only when the new doc's
  total-newline-count-across-codeBlock-nodes is STRICTLY
  GREATER than the existing doc's. Articles whose code blocks
  were already multi-line (e.g. content imported AFTER ed4b8ae,
  or articles with zero code blocks) fall through cleanly.
  This is a tighter materiality test than the truncation
  fix's word-count gate because the bug only manifests inside
  one node type and word count is dominated by prose.
- **Image URL preservation.** Already-downloaded images keep
  their local ``/api/articles/.../assets/file/...`` URLs. Same
  reconciliation logic as the truncation-fix script.
- **Idempotent.** Re-running after a successful apply produces
  zero changes (recovered articles' newline-count already
  matches the re-walk's output).
- **Dry-run by default.** ``--apply`` required to write.

Requires the user's original Medium archive on disk. Pass the
path to the archive's ``posts/`` directory via ``--archive-dir``.

Usage
-----

    cat scripts/fix_medium_import_codeblocks.py | \\
        docker compose exec -T backend python - \\
        --archive-dir /home/<you>/Downloads/medium-export-XYZ/posts

    cat scripts/fix_medium_import_codeblocks.py | \\
        docker compose exec -T backend python - \\
        --archive-dir /home/<you>/Downloads/medium-export-XYZ/posts \\
        --apply

Inside the container the user's home dir typically isn't
mounted; run with the path the BACKEND can reach. If running
this on the host directly (without docker exec), point at the
real on-host path.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from app.database import SessionLocal
from app.models import Article, ArticleAsset, ArticleImportSource


def _total_codeblock_newlines(content_json_or_doc: str | dict | None) -> int:
    """Sum of ``\\n`` characters across every codeBlock node's text
    content. Returns 0 for None / unparseable / no-codeBlocks.
    """
    if not content_json_or_doc:
        return 0
    try:
        doc = (
            json.loads(content_json_or_doc)
            if isinstance(content_json_or_doc, str)
            else content_json_or_doc
        )
    except json.JSONDecodeError:
        return 0
    total = 0

    def _walk(n: Any) -> None:
        nonlocal total
        if isinstance(n, dict):
            if n.get("type") == "codeBlock":
                for child in n.get("content", []) or []:
                    if isinstance(child, dict) and child.get("type") == "text":
                        total += str(child.get("text", "")).count("\n")
            for c in n.get("content", []) or []:
                _walk(c)

    _walk(doc)
    return total


def _reconcile_image_urls(
    content_doc: dict[str, Any],
    images: list,
    article_id: str,
    db,
) -> dict[str, Any]:
    """Look up ArticleAsset rows for this article and rewrite any
    imageFigure node whose CDN URL maps to an already-downloaded
    local file. Mirrors the same helper in
    ``fix_medium_import_truncation.py`` — extracted-shape candidate
    if a 3rd retro-fix lands.
    """
    from bibliogon_medium_import.image_downloader import filename_for

    existing = {
        row.filename
        for row in db.query(ArticleAsset).filter(ArticleAsset.article_id == article_id).all()
    }
    if not existing:
        return content_doc

    rewrites: dict[str, str] = {}
    for image in images:
        if not image.src or not image.src.startswith("https://cdn-images-1.medium.com/"):
            continue
        target = filename_for(image)
        if target in existing:
            rewrites[image.src] = (
                f"/api/articles/{article_id}/assets/file/{target}"
            )

    if not rewrites:
        return content_doc

    def _walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") in ("imageFigure", "image"):
            attrs = node.get("attrs") or {}
            src = attrs.get("src")
            if isinstance(src, str) and src in rewrites:
                attrs["src"] = rewrites[src]
        for child in node.get("content", []) or []:
            _walk(child)

    _walk(content_doc)
    return content_doc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive-dir",
        required=True,
        help="Path to the Medium archive's posts/ directory "
        "(e.g. ~/Downloads/medium-export-XYZ/posts).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write rewritten content_json back to the DB. "
        "Without this flag the script reports counts only.",
    )
    args = parser.parse_args()

    archive = Path(args.archive_dir).expanduser().resolve()
    if not archive.is_dir():
        print(f"ERROR: --archive-dir {archive} is not a directory", file=sys.stderr)
        return 2

    from bibliogon_medium_import.walker import MediumWalker

    db = SessionLocal()
    try:
        rows = (
            db.query(Article, ArticleImportSource)
            .join(ArticleImportSource, ArticleImportSource.article_id == Article.id)
            .all()
        )
        examined = 0
        skipped_no_source = 0
        skipped_no_gain = 0
        skipped_unparseable_metadata = 0
        rewrote = 0
        total_newlines_recovered = 0

        for article, src in rows:
            examined += 1
            if not src.import_metadata:
                skipped_unparseable_metadata += 1
                continue
            try:
                metadata = json.loads(src.import_metadata)
            except json.JSONDecodeError:
                skipped_unparseable_metadata += 1
                continue
            fname = metadata.get("source_filename")
            if not fname:
                skipped_no_source += 1
                continue
            html_path = archive / fname
            if not html_path.is_file():
                skipped_no_source += 1
                continue

            old_nl = _total_codeblock_newlines(article.content_json)
            html = html_path.read_text(encoding="utf-8")
            walker = MediumWalker()
            parsed = walker.parse(html)
            new_doc = parsed.content_doc
            new_nl = _total_codeblock_newlines(new_doc)

            # Gate: only rewrite when the re-walk produces strictly
            # more newlines. Catches the exact bug class (collapsed
            # code blocks) without disturbing articles whose code
            # blocks are already correct OR articles with zero code.
            if new_nl <= old_nl:
                skipped_no_gain += 1
                continue

            new_doc = _reconcile_image_urls(
                new_doc, parsed.images, article.id, db
            )
            rewrote += 1
            total_newlines_recovered += new_nl - old_nl
            if args.apply:
                article.content_json = json.dumps(new_doc, ensure_ascii=False)

        if args.apply:
            db.commit()
            print(f"\nApplied. Re-walked {rewrote} article(s); committed.")
        else:
            print(
                f"\nDry-run. Use --apply to write {rewrote} change(s) to the DB."
            )
        print(
            f"  Examined: {examined}\n"
            f"  Re-walked (codeBlock newline gain): {rewrote}\n"
            f"  Newlines recovered total: {total_newlines_recovered}\n"
            f"  Skipped (no newline gain — already correct or no code blocks): {skipped_no_gain}\n"
            f"  Skipped (source HTML not in archive dir): {skipped_no_source}\n"
            f"  Skipped (provenance metadata unparseable): {skipped_unparseable_metadata}"
        )
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
