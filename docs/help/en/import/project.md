# Importing a book project

A book project in the **write-book-template** format arrives as an
archive - usually with a `.bgp` extension, sometimes as a plain `.zip`.
Bibliogon reads it and builds a complete book from it: chapters in the
right order, metadata, and images.

This works in the desktop app **and** in the backendless web app on
GitHub Pages. There, the import runs entirely in the browser; nothing is
uploaded.

## How to use it

1. On the dashboard, click **Import**.
2. Drop the file on the field, or pick it.
3. Under "Detected format" you should see **Book project (.bgp)**.
4. Click **Import**.

Bibliogon then reports how many chapters and images arrived, and the new
book appears on the dashboard.

## What comes along

- **Chapters** from `manuscript/`. The order comes from
  `config/export-settings.yaml` when the project declares a
  `section_order`; otherwise front matter, chapters and back matter are
  each sorted alphabetically.
- **Chapter titles** from the file's first `# ` line. Without one, the
  filename becomes the title (`02-die-rueckkehr.md` becomes "Die
  Rueckkehr").
- **Chapter types** from the filename: `dedication.md` becomes a
  dedication, `epilogue.md` an epilogue, `part-1-intro.md` a part intro.
- **Metadata** from `config/metadata.yaml`: title, subtitle, author,
  language, series, publisher, ISBN and ASIN numbers, keywords,
  descriptions, and custom CSS.
- **Images** from `assets/`. The subfolder decides the kind:
  `assets/covers/` are covers, `assets/figures/` figures,
  `assets/diagrams/` diagrams, `assets/tables/` tables.
- The **cover** from `cover_image` in the metadata - provided the file it
  names is actually in the archive. When it is not, Bibliogon takes the
  first cover image that did arrive, so the reference cannot point at
  nothing.

## What does not

- Files with a `-print` suffix in the name. write-book-template uses
  that for a separate print variant of a chapter; the regular one is
  imported.
- Files in `manuscript/front-matter/` or `back-matter/` whose name does
  not match a known chapter type.
- The project's **git history**. Adopting that needs the desktop app -
  see [Adopt git history](git-adoption.md).

## Related pages

- [Word and EPUB import](office.md)
- [Import from GitHub](github.md)
- [Using Bibliogon as a web app](../web-app.md)
