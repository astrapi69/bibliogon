# Browser export

When Bibliogon runs in the browser without a backend (the
[web app](../web-app.md)), it can still export your work — entirely
client-side, with no server and no Pandoc. Six formats are available:

- **Markdown** (`.md`)
- **HTML** (`.html`)
- **Plain text** (`.txt`)
- **PDF** (`.pdf`)
- **EPUB** (`.epub`)
- **DOCX** (`.docx`)

## Exporting a book or article

1. Open the book or article and go to its export page (the export button
   lives in the editor sidebar / toolbar).
2. Choose a format.
3. Export. The file is generated in your browser and downloaded straight
   to your device.

## The Export-Engine setting

**Settings > Verhalten** (Behaviour) has an **Export engine** option with
three choices:

- **Auto** (default) — use the backend pipeline when a backend is
  available, otherwise fall back to the in-browser export.
- **Client** — always export in the browser, even on the desktop.
- **Backend** — always use the backend pipeline (desktop only; the web
  app has no backend, so this falls back to client export there).

## Browser export vs. Pandoc export

The desktop app's export pipeline runs **Pandoc / manuscripta**, which
produces the highest-fidelity output — full template control, advanced
PDF/LaTeX typesetting, and the write-book-template project structure.

The browser export is a self-contained, dependency-free alternative for
the backendless build. It covers the same six formats and is ideal for
quick exports and for working entirely offline. For production-grade
print PDFs and the full template pipeline, use the desktop app with the
backend engine — see [EPUB](epub.md) and [PDF](pdf.md).
