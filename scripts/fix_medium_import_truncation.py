"""One-time data fix: re-walk Medium-imported articles whose
``content_json`` was truncated by the pre-fix walker.

Background
----------

Until commit ce9665e the walker called ``section.find("div",
class_="section-inner")`` and got back only the FIRST inner div
of each ``<section class="section--body">``. Medium's standard
header-image layout puts THREE inner divs per section (title,
image lane, main body), so the entire main body of every such
section was silently dropped. 117 of the 209-post production
import (56%) lost content; 9 imported with literally zero text.

Fix shipped in walker.py iterates ``find_all`` instead. This
script re-walks the source HTML for each affected article and
overwrites ``content_json``.

Properties
----------

- **Scoped via ArticleImportSource.** Only Medium-imported rows
  are read or written. Native Bibliogon articles are never
  touched.
- **Materiality gate.** A re-walk that produces content less
  than 2x the existing word count AND fewer than 100 additional
  words is treated as a no-op (existing content is fine; the
  walker recovered the same text or trivially more).
- **Image URL preservation.** Already-downloaded images keep
  their local ``/api/articles/.../assets/file/...`` URLs. The
  script reconciles new ``ImageRef`` lookups against the
  ``ArticleAsset`` table and rewrites local URLs in place.
  Newly-recovered images that were never downloaded stay as
  CDN URLs (deliberate; the user can re-trigger image download
  separately if they care).
- **Idempotent.** Re-running after a successful apply produces
  zero changes (recovered articles no longer trip the
  materiality gate).
- **Dry-run by default.** ``--apply`` required to write.

Requires the user's original Medium archive on disk. Pass the
path to the archive's ``posts/`` directory via ``--archive-dir``.

Usage
-----

    cat scripts/fix_medium_import_truncation.py | \\
        docker compose exec -T backend python - \\
        --archive-dir /home/<you>/Downloads/medium-export-XYZ/posts

    cat scripts/fix_medium_import_truncation.py | \\
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


def _word_count(content_json: str | None) -> int:
    if not content_json:
        return 0
    try:
        doc = json.loads(content_json) if isinstance(content_json, str) else content_json
    except json.JSONDecodeError:
        return 0
    bits: list[str] = []

    def _walk(n: Any) -> None:
        if isinstance(n, dict):
            if n.get("type") == "text":
                bits.append(str(n.get("text", "")))
            for c in n.get("content", []) or []:
                _walk(c)

    _walk(doc)
    return len(" ".join(bits).split())


def _reconcile_image_urls(
    content_doc: dict[str, Any],
    images: list,
    article_id: str,
    db,
) -> dict[str, Any]:
    """Look up ArticleAsset rows for this article and rewrite any
    imageFigure node whose CDN URL maps to an already-downloaded
    local file.

    Walker emits CDN URLs in the freshly-walked doc. For images
    the original import did download (those landed in the small
    non-truncated portion), we want to preserve the local URL
    instead of regressing to CDN.
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

    # Lazy import the walker so the script can be parsed even when
    # the plugin path isn't on sys.path (it is via the backend
    # path-dep, but defensive).
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
        skipped_not_material = 0
        skipped_unparseable_metadata = 0
        rewrote = 0

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

            old_words = _word_count(article.content_json)
            html = html_path.read_text(encoding="utf-8")
            walker = MediumWalker()
            parsed = walker.parse(html)
            new_doc = parsed.content_doc
            new_words = _word_count(json.dumps(new_doc))

            # Materiality gate: skip if the recovery isn't substantial.
            # Article is "fine" if either the new content is less than
            # 2x the old word count OR adds fewer than 100 words.
            gain = new_words - old_words
            if old_words > 0 and (new_words < old_words * 2 and gain < 100):
                skipped_not_material += 1
                continue

            new_doc = _reconcile_image_urls(
                new_doc, parsed.images, article.id, db
            )
            rewrote += 1
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
            f"  Re-walked (material content gain): {rewrote}\n"
            f"  Skipped (existing content already fine): {skipped_not_material}\n"
            f"  Skipped (source HTML not in archive dir): {skipped_no_source}\n"
            f"  Skipped (provenance metadata unparseable): {skipped_unparseable_metadata}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
