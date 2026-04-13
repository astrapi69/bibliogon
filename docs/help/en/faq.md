# FAQ

**What format is used internally?** Bibliogon stores chapter content as TipTap JSON. During export, this is converted to Markdown and then to the target format.

**How do I export my book?** Open your book in the editor. The sidebar contains export buttons for EPUB, PDF, DOCX, HTML, Markdown, and project structure (ZIP).

**Can I import an existing project?** Yes. On the Dashboard, click "Import Project" and select a ZIP file in write-book-template format.

**How does backup work?** Click "Backup" on the Dashboard to export all books, chapters, and assets as a .bgb file. Use "Restore" to import a backup.

**What is Markdown mode?** The editor supports switching between WYSIWYG and Markdown views. Content is converted automatically when toggling.

**Does Bibliogon work offline?** Yes. Bibliogon uses SQLite and stores everything locally. Only plugins that access external APIs (Grammar, Translation, Audiobook with cloud engines) require an internet connection.
