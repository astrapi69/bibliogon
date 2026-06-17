# Import from a URL

Bibliogon can import a single Markdown, HTML or text file from any
public address. The import runs entirely in the browser and works
online as well as in the web app.

## How to use it

1. Open the import dialog (the **Import** button).
2. Switch to the **From URL** tab.
3. Paste the file address, e.g.
   `https://example.com/document.md`.
4. Click **Import**.

Bibliogon fetches the file, detects its format and creates a new
book with one chapter from it.

## CORS note

The fetch happens directly from the browser, so the target site
must allow it via the appropriate CORS headers. If the fetch
fails, the page is likely blocking cross-origin access — in that
case download the file and import it through the **File** tab.

## Offline

URL import needs an internet connection. With no network the tab
is disabled.

## Related topics

- [Import from GitHub](github.md) — several files from a
  repository.
