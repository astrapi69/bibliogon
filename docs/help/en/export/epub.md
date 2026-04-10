# EPUB Export

Bibliogon exports EPUB files via the Export plugin using manuscripta and Pandoc. TipTap JSON content is converted to Markdown, scaffolded into a write-book-template project structure, and then converted to EPUB. Book metadata (title, author, language, ISBN, cover) is embedded automatically.

The table of contents can be auto-generated from headings or manually provided via a dedicated TOC chapter. Validate exported EPUB files with epubcheck (W3C) to ensure standard conformity. Different book types (ebook, paperback, hardcover) determine chapter order and TOC style.
