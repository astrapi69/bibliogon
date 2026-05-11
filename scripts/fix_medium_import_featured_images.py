"""One-time retro-fix: set ``Article.featured_image_url`` for
Medium-imported articles that were imported before the
``set_first_image_as_featured`` feature shipped (2026-05-09).

Articles imported before today's feature went out have
``featured_image_url IS NULL`` even when the body contains
images. This script walks each Medium-imported article, looks
for the first ``imageFigure`` node in ``content_json``, and
sets ``featured_image_url`` from that node's ``attrs.src``.

Scope:

- **Medium-imports only.** Filters via ``ArticleImportSource``;
  native Bibliogon articles are never read or written.
- **Skips articles with featured_image_url already set.** Will
  never overwrite a value the user manually curated.
- **Idempotent.** Re-running after a successful apply skips
  every row (because they all now have a value).
- **Dry-run by default.** ``--apply`` required to commit.

Pure stdlib + SQLAlchemy ORM (already a backend dependency); no
additional deps. Uses ``json.loads`` + recursive walk so the
extraction is targeted at imageFigure nodes specifically and
cannot mistake some other node's ``attrs.src`` for the
featured image.

Usage (Docker dev environment — script lives outside the
backend container's mount, so pipe via stdin):

    cat scripts/fix_medium_import_featured_images.py | \
        docker compose exec -T backend python -          # dry-run
    cat scripts/fix_medium_import_featured_images.py | \
        docker compose exec -T backend python - --apply  # write
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from app.database import SessionLocal
from app.models import Article, ArticleImportSource


def _first_image_src(doc: Any) -> str | None:
    """Return the ``attrs.src`` of the first ``imageFigure`` node
    found in the doc (depth-first, document order). None if the
    doc is unparseable or has no imageFigure nodes.
    """
    if not isinstance(doc, dict):
        return None
    if doc.get("type") == "imageFigure":
        attrs = doc.get("attrs") or {}
        src = attrs.get("src")
        if isinstance(src, str) and src.strip():
            return src
    for child in doc.get("content", []) or []:
        result = _first_image_src(child)
        if result is not None:
            return result
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write featured_image_url back to the DB. Without "
        "this flag the script reports counts only.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = (
            db.query(Article)
            .join(ArticleImportSource, ArticleImportSource.article_id == Article.id)
            .all()
        )
        examined = 0
        already_set = 0
        no_images = 0
        unparseable = 0
        rewrote = 0

        for article in rows:
            examined += 1
            if article.featured_image_url:
                already_set += 1
                continue
            raw = article.content_json
            if not raw:
                no_images += 1
                continue
            try:
                doc = json.loads(raw) if isinstance(raw, str) else raw
            except json.JSONDecodeError as exc:
                print(
                    f"  SKIP {article.id} ({article.title!r}): "
                    f"content_json is not valid JSON ({exc})",
                    file=sys.stderr,
                )
                unparseable += 1
                continue
            src = _first_image_src(doc)
            if src is None:
                no_images += 1
                continue
            rewrote += 1
            if args.apply:
                article.featured_image_url = src

        if args.apply:
            db.commit()
            print(f"\nApplied. Set featured_image_url on {rewrote} article(s); committed.")
        else:
            print(
                f"\nDry-run. Use --apply to write {rewrote} change(s) to the DB."
            )
        print(
            f"  Examined: {examined}\n"
            f"  Would set featured_image_url: {rewrote}\n"
            f"  Skipped (already set, manual curation preserved): {already_set}\n"
            f"  Skipped (no imageFigure node in body): {no_images}\n"
            f"  Skipped (content_json unparseable): {unparseable}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
