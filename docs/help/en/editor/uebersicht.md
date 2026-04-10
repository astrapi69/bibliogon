# Editor Overview

Bibliogon uses TipTap, a ProseMirror-based WYSIWYG editor. The toolbar provides 24 buttons for formatting (bold, italic, headings, lists, images, tables, footnotes, etc.). Chapters are managed in the sidebar on the left, where you can add, reorder (drag-and-drop), and delete chapters.

The editor supports two modes: WYSIWYG (visual) and Markdown (raw text). Content is stored internally as TipTap JSON and converted automatically when switching modes. All changes are saved automatically with debounce.
