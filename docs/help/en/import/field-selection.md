# Field selection in the import wizard

From v0.22 the import wizard lets you see and configure every
Book metadata field before you commit the import. Three-step
flow:

## Step 1: Source

Drop a file, pick a folder, or paste a git URL. Same as
before.

## Step 2: Summary

After detection finishes, the wizard shows a short overview
of what was found:

- Detected format (`.bgb`, `markdown`, `wbt-zip`, `docx`,
  `epub`, ...)
- Number of chapters
- Number of assets
- Cover filename, if a cover image was detected
- Custom CSS filename, if a stylesheet was detected
- Warnings (missing cover, metadata issues, ...)

Click **Next: Review & Configure** to continue.

## Step 3: Review & Configure

A sectioned form with every field the Book Metadata Editor
exposes:

**Basic information (mandatory)**
- Title — required. Empty titles block the Import button.
- Author — required. Same behaviour.
- Language — defaults to `de` if you deselect.

**Metadata**
- Subtitle, Series, Series index, Genre, Edition.

**Publishing**
- Publisher, Publisher city, Publish date.
- Three ISBNs (e-book / paperback / hardcover).
- Three ASINs (e-book / paperback / hardcover).

**Long-form content**
- Description, HTML description, Back-cover description,
  About the author. Long entries are collapsible.

**Styling**
- Custom CSS (EPUB styles). Mono font, collapsible.

**Keywords** — comma-separated.

Every non-mandatory row has an include/exclude checkbox:

- Checkbox ON: the field will be imported with the shown
  (possibly edited) value.
- Checkbox OFF: the field will be skipped. The Book column
  keeps its default (empty/null, or `de` for language).

Sections whose fields are all empty in the source are
collapsed under a **+ Add fields** toggle so you can fill
missing metadata even when the import did not provide it.

## Why this exists

Earlier wizard versions only surfaced title, author, and
language in the preview. Long-form fields (CSS, back-cover
text, author bio) were imported but not visible until you
opened the Metadata Editor after the fact. Users reported
this as "fields are not imported" because they could not see
them. The field-selection step closes that gap.

## Related

- [Import from a git URL](git-url.md) — the Step 1 paste box.
- [Metadata editor](../editor/) — full post-import editing.
