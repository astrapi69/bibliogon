# bibliogon-plugin-medium-import

Imports a Medium HTML export archive (the ZIP from
Medium → Settings → "Download your information") into Bibliogon
as Articles, one Publication per imported post (platform=medium),
and an `ArticleImportSource` row for provenance.

## What it does

- Reads the `posts/` folder from a Medium export ZIP
- Parses each `.html` post with BeautifulSoup
- Extracts title, subtitle, canonical URL, publish date, body
- Walks the body's `graf--*` elements into TipTap JSON
- Downloads `cdn-images-1.medium.com` images locally as
  `ArticleAsset`s (default on; configurable)
- Skips posts whose canonical URL already exists on an Article
- Records provenance in `ArticleImportSource` so re-imports
  detect duplicates

## What it does NOT do (deferred to v2)

- Dry-run preview UI
- Selective import (use the post-import archive flow on
  unwanted articles)
- AI tag inference (Medium's HTML export strips tags;
  imported articles get an empty tag list)

## Source format

`medium_html_export` - the per-post HTML files Medium produces
under `posts/` in the export ZIP. Per the audit of 209 real
posts, the structure is templated and reliable across all years
2020-2026.

## Design notes

See [docs/medium-import/](../../docs/medium-import/) for the
audit and design rationale.
