# PDF Export

## Basics

PDF is best suited for print-ready book versions (paperback, hardcover) and for previewing the final layout. Bibliogon produces PDF files via the same pipeline as EPUB export: TipTap JSON is converted to Markdown, scaffolded into a write-book-template project structure, and converted by manuscripta with Pandoc as the converter.

## Pandoc as a prerequisite

PDF export requires Pandoc. Pandoc is a separate command-line tool and must be installed on the system that runs the Bibliogon backend. Without Pandoc, PDF export fails with a corresponding error message.

**Installation:**

- **Linux (Debian/Ubuntu):** `sudo apt install pandoc`
- **macOS (Homebrew):** `brew install pandoc`
- **Windows:** download the installer from [pandoc.org](https://pandoc.org/installing.html)

A LaTeX distribution is also required, since Pandoc produces PDF files via LaTeX. TeX Live (Linux/macOS) or MiKTeX (Windows) is recommended. On Debian/Ubuntu, `sudo apt install texlive-full` gives you a full install.

If you are running Bibliogon via Docker (`make prod`), Pandoc and TeX Live are already in the container.

## Export options

PDF export supports the same options as EPUB export:

- **Book type** (ebook, paperback, hardcover): determines the chapter order and table of contents.
- **Manual TOC**: when your book has its own TOC chapter.
- **Cover**: a configured cover image is inserted as the first page.
- **Metadata**: title, author, language, and ISBN flow into the PDF metadata.

## Other formats

Beyond PDF, Bibliogon also exports to the following formats, all produced via Pandoc:

- **DOCX** (Word): for collaboration with editors or publishers who prefer Word documents.
- **HTML**: a single HTML file containing the entire book.
- **Markdown**: the raw Markdown text of all chapters in the configured order.
- **Project structure (ZIP)**: a ZIP file in write-book-template format with Markdown files, metadata, and assets. Useful for further processing with your own tools or for version control with Git.
