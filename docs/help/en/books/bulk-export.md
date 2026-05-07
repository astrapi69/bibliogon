# Bulk book export

The Books dashboard exports multiple books in one operation. Pick the books, pick a format, and click Export. You get a single ZIP containing one rendered file per book.

## When to use it

- A series with several volumes you want to ship together to a publisher or backup target.
- Migrating a catalog to another platform.
- Cutting an annual archive of every published book in your library.

For a single book, the per-book Export action in the editor is faster.

## Selecting books

- Each tile shows a checkbox. Click to select.
- The "Select all" checkbox at the top selects every book currently visible after filters — not every book in the database.
- Selecting more than 50 shows a soft warning ("may take a while"). Selecting more than 200 disables the Export button (server limit).

## Output mode

After selecting books, the bulk action bar shows:

- **Format**: EPUB, PDF, DOCX. Three formats — narrower than articles (which adds Markdown and HTML) because each book goes through the full manuscripta + write-book-template scaffolding pipeline that needs a real document target.
- **Output**: ZIP archive of individual files. There is no combined-document mode for books — see "What does not happen" below.

### ZIP archive

One file per book in the chosen format, packed as a ZIP. Filename pattern is `<slug>.<ext>` (e.g. `cosmos-introduction.epub`). When two books share a slug, the second gets `-2`, the third `-3`, and so on.

Cover ZIP filename: `books-YYYY-MM-DD.zip`. The date stamp lets you sort multiple bulk exports without renaming.

## Limits and behaviour

- **Hard server limit**: 200 books per export. The Export button is disabled past 200 (Pydantic `max_length` validation returns 422).
- **Soft warning at 50**: a non-blocking note about wait time. Each book runs the full scaffold + Pandoc pipeline, so a 50-book selection can run for several minutes.
- **Per-book error fails loud**: if Pandoc fails on any book in the selection, the entire request returns 502 with the offending book's title in the error detail. Fix the book (or unselect it) and try again.
- **Unknown book ID returns 404** with the offending ID in the message.

## What does not happen

- **No combined-document mode.** Books bulk export ships ZIP-only by design. Merging N books into one EPUB / PDF would have to decide whose metadata wins, which book contributes the cover, what the table of contents looks like — none of which is a natural author workflow. If your use case really needs a combined book, file a backlog request and we will revisit.
- No bulk delete, bulk publish, or bulk genre reassignment. Bulk export is the only multi-book operation today.
- No drag-drop ordering inside an export dialog. The order of files in the ZIP follows the order of book IDs in the request, which is the dashboard's current sort order.
- No per-book format override. All selected books export to the same format.

## Tips

- Sort the dashboard by date descending (the default) and select the top N books for a "recent releases" archive.
- Filter by genre, click "Select all", export EPUB ZIP for a genre-batch upload to a distributor.
- Filter by language, then "Select all", then PDF ZIP if you want a paginated archive of every book in one language.

> Last verified for v0.29.0 (2026-05-07).
