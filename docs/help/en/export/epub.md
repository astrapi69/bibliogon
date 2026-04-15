# EPUB Export

## Basics

EPUB is the standard format for e-books and is supported by most e-book readers (Kindle via conversion, Kobo, Tolino, Apple Books, and others). Bibliogon exports EPUB files via the Export plugin, which uses manuscripta as the conversion pipeline. The export button lives in the editor sidebar and in the Export dialog.

During export, Bibliogon first converts TipTap JSON content into Markdown, scaffolds a write-book-template project structure, and lets manuscripta produce the final EPUB file. Pandoc handles the final Markdown-to-EPUB step.

## Metadata

Your book's metadata flows into the EPUB file automatically. The following fields are supported:

- **Title and subtitle**: appear on the title page and in the EPUB metadata.
- **Author**: stored as the Creator in the EPUB metadata.
- **Language**: determines the language tag in the EPUB (e.g. "en" for English).
- **ISBN**: if set, the ISBN is embedded in the metadata.
- **Cover**: a cover image can be set via the book metadata and is used as the EPUB cover.
- **Description**: the book description is included in the Dublin Core metadata.

Maintain the metadata before export from the Metadata tab in the editor so your EPUB carries all the relevant information.

## Table of contents

Bibliogon supports two TOC variants:

- **Auto-generated**: Pandoc builds the table of contents from the headings in the text. The depth (number of heading levels) is configurable in the export settings (default: 2 levels).
- **Manual TOC**: if your book contains its own TOC chapter, enable "Use manual TOC" in the export dialog. In that case the manually authored TOC is used and auto-generation is skipped.

Do not use both at once - that produces a duplicate table of contents.

## Quality check with epubcheck

After exporting, it is a good idea to validate the EPUB file with epubcheck. Epubcheck is an open-source W3C tool that checks EPUB files for conformance with the EPUB standard. It catches structural errors, missing metadata, and invalid references. Epubcheck is available as a Java application at [github.com/w3c/epubcheck](https://github.com/w3c/epubcheck).

## Book types

When exporting, you can pick the book type (ebook, paperback, hardcover). The book type determines which chapters go into the EPUB and in what order. An ebook, for instance, gets a digital table of contents, while a paperback uses a print-optimized one. The exported file name includes the book type as a suffix by default (e.g. `my-book-ebook.epub`).
