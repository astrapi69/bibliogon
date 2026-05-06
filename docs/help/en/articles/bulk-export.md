# Bulk article export

The Articles dashboard exports multiple articles in one operation. Pick the articles, pick a format, pick whether you want a ZIP of individual files or one combined document, and click Export.

## When to use it

- An umbrella series with several constituent articles you want to ship together.
- Migrating a topic to another platform that prefers one document over many.
- Building a long-form anthology PDF of a year's posts.

For a single article, the per-article Export action in the row menu is faster.

## Selecting articles

- Each tile (grid view) and each row (list view) shows a checkbox. Click to select.
- The "Select all" checkbox at the top selects every article currently visible after filters - not every article in the database.
- Selecting more than 50 shows a soft warning ("may take a while"). Selecting more than 200 disables the Export button (server limit).

## Filtering

The dashboard filter quartet is **status**, **topic**, **series**, and **tag**. Filters compose with AND - each one narrows the result further.

- **Status**: draft / ready / published / archived (button row).
- **Topic**: dropdown populated from the topics in your articles (settings-managed under Settings > Topics).
- **Series**: dropdown populated from each distinct series name in your articles. Series is a flat free-string today; nested sub-series is a future feature.
- **Tag**: dropdown populated from each distinct tag in your articles. The filter checks list membership (an article tagged "python" matches; one tagged "pythonista" does not).

Filter state syncs to the URL so you can bookmark or share a filtered view. Selection itself does NOT sync to the URL - it's per-session.

## Output modes

After selecting articles, the bulk action bar shows:

- **Format**: Markdown, HTML, PDF, DOCX. Same four formats the per-article export supports.
- **Output**: ZIP archive vs Combined document.

### ZIP archive

One file per article in the chosen format, packed as a ZIP. Filename pattern is `<slug>.<ext>` (e.g. `cosmos-introduction.md`). When two articles share a slug, the second gets `-2`, the third `-3`, and so on.

Cover ZIP filename: `articles-YYYY-MM-DD.zip`.

### Combined document

All articles concatenated into one file:

- **Markdown**: `## <Title>` heading per article, articles separated by `---`. No per-article frontmatter.
- **HTML**: standalone HTML with a table of contents and id-anchored sections, suitable for opening in a browser.
- **PDF**: each article becomes a chapter, auto-generated TOC, pandoc + xelatex.
- **DOCX**: each article is a top-level heading, auto-generated TOC.

Article order in the combined document is the order shown on screen (the dashboard's current sort order).

## Limits and behaviour

- **Hard server limit**: 200 articles per export. The Export button is disabled past 200.
- **Soft warning at 50**: a non-blocking note about wait time.
- **Combined-export timeout**: 180 seconds. If a combined PDF needs longer (very large selection, many embedded images), reduce the selection or split into smaller batches.
- **Unreachable images fail loud**: if any selected article references a broken image URL, the combined Pandoc step fails and the error message names which article. Fix the image (or unselect the article) and try again.

## What does not happen

- No bulk delete, bulk publish, or bulk tag. Bulk export is the only multi-article operation today.
- No drag-drop ordering inside an export dialog. The order is the dashboard's current sort order.
- No per-article format override. All selected articles export to the same format.

## Tips

- Sort the dashboard by date descending (the default) and select the top N articles for a "recent posts" anthology.
- Filter by series, click "Select all", export combined PDF for a series collection.
- Filter by tag, then "Select all", then ZIP markdown if you want to feed the result into another tool.
