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

---

## Release session (afternoon, 2026-04-18)

Continued the day with the YAML round-trip fix, three major frontend dependency upgrades, regression pinning, audit refresh, CI matrix cleanup, and cut v0.18.0.

### YAML round-trip (commits `364a6ff`, `3c8c10e`, `decb531`)

- **Root cause.** User reported that saving plugin settings through the Settings UI rewrote `backend/config/plugins/translation.yaml` from quoted/commented form to bare form. Traced to four call sites that use PyYAML's `yaml.dump`: `settings.py`, `plugin_install.py`, `audiobook.py`, `licenses.py`. PyYAML silently strips comments, blank lines, and quote styles.
- **Fix.** Introduced `backend/app/yaml_io.py` with `read_yaml_roundtrip` / `write_yaml_roundtrip` backed by ruamel.yaml in round-trip mode. Swapped all four write paths. Added ruamel.yaml ^0.18.0 as a backend dep.
- **PS-11.** Added 5 unit tests in `backend/tests/test_yaml_io.py` (byte-identical round-trip, `# INTERNAL` comment preservation, double-quote style preservation, missing-file error, parent-dir creation). Fixed missing Spanish diacritics across 4 plugin YAMLs: `translation` (Traduccion -> Traducción, automatica -> automática, via -> vía), `kinderbuch` (pagina -> página), `kdp` (validacion -> validación, publicacion -> publicación), `audiobook` (Generacion -> Generación, capitulos -> capítulos). ms-tools was already correct.
- **Regression pin at HTTP boundary.** Added `test_update_preserves_comments_and_formatting` in `test_settings_api.py` that POSTs to `PATCH /api/settings/plugins/export`, reads the YAML back from disk, and asserts both the mutated value AND the `# INTERNAL` comment AND the quote style survived. Negative-proof confirmed: swapping `yaml_io` back to PyYAML makes it fail.

### Dependency upgrades DEP-01 / DEP-04 / DEP-07 (commits `dbf8abe`, `43fc801`, `54f619f`, `3c6008c`)

- **DEP-01 (React 18 -> 19).** Bump-only. Verified first with `npm view` that every peer dep accepts React ^19 (TipTap 2.27.2, react-router-dom 6, react-toastify 11, react-markdown 10, lucide-react, @dnd-kit, Radix). Scanned for React 19 breakage patterns (`forwardRef`, `defaultProps`, `PropTypes`, `findDOMNode`, legacy lifecycle, `useRef<T>()` without initial value, `ReactDOM.render`) - found zero. Already using `createRoot`. tsc clean, 351 Vitest tests green, build clean.
- **DEP-04 (Vite 6 -> 7 + TS 5 -> 6).** Vite 8 aborted upstream: `vite-plugin-pwa@1.2.0` only lists peer deps through Vite 7. Cut scope to Vite 7. Raised `@vitejs/plugin-react` 4 -> 5 (needed for Vite 7 compat). TypeScript 5 -> 6 broke `node:fs`/`node:path` imports in `ChapterSidebar.test.tsx` because TS 6 no longer auto-includes every `@types/*` in node_modules. Fix: explicit `@types/node` devDep + `"types": ["node", "vite/client"]` in `tsconfig.json`. Vite 7 requires Node 20.19+/22.12+: switched dev from Node 18 to 22; CI already on 22. DEP-09 opened as a new tracked item for the Vite 7 -> 8 follow-up.
- **DEP-07 (lucide-react 0.468 -> 1.8.0).** Zero-touch. Researched the 1.0 migration notes via claude-code-guide: only breaking change was removal of 13 brand icons (GitHub, Instagram, Slack, etc.); Bibliogon's 32 lucide imports across 29 files use only semantic UI icons. tsc clean, 351 tests green, build clean.

### Coverage audit refresh + help/getstarted CI wiring (commits `a348ebb`, `8f36c25`)

- **Audit refresh (`docs/audits/current-coverage.md`).** Archived the v0.14.0 snapshot to `history/2026-04-13-coverage.md`. Collected fresh numbers: 511 backend, 373 plugin (in the `make test` matrix), 36 plugin (orphaned), 351 Vitest, 193 Playwright (across 19 spec files). Deltas vs 2026-04-13 baseline: +44 backend, +65 plugin, +28 Vitest, +105 E2E. 4 of 5 previously-open E2E gaps closed.
- **Help + Getstarted joined the CI matrix.** `Makefile` gets `test-plugin-help` / `test-plugin-getstarted` + coverage targets; `test-plugins` and `test-coverage-plugins` aggregators extended. Both plugins added to `ci.yml` and `coverage.yml` plugin matrices. `pytest-cov` as dev dep for both; `httpx` added to help (its tests use `starlette.TestClient`). `make test` now runs 409 plugin tests across 9 suites.

### Release v0.18.0 (commits `0da8a20`, `953da46`, `a4eca1b`, tag `v0.18.0`)

- **Pre-flight help check.** Only one stale reference found: `docs/help/en/developers/plugins.md` line 342 still named React 18. Updated to `React 19, TypeScript 6, Vite 7`. No other version drift in the help content.
- **SemVer decision.** v0.17.0 -> v0.18.0. Minor bump: substantial new feature (templates), three major dep upgrades, infrastructure (CI coverage + matrix), polish. No breaking changes for users.
- **Changelog.** Rewrote the existing `[Unreleased]` block into `[0.18.0] - 2026-04-18` with three sections (Added / Changed / Fixed) plus a "Known pending post-release" note that UI smoke testing of the three DEP upgrades is scheduled for a dedicated post-release session. `CHANGELOG-v0.18.0.md` created at repo root for the GitHub release body.
- **Version bumps.** `backend/pyproject.toml` 0.17.0 -> 0.18.0, `frontend/package.json` 0.17.0 -> 0.18.0, `install.sh` VERSION 0.17.0 -> 0.18.0, `backend/app/main.py` FastAPI version string 0.17.0 -> 0.18.0, `CLAUDE.md` version line updated, `ROADMAP.md` "Latest release" line updated. `backend/app/__init__.py` still empty (no `__version__` maintained there - left alone).
- **Dependency currency review.** Ran `poetry show --outdated`. Patch-level bumps available (pydantic, numpy, mypy, etc.) but deliberately deferred: release already carries three major frontend DEPs; stability filter from lessons-learned says don't pile on right before ship. elevenlabs 0.2 -> 2.x is DEP-05 (dedicated session), starlette 1.0 / rich 15 / ruamel.yaml 0.19 deferred to next cycle.
- **Test gate.** Full `make test` green: 511 backend + 9 plugin suites (92 + 10 + 33 + 8 + 97 + 35 + 98 + 30 + 6 = 409) + 351 Vitest = 1,271 automated tests. tsc clean. Frontend `vite build` + PWA regen clean on Node 22.
- **mypy status.** 14 pre-existing errors (all "Returning Any" from `yaml.safe_load`/`read_yaml_roundtrip` or untyped plugin imports). Verified pre-existing via stash test on v0.17.0 state. Not a release regression.
- **Tag and release.** `v0.18.0` pushed to `origin main` and `origin v0.18.0`. GitHub release published via `gh release create` with `CHANGELOG-v0.18.0.md` as body: <https://github.com/astrapi69/bibliogon/releases/tag/v0.18.0>.
- **Docker push:** skipped (not active in release pipeline).
- **MkDocs deploy:** GitHub Action will fire on the main push automatically.

### Post-release follow-ups pending

- UI smoke test session for DEP-01 / DEP-04 partial / DEP-07 (browser-level visual + interaction testing on a running instance). Owner: Aster.
- DEP-09 (Vite 7 -> 8) when vite-plugin-pwa publishes Vite 8 compat. Owner: Aster, re-check cadence ~2 weeks.
- Deferred patch-level dep bumps (pydantic 2.13.1 -> 2.13.2, numpy 2.4.3 -> 2.4.4, click 8.1 -> 8.3, etc.) for the next release cycle.

---

## Second release of the day: v0.19.0 (late afternoon)

Two major workstreams shipped: the donation integration (S-series) plus the content-safety overhaul. Both ended with a release.

### Donation integration (S-01/02/03), 8 commits

- **S-01 Support Settings tab.** Conditional 4th Radix tab in `Settings.tsx`; `SupportSection.tsx` renders channels from `config.donations` with an optional "Recommended" star on Liberapay. `donations.enabled: false` hides the entire tab.
- **S-02 One-time onboarding dialog.** Mirrors the `AiSetupWizard` pattern. Trigger: Dashboard's book-creation handlers, gated on `books.length === 0` BEFORE the create and the `bibliogon-donation-onboarding-seen` localStorage flag being unset. Every dismiss path sets the flag. Two-step UX: intro -> channel picker if no `landing_page_url`.
- **S-03 90-day reminder banner** on Dashboard with pure `shouldShowReminder` helper. 180-day cooldown on "Support", 90 on "Not now" and close. Never during editor/export routes; never before S-02 is seen.
- **Donation config** added to `app.yaml.example` with `enabled` kill switch, `landing_page_url` override, and the four active channels. Not in the PATCH schema (project-level only).
- **Help page** `docs/help/{de,en}/support.md` with FAQ (tax-deductibility, anonymity, recurring vs one-time). New top-level nav entry "Support" / "Unterstuetzen" with icon `heart` (nav count 14 -> 15).
- **i18n** for all 8 languages.
- **31 new Vitest tests** across `SupportSection`, `DonationOnboardingDialog`, `DonationReminderBanner`. 2 new backend tests pin the GET `/api/settings/app` donation shape and kill-switch behavior.

### Content safety audit + implementation (13 commits, 7 Critical + 6 Major gaps closed)

Audit findings (`Content Safety Audit` prompt):
- **Critical**: autosave's success-path lie (status flipped to "saved" and draft deleted before onSave resolved), save-failure UX (swallowed in console.error), no beforeunload/pagehide/visibilitychange flush, no offline detection, no optimistic locking, no 409 handling, no version column on Chapter.
- **Major**: no AbortController dedup, SQLite on default rollback-journal + sync=FULL, no chapter_versions table, no frontend save-path tests, no E2E crash-recovery test, no mypy gate on regressions.

Implementation arc (13 commits):
1. `db57892` fix(editor): `await onSave` before success side effects - closes the silent-loss path
2. `c8de0fd` feat(editor): toast + retry on save failure, new `notify.saveError(message, onRetry, retryLabel)` + `SaveErrorContent` React component
3. `8d70fe1` feat(editor): `useFlushOnUnload` hook registers beforeunload/pagehide/visibilitychange; IndexedDB write via Dexie + best-effort `fetch(..., {keepalive: true})`
4. `43195aa` feat(editor): offline detection + reconnect auto-flush; new `useOnlineStatus`, `OfflineBanner`, `syncAllDrafts`
5. `1422631` feat(models): `Chapter.version` column + migration `e1f2a3b4c5d6`
6. `7a8735e` feat(api): optimistic locking on PATCH /chapters, 409 with structured detail body; client helper normalises dict detail into `ApiError.detailBody`
7. `5db75d8` feat(editor): `ConflictResolutionDialog` with side-by-side TipTap text preview, Keep/Discard resolution
8. `01d13b1` feat(api-client): per-chapter `AbortController` dedup + new `SaveAbortedError` class
9. `2d5ce21` feat(db): SQLAlchemy event listener sets `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`. Measured side effect: `make test` runtime 2:03 -> 15s.
10. `2e8747f` feat(versioning): `chapter_versions` table + migration `f2a3b4c5d6e7`, retention=20, 3 new endpoints, `ChapterVersionsModal` + sidebar context-menu entry
11. `8826714` test(backend): 12 tests covering the optimistic lock contract, 409 payload shape, `updated_at` bumps, snapshot-on-PATCH, retention at exactly 20, restore with pre-restore snapshot, PRAGMA probes
12. `02cf1df` test(frontend): 15 Vitest tests for `useOnlineStatus`, `useFlushOnUnload`, `ConflictResolutionDialog`
13. `76a2974` test(e2e): 2 Playwright smoke specs (force-close recovery via IndexedDB seeding, `context.setOffline()` transitions)

Breaking API change shipped: PATCH /chapters now requires `version` (422 without). All backend test helpers + `api.chapters.update` + `OfflineBanner.syncAllDrafts` + `BookEditor.handleSaveContent` / `handleRenameChapter` updated in the same commit that landed the backend change.

### MkDocs installation restructure (1 commit)

- `342617e` Installation top-level nav with Overview + Windows + macOS + Linux + Uninstall. URLs preserved via flat slug structure. macOS + Linux pages written from scratch covering Gatekeeper, `xattr` fallback, glibc 2.35+, Docker group setup, optional `python3-tk`.

### GitHub issue filed post-content-safety

- **#8** UI + E2E smoke test for content safety: Playwright recovery + offline flush + 5 manual UX checks (autosave+retry, beforeunload flush, offline reconnect, multi-tab 409 conflict, version-history restore). Covers the paths E2E cannot reliably test.

### Release v0.19.0 (5f02f57 changelog, 606b2f7 version bump)

- **SemVer decision.** v0.18.0 -> v0.19.0. Minor bump despite a breaking PATCH API change; the break is contained to clients calling the chapters endpoint and the frontend was updated in the same commit. No plugin contract change.
- **Changelog.** Lead with content safety (the user-visible headline that protects against data loss). Donation integration second. MkDocs restructure third. Known-pending post-release block calls out issue #5 (DEP upgrades + donation UI) and issue #8 (content safety smoke).
- **Version bumps.** Standard 5 locations.
- **Dependency review.** No new bumps. Same deferred set as v0.18.0. Stability filter says don't pile on a release that already carries a big breaking change.
- **Test gate.** Full `make test` green: 525 backend + 9 plugin suites (409 tests) + 397 Vitest = 1,331 automated tests. tsc clean. `vite build` + PWA regen clean.
- **Tag and release.** `v0.19.0` pushed, GitHub release published via `gh release create` with `CHANGELOG-v0.19.0.md` body.
- **MkDocs deploy** fired on the main push.

### Post-release follow-ups pending

- UI smoke test for content safety (issue #8): 2 Playwright scenarios + 5 manual UX checks.
- DEP-09 Vite 7 -> 8 still blocked upstream on vite-plugin-pwa.
- Patch-level dep bumps deferred again.
