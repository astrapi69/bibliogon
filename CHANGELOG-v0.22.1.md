## [0.22.1] - 2026-04-25

Patch release on top of the v0.22.0 import orchestrator. Headline is a critical Alembic fix: a missing migration for `books.tts_speed` (added as a `Mapped` column without a corresponding revision) caused HTTP 500 on `/api/import/detect` for users who reached v0.22.0 via `alembic upgrade head` rather than fresh-install. The release also lands the post-import textarea polish, an error-reporting infrastructure for the wizard, the multi-book BGB import path with an XState v5 state graph, and a sticky-footer pattern across all scrolling dialog modals so action buttons never scroll out of reach.

### Action required for v0.22.0 users

If you reached v0.22.0 by running `alembic upgrade head` (rather than a fresh install), run it again after pulling v0.22.1:

```bash
cd backend && poetry run alembic upgrade head
```

The new migration `c6d7e8f9a0b1` is idempotent — it skips the column add if it already exists — so it is safe to run regardless of how you got here.

### Fixed

- **Critical: missing `books.tts_speed` migration.** `Book.tts_speed` was introduced as a `Mapped[float | None]` column but never paired with an Alembic revision. Fresh installs picked it up via `Base.metadata.create_all`; alembic-upgrade-path DBs did not, surfacing as a SQLAlchemy `OperationalError` and HTTP 500 on import. Migration `c6d7e8f9a0b1` backfills the column with an idempotent existence check.
- **Wizard error dialog.** Render exceptions inside the import wizard previously cratered the modal with no user-actionable message. New `WizardErrorBoundary` + rewritten `ErrorStep` capture the failure, expose **Copy details** (clipboard-ready markdown bundle: cause, stack, status, endpoint, version, browser, route) and **Report Issue** (pre-filled GitHub Issues URL).
- **Author field is a real `<select>` dropdown.** The previous datalist-based input was filtered by current value, so a populated author silently hid the rest of the picker. Replaced with a `<select>` + optgroup that renders all options unconditionally. Pen-name endpoint added (`POST /api/settings/author/pen-name`).
- **Sticky modal action buttons.** Action buttons in long-content modals (Export, ChapterTemplate, CreateBook, ErrorReport, SaveAsTemplate) now stay visible via a global `.dialog-content-wide .dialog-footer` sticky rule. BackupCompare and GitBackup got bespoke inline sticky on their long-content surfaces. Companion to the wizard step-footer fix landed earlier in the cycle.

### Added

- **EnhancedTextarea wrapper.** Universal textarea component with toolbar (copy, word/char counter, autosize, fullscreen) and tab-switchable preview for `css` (lowlight syntax), `markdown` (react-markdown + remark-gfm) and `html` (DOMPurify-sanitized) fields. Migrated all metadata textareas (description, backpage, custom CSS, html_description) to the new wrapper.
- **Multi-book BGB import.** `.bgb` archives containing multiple books now render a per-book selection list (Step 3) with bulk select-all/deselect-all, per-row duplicate handling (Skip/Overwrite/Create-new), and chapter/cover badges. Backend extends `DetectedProject` with `is_multi_book` + `books: list[DetectedBookSummary]`; orchestrator dispatches to `execute_multi` on multi-book detect.
- **XState v5 wizard state graph.** New `wizardMachine` (states: upload/detecting/summary/preview-single/preview-multi/executing/success/error; guards: `isMultiBook`, `hasMultiBookSelection`, `canRetry`) acts as the testable data layer. State pattern documented in `docs/architecture/state-machines.md`.
- **Three-option author picker.** Wizard now handles `.bgp`/`.bgb` with no author by offering: create-new, pick-existing, defer. Defer is gated behind a Settings toggle `Allow books without author` (default OFF).
- **`books.author` nullable.** Migration `b5c6d7e8f9a0` makes `Book.author` nullable, paired with backend `_validate_author()` guard on POST/PATCH that respects the toggle.
- **UX convention guide.** `docs/ux-conventions.md` formalises the modal/form/dialog patterns we keep landing in PRs.

### Changed

- **Deterministic cover fallback.** `_first_cover_for_book` now orders by `Asset.filename` so backend test results match across SQLite versions and CI environments.
- **Dependencies.** Added `xstate@5` + `@xstate/react@6`; bumped lowlight + react-markdown + dompurify + hast-util-to-jsx-runtime for the EnhancedTextarea preview pipeline.
