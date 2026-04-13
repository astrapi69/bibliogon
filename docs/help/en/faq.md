# FAQ

**What format is used internally?** Bibliogon stores chapter content as TipTap JSON. During export, this is converted to Markdown and then to the target format.

**How do I export my book?** Open your book in the editor. The sidebar contains export buttons for EPUB, PDF, DOCX, HTML, Markdown, and project structure (ZIP).

**Can I import an existing project?** Yes. On the Dashboard, click "Import Project" and select a ZIP file in write-book-template format.

**How does backup work?** Click "Backup" on the Dashboard to export all books, chapters, and assets as a .bgb file. Use "Restore" to import a backup.

**What is Markdown mode?** The editor supports switching between WYSIWYG and Markdown views. Content is converted automatically when toggling.

**Does Bibliogon work offline?** Yes. Bibliogon uses SQLite and stores everything locally. Only plugins that access external APIs (Grammar, Translation, Audiobook with cloud engines, AI with cloud providers) require an internet connection. Fonts are bundled locally.

**How do I set up AI features?** Go to Settings > General > AI Assistant. Enable AI, pick a provider, enter your API key, and test the connection. See the [AI help page](ai.md) for details.

**Can I use AI without sending my text to the cloud?** Yes. Select LM Studio as the provider. It runs on your computer and keeps everything local.

**How do I find a specific book?** Use the search bar and filter dropdowns at the top of the Dashboard. You can filter by genre, language, and sort by date, title, or author.

**What happens if I close the browser without saving?** Bibliogon saves automatically as you type (debounced). Additionally, unsaved changes are stored locally in your browser (IndexedDB). If you reopen a chapter with unsaved changes, you will be offered to restore them.

**What are the available themes?** Six themes with light and dark variants each: Warm Literary, Cool Modern, Nord, Classic, Studio, and Notebook. Change themes in Settings > General.

**How do I see keyboard shortcuts?** Press Ctrl+/ (Cmd+/ on macOS) to open the shortcuts overview.
