## [0.13.0] - 2026-04-12

### Added
- **Dashboard filters and sorting:** genre and language filter dropdowns, sort toggle (date/title/author), reset button and URL persistence for filter state. Filters are derived from the user's existing books, not a static list.
- **Keyword editor improvements:** inline edit (click a chip to rename), soft warning at 40 keywords, hard limit at 50, undo-toast on delete. Keywords are now stored as a native `list[str]` in the API (removes the JSON-string workaround in the frontend).
- **Three new themes:** Classic (serif-first, literary typography with proper paragraph indentation), Studio (clean sans-serif workspace), Notebook (warm, relaxed tones). Each with light and dark variants (6 new theme variants, 12 total). Central palette registry with a `useTheme` guard prevents invalid theme states.
- **Coverage audit infrastructure:** `docs/audits/current-coverage.md` as the single source of truth for test statistics, with a history archive in `docs/audits/history/`. Coverage targets per module type codified in `quality-checks.md`. Single-source-of-truth rule prevents duplicated statistics across documentation files.
- **274 new tests across 4 phases:**
  - Phase 1 (critical data integrity): 64 backend tests covering serializer, trash endpoints, html_to_markdown, license tiers, plugin install, settings integration
  - Phase 3 (frontend focus): 138 Vitest tests for hooks (useTheme, useEditorPluginStatus, HelpContext), form components (CreateBookModal, ChapterTypeSelect), display components (ThemeToggle, BookCard, OrderedListEditor), ExportDialog, BookMetadataEditor
  - Phase 4 (editor E2E): 31 Playwright tests covering text entry/persistence, toolbar formatting (bold/italic/underline/strikethrough/code/headings), keyboard shortcuts, block elements, undo/redo, text alignment, chapter switching, and toolbar button state sync
  - 7 new Playwright smoke suites: editor formatting, book metadata round-trip, trash flow, theme system, keywords editor, chapter sidebar viewport, dashboard filters
- **Help documentation:** themes guide, keyword editor documentation in metadata help

### Changed
- **Documentation language:** all docs (`CLAUDE.md`, `CONCEPT.md`, `CHANGELOG.md`, `API.md`, `ROADMAP.md`) and all `.claude/rules/` files translated from German to English
- **E2E test structure:** test directory moved from `frontend/e2e/` to `e2e/` (project root). AppDialog confirm button uses `data-testid` instead of text matching
- **Google Fonts:** extended with Inter, Lora and Source Serif Pro for the new theme palettes

### Fixed
- **Classic theme indent bug:** paragraph indentation reset after headings, producing inconsistent typography in long chapters
- **Chapter sidebar overflow:** chapter list and add-chapter dropdown clipped or hidden when the sidebar had many entries

### Removed
- Frontend JSON-string workaround for book keywords (replaced by native `list[str]` API)
