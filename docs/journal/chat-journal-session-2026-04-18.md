# Chat-Journal: Bibliogon Session 2026-04-18

Templates theme (book + chapter level) shipped end-to-end: TM-01, TM-03, TM-04, TM-05 all closed. Coverage runs moved out of the local test path to CI-only. Docs caught up across help pages, FAQ, CLAUDE.md, and CHANGELOG. CI plugin matrix expanded from 5 to 7 plugins (PS-09). Small UI polish on Dashboard theme-toggle placement. 30 commits pushed to `main`.

---

## 1. TM-01: Book Template Data Model

- Pre-audit: models live in `backend/app/models/__init__.py` (single file), schemas in `backend/app/schemas/__init__.py`, Alembic migrations at `backend/migrations/versions/` (not `alembic/versions/`). Current head `a1b2c3d4e5f7`. Five of the `ChapterType` values required by the task (`half_title`, `title_page`, `copyright`, `section`, `conclusion`) were missing from the enum.
- Clarifying questions to the user before writing code: UUID string IDs (not autoincrement int) to match the existing `Book`/`Chapter`/`Asset` pattern; reuse existing `ABOUT_AUTHOR = "about_author"` rather than introducing a near-duplicate `ABOUT_THE_AUTHOR`; default template language `"en"` (vs book default `"de"`) because templates are genre-neutral reference structures; new router file `backend/app/routers/templates.py`. All approved.
- 5 atomic commits: ChapterType additions (models + schemas), `BookTemplate` + `BookTemplateChapter` models with migration `b7c8d9e0f1a2`, `/api/templates/` CRUD router with 409-on-duplicate-name and 403-on-builtin, 5 builtin templates (Children's Picture Book, Sci-Fi Novel, Non-Fiction / How-To, Philosophy, Memoir) seeded idempotently at lifespan startup, 15 pytest tests covering model round-trip, schema validation, API, and seed idempotency.
- `make test` green: 488 backend tests (473 + 15 new), full `make test` 323 frontend tests.

## 2. TM-03: Create Book from Template

- Pre-audit: existing `CreateBookModal.tsx` uses Radix Dialog + Collapsible; `api.templates.list/get` already present from TM-01; `BookCreate` schema on the backend accepts the right fields. Flagged 5 deviations from the task spec — task said 5 languages (actually 8 per CLAUDE.md), plain `fetch` error handling (existing client uses `request<T>` + `ApiError`), and `ui.genres` / `ui.template_genres` namespace collision (TM-01 template genres `scifi`/`nonfiction`/`philosophy`/`memoir` don't match existing book-genre keys).
- 5 atomic commits: POST `/api/books/from-template` endpoint with single-commit book + chapters creation and 4 pytest tests, `BookTemplate`/`BookFromTemplateCreate` TypeScript types + `api.books.createFromTemplate` + `api.templates.list` on the client, Radix Tabs "Blank / From template" toggle in `CreateBookModal` with template-picker cards (description + chapter count + genre badge), i18n keys in all 8 languages (`ui.create_book.mode_*`, `ui.create_book.template_*`, `ui.template_genres.*`), 6 Vitest tests + Playwright smoke spec at `e2e/smoke/create-book-from-template.spec.ts`.
- Card layout: each template becomes a selectable `role="radio"` div (not a `<button>`) so a nested delete button added in TM-05 later would be valid HTML. Radix Tabs trigger needs pointer events (pointerDown + mouseDown + click) in happy-dom for `fireEvent` to drive the tab switch — documented in a `clickTab()` helper in the test file.

## 3. Coverage moved to CI

- Pre-audit: no coverage tooling installed anywhere (no pytest-cov in backend or any plugin's dev deps, no `@vitest/coverage-v8` in frontend). No `[tool.pytest.ini_options]` block in `backend/pyproject.toml` — nothing to strip. Existing `ci.yml` uses `ubuntu-latest`, Python 3.12, Node 22, Poetry via `pip install poetry`. Flagged the task spec's `cd plugins && make test-coverage` as broken (no Makefile there) and proposed the existing-CI matrix pattern instead.
- 3 atomic commits: pytest-cov in backend + 5 plugins (export, grammar, kdp, kinderbuch, ms-tools), `@vitest/coverage-v8` in frontend, `test` + `test:coverage` npm scripts, root Makefile split with new `test-coverage-*` targets (`make test` stays fast and coverage-free); `.github/workflows/coverage.yml` with three job groups (backend, plugin matrix, frontend) uploading HTML + XML artifacts with 14-day retention; `ai-workflow.md` section documenting the split, local Node-20-minimum caveat for frontend coverage, and `gh run download` hints.
- Local test results: backend 85%, plugin-export 55% (first measurement). Frontend coverage needs Node 20+; user's local Node 18 fails with `node:inspector/promises` — documented, CI uses Node 22.

## 4. TM-05: Save Current Book as Template

- Pre-audit: `BookEditor.tsx` is the book detail view; `ChapterSidebar` footer holds Metadata/TOC/Export actions — natural spot to add "Save as template". Book templates pattern reusable 1:1. Clarified: modal fetches `api.books.get(id, true)` in "preserve content" mode because `BookEditor` loads with `include_content=false` for speed; genre dropdown uses the 5 TM-01 template genres via existing `ui.template_genres.*`; language dropdown reuses the same 5 as `CreateBookModal`; rollback test skipped in favor of "single-commit-at-end" architecture review.
- 6 atomic commits: `api.templates.create` + `api.templates.delete` + `BookTemplateCreate` TS type, new `SaveAsTemplateModal` component with empty-placeholder vs preserve-content radio + chapter preview, wire-up via new optional `onSaveAsTemplate` prop in `ChapterSidebar` footer (BookmarkPlus icon), delete action + "Built-in" lock badge on user templates in the picker (card converted to `<div role="radio" tabIndex={0}>` to allow the nested delete button), i18n in 8 languages (`ui.sidebar.save_as_template`, `ui.save_template.*`, `ui.template_picker.*`), 9 Vitest tests (6 for the modal, 3 for the picker delete flow).
- Existing `CreateBookModal.test.tsx` extended with `useDialog` + `notify` + `ApiError` mocks so the delete-in-picker flow is testable.

## 5. TM-04: Chapter Templates

- Pre-audit: TM-02 checkbox on the roadmap was cosmetic (5 TM-01 builtins are what TM-02 asked for; `git log` shows only one commit to `builtin_templates.py`). `POST /books/{id}/chapters` already accepts `ChapterCreate` with content/type/position — no chapter endpoint changes needed. `ChapterSidebar` already has a Radix DropdownMenu for new-chapter (Front Matter / Chapter / Back Matter groups) — natural place for "From template..." entry. Builtin book templates store English strings in the DB verbatim; same pattern applied to chapter templates (no i18n overlay on builtin name/description).
- 8 atomic commits: `ChapterTemplate` model + migration `c8d9e0f1a2b3`, `/api/chapter-templates/` CRUD with full schemas and 10 pytest tests, 4 builtins seeded (Interview, FAQ, Recipe, Photo Report) as TipTap JSON authored via `_doc()`/`_heading()`/`_paragraph()`/`_ordered_list()`/`_bullet_list()` helpers + 3 more tests (expected-builtins, idempotency, valid-TipTap-JSON regression pin), `api.chapterTemplates.list/create/delete` + `ChapterTemplate`/`ChapterTemplateCreate` TS types (fixed a pre-existing TS error in `SaveAsTemplateModal.test.tsx` as drive-by — mock `ApiError` constructor needed 4-6 args to match the real class), `ChapterTemplatePickerModal` mounted from a new "Aus Vorlage..." dropdown entry with BookEditor handler that fetches the template and POSTs `/books/{id}/chapters`, `SaveAsChapterTemplateModal` wired into each chapter row's Radix ContextMenu (between Rename and Delete), i18n in 8 languages (`ui.editor.new_chapter_from_template`, `ui.sidebar.chapter_save_as_template`, `ui.chapter_template_picker.*`, `ui.save_chapter_template.*`), 13 Vitest tests across both new modals.
- Prop threading: `onSaveAsChapterTemplate` had to be wired through `SortableGroup` and `SortableChapterItem` to reach the context menu; all three `SortableGroup` call sites (front matter / main chapters / back matter) updated.

## 6. Dashboard theme-toggle placement

- First pass moved `ThemeToggle` from its isolated spot next to "Neues Buch" into the desktop icon cluster between Help and Settings, plus a Sun/Moon `DropdownMenu.Item` in the mobile hamburger.
- User asked for it as the rightmost icon — moved after Trash in the desktop cluster; the mobile hamburger item was moved to the very end of the menu to mirror the order.

## 7. PS-08: docs + help catch-up for the Templates theme

- Driven by user-memory feedback that every feature must update CLAUDE.md + `help.yaml`. The templates work across TM-01/03/04/05 and coverage-to-CI had shipped without any docs updates.
- 4 atomic commits: new `docs/help/{de,en}/templates.md` pages (80+ lines each, book + chapter template flows, built-in chapter structures reference table, book-vs-chapter comparison table) registered in `docs/help/_meta.yaml` with the `bookmark` icon between "Plugins" and "Windows Launcher"; 6 new FAQ entries in `backend/config/plugins/help.yaml` (DE + EN) — what templates are, create book from template, save book as template, create chapter from template, save chapter as template, delete user template — plus the two stale "21 chapter types" FAQ answers refreshed to 31 with the new types listed and the audiobook-skip caveat inline; CLAUDE.md data-model gets BookTemplate + ChapterTemplate lines and ChapterType count 26 -> 31, Commands block documents `make test-coverage`; CHANGELOG gains an "Unreleased" section (Keep-a-Changelog convention) capturing all the session's Added / Changed / Fixed items.
- CLAUDE.md was already at 8080 chars (over the 8000 soft target); additions brought it to 8545. Flagged to the user; acceptable for always-loaded data-model content.

## 8. PS-09: expand the CI plugin matrix

- `ci.yml` and `coverage.yml` had 5 plugins; audiobook + translation were tested only via root `make test`. Both plugins had no pytest-cov yet.
- 1 atomic commit: pytest-cov added to both plugins' dev deps, `ci.yml` matrix 5 -> 7 plugins, `coverage.yml` matrix 5 -> 7 plugin+package entries, root Makefile gets new `test-coverage-plugin-audiobook` / `test-coverage-plugin-translation` targets and updated `test-coverage-plugins` fan-out + `.PHONY` list. Initial coverage measured: audiobook 63%, translation 43%. ROADMAP PS-09 ticked; CHANGELOG Unreleased corrected "5 plugins" -> 7 and a matrix-expansion line added.

## 9. PS-10: plugin_config unused-parameter cleanup

- The `_check_license` callback in `backend/app/main.py` declared a `plugin_config` parameter that was never read. Long-standing ruff hint visible in every IDE session.
- Resolved via ruff auto-fix: `plugin_config` -> `_plugin_config`. No behavior change, the pluginforge `pre_activate` hook still receives the same two arguments — Python simply treats the leading-underscore name as an intentional unused parameter.

## 10. Roadmap + CHANGELOG updates

- ROADMAP.md through the session: TM-01/02/03/05 ticked off after the templates backend work; "Current focus" sentence updated to reflect Templates theme being largely done; TM-04 ticked with a one-line description after PS-08 work; PS-08 ticked and PS-09/10 queued with explicit descriptions; PS-09 ticked; PS-10 to tick in the wrap-up commit.
- CHANGELOG Unreleased section tracked through: templates theme end-to-end, coverage workflow on CI, PS-08 help content, dashboard theme toggle placement, CLAUDE.md data-model refresh, pre-existing TS error fix. PS-09 matrix expansion added. PS-10 auto-fix to add in the wrap-up commit.

---

## Statistics

- **Commits:** 30 on `main` between `9495d5b` (first TM-01 commit) and the PS-10 wrap-up.
- **Tests:** backend 473 -> 505 (+32), frontend 323 -> 351 (+28), plugins unchanged (audiobook 98, translation 35, kinderbuch 8, kdp 33, grammar 97, export 92, ms-tools 97). All green.
- **New files:** `backend/app/routers/templates.py`, `backend/app/routers/chapter_templates.py`, `backend/app/data/__init__.py`, `backend/app/data/builtin_templates.py`, `backend/app/data/builtin_chapter_templates.py`, `backend/tests/test_templates.py`, `backend/tests/test_chapter_templates.py`, 2 Alembic migrations, `frontend/src/components/SaveAsTemplateModal.tsx`, `ChapterTemplatePickerModal.tsx`, `SaveAsChapterTemplateModal.tsx` + 3 matching `.test.tsx` files, `docs/help/{de,en}/templates.md`, `e2e/smoke/create-book-from-template.spec.ts`, `.github/workflows/coverage.yml`.
- **New API surface:** `/api/templates/` (5 endpoints), `/api/books/from-template`, `/api/chapter-templates/` (5 endpoints).
- **New i18n namespaces:** `ui.template_genres`, `ui.save_template`, `ui.template_picker`, `ui.chapter_template_picker`, `ui.save_chapter_template` plus per-key additions in `ui.create_book`, `ui.sidebar`, `ui.editor`.
- **CI changes:** new `coverage.yml` workflow, plugin matrices expanded 5 -> 7.
- **Docs:** 1 new help page (DE + EN), 6 new FAQ entries, CLAUDE.md data-model updated, CHANGELOG Unreleased section opened.
- **Open polish items:** PS-11+ (catch-all for future surfaced items).
