# Import from a Medium archive

Bibliogon imports a Medium HTML export ZIP and produces one
**Article** + one **Publication** entry + one provenance record
per post.

## Step 1 - Get the export from Medium

1. Sign in to [medium.com](https://medium.com).
2. Open **Settings** → **Account** → **Download your information**.
3. Click **Download .zip**. Medium emails you a download link
   within a few minutes.
4. Save the ZIP locally. Do **not** extract it.

## Step 2 - Confirm Bibliogon is up

The plugin runs in the backend. Before importing, check that the
backend started cleanly. Look for these log lines:

```
INFO  app.main: Plugin discovery: 11 entry points found via 'bibliogon.plugins' group: ..., medium-import, ...
INFO  app.main: Plugins enabled in config (11): ..., medium-import
INFO  app.main: Plugins loaded (11/11 enabled): ..., medium-import, ...
```

If the third line shows fewer plugins loaded than enabled, or if
you see `WARNING: Plugins enabled in config but not loaded`, see
**Troubleshooting** below.

## Step 3 - Run the import

The bulk-import API takes a single `multipart/form-data` POST. The
in-app Settings UI is planned for v2 (see backlog
`MEDIUM-IMPORT-V2-01`); for now run it from a shell with `curl`:

```bash
curl -X POST http://localhost:7880/api/medium-import/import \
  -F "file=@medium-export.zip" \
  | jq .
```

Replace `localhost:7880` with your Bibliogon URL. The response is a
JSON summary like:

```json
{
  "imported_count": 207,
  "skipped_count": 1,
  "errored_count": 1,
  "imported": [
    { "id": "abc123", "title": "Migrate a maven project to Gradle",
      "canonical_url": "https://medium.com/@.../...",
      "warnings": [] },
    ...
  ],
  "skipped": [
    { "filename": "2024-...", "canonical_url": "...",
      "existing_article_id": "..." }
  ],
  "errored": [
    { "filename": "2025-...html", "error": "post has no canonical URL; cannot dedup or track" }
  ]
}
```

Imports run sequentially; expect a few minutes for a 200-post
archive while images download.

## What gets imported

| Field | Source |
|---|---|
| `title` | `<h1 class="p-name">` |
| `subtitle` | `<section data-field="subtitle">` |
| `author` | `<a class="p-author">` |
| `published_at` | `<time class="dt-published">` `datetime` |
| `canonical_url` | `<a class="p-canonical">` `href` |
| `content_json` (TipTap) | walked from `<section data-field="body">` |
| Image assets | every `<figure>` -> downloaded locally to `ArticleAsset` |
| Provenance | `ArticleImportSource` row with `source_type=medium`, `format_name=medium_html_export` |
| Status | `published` (Medium posts are by definition live) |
| Language | defaults to `en` (change per article afterwards) |
| Tags | empty list (Medium strips tags from the HTML export) |

## What is NOT imported

| Missing | Why |
|---|---|
| Tags | Medium does not include them in the HTML export |
| Drafts | only published posts are in the export |
| Reading time / claps / response counts | platform metrics, not content |
| Publication membership name | not in the HTML; the canonical URL still encodes the slug |

## Step 4 - After the import

The imported articles appear in your dashboard like any other
article. Common follow-ups:

- **Archive unwanted articles.** Select them in the dashboard and
  use **Move to trash**. Old / abandoned posts you do not want to
  keep in Bibliogon get cleaned up here.
- **Add tags.** Medium did not include them; add them per article
  in the editor.
- **Adjust language.** Change non-English articles in the editor's
  metadata panel.
- **Verify cross-posts.** The Publication entry tracks the Medium
  URL. If you cross-publish on Substack or your own blog later,
  add a second Publication on that platform.

## Re-import safety

- Articles whose canonical URL already exists on a Bibliogon
  Article are **skipped** on the second import. The summary lists
  every skipped post with the existing article's id.
- Articles in the trash are still considered "existing" for dedup
  purposes - if you trashed an imported article and run the
  archive again, that post stays in the trash and is reported as
  skipped.
- Per-post failures are recorded in the summary's `errored` list
  but do **not** abort the batch.

## Troubleshooting

### "Plugin enabled in config but not loaded"

The startup log shows a WARNING with this exact wording followed
by the rebuild hint. Cause: the plugin is in
`backend/config/app.yaml` under `plugins.enabled` but its package
is not installed in the running Python environment. Fix:

- **Docker**: rebuild the image (`docker compose build` then
  `docker compose up`). A `docker compose restart` reuses the old
  image and does not pick up new path-deps.
- **`make dev`** (local Poetry venv): run `poetry install` in
  `backend/` to refresh the path-dep editable install.

### Every endpoint returns HTTP 502

The backend process is not running. The frontend is reaching the
proxy fine, but the proxy cannot connect to the backend. Inspect
the backend container logs (`docker logs <backend-container>
--tail 200`) or your `make dev` terminal for the traceback that
killed startup.

### "Config file not found, using empty defaults"

Single DEBUG line at startup naming the missing YAML. The plugin
still loads, but its user-visible settings (image download, default
status, etc.) are silently replaced by in-code defaults. Fix: the
file must live at `backend/config/plugins/{plugin_slug}.yaml`, not
inside the plugin's own directory.

### A specific post fails to import

Look in the response's `errored` list for the source filename and
the error message. The most common cause is "post has no canonical
URL", which means the HTML doesn't carry a `<a class="p-canonical">`
link - rare in real Medium exports but possible for very old
posts.

## Limitations (v1)

- Sequential processing. A 200-post archive takes a few minutes
  while images download.
- Image-download failures are silent at the per-image level
  (recorded in the article's `conversion_warnings` provenance
  field, not surfaced in the response).
- No selective-import UI. Import everything; archive what you
  do not want afterwards. The dry-run preview lands in v2.
- No AI-driven tag inference. Tags are empty by default; this is
  on the v2 roadmap.
