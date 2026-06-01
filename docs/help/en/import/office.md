# Word and EPUB import

Bibliogon can import a Word file (`.docx`) or an EPUB (`.epub`) as a
new book. This is the main switching path from Word, Scrivener (via its
DOCX export) and other writing tools.

## How to use it

1. Open the import wizard from the dashboard.
2. Drop the `.docx` or `.epub` file into step 1, or pick it via the
   file dialog.
3. Bibliogon converts the file and shows the detected chapters and
   images in the preview panel.
4. Adjust title, author and language if needed, then click
   **Import**.

## Chapter splitting

Chapters are split at **level-1 headings** (H1). Each H1 becomes its
own chapter; any text before the first H1 (front matter) is discarded.
If the document has no H1 at all, the whole text lands in a single
chapter.

Tip: in your source program, format every chapter heading as
**Heading 1** so the split works cleanly. Deeper headings (H2, H3, …)
are preserved inside the chapter.

## What is imported

- Headings, bold/italic, lists, quotes
- Embedded images (stored as the book's assets)
- The document structure, as far as it maps to Markdown

Conversion runs through Pandoc. Very specific Word constructs (complex
tables, text boxes, comments) may be simplified or dropped.

## Requirement

Word/EPUB import requires the **Pandoc** program on the server. It is
already included in the Docker installation. If Pandoc is missing, the
import reports a corresponding error.
