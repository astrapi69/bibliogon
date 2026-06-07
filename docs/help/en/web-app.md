# Using Bibliogon as a Web App

Bibliogon also runs as a **backendless web app** at
[astrapi69.github.io/bibliogon/](https://astrapi69.github.io/bibliogon/).
There is nothing to install: open the URL in any modern browser and you
can start writing. This build talks to **no server at all** — it boots
from data baked into the page and stores everything you create in your
own browser.

This is different from the desktop app's offline mode (see
[Offline mode and LAN access](offline-lan.md)), which keeps a backend
around and falls back to a local copy only when that backend is
unreachable. The web app never has a backend in the first place.

## What works offline

Almost everything the desktop does:

- Writing prose books, articles, picture-books and comics.
- The Story Bible (characters, settings, items, lore), entity links and
  relationships — see [Story Bible offline](story-bible/offline.md).
- The Storyboard, chapter labels, writing goals and writing history.
- Exporting in the browser to Markdown, HTML, plain text, PDF, EPUB and
  DOCX — see [Browser export](export/browser.md).
- Importing a Medium HTML export.
- Settings, themes and the eight interface languages.

## What needs the desktop app

Four features are genuinely impossible in a browser and are disabled in
the web app, each with a short "requires the desktop app" hint:

- **Pandoc / LaTeX export** (the high-fidelity desktop export pipeline).
- **Git sync and Git backup.**
- **Audiobook generation** (text-to-speech).
- **LAN mode.**

## Where your data lives

Everything you create in the web app is stored **in your browser**, in
its built-in database (IndexedDB). Nothing is uploaded anywhere.

Two consequences worth knowing:

- The data is tied to **this browser on this device**. It does not sync
  to another browser or machine. To move work elsewhere, export it (for
  example as EPUB or DOCX) and re-import.
- Clearing your browser's site data for the page also clears your books.
  If you rely on the web app, export your work regularly.

## Updates and the build version

The web app updates itself: when a new version is published, the service
worker fetches it in the background and the next reload runs the new
build.

To check which build you are on, open **Settings > Über** (About). It
shows the version, the build hash and the build date.

## Clearing a stale Service Worker

Very rarely a cached service worker can get stuck on an old build. If the
app looks broken after an update, force a clean reload:

1. Open your browser's developer tools (F12).
2. Go to **Application > Service Workers** (Chrome/Edge) or
   **Storage > Service Workers** (Firefox).
3. Click **Unregister**, then reload the page.

A normal hard reload (Ctrl+Shift+R) is usually enough; the unregister
step is only for the stubborn cases.
