# Import from a Medium archive

Bibliogon can import a Medium HTML export ZIP and produce one
Article + one Publication entry per post, with provenance
recorded so re-imports detect duplicates.

## How to get the export from Medium

1. Sign in to [medium.com](https://medium.com).
2. Open **Settings** → **Account** → **Download your information**.
3. Click **Download .zip**. Medium sends an email with a download
   link; the archive arrives within a few minutes.
4. Save the ZIP locally. You do not need to extract it.

## How to import in Bibliogon

1. Open **Settings** → **Plugins** → **Medium Import**.
2. Drop the ZIP into the upload field, or click **Choose file**
   and select it.
3. Click **Import**.

Bibliogon walks every `posts/*.html` file in the archive and
produces, per post:

- One **Article** with the original title, subtitle, language
  (defaults to English; change per article afterwards), TipTap
  body content, and `status = published`.
- One **Publication** entry on the **Medium** platform, with the
  canonical URL recorded and the original publish date preserved.
- One **Article import source** row that tracks where the article
  came from. Re-imports of the same archive recognise existing
  articles by canonical URL and skip them.

## What gets imported

- Title, subtitle, author name, and publish date.
- Body content: paragraphs, headings (H2 / H3 / H4),
  blockquotes, code blocks (with language), bullet and numbered
  lists, inline bold / italic / inline-code / links.
- Figure images: by default each image is downloaded to local
  storage so the article continues to work even if Medium's CDN
  changes the URL. Captions become image titles.

## What is NOT imported (Medium does not include it)

- **Tags**: Medium strips tags from the HTML export. Imported
  articles land with an empty tag list; add them manually
  afterwards.
- **Drafts**: only published Medium posts appear in the export.
- **Reading time, claps, response counts**: these are platform
  metrics, not content.
- **Publication membership**: posts that lived under a Medium
  publication keep the canonical URL of the publication, but
  the publication name is not recorded as a separate field.

## What if I import the same archive twice

Articles whose canonical URL already exists on a Bibliogon
Article are **skipped** on the second import. The summary at
the end of the run lists every skipped post with the existing
article's id so you can find the duplicate.

## What if a post fails to import

The summary lists every failed post with the source filename
and the error message. The other posts continue importing
normally; one bad post never aborts the batch.

## After the import

The imported articles appear in your **Dashboard** like any
manually-authored article. Common follow-ups:

- **Archive unwanted articles**: select them in the dashboard
  and use **Move to trash**. Originally-Medium articles you do
  not want to keep in Bibliogon (drafts you never published
  there, abandoned posts) can be cleaned up after the import.
- **Add tags**: Medium did not include them; add them per
  article in the editor.
- **Adjust language**: defaults to English. Change German /
  Spanish / etc. articles in the editor's metadata panel.
- **Verify cross-posts**: the Publication entry tracks the
  Medium URL. If you cross-publish the same article on Substack
  or your own blog later, add a second Publication on that
  platform.

## Limitations

- Sequential processing: a 200-post archive takes a few minutes
  while images download.
- Image downloads can fail silently for individual images
  (network glitches, removed files). Any per-image failure is
  recorded as a warning on the article's provenance record but
  does not abort the import.
- Selective import (picking specific posts before the import
  runs) is **not** part of the v1 importer. Import everything
  and archive what you do not want afterwards.
