# Phase 1 Roadmap (Archived)

Archived: 2026-04-13
Covers: Project start through v0.13.0

This document preserves the Phase 1 roadmap as it stood at completion. For the current work plan, see [docs/ROADMAP.md](../ROADMAP.md).

## Summary

Phase 1 established Bibliogon as a feature-complete single-user, offline-first book authoring platform. It delivered a TipTap-based WYSIWYG editor with 15+ extensions, a full import/export pipeline (EPUB, PDF, DOCX, write-book-template), 9 plugins (export, help, get-started, manuscript tools, audiobook, KDP, translation, grammar, kinderbuch), comprehensive i18n in 8 languages, 6 theme variants, and a test suite of 700+ tests across unit, integration, E2E and mutation testing. The architecture is plugin-based (PluginForge), the export pipeline uses manuscripta, and the entire system runs offline with SQLite.

## Completed items

### Next steps (prioritized)

- [x] W-01: PWA support (manifest.json, service worker, offline cache, installable)
- [x] K-01: finish and deploy the KDP plugin
- [x] K-02: cover validation: dimensions, DPI, color profile against KDP specs
- [x] K-03: metadata completeness check before export (required fields)
- [x] A-03: clear UI separation: AI suggestions in their own panel, not inline in the text
- [x] A-02: optional AI-metadata flag in the EPUB/PDF export
- [x] V-01: version history tab: chronological list of all backups
- [x] K-04: changelog export: which version was published when

### UI/UX

- [x] Trash: delete without a confirm dialog, move directly
- [x] Trash: red "Delete permanently" button in the widget
- [x] BookCard: three-dot menu instead of a single trash icon
- [x] CreateBookModal: two-step dialog (required + expandable optional)
- [x] CreateBookModal: genre field with a datalist (editable)
- [x] CreateBookModal: series hidden behind a checkbox
- [x] Sidebar: collapsible sections (front matter, chapters, back matter)
- [x] Responsive layout: hamburger menu on mobile
- [x] BookEditor: sidebar as an overlay on mobile
- [x] GetStarted: interactive step-by-step wizard
- [x] Settings: white-label configuration (rename app, toggle core plugins)
- [x] Settings: author tab with pen-name management
- [x] Core plugins: "Standard" badge, no delete/disable
- [x] Dashboard: book search/filter (by title, author, genre, language)
- [x] U-01: Dashboard: sorting (by date, title, author)
- [x] U-02: Dashboard: book cover as a thumbnail on the BookCard
- [x] U-03: Editor: image upload via drag-and-drop into the editor
- [x] U-04: Editor: footnote support (tiptap-footnotes extension)
- [x] U-05: Editor: find and replace within a chapter
- [x] U-06: Editor: word count target per chapter (progress bar)
- [x] U-07: Sidebar: rename a chapter via right-click
- [x] U-08: Dark mode: sidebar theme independent of the main theme
- [x] U-09: Trash: auto-delete after X days (configurable)

### i18n

- [x] useI18n hook with 216 strings in 5 languages
- [x] All main components migrated (Sidebar, Editor, Settings, GetStarted, Export, Dashboard)
- [x] Settings: migrate remaining strings
- [x] I-01: live language switch without a reload
- [x] I-02: missing languages: Portuguese, Turkish, Japanese
- [x] I-03: retroactive i18n completion for ES, FR, EL, PT, TR, JA

### Import/Export

- [x] write-book-template import with 21 chapter types
- [x] Section order from export-settings.yaml
- [x] Asset import with path rewriting
- [x] EPUB export with images and manual TOC
- [x] Backup/restore with assets and all metadata
- [x] PDF export: cover image as the first page
- [x] X-01: EPUB: epubcheck validation after export (automatic)
- [x] X-02: import: detect Markdown files without a write-book-template structure
- [x] X-03: export: chapter-type-specific formatting (dedication centered, epigraph italic)
- [x] X-04: export: custom CSS per chapter type
- [x] X-05: batch export: all formats at once (EPUB + PDF + DOCX)

### Editor (TipTap)

- [x] 15 official extensions + Figure/Figcaption
- [x] 24 toolbar buttons
- [x] Markdown toggle with image preservation
- [x] T-01: footnotes (tiptap-footnotes)
- [x] T-02: find and replace (@sereneinserenade/tiptap-search-and-replace)
- [x] T-03: office paste (tiptap-extension-office-paste)
- [x] T-04: image resize via drag
- [x] T-05: spellcheck integration (LanguageTool, when the grammar plugin is active)
- [x] T-06: reading-time estimate per chapter
- [x] T-07: focus mode (only the current paragraph is highlighted)

### Backend

- [x] Auto migration for the DB schema (missing columns)
- [x] Plugin ZIP installation with dynamic loading
- [x] Environment variables (CORS, DEBUG, SECRET, DB_PATH)
- [x] Non-root Docker, health checks
- [x] B-01: Alembic migrations instead of auto migration
- [x] B-02: structured logging (JSON format for production)
- [x] B-05: asynchronous export jobs (long exports don't block)

### Tests

- [x] Q-01: update E2E tests for Radix selectors and new features
- [x] Q-02: set up mutation testing with mutmut
- [x] Q-03: roundtrip tests: import -> editor -> export -> epubcheck
- [x] Q-04: API client unit tests (Vitest)
- [x] Q-05: mypy type checking for the Python backend
- [x] Q-06: CI pipeline (GitHub Actions)

### Coverage Work (4 phases, 274+ tests)

- [x] CW-01 through CW-07: Phase 1 Critical (data integrity + regression pinning)
- [x] CW-08 through CW-14: Phase 2 Standard (fill organic gaps)
- [x] CW-15 through CW-20: Phase 3 Frontend Focus (raise frontend from 32% to 68%)
- [x] CW-21 through CW-26: Phase 4 Editor E2E + remaining gaps

### Plugins

- [x] P-09/P-10/P-11: plugin-manuscript-tools (style checks, filler words, readability)
- [x] P-06/P-07/P-08: plugin-translation (DeepL/LMStudio, chapter-by-chapter)
- [x] P-01 through P-05: plugin-audiobook (TTS via Edge/Google/pyttsx3/ElevenLabs, preview, merge)

### Technical debt

- [x] S-01 through S-07: hardcoded strings, i18n gaps, Docker, chunk size
- [x] S-08: split backup.py into service modules
- [x] S-09: export scaffolder god methods decomposed
- [x] S-10: translation routes god method split
- [x] S-11: pandoc_runner god method split
- [x] S-12: chapters.py validate_toc decomposed

### Offline hardening

- [x] O-01: bundle all UI fonts locally

### KDP publishing workflow

- [x] K-01 through K-04: KDP plugin, cover validation, metadata check, changelog export

### AI assistance

- [x] A-01: generic AI plugin (Ollama/LMStudio integration)
- [x] A-02: optional AI-metadata flag in the export
- [x] A-03: clear UI separation for AI suggestions

### Versioning

- [x] V-01: version history tab
- [x] V-02: backup compare (upload dialog)

### Manuscript tools (M-01 through M-18)

- [x] M-01 through M-11: word repetition, redundant phrases, adverbs, sanitization, readability metrics, CSV/JSON export
- [x] M-12 through M-18: auto-sanitization on import, adjective density, inline editor marks, quality tab, per-book thresholds, YAML filler lists, allowlists

## Items carried forward to Phase 2

- [ ] SI-01: "Accept remote state" button for external changes
- [ ] SI-02: merge help on simple conflicts
- [ ] SI-03: SSH key generation from the UI
- [ ] SI-04: visual indicator when remote state is newer than local

These four items are part of the Git-based backup integration theme.

## Items marked obsolete

None. All planned items were either delivered or carried forward.
