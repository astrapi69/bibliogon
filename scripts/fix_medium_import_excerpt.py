"""One-time data fix: populate ``Article.excerpt`` for Medium-
imported articles that landed before the importer's excerpt
autofill landed.

Background
----------

The importer historically left ``Article.excerpt`` untouched. The
companion SEO retro-fix (``fix_medium_import_seo.py``,
commit d195ab4) explicitly deferred excerpt as separate scope
(filed as MEDIUM-IMPORT-EXCERPT-AUTOFILL-01). This script ships the
matching retro-fix.

The importer change in the same MEDIUM-IMPORT-EXCERPT-AUTOFILL-01
commit fills excerpt for FUTURE imports as:

  - excerpt = subtitle (when present)
  - excerpt = body-text-slice (max 300 chars, sentence-boundary
    preferred) when no subtitle but the post has body text
  - excerpt = NULL when the doc has no extractable body text

This script applies the same defaults retroactively.

Properties
----------

- **Scoped via ArticleImportSource.** Only Medium-imported rows.
  Native Bibliogon articles are never touched.
- **Idempotency gate.** Only fill ``excerpt`` when the current
  value is NULL or empty. Manually-edited values are preserved.
- **Re-running** after a successful apply produces zero changes.
- **Dry-run by default.** ``--apply`` required to write.
- **No seo_description side-effect.** This script does NOT touch
  seo_description; the SEO-D precedent (strict-NULL when no
  subtitle) stays intact.

Usage
-----

    cat scripts/fix_medium_import_excerpt.py | \\
        docker compose exec -T backend python -          # dry-run
    cat scripts/fix_medium_import_excerpt.py | \\
        docker compose exec -T backend python - --apply  # write
"""

from __future__ import annotations

import argparse
import json
import sys

from app.database import SessionLocal
from app.models import Article, ArticleImportSource
from bibliogon_medium_import.importer import _body_text_excerpt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write defaults back to the DB. Without this flag "
        "the script reports counts only.",
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
        excerpt_from_subtitle = 0
        excerpt_from_body = 0
        skipped_already_set = 0
        skipped_no_source = 0

        for article in rows:
            examined += 1

            already_filled = article.excerpt is not None and article.excerpt != ""
            if already_filled:
                skipped_already_set += 1
                continue

            new_excerpt: str | None = None
            source: str = ""
            if article.subtitle:
                new_excerpt = article.subtitle
                source = "subtitle"
            else:
                try:
                    parsed = json.loads(article.content_json or "{}")
                except (json.JSONDecodeError, TypeError):
                    parsed = {}
                if isinstance(parsed, dict):
                    new_excerpt = _body_text_excerpt(parsed)
                if new_excerpt:
                    source = "body"

            if not new_excerpt:
                skipped_no_source += 1
                continue

            if args.apply:
                article.excerpt = new_excerpt
            if source == "subtitle":
                excerpt_from_subtitle += 1
            else:
                excerpt_from_body += 1

        if args.apply:
            db.commit()
            print("\nApplied. Committed.")
        else:
            print("\nDry-run. Use --apply to write changes to the DB.")
        print(
            f"  Examined: {examined}\n"
            f"  excerpt filled from subtitle: {excerpt_from_subtitle}\n"
            f"  excerpt filled from body-text slice: {excerpt_from_body}\n"
            f"  Skipped (excerpt already set, manual curation preserved): "
            f"{skipped_already_set}\n"
            f"  Skipped (no subtitle AND no extractable body): {skipped_no_source}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
