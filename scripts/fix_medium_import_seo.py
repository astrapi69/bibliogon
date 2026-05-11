"""One-time data fix: populate seo_title and seo_description for
Medium-imported articles that landed before commit 2062393.

Background
----------

The importer historically left ``Article.seo_title``,
``Article.seo_description``, and ``Article.excerpt`` untouched.
For the 209-post production import, all three fields were NULL
across every row, even though title and subtitle (the natural
defaults) were already populated.

Commit 2062393 wires the importer to set:

  - seo_title       = article.title (always)
  - seo_description = article.subtitle if present, else NULL

This script applies the same defaults retroactively.

Properties
----------

- **Scoped via ArticleImportSource.** Only Medium-imported rows.
  Native Bibliogon articles are never touched.
- **Idempotency gate.** Per the user's spec: only fill a field
  when its current value is NULL. Manually-edited values are
  preserved. Specifically: ``seo_title`` is filled only when
  NULL; ``seo_description`` is filled only when NULL AND the
  article has a subtitle.
- **Re-running** after a successful apply produces zero changes.
- **Dry-run by default.** ``--apply`` required to write.

Excerpt is **not** populated by this script. User explicitly
deferred that decision (filed as MEDIUM-IMPORT-EXCERPT-AUTOFILL-01
in the backlog). When that ships, run the matching retro-fix
script separately.

Usage
-----

    cat scripts/fix_medium_import_seo.py | \\
        docker compose exec -T backend python -          # dry-run
    cat scripts/fix_medium_import_seo.py | \\
        docker compose exec -T backend python - --apply  # write
"""

from __future__ import annotations

import argparse
import sys

from app.database import SessionLocal
from app.models import Article, ArticleImportSource


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
        seo_title_set = 0
        seo_desc_set = 0
        skipped_no_subtitle = 0
        skipped_both_already_set = 0

        for article in rows:
            examined += 1
            changed = False

            if article.seo_title is None or article.seo_title == "":
                if article.title:
                    if args.apply:
                        article.seo_title = article.title
                    seo_title_set += 1
                    changed = True

            if article.seo_description is None or article.seo_description == "":
                if article.subtitle:
                    if args.apply:
                        article.seo_description = article.subtitle
                    seo_desc_set += 1
                    changed = True
                else:
                    # User asked for strict SEO-D: no body-text
                    # fallback. NULL stays NULL when subtitle is
                    # absent.
                    skipped_no_subtitle += 1

            if not changed:
                skipped_both_already_set += 1

        if args.apply:
            db.commit()
            print("\nApplied. Committed.")
        else:
            print("\nDry-run. Use --apply to write changes to the DB.")
        print(
            f"  Examined: {examined}\n"
            f"  seo_title  filled: {seo_title_set}\n"
            f"  seo_description filled: {seo_desc_set}\n"
            f"  Skipped seo_description (no subtitle in source): {skipped_no_subtitle}\n"
            f"  Skipped (both fields already set, manual curation preserved): {skipped_both_already_set}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
