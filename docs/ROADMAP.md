# Bibliogon - requirements and roadmap

Open items, planned features and technical debt.
Checkboxes: `[ ]` = open, `[x]` = done.
IDs: U=UI/UX, I=i18n, X=Import/Export, T=TipTap, B=Backend, Q=Tests, P=Plugin, S=Debt, O=Offline hardening.

Prompt reference: `Implement T-01.` is enough as an instruction.

---

## Next steps (prioritized)

These items take precedence over the categorized lists below.

- [x] W-01: PWA support (manifest.json, service worker, offline cache, installable)
- [x] K-01: finish and deploy the KDP plugin
- [x] K-02: cover validation: dimensions, DPI, color profile against KDP specs
- [x] K-03: metadata completeness check before export (required fields)
- [x] A-03: clear UI separation: AI suggestions in their own panel,
      not inline in the text. The author accepts explicitly via click.
- [x] A-02: optional AI-metadata flag in the EPUB/PDF export.
- [x] V-01: version history tab: chronological list of all backups
- [x] K-04: changelog export: which version was published when


## UI/UX

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

## i18n

- [x] useI18n hook with 216 strings in 5 languages
- [x] All main components migrated (Sidebar, Editor, Settings, GetStarted, Export, Dashboard)
- [x] Settings: migrate remaining strings (some toast messages still hardcoded)
- [x] I-01: live language switch without a reload
- [x] I-02: missing languages: Portuguese, Turkish, Japanese
- [x] I-03: retroactive i18n completion for ES, FR, EL, PT, TR, JA.
      language is complete.

## Import/Export

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

## Editor (TipTap)

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

## Backend

- [x] Auto migration for the DB schema (missing columns)
- [x] Plugin ZIP installation with dynamic loading
- [x] Environment variables (CORS, DEBUG, SECRET, DB_PATH)
- [x] Non-root Docker, health checks
- [x] B-01: Alembic migrations instead of auto migration (more robust)
- [x] B-02: structured logging (JSON format for production)
- [ ] B-03: rate limiting on API endpoints
- [ ] B-04: API versioning (v1/v2 prefix)
- [x] B-05: asynchronous export jobs (long exports don't block)

## Tests

Current counts and coverage: see [docs/audits/current-coverage.md](docs/audits/current-coverage.md).

- [x] Q-01: update E2E tests for Radix selectors and new features
- [x] Q-02: set up mutation testing with mutmut
- [x] Q-03: roundtrip tests: import -> editor -> export -> epubcheck
- [x] Q-04: API client unit tests (Vitest)
- [x] Q-05: mypy type checking for the Python backend
- [x] Q-06: CI pipeline (GitHub Actions)

## Coverage Work

Systematic test coverage improvements tracked as four phases.
Full audit: `docs/audits/current-coverage.md`. Targets: `quality-checks.md`.

### Phase 1: Critical (Category A/B) - data integrity + regression pinning
Expected delta: +64 backend tests, +5 E2E tests.

- [x] CW-01: serializer.py unit tests (10 tests)
- [x] CW-02: backup export + import roundtrip E2E (5 tests)
- [x] CW-03: trash endpoints integration tests (14 tests)
- [x] CW-04: html_to_markdown.py unit tests (26 tests)
- [x] CW-05: license activation/deactivation integration tests (12 tests)
- [x] CW-06: plugin install/uninstall integration tests (15 tests)
- [x] CW-07: settings GET/PATCH integration tests (23 tests)

### Phase 2: Standard (Category C) - fill organic gaps
Expected delta: ~30-40 tests across backend and plugins.

- [ ] CW-08: `useTheme.ts` hook tests
- [ ] CW-09: `pandoc_runner.py` tests (export plugin)
- [ ] CW-10: `backup_history.py` + `GET /api/backup/history` tests
- [ ] CW-11: `archive_utils.py`, `asset_utils.py`, `markdown_utils.py` tests
- [ ] CW-12: plugin `routes.py` integration tests (grammar, kdp, kinderbuch, translation)
- [ ] CW-13: audiobook dry-run + preview endpoint tests
- [ ] CW-14: Google Cloud TTS config endpoint tests

### Phase 3: Frontend Focus - raise frontend from 32% to 68%
Actual delta: +138 frontend tests (101 Phase 3a + 37 Phase 3b).

- [x] CW-15: `ExportDialog.tsx` component tests (18 tests)
- [x] CW-16: `CreateBookModal.tsx` component tests (11 tests)
- [ ] CW-17: actual file export E2E (trigger export, verify download)
- [x] CW-18: `BookMetadataEditor.tsx` component tests (19 tests)
- [x] CW-19: `useEditorPluginStatus.ts` hook tests (11 tests)
- [x] CW-20: `CoverUpload.tsx` component tests (8 tests)

### Phase 4: Editor E2E + remaining gaps
Expected delta: ~30-40 tests, mostly Playwright E2E.

- [x] CW-25: editor formatting E2E (text entry, toolbar, shortcuts, block elements, undo, alignment, button state sync)
- [ ] CW-26: toolbar data-testid migration (add `toolbar-{action}` testids, migrate editor specs from getByTitle)
- [ ] CW-21: audiobook generation E2E (mocked TTS)
- [ ] CW-22: plugin ZIP installation E2E
- [ ] CW-23: import flows E2E (project ZIP, markdown ZIP)
- [ ] CW-24: chapter drag-and-drop reorder E2E

## Plugins (roadmap)

### Phase 8: manuscript quality (v0.9.0)
- [x] P-09: plugin-manuscript-tools: style checks, sanitization
- [x] P-10: filler words, passive voice, sentence length
- [x] P-11: readability metrics (Flesch-Kincaid)

### Phase 9: translation plugin (v0.10.0, premium)
- [x] P-06: plugin-translation: DeepL/LLM translation
- [x] P-07: LMStudio for local LLM translation
- [x] P-08: chapter-by-chapter translation into a new book

### Phase 10: audiobook plugin (v0.11.0, premium)
- [x] P-01: plugin-audiobook: TTS-based audiobook generation
- [x] P-02: TTS engine selection: Edge TTS, Google TTS, pyttsx3, ElevenLabs
- [x] P-03: voice settings per book
- [x] P-04: MP3 per chapter, merge into an audiobook (ffmpeg)
- [x] P-05: preview function in the editor

### Phase 11: multi-user and SaaS (v1.0.0)
- [ ] P-12: user registration and authentication
- [ ] P-13: PostgreSQL instead of SQLite
- [ ] P-14: pen-name management per user (not global)
- [ ] P-15: plugin marketplace
- [ ] P-16: Stripe integration

## Technical debt

- [x] S-01: hardcoded strings in the dashboard (some dialog texts)
- [x] S-02: BookCard: genre badge i18n (currently shows the key instead of the translated name)
- [x] S-03: Settings page: ~10 remaining hardcoded strings
- [x] S-04: export plugin: tiptap_to_md.py does not support all new extensions (Table, TaskList)
- [x] S-05: Playwright E2E: a few tests need adjustments for Radix selectors (done in Q-01)
- [x] S-06: package.json: chunk-size warning on build (>500KB)
- [x] S-07: Docker: multi-stage build for a smaller backend image
- [x] S-08: split backend/app/routers/backup.py into service modules.
      State: 1070 lines, several god methods (`import_project` 263 LOC,
      `import_backup` 123, `_import_with_section_order` 101,
      `export_backup` 86, `smart_import` 82). The 04-05 refactor only
      extracted book serialization; follow-up features (V-01, smart
      import, X-02 plain Markdown) put god methods right back into the
      router. Plan: `app/services/backup/` with `serializer.py`,
      `backup_export.py`, `backup_import.py`, `project_import.py`,
      `markdown_import.py`, `format_detection.py`. The router only
      contains thin endpoints that delegate.
- [x] S-09: plugins/bibliogon-plugin-export/.../scaffolder.py: god methods
      `scaffold_project` (197) and `_html_to_markdown` (123) decomposed.
      `scaffold_project` split into 6 step helpers; HTMLParser extracted
      into its own `html_to_markdown.py` module with per-tag open/close
      handlers via dispatch tables.
- [x] S-10: plugins/bibliogon-plugin-translation/.../routes.py: god method
      `translate_book` (~106 LOC) split into 5 step helpers:
      `_open_db_session_or_500`, `_load_book_with_chapters`,
      `_build_translation_clients`, `_create_translated_book`,
      `_translate_chapters_into` plus a per-chapter `_translate_one_chapter`.
- [x] S-11: plugins/bibliogon-plugin-export/.../pandoc_runner.py: god method
      `run_pandoc` (~84 LOC) split into 5 step helpers:
      `_read_export_settings`, `_resolve_section_order`,
      `_set_manuscripta_output_file`, `_resolve_cover_path`,
      `_find_output_file`. Body shrunk from ~84 to ~25 LOC.
- [x] S-12: backend/app/routers/chapters.py: god method `validate_toc`
      (~98 LOC) split into 6 step helpers: `_collect_valid_anchors`,
      `_collect_chapter_anchors`, `_add_title_anchors`,
      `_add_heading_anchors`, `_add_explicit_id_anchors`, `_check_toc_links`
      with an `_iter_toc_links` generator. `_TYPE_ANCHORS` lifted out of
      the function body into a module constant.

## Offline hardening

- [ ] O-01: bundle all UI fonts locally instead of the Google Fonts CDN.
      Currently `frontend/index.html` loads six font families
      (Crimson Pro, JetBrains Mono, DM Sans, Inter, Lora, Source Serif
      Pro) over `fonts.googleapis.com`, which breaks offline and in
      privacy-sensitive environments. Plan: put WOFF2 files into
      `frontend/public/fonts/` (OFL-licensed, license texts alongside
      as `LICENSE-{name}.txt`), add matching `@font-face` rules in
      `global.css`, remove the Google Fonts link from `index.html`,
      have the PWA manifest/service worker cache the new asset URLs.
      Must be consistent: either all six fonts local or none. Partial
      migrations only create confusion. Extracted from the themes task
      because only the three new fonts were added there; the bundling
      touches all six.

## KDP publishing workflow
- [x] K-01: finish and deploy the KDP plugin
- [x] K-02: cover validation: dimensions, DPI, color profile against KDP specs
- [x] K-03: metadata completeness check before export (required fields)
- [x] K-04: changelog export: which version was published when

### AI assistance (building on the translation plugin)
- [x] A-01: generic AI plugin (Ollama/LMStudio integration)
- [x] A-02: optional AI-metadata flag in the export (commit 881e84c)

- [x] A-03: clear UI separation: AI suggestions in their own panel,
      not inline in the text. The author accepts explicitly via click.

## Versioning (lightweight, no Git)
- [x] V-01: version history tab: chronological list of all backups
- [x] V-02: backup compare: show two versions side by side (implemented as an upload dialog: POST /api/backup/compare + dashboard button "Compare backups". Will later be replaced by the backup feature with automatic save points.)

## Manuscript tools (M)

Done:
- [x] M-01: word repetition detection with a configurable window
- [x] M-02: redundant phrases detection (DE + EN lists)
- [x] M-03: adverb detection by suffix (-lich/-ly/-ment/-mente)
- [x] M-04: remove invisible Unicode characters (NBSP, ZWSP, BOM, soft hyphen)
- [x] M-05: remove HTML/Word artifacts (empty tags, style attributes, namespace tags)
- [x] M-06: sanitization preview (diff endpoint)
- [x] M-07: passive voice ratio as a percentage (was just a count)
- [x] M-08: average word length in characters
- [x] M-09: character count, paragraph count, estimated page count
- [x] M-10: CSV/JSON export of the metrics per book
- [x] M-11: default threshold 25 words (was 30)

Planned:
- [x] M-12: auto-sanitization on import (hook into the import system)
- [ ] M-13: adjective density via POS tagging (spaCy/NLTK dependency)
- [ ] M-14: inline marks in the TipTap editor (TipTap extension)
- [ ] M-15: quality tab in book metadata (chapter table with outlier markers)
- [x] M-16: persist per-book thresholds (DB migration)
- [x] M-17: load filler-word lists from YAML (user-extensible)
- [x] M-18: exclude terms from checks (allowlist)

## Backup (Git integration) - phase 2

- [ ] SI-01: "Accept remote state" button for external
       changes. Creates an automatic save point from the
       current state, then `git reset --hard origin/main`,
       then reloads the changed chapters into the Bibliogon DB.
- [ ] SI-02: merge help on simple conflicts (only one
       chapter changed, no overlapping lines)
- [ ] SI-03: SSH key generation from the UI
       (for users without an existing SSH key)
- [ ] SI-04: visual indicator in the sidebar when the remote state
       is newer than local (warning instead of waiting for the push attempt)
