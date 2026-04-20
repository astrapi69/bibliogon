# Changelog - Bibliogon

Completed phases and their content. Current state in CLAUDE.md, open items in ROADMAP.md.

## [0.20.0] - 2026-04-20

AI Review Extension is the headline feature. The existing chapter review grows from a single sync path into a three-mode async flow with persistent Markdown reports, cost estimates, and full 8-language prompt parity. Three real backend bugs in backup / batch export / smart-import are fixed along the way. Playwright smoke suite drops from 31 failures to zero.

### Added

**AI Review Extension**
- Three primary focus modes in the Editor's AI panel: **Style**, **Consistency** (new; within-chapter contradictions, distinct from the legacy `coherence` focus), **Beta Reader** (new; open-ended simulated first-read feedback). Mutually exclusive radio buttons; the four legacy focus values stay on the API for power users but no longer appear in the UI.
- Async review flow: `POST /api/ai/review/async`, `GET /api/ai/jobs/{id}`, `GET /api/ai/jobs/{id}/stream` (SSE), `DELETE /api/ai/jobs/{id}`. Rotating book-language status messages during the 5-60s job while the editor stays usable.
- Persistent Markdown reports under `uploads/{book_id}/reviews/{review_id}-{chapter-slug}-{YYYY-MM-DD}.md`. `GET /api/ai/review/{id}/report.md?book_id=...` returns a `FileResponse`. Download button on the result panel.
- Cascade delete on chapter removal wipes matching review files.
- Chapter-type-aware prompts for all 31 `ChapterType` values; `ReviewRequest` gains `chapter_type`; the legacy sync `POST /api/ai/review` threads it through the same builder.
- Non-prose warning above the Start button for 12 chapter types (`title_page`, `copyright`, `toc`, `imprint`, `index`, `half_title`, `also_by_author`, `next_in_series`, `call_to_action`, `endnotes`, `bibliography`, `glossary`), rendered in the book's language.
- Token + USD cost preview on the Start button (`POST /api/ai/review/estimate`, chars/4 heuristic + small per-model pricing dict).
- `GET /api/ai/review/meta` exposes UI focus values, primary focus list, non-prose types, supported languages, chapter types so the frontend avoids hardcoding.
- Full 8-language prompt parity via a shared `LANG_MAP`; marketing prompt builder re-uses the same map.
- New `backend/app/ai/prompts.py`, `pricing.py`, `review_store.py`. Thin `routes.py`.
- i18n: six new UI keys per language x 8 languages.

**Tests**
- 31 new backend tests (AI review extended + cascade + store utilities).
- 9 regression tests pinning the three backend fixes.
- 8 frontend Vitest tests for 8-lang strings + non-prose-set parity.
- 4 Playwright smoke tests for the AI review UI.
- 16 smoke test-infra fixes (selector narrowing, seed corrections, timing tolerances, testid coverage, assumption refreshes).

### Fixed

- **`backup_import` now restores soft-deleted books** instead of silently skipping. Dedup check predated the trash feature. Fix: hard-delete the stale row + its chapters + assets, then fall through to the fresh-insert path.
- **Batch export no longer raises `FileNotFoundError`**. `plugin-export.export_batch_route` collected per-format paths across a loop, but manuscripta's `run_export` moves `project/output/` to `project/backup/` on every call. Fix: copy each format's output into a stable `tmp_dir/batch/` staging dir before the next `run_pandoc`.
- **`smart-import` handles Pandoc-wrapped `metadata.yaml`**. `safe_load` rejected the multi-document stream (`---` / `---` markers); fix uses `safe_load_all` + first non-empty document.
- **Launcher release workflows** inherit the v0.19.1 permissions fix; tag push attaches Windows / macOS / Linux binaries as release assets.

### Changed

- `POST /api/ai/review` (sync) accepts `chapter_type`; backward-compatible default `"chapter"`.
- `_build_review_system_prompt` is a thin alias for `prompts.build_review_system_prompt` (existing test imports keep working).
- Classic palette first-line indent override uses `h* + p:not(:first-child)` to beat the base rule's specificity.
- CreateBookModal Radix Select trigger gains `data-testid="create-book-author-select"`.

### Documentation

- AI help pages (`docs/help/{de,en}/ai.md`) rewrite the Chapter Review section with focus-mode guidance, non-prose warning, cost estimate, async progress, persistence + download.
- `docs/API.md` documents the 8 new `/api/ai/` endpoints.
- `.claude/rules/lessons-learned.md` adds 7 pitfalls from the release window.
- `docs/audits/current-coverage.md` gets a v0.20.0 addendum with the +181 test delta.
- Medium blog post for v0.19.1 archived under `docs/blog/`.

### Known pending post-release

4 Playwright smoke skips tracked in GitHub issue #9: three chapter-sidebar dropdown / layout tests at 125% + 150% CSS zoom, one editor word-count test (TipTap useEditor transaction re-render). Deferred major dependency bumps: elevenlabs 0.2 -> 2.43, starlette 0.46 -> 1.0, rich 14 -> 15. Pillow 12 still blocked upstream by manuscripta.

## [0.19.1] - 2026-04-20

Maintenance release. Two user-visible fixes (i18n labels, backup resource leak), launcher release-workflow unblocked, and a substantial code-hygiene sweep (ruff + mypy + pre-commit wired into CI). No schema changes, no API breakage.

### Fixed
- **Front Matter / Back Matter labels translated.** The two section headers in the BookEditor chapter sidebar were hardcoded English strings. Now pulled from `ui.editor.front_matter` / `back_matter` in all 8 i18n YAMLs.
- **Backup: zip file handle leak in `smart_import`.** The zip handle was not closed on all code paths, keeping the file locked on Windows and leaking file descriptors on long-running backends. Explicit `close()` in a `finally` block.
- **Launcher release workflows granted `contents: write`.** `softprops/action-gh-release@v2` was failing with "Resource not accessible by integration" on tag pushes because the default `GITHUB_TOKEN` is read-only. All three launcher workflows (Linux, macOS, Windows) now declare `permissions: contents: write` at top level. Tagged releases publish the prebuilt launcher binaries + SHA256 checksums as release assets.

### Changed
- **Dependency bump: react-router-dom to ^7.14** (DEP-03). Backward-compatible minor within the v7 line.

### Internal
- **ruff configured and applied** across the backend; conservative rule set plus whole-tree auto-fix sweep.
- **mypy errors closed.** 14 pre-existing `[no-any-return]` and `[import-untyped]` errors fixed without loosening the type-checker config.
- **pre-commit installed and enforced.** Whole-tree formatter sweep landed as a single commit; every subsequent commit must pass the hook stack.
- **CI jobs for pre-commit + ruff + mypy** in `.github/workflows/ci.yml`.
- **release-workflow Step 5** uses `poetry run` for `ruff check` / `mypy` (docs fix).

### Tests
- **Licensing: full unit coverage** for `app.licensing` (payload, signatures, expiry edges, wildcard plugin `*`).
- **Backup: direct unit tests** for archive, asset, markdown utility modules.
- **Backup: persistence + HTTP route coverage** for `backup_history`.
- **Async event-loop hygiene** in backend tests — `asyncio.run()` replaces manual loop construction.
- **Frontend sanitizer test** no longer sets an iframe `src` (silences happy-dom fetch warning).

### Docs
- Exploration docs for AI review extension architecture and the children's-book plugin (architecture finalized, implementation deferred).
- Audit docs — backup_history + backup utils coverage gaps closed; polish audit 2026-04-18 captured; placeholder hashes replaced with real hashes.
- Roadmap — conflict-dialog "Save as new chapter" TODO promoted to PS-13.
- Session journals backfilled for April 1–12; gitignore aligned with ai-workflow.md so journals are actually committed.
- DEP-09 still blocked on vite-plugin-pwa compat.

### Known pending post-release

Playwright smoke suite: 135 passed / 31 failed. Three-sample triage (content-safety, dashboard-filters, editor-formatting Ctrl+Z) classified all three as test-infrastructure drift or latent test-code bugs that predate v0.19.1 — no user-visible regressions identified. Full triage of the remaining 28 failures tracked in GitHub issue #9, mandatory before v0.20.0. `make test` (backend 598 + Vitest 397 + tsc + ruff + mypy + pre-commit) remains the authoritative release gate and is all green.

## [0.19.0] - 2026-04-18

Content safety is the headline of this release. A silent data-loss path in autosave (status flipped to "saved" and the IndexedDB draft was deleted before the server round-trip completed) is closed, and the whole save pipeline is hardened against tab crashes, offline outages, concurrent edits from a second tab, and accidental overwrites. Plus the donation-integration S-series (Liberapay, GitHub Sponsors, Ko-fi, PayPal) and an MkDocs restructure that finally gives macOS and Linux launcher users proper documentation.

### Added

**Content safety**
- **Autosave awaits server acknowledgment.** The Editor's save-status indicator no longer flips to "saved" and the IndexedDB draft is no longer deleted before `onSave` resolves. On failure the status stays in `error` and the draft is retained as the safety net.
- **Save-failure toast with retry.** On network / server error the user sees a dismissible toast with a Retry button that re-triggers the save immediately. The IndexedDB draft is preserved until the retry succeeds.
- **`beforeunload` / `pagehide` / `visibilitychange` flush.** New `useFlushOnUnload` hook registers all three events. On tab close / mobile background / iOS pagehide the pending debounce is cancelled, the current content is written to IndexedDB via Dexie's transaction queue (which survives the tab dying), and a best-effort `fetch(..., {keepalive: true})` PATCH is attempted.
- **Offline detection with reconnect flush.** New `OfflineBanner` (mounted globally in `App.tsx`) watches `navigator.onLine`. While offline, save failures suppress the retry toast (the banner is authoritative). On reconnect, `syncAllDrafts` iterates every IndexedDB draft, fetches the current server version, PATCHes the content with the correct version, and toasts a summary ("Kapitel synchronisiert: N" or `sync_partial` if any failed).
- **Optimistic locking on PATCH /chapters.** New `Chapter.version` column (Alembic migration `e1f2a3b4c5d6`), required `version` field on `ChapterUpdate`, 409 with structured detail `{error, message, current_version, server_content, server_title, server_updated_at}` on mismatch. The backend bumps `version += 1` on every successful write.
- **Conflict resolution dialog.** New `ConflictResolutionDialog.tsx` shows a side-by-side preview of local vs server content on 409. Two primary actions: "Meine Änderungen behalten" (force-save with the new server version) and "Meine Änderungen verwerfen" (pull the server version into the editor).
- **`chapter_versions` table with restore flow.** New table (Alembic migration `f2a3b4c5d6e7`) stores an immutable snapshot of the pre-update content on every successful PATCH. Retention policy: last 20 per chapter, trimmed after each insert. Three new endpoints: `GET /api/books/{bid}/chapters/{cid}/versions`, `GET /api/books/{bid}/chapters/{cid}/versions/{vid}`, `POST .../restore`. Frontend: "Versionsverlauf" entry in the chapter context menu opens `ChapterVersionsModal` with a scrollable list and per-entry Restore button. Restore snapshots the current state before overwriting so nothing is lost.
- **AbortController per-chapter save dedup.** `api.chapters.update` aborts any prior in-flight save for the same chapter before starting a new one. Aborts surface as a new `SaveAbortedError` class that the Editor treats as a no-op. Latest save always wins; no more races between rapid keystrokes.
- **SQLite PRAGMA on every connection.** SQLAlchemy event listener enables `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`. WAL unblocks concurrent readers during background jobs; `foreign_keys=ON` is a correctness fix (ON DELETE CASCADE was silently ignored without it); NORMAL sync removes per-commit fsync. **Side effect: `make test` runtime dropped from ~2:03 to ~15s** on the reference machine.
- **12 new backend tests** (`test_chapter_versioning.py`, `test_database_pragma.py`) covering the optimistic-lock happy path, the 409 detail shape, the `version`-required 422, `updated_at` bumps, snapshot creation on PATCH, retention at exactly 20 per chapter, the restore endpoint's overwrite + snapshot contract, PRAGMA WAL / synchronous=1 / foreign_keys=1.
- **15 new frontend Vitest tests** (`useOnlineStatus`, `useFlushOnUnload`, `ConflictResolutionDialog`) pinning the online/offline transitions, the three-event flush contract, and the conflict-dialog callback invariants.
- **Two Playwright E2E specs** (`e2e/smoke/content-safety.spec.ts`): tab-crash recovery via IndexedDB seeding and `offline → online` flush via `context.setOffline()`.

**Donation integration (S-series)**
- **S-01 Support Settings tab.** New `SupportSection.tsx` rendered as a conditional 4th Radix tab in `Settings.tsx`. Shows one card per channel with name, optional "Recommended" star (Liberapay), localised description, and an external-link button (`target="_blank"`, `rel="noopener noreferrer"`). `donations.enabled: false` in `app.yaml` hides the entire tab; `landing_page_url` collapses the UI to one primary button.
- **S-02 One-time onboarding dialog.** New `DonationOnboardingDialog.tsx` mirroring the AiSetupWizard pattern. Trigger: Dashboard's book-creation handler, gated on `books.length === 0` BEFORE the create and the `bibliogon-donation-onboarding-seen` localStorage flag being unset. Every dismiss path sets the flag; two-step UX falls back to a channel list when `landing_page_url` is null.
- **S-03 90-day reminder banner.** New `DonationReminderBanner.tsx` + pure `shouldShowReminder` helper. Shown at the top of the Dashboard when all of: donations enabled, onboarding seen, `bibliogon-first-use-date` at least 90 days old, `bibliogon-donation-reminder-next-allowed` missing or in the past. Dismiss paths: "Support the project" sets a 180-day cooldown, "Not now" / close-X set 90 days. Never during an editor/export session (Dashboard is a separate route).
- **Donation config** in `backend/config/app.yaml.example` with `enabled` kill switch, `landing_page_url` override, and the four active channels (Liberapay, GitHub Sponsors, Ko-fi, PayPal). Not editable via the Settings UI; project-level YAML only.
- **Help page** `docs/help/{de,en}/support.md` registered in `_meta.yaml` with `heart` icon. Channel descriptions, FAQ covering tax-deductibility, anonymity per platform, recurring vs one-time, how to cancel, why no direct bank transfer. Top-level nav entry (15 entries total).
- **i18n for all 8 languages** (`ui.donations.*`: tab, section_title, intro, recommended_badge, support_button, understood_button, not_now_button, onboarding_title / body / hint, reminder_body, reminder_close, 4 channel descriptions).

**Documentation**
- **MkDocs installation restructure.** New top-level "Installation" nav section with five children: Overview landing page, Windows Launcher (existing, harmonised), macOS Launcher (new), Linux Launcher (new), and Uninstall (pulled into the section). URLs preserved via flat slug structure: `/launcher-windows/` still works, plus new `/launcher-macos/`, `/launcher-linux/`, `/installation/`. Top-level nav count stays at 14 (Installation replaces the standalone "Windows Launcher" entry).
- **macOS launcher page** covers arm64-only builds, the right-click → Open Gatekeeper bypass, the `xattr -d com.apple.quarantine` fallback, `shasum -a 256` verification, the `~/Library/Application Support/bibliogon/` config dir.
- **Linux launcher page** covers glibc 2.35+ requirement, Docker group setup, `chmod +x`, `sha256sum`, the optional `python3-tk` runtime, `~/.config/bibliogon/` config dir.
- **mkdocs.yml nav regenerated** from `_meta.yaml`. The committed nav was stale against the meta file and missing templates, ai, themes, and developers/plugins entries that had been added since v0.17.0.

### Changed
- **PATCH /chapters is a breaking API change** for any client that does not send `version`. The schema rejects missing `version` with 422 (Pydantic). Backend test helpers and the frontend `api.chapters.update` signature were both updated; any third-party caller must add `version` or pre-fetch the chapter first. The `OfflineBanner` reconnect flush already does a GET before each PATCH to read the server-side version.
- **`api.chapters.update` is now async with abort semantics.** New `SaveAbortedError` exported from `frontend/src/api/client.ts`. Callers should treat it as a no-op (the Editor already does).

### Fixed
- **Chapter Rename rejected stale version** silently before - it followed the same last-write-wins path as chapter content. With optimistic locking in place, the rename handler catches `SaveAbortedError` from the dedup layer and suppresses the "Rename failed" toast on abort (rapid-rename races).

### Known pending post-release

A UI smoke-test session is scheduled to cover three areas on the running app:
- DEP-01 / DEP-04 partial / DEP-07 zero-touch upgrades carried over from v0.18.0 (GitHub issue #5)
- S-01 / S-02 / S-03 donation UI surfaces (GitHub issue #5 mentions this too but the primary tracker is this CHANGELOG)
- Content safety: Playwright recovery and offline specs plus a manual checklist for the 5 UX paths that E2E cannot cover cleanly (GitHub issue #8)

Automated coverage is in place (530+ backend + 400+ Vitest tests, all green) but multi-tab 409 conflict, beforeunload-on-tab-close, mobile Safari pagehide, and the version-history restore modal need human eyes before v0.19.0 gets a clean bill of health.

## [0.18.0] - 2026-04-18

Templates are the headline feature: reusable book and chapter structures, with 5 book builtins and 4 chapter builtins seeded at startup, covering front-matter, back-matter, and specialised content types. Three major frontend dependency upgrades landed cleanly (React 18 -> 19, Vite 6 -> 7, TypeScript 5 -> 6, lucide-react 0 -> 1) with every automated check green; a dedicated UI smoke-test session is scheduled post-release. Plugin YAML saves no longer silently strip comments.

### Added
- **Book templates (TM-01, TM-02, TM-03, TM-05).** `BookTemplate` + `BookTemplateChapter` tables (Alembic migration `b7c8d9e0f1a2`), `/api/templates/` CRUD with `is_builtin` enforcement (403 on PUT/DELETE to builtins, 409 on duplicate name), 5 new `ChapterType` values (`half_title`, `title_page`, `copyright`, `section`, `conclusion`), and 5 builtins seeded idempotently at startup: Children's Picture Book, Sci-Fi Novel, Non-Fiction / How-To, Philosophy, Memoir. Frontend: `CreateBookModal` gains a Radix Tabs "Blank / From template" toggle; `POST /api/books/from-template` creates the book + all chapters in a single commit. Save-as-template action in the `ChapterSidebar` footer with empty-placeholder vs preserve-content modes. User templates have a trash-icon delete; builtins show a "Built-in" lock badge.
- **Chapter templates (TM-04).** `ChapterTemplate` table (migration `c8d9e0f1a2b3`), `/api/chapter-templates/` CRUD, 4 builtins seeded as TipTap JSON: Interview, FAQ, Recipe, Photo Report. "From template..." entry in the new-chapter dropdown opens `ChapterTemplatePickerModal`; "Save as template" entry in each chapter's ContextMenu opens `SaveAsChapterTemplateModal` (same empty/preserve content choice). Mirrors the book-template UX and 403/409 behavior.
- **Templates i18n.** All template UI strings localised to the 8 supported languages (DE, EN, ES, FR, EL, PT, TR, JA).
- **Coverage workflow on CI.** `.github/workflows/coverage.yml` runs on every push to main and every PR. Uploads HTML + XML coverage artifacts (14-day retention) for backend, all plugins, and frontend. `make test-coverage` is an explicit opt-in local target; `make test` stays fast and coverage-free.
- **PS-09: CI plugin matrix expansion.** `ci.yml` and `coverage.yml` matrices extended to include audiobook + translation alongside the original five. Initial coverage: audiobook 63%, translation 43%.
- **Help + Getstarted plugins now in CI matrix.** 36 previously-orphaned plugin tests (help 30, getstarted 6) are now run by `make test` and the CI plugin matrix. `pytest-cov` added to both plugins; `httpx` added to help for `starlette.TestClient`.
- **Templates help content (PS-08).** New `docs/help/{de,en}/templates.md` pages registered in `_meta.yaml`, plus 6 new FAQ entries in `backend/config/plugins/help.yaml` (DE + EN). Two stale "21 chapter types" FAQ answers refreshed to 31 with the new types listed.
- **YAML round-trip tests (PS-11).** 5 unit tests in `backend/tests/test_yaml_io.py` pinning byte-identical round-trip, `# INTERNAL` comment preservation, quote-style preservation, error handling, and parent-directory creation. Plus 1 HTTP-level integration test in `test_settings_api.py` (`test_update_preserves_comments_and_formatting`) that pins the same behavior through `PATCH /api/settings/plugins/{name}`.
- **Coverage audit refresh.** `docs/audits/current-coverage.md` regenerated for v0.18.0. Deltas since 2026-04-13 baseline: +44 backend tests, +65 plugin tests (+36 once help/getstarted joined the matrix), +28 Vitest, +105 E2E. 4 of 5 previously-open E2E gaps closed this cycle.

### Changed
- **React 18 -> 19 (DEP-01).** `react`, `react-dom`, `@types/react`, `@types/react-dom` bumped to `^19.2.0`. No code changes required: the codebase was already on `createRoot` and has no `forwardRef`/`defaultProps`/`PropTypes`/`findDOMNode`/legacy lifecycle usage. All peer deps (TipTap 2.27.2, react-router-dom 6, react-toastify 11, react-markdown 10, lucide-react, @dnd-kit, Radix) accept React ^19.
- **Vite 6 -> 7 + TypeScript 5 -> 6 + @vitejs/plugin-react 4 -> 5 (DEP-04 partial).** Vite 7 brings a Node floor of 20.19+/22.12+ (CI's Node 22 is fine; local dev must now use Node 22+). TypeScript 6 no longer auto-includes every `@types/*` in node_modules, so `@types/node` is now explicit in `package.json` and `tsconfig.json` gets `"types": ["node", "vite/client"]`. Vite 8 is deferred to DEP-09: `vite-plugin-pwa@1.2.0` (the current latest) still lists peer deps through Vite 7 only.
- **lucide-react 0.468 -> 1.8.0 (DEP-07).** Zero-touch upgrade: the only breaking change in 1.0 was removal of 13 brand icons (GitHub, Slack, Chromium, etc.) and Bibliogon uses only semantic UI icons. Bonus: UMD format dropped (smaller bundle), `aria-hidden` auto-added on icons for a11y.
- **Plugin YAML writes preserve comments and formatting.** The settings API (`PATCH /api/settings/plugins/{name}`), plugin install, audiobook config, and license routes all swapped from PyYAML's `yaml.dump` (which silently strips comments, blank lines, quote styles) to a shared ruamel.yaml round-trip helper in `backend/app/yaml_io.py`. A save from the UI now leaves `# INTERNAL` markers and formatting intact.
- **Dashboard theme toggle placement.** The `ThemeToggle` icon moved from an isolated spot next to "Neues Buch" into the rightmost position of the header icon cluster (after Trash). Mobile hamburger gets a matching Sun/Moon entry.
- **CLAUDE.md.** Chapter-type count bumped 26 -> 31; BookTemplate and ChapterTemplate entries added to the Data model section; Commands block now documents `make test-coverage`.

### Fixed
- **Spanish accents restored across plugin YAMLs (PS-11).** `translation.yaml`, `kinderbuch.yaml`, `kdp.yaml`, and `audiobook.yaml` had missing diacritics in their Spanish `display_name`/`description` strings (`Traduccion`, `pagina`, `validacion`, `publicacion`, `Generacion`, `capitulos`). Corrected to the proper forms.
- **Pre-existing TS error in `SaveAsTemplateModal.test.tsx`.** The mocked `ApiError` constructor only accepted 2 args while the real class requires 4-6, causing `tsc --noEmit` to fail silently. Mock signature widened to match the real class.
- **PS-10 unused-parameter warning in `_check_license`.** The `plugin_config` parameter in `backend/app/main.py` was never read but had to stay in the signature for pluginforge's `pre_activate` hook contract. Renamed to `_plugin_config`.

### Known pending post-release

A dedicated UI smoke-test session is scheduled after v0.18.0 ships to verify DEP-01 (React 19), DEP-04 partial (Vite 7 + TS 6), and DEP-07 (lucide 1.x) on the running application. These are verified by the automated test suite (tsc clean, 351 Vitest tests green, `vite build` + PWA regen clean) but browser-level visual regression testing has not been performed. Report any rendering or interaction issues via the bug-session workflow.

## [0.17.0] - 2026-04-17

Distribution is now one-click on Windows, macOS, and Linux. The Bibliogon launcher handles install, uninstall, Docker lifecycle, and update notifications without any terminal step. Dependency currency restored with the manuscripta 0.9.0 upgrade.

### Added
- **One-click launcher install (D-01, D-02, D-03).** The Windows `.exe`, macOS `.app` bundle (arm64), and Linux PyInstaller binary now handle the full distribution flow: folder picker, ZIP download from GitHub Releases, extraction, `.env` generation, `docker compose up --build -d`, health check, and browser open. No Git Bash or terminal required. Manifest at `install.json` tracks installation state; corrupt or missing file is treated as "not installed, show install UI". Tests: 142 launcher tests.
- **One-click launcher uninstall.** Confirmation dialog, `docker compose down`, dynamic volume + image removal via `docker volume ls --filter name=bibliogon` / `docker images --filter reference=*bibliogon*`, directory removal, manifest deletion. All Docker operations are best-effort (no Docker running = skip that step, never abort). `uninstall.sh` script ships as the CLI-based alternative.
- **Pending cleanup retry.** If uninstall is interrupted mid-flight (process killed, Docker locked files, power loss), the launcher writes `cleanup.json` at the start and marks each step `true` as it completes. On next launch, the launcher silently retries each step still marked `false`. A one-time warning fires only if `rmtree` still fails (the user may need to delete the directory manually).
- **Activity log with rotation.** All launcher events (install, uninstall, Docker ops, errors) write to `install.log` in the platformdirs config dir via `RotatingFileHandler` (1 MB max, 1 backup). Legacy `launcher.log` under `APPDATA/Bibliogon/` is kept for backward compatibility.
- **Auto-update check (D-04).** Background daemon thread polls `https://api.github.com/repos/astrapi69/bibliogon/releases/latest` on every launcher start, compares against the installed version in `install.json`, and shows a three-button dialog (Open release page / Dismiss / Don't check for updates) when a strictly newer release is available. All failures are silent (network, timeout, rate limit, malformed response). Stdlib-only (urllib + threading). 21 tests.
- **Settings dialog with opt-out.** Settings button in the main launcher UI opens a dialog with an `auto_update_check` checkbox (default on). Persists to `settings.json` in the platformdirs config dir. The notification's "Don't check for updates" button also flips this setting. 17 tests covering defaults, corruption fallback, persistence, guard behavior.
- **macOS CI workflow (D-02).** `launcher-macos.yml` runs on `macos-14`, generates `bibliogon.icns` via new `scripts/make_icns.py` + `iconutil`, builds the `.app` bundle from the cross-platform spec file, and produces `bibliogon-launcher-macos.zip` with SHA256. arm64-only for initial release; unsigned binary requires Gatekeeper bypass on first launch.
- **Linux CI workflow (D-03).** `launcher-linux.yml` runs on `ubuntu-22.04`, installs `python3-tk` before PyInstaller, builds a 13 MB ELF binary from the same spec file. No source changes were needed; the spec file was already cross-platform aware.
- **Distribution smoke test template.** `docs/manual-tests/distribution-smoke-test.md` now covers all 6 flows: install.sh, Windows launcher, launcher install/uninstall + cleanup retry + activity log, Linux binary, macOS .app, and `uninstall.sh`. GitHub issues #2, #3, #4 track the three pending platform smoke tests.

### Fixed
- **install.sh VERSION pin** (`cfcac6f`). The default was hardcoded to `v0.7.0`, an ancient release where the Docker build architecture was fundamentally different (`build: ./backend` context vs. current `context: .`). Fresh installs via `curl | bash` were cloning the wrong code and hitting plugin-path failures. Now pinned to `v0.16.0` / `v0.17.0`, bumped during each release cycle (added to `release-workflow.md` Step 4).
- **install.sh shallow clone update path** (`cfcac6f`). The "already installed, update" branch tried to surgically repair a shallow clone and failed on Windows Git Bash with "pathspec 'main' did not match". Replaced with delete-and-re-clone (preserving `.env` via a tempfile backup). Eliminates an entire class of git state edge cases.
- **Launcher lockfile NoneType crash on Windows** (`21e218e`). `tasklist` returned `stdout=None` on a Windows locale edge case, which made `str(pid) in result.stdout` raise `TypeError` and blocked every launcher start. Guard added on line 79 plus a fail-open wrapper around the whole check in `__main__.py`. New lessons-learned entry: diagnostic and convenience features should always fail open.

### Changed
- **manuscripta 0.8 -> 0.9.0**, which forced the `pillow` and `pandas` bumps:
  - **DEP-08 resolved:** Pillow 11 -> 12.2.0 (manuscripta 0.9.0 requires `pillow >=12.0`). Both bumped together since 0.9.0 won't resolve with Pillow 11.
  - **DEP-06 resolved:** pandas 2.3 -> 3.0.2 (transitive dep of manuscripta 0.9.0 requiring `pandas >=3.0`). tenacity 8.5 -> 9.1.4 came along as another transitive.
- **Docker config directory layout under `%APPDATA%\bibliogon\`** (Windows) / `~/.config/bibliogon/` (Linux) / `~/Library/Application Support/bibliogon/` (macOS): the launcher now writes `install.json`, `install.log` (+ `.log.1` rotation), `cleanup.json` (only during interrupted uninstall), and `settings.json`.

### Deferred (still tracked)
- D-03a AppImage for Linux (deferred; re-evaluate on missing-tkinter user reports)
- D-05 Full Windows installer (deferred until user feedback shows install friction)
- DEP-01 React 19, DEP-02 TipTap 3, DEP-03 react-router-dom 7, DEP-04 Vite 8 + TypeScript 6, DEP-05 elevenlabs SDK 2.x, DEP-07 lucide-react 1.x (all major bumps deferred to dedicated sessions)

## [0.16.0] - 2026-04-16

Audiobook export is now robust against cancellation and live-updates during generation. Dependency currency restored across the stack.

### Added
- **Audiobook incremental persistence:** each chapter MP3 is written to persistent storage immediately after generation, not at the end of the job. Cancelling a 30-chapter export at chapter 27 preserves all 27 completed chapters on disk and in the metadata view. Previously, cancellation lost every generated file.
- **Per-chapter audio status in book metadata:** the audiobook tab now shows every book chapter with its audio state - green check with duration and play/download for generated chapters, clock icon with "Nicht generiert" for pending chapters, warning banner for partial exports.
- **Four-mode regeneration dialog:** when re-exporting an audiobook, the user sees chapter classification counts (current/outdated/missing) and four radio choices: generate only missing, regenerate only outdated, generate missing and outdated (recommended default), or regenerate all. Content-hash sidecars detect edited chapters automatically.
- **Chapter classification endpoint:** GET /api/books/{id}/audiobook/classify compares current TipTap content hashes against persisted .meta.json sidecars to bucket chapters as current, outdated, or missing.
- **Real-time metadata updates via WebSocket:** new generic WebSocket hub (topic-based ConnectionManager at /api/ws/{topic}) broadcasts audiobook events (chapter_persisted, job_complete, job_failed). The metadata view subscribes via the new useWebSocket hook with auto-reconnect (exponential backoff, 10 retries).
- **Themed audiobook player:** custom-built player replaces bare HTML5 audio elements in the metadata view. Sticky bottom bar with play/pause, skip 15s, previous/next chapter, progress scrub (Radix Slider), time display, playback speed (0.75x-2.0x), volume, auto-advance toggle, and keyboard shortcuts (Space, arrows, 0-9, Escape). All themed via CSS variables across all 6 theme variants.
- **useDialog().choose() API:** multi-choice dialog variant in AppDialog for cases beyond binary confirm/cancel.
- **D-01 Windows Simple Launcher:** Python code, unit tests, PyInstaller spec, Windows CI workflow, placeholder icon, install guide (DE+EN). Smoke test pending Windows time slot - ships in v0.17.0.

### Fixed
- **Docker build for fresh installations:** Dockerfile now copies all plugins via glob instead of listing 4 by name. The 5 plugins added after the Dockerfile was written (audiobook, grammar, kdp, kinderbuch, translation) were missing from the build context, causing `poetry install` to fail on fresh `install.sh` runs.
- **Audiobook overwrite dialog:** replaced browser-native `window.confirm()` with the app's Radix-based AppDialog. Multi-line engine/voice/timestamp info now renders properly with `white-space: pre-line`.
- **Launcher first-run UX:** distinguished "never installed" from "installation moved" states. New users see a welcome dialog pointing to the install guide instead of a confusing folder picker.

### Changed
- **Dependency sweep:** Node.js 20 -> 22 LTS, Python Docker base 3.11 -> 3.12, FastAPI 0.115 -> 0.135, uvicorn 0.32 -> 0.44, Pydantic 2.0 -> 2.13, SQLAlchemy 2.0.0 -> 2.0.49, httpx 0.27 -> 0.28, pytest 8 -> 9, plus routine npm bumps (dompurify, vitest, happy-dom, jsdom). GitHub Actions upload-pages-artifact v3 -> v4.
- **Release workflow:** new Step 4b "Dependency currency check" runs `poetry show --outdated` and `npm outdated` before every release.
- **Deferred major bumps tracked:** DEP-01 through DEP-08 in ROADMAP.md for React 19, TipTap 3, react-router-dom 7, Vite 8, elevenlabs SDK, pandas 3, lucide-react 1.x, and Pillow 12 (blocked by manuscripta upstream).

## [0.15.0] - 2026-04-15

### Added
- **Onboarding wizard for AI provider setup (PS-02):** First-run flow that walks the user through provider selection, base URL, model, and connection test. Skippable; the existing Settings flow still works for power users.
- **Keyboard shortcuts customization with cheatsheet overlay (PS-03):** Editor and global shortcuts surfaced through a `?` cheatsheet, customisable per user via `~/.claude/keybindings.json`-style overrides on the bibliogon side.
- **Plugin developer documentation (PS-07):** EN and DE guides covering the plugin API, hook spec contract, packaging, ZIP install flow, and a worked example plugin walk-through.
- **Help docs:** AI integration user guide (EN + DE), shortcut/index/FAQ refresh for current feature set.

### Changed
- **manuscripta v0.7.0 -> v0.8.0 (PS-06):** Migrated `run_pandoc` to the new `run_export(source_dir=...)` entry point. Drops the `os.chdir(project_dir)` workaround and the `OUTPUT_FILE` module-global mutation in favour of explicit `output_file` / `no_type_suffix` kwargs. Strict-images mode is on by default; missing image files now surface as a structured 422 with the unresolved file list so the export toast names the missing files (DE + EN i18n; other locales fall back to EN until next sweep). Manuscripta's typed exception hierarchy (`ManuscriptaError`, `ManuscriptaImageError`, `ManuscriptaPandocError`, `ManuscriptaLayoutError`) is propagated through bibliogon's `MissingImagesError` / `PandocError.cause` so attribute access (`.unresolved`, `.returncode`, `.stderr`) survives all the way to the GitHub issue button.
- **Lazy chapter content loading and sidebar memoization (PS-04):** Large books (500+ pages, 100+ chapters) no longer pay the full chapter-content cost on initial load; the sidebar memoizes derived state so chapter switches no longer re-render the whole tree.
- **WCAG 2.1 AA improvements (PS-05):** Keyboard navigation, focus management, ARIA attributes, and contrast across the core editor and dashboard workflows.

### Fixed
- **PDF/DOCX silent image drop (CF-01, critical):** Imported books that referenced figures via `<img>` tags exported to PDFs and DOCX with zero embedded images, while EPUB output for the same book contained them. Bug present in every shipped version v0.1.0 through v0.14.0. Books authored natively in Bibliogon (TipTap-JSON storage) were unaffected. Root cause: `html_to_markdown` preserved `<figure>/<img>` as raw HTML, which Pandoc's LaTeX (PDF) and DOCX writers silently drop. Fix emits native Pandoc image syntax (`![caption](src "alt")`) so figures survive every output format. **If you have imported books and exported them to PDF or DOCX in earlier versions, re-export to verify your output contains all expected images.**
- **app.yaml first-run failure (PS-01):** Fresh installs failed at startup because `app.yaml` was not in the repo (gitignored). The backend now auto-creates `app.yaml` from `app.yaml.example` on first startup.

### Migration notes
- The manuscripta v0.7.0 -> v0.8.0 upgrade is non-breaking for end users; pin updates land in `plugins/bibliogon-plugin-export/pyproject.toml` and `plugins/bibliogon-plugin-audiobook/pyproject.toml`. After pulling, run `make install` so the path-installed plugins re-resolve their lock files (the backend's `poetry.lock` caches the plugin's old transitive pins until refreshed).

## [0.14.0] - 2026-04-13

### Added
- **Multi-provider AI integration (AI-01 to AI-05):** Unified LLM client supporting Anthropic (Claude), OpenAI (GPT), Google (Gemini), Mistral, and LM Studio (local). Anthropic adapter for the native /v1/messages endpoint. Provider selection dropdown with auto-filled base URLs and model suggestions. Connection test with 7 error categories (auth, rate limit, timeout, model not found, invalid request, server error, offline). AI enable/disable toggle (default: off).
- **AI-assisted chapter review (AI-06):** "Review" tab in the editor AI panel. Sends the full chapter for analysis of style, coherence, and pacing. Structured feedback with summary, strengths, actionable suggestions with quotes, and overall assessment. Language-aware (reviews in the chapter's language).
- **AI-generated marketing text (AI-07):** Sparkles button on each marketing field in book metadata. Generates Amazon KDP blurb (HTML), back cover text, author bio, and keywords. Field-specific prompts with format rules. Book context (title, author, genre, chapter titles) passed for relevance.
- **Context-aware AI prompts (AI-08):** All AI features now receive book metadata (title, author, language, genre, description). Editor suggestions match genre tone. Chapter reviews tailored to genre reader expectations.
- **AI usage tracking (AI-09):** Cumulative token counter per book. Usage displayed in the marketing tab with estimated cost range. All AI endpoints track tokens via best-effort background writes.
- **Manuscript tools:** adjective density detection (M-13), inline style check marks in TipTap (M-14), quality tab in book metadata with chapter metrics and outlier markers (M-15).
- **Editor:** IndexedDB draft recovery for unsaved changes, tooltips on quality tab outlier indicators.
- **Settings:** AI configuration section with provider selection, editor debounce and AI context settings, delete_permanently option.
- **Offline:** all UI fonts bundled locally, no CDN dependency (O-01).
- **Metadata:** HTML preview for Amazon book description, backpage description, and author bio.
- **Phase 2 roadmap:** Phase 1 archived (100% completion), new roadmap with 5 themes (AI, distribution, templates, Git backup, polish).

### Changed
- **Licensing model:** all plugins free, license gates removed, /api/licenses returns 410, Licenses tab removed from Settings, premium badges removed.
- **Config management:** app.yaml and backup_history.json removed from version control (gitignored), app.yaml.example provided as template.
- **AI config:** app.yaml reads fresh from disk on every request (was cached at startup). Plugin-status cache invalidated on settings save.
- **i18n:** retroactive translation completion for ES, FR, EL, PT, TR, JA (I-03). AI provider and error messages in all 8 languages.

### Fixed
- **PWA install prompt:** added PNG icons (Chrome requires raster format, not SVG). Enabled service worker in dev mode via vite-plugin-pwa devOptions.
- **AI stale config:** toggling AI on/off in Settings now takes effect immediately without server restart.
- **AI error reporting:** specific error messages for auth failure, rate limit, timeout, model not found, invalid request, and server errors (was generic "connection failed").
- **Anthropic model IDs:** corrected preset model names (claude-sonnet-4-20250514, claude-opus-4-20250514).
- **Export:** include backpage description and author bio in project export.

### Tests
- 100+ new tests across AI (providers, Anthropic adapter, config refresh, review, marketing, usage tracking), E2E (editor formatting, import flows, plugin install, chapter DnD, file export), plugins (kinderbuch, KDP routes, pandoc runner, backup utilities).

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

## [0.12.0] - 2026-04-11

### Added
- **Backup compare (V-02):** `POST /api/backup/compare` compares two uploaded `.bgb` files in-memory with no server state. Returns a per-book diff with a metadata table and a two-column chapter comparison (red/green) on HTML-projected-to-plain-text content. Frontend dialog on the dashboard next to the version-history toggle. Stop-gap until the planned Git-based backup.
- **Per-book audiobook overwrite flag:** `Book.audiobook_overwrite_existing` (new Alembic migration) replaces the plugin-global `overwrite_existing` flag. Visible as a checkbox in Metadata > Audiobook. When enabled: the content-hash cache is disabled for that run and the "audiobook_exists" 409 warning is skipped.
- **Per-book audiobook skip chapter types:** `Book.audiobook_skip_chapter_types` (JSON text) replaces the plugin-global `skip_types`. UI in Metadata > Audiobook as a checkbox list of all 26 types, grouped into "present in the book" and "other types". The dry-run cost estimate respects the per-book list (two hardcoded skip sets in the backend removed, bug fix).
- **Per-book ms-tools thresholds (M-16):** `Book.ms_tools_max_sentence_length`, `ms_tools_repetition_window`, `ms_tools_max_filler_ratio` as columns. `/ms-tools/check` accepts a `book_id` and resolves thresholds in the order request > book > plugin config > default.
- **Auto-sanitization on Markdown import (M-12):** new hook `content_pre_import` in the hookspec, ms-tools implements it via `sanitize()` on the book language. Gated by `auto_sanitize_on_import: true` in `ms-tools.yaml`. Applies to all 4 import paths.
- **5 new ChapterTypes:** `part`, `final_thoughts`, `also_by_author`, `excerpt`, `call_to_action`. 26 types in total. Marketing types (also_by_author, excerpt, call_to_action) are in the audiobook-export skip list by default. The scaffolder recognizes body-level types explicitly (`_BODY_TYPES`) instead of via the default case.
- **Grammar plugin premium auth:** `languagetool_username` and `languagetool_api_key` in a new minimal `grammar.yaml`. LanguageToolClient attaches both as POST form fields when set. Enables self-hosting and LanguageTool Premium.
- **Plugin settings audit:** the generic plugin settings panel renders scalars in a typed way (boolean -> checkbox, number -> number input, string -> text input, object -> JSON textarea with an advanced hint). 4 fields previously rendered as "string true/false" are now shown as a checkbox. New TranslationSettingsPanel with a provider select and a masked DeepL API key.
- **Event recorder and error report dialog:** ring buffer for user actions with a sanitizer, opt-in history, improved GitHub issue dialog with preview and URL-length truncation.
- **M-17/M-18:** filler-word lists are loaded from YAML files (per language, extensible by user edits). Per-language allowlist to exclude terms from the checks.

### Changed
- **Architecture rule: plugin settings visibility.** Every `config/plugins/*.yaml` field must either be UI-editable or marked with `# INTERNAL`. Dead settings are forbidden. Per-book values belong on the Book model, not in the plugin YAML. Codified in `.claude/rules/architecture.md`.
- **Architecture rule: plugin package versions.** Plugin versions are independent of the app version. No forced bump on app releases.
- **Plugin settings cleanup:** `audiobook.yaml` loses `overwrite_existing`, `skip_types`, `language` (all now per-book or dead). `ms-tools.yaml` loses `languages` (hardcoded in the code). `kdp.yaml` loses the entire `settings.cover` and `settings.manuscript` block (Amazon-mandated, now documented as a module constant `KDP_COVER_REQUIREMENTS`). `export.yaml` `formats`, `export_defaults`, `ui_formats` marked `# INTERNAL`.
- **Scaffolder bug fix:** `part_intro` and `interlude` are now explicitly classified as body types instead of falling through the default branch.
- **Documentation cleanup:** `CLAUDE.md` brought up to v0.12 state (manuscripta ^0.7.0, complete ChapterType list, corrected test counts, KDP no longer "planned"). `docs/API.md` rewritten into a <100-line high-level overview that points at `/docs` and `/openapi.json` as the source of truth. `docs/CONCEPT.md` version/status header removed. `docs/help/de+en/export/audiobook.md` extended with per-book overwrite/skip/chapter-number sections, outdated "skip list in plugin config" reference removed. Empty `docs/de/` and `docs/en/` placeholder directories deleted.

### Fixed
- **i18n bug (critical, v0.11.x):** when the TranslationSettingsPanel was added, the new `ui.translation:` keys were inserted in the wrong place in `de.yaml` and `en.yaml`. This closed the `ui.settings:` block early and reparented ~50 settings keys (free, premium, active, off, on, expand_settings, plugin_*, white_label_*, trash_*, license_required, enter_license) under `ui.translation:`. The frontend `t()` helper could not find them and fell back to the English defaults, so the UI looked "correct" in the English locale while German users saw English strings. Commit `fix(i18n): move translation section out of settings and quote on/off`.
- **YAML 1.1 bool trap:** `on:` and `off:` as YAML keys were parsed into Python `True`/`False` keys in pt/tr/ja.yaml and became unreachable from the frontend lookup. Now quoted as `"on":` / `"off":`.
- **Dry-run cost estimate:** two hardcoded skip sets in the `audiobook.py` dry-run endpoint ignored the YAML and every per-book configuration. Now via a `_resolve_book_skip_types(book)` helper that reads the per-book column and falls back to `DEFAULT_AUDIOBOOK_SKIP_TYPES`.
- **Error report issue body:** URL-length truncation prevents GitHub from cutting off the body.
- **Audiobook downloads:** audio player + confirm before delete, individual chapter MP3 list expanded by default, per-chapter delete button in the Downloads tab.
- **Dev mode:** backend starts before frontend, ECONNREFUSED noise on startup suppressed.
- **Language names:** language-name strings are translated into the current UI language (not into the native language form).

### Security
- Audit of all `config/plugins/*.yaml` against UI visibility, no active settings without control anymore.

### Removed
- Plugin-global `audiobook.settings.overwrite_existing` (replaced by `Book.audiobook_overwrite_existing`, migration seeds once from YAML)
- Plugin-global `audiobook.settings.skip_types` (replaced by `Book.audiobook_skip_chapter_types`, migration seeds once from YAML)
- Plugin-global `audiobook.settings.language` (was a UI-only voice filter, never read by the export pipeline)
- `ms-tools.settings.languages` (never read, languages come from module constants)
- All `kdp.settings.cover.*` and `kdp.settings.manuscript.*` fields (never read, Amazon-mandated values now as a module constant)
- Grammar plugin `default_language`, `enabled_rules`, `disabled_rules`, `disabled_categories` (not maintained, the LanguageTool defaults are enough)
- Empty `docs/de/` and `docs/en/` placeholder directories

## [0.11.0] - 2026-04-10

### Added
- Google Cloud TTS engine with service-account authentication, quality detection (standard/wavenet/neural2/studio/journey) and voice seeding (audiobook)
- Encrypted credential storage via Fernet/AES for Google SA JSON and ElevenLabs API key (credential_store)
- Content-hash cache: unchanged chapters are not regenerated on re-export, saving TTS cost (audiobook)
- Cost estimation and savings tracking in the progress dialog after export completion (audiobook)
- Dry-run mode: preview sample + cost preview before the real export (audiobook)
- Quality filter toggle in the voice dropdown for Google Cloud TTS voices (audiobook)
- Persistent audiobook storage under uploads/{book_id}/audiobook/ with download endpoints (audiobook)
- TTS preview cache and preview persistence with chapter context in the metadata tab (audiobook)
- Inline audio player for the TTS preview in the editor with play/pause/volume/close (editor)
- ElevenLabs API key UI in Settings with verify/test/remove (audiobook)
- Help system: single-source-of-truth documentation with an in-app HelpPanel (react-markdown, search, navigation, breadcrumbs, context-sensitive HelpLinks) and a MkDocs Material site on GitHub Pages (help)
- 26 Markdown documentation pages (12 DE + 12 EN + 2 ms-tools) in docs/help/ (help)
- MkDocs setup with Material theme, i18n, git-revision-dates and GitHub Actions auto-deploy (docs)
- Manuscript tools: word repetition detection, redundant phrases (15 DE + 15 EN), adverb detection, invisible character removal, HTML/Word artifact removal, sanitization preview (diff), CSV/JSON metrics export (ms-tools)
- Plugin status endpoint GET /api/editor/plugin-status with health checks and a 30s cache (editor)
- Disabled buttons with tooltips for unavailable plugins (Grammar, AI, Audiobook) in the editor (editor)
- Audiobook progress: "01 | Foreword" prefix format instead of "Chapter 1:", SSE listener in the context instead of the modal, localStorage persistence, F5 recovery, background badge with popover (audiobook)
- Regeneration warning before overwriting existing audiobooks with a confirm dialog (audiobook)
- Backup with an optional include_audiobook parameter (backup)
- Toolbar i18n: 32 button labels extracted in 8 languages (editor)
- Audiobook tab in Metadata with sub-tabs "Downloads" and "Previews" (metadata)

### Fixed
- Voice dropdown no longer leaks Edge TTS voices into other engines (audiobook)
- LanguageTool: texts are split into 900-character chunks to avoid 413 Payload Too Large (grammar)
- Grammar plugin: config is passed through to routes correctly (grammar)
- Plugin loading: AttributeError on _settings before activate() fixed for KDP, Kinderbuch and Grammar (plugins)
- Grammar plugin added to the enabled list in app.yaml (config)
- Error toast: overflow fixed, "Report issue" button visible and clickable, closeOnClick disabled (ui)
- Browser confirm() replaced with AppDialog for audiobook delete (ui)
- LLM port changed from 11434 (Ollama) to 1234 (LMStudio) as the default (ai)
- Error message for an unreachable AI server is now in German with an actionable recommendation (ai)
- MkDocs i18n: docs_structure: folder, index.md per locale, nav generator with a homepage (docs)
- Various docs fixes in the MkDocs config (5 iterations until CI was green) (docs)

### Changed
- manuscripta ^0.7.0: all TTS engines delegate to the manuscripta adapter instead of their own implementation (audiobook)
- Direct dependencies on edge-tts, gtts, pyttsx3, elevenlabs removed (audiobook)
- GoogleTTSAdapter renamed from gtts_adapter to google_translate_adapter (manuscripta 0.7.0 compat) (audiobook)
- AudioVoice DB model: new quality column + Alembic migration (models)
- voice_store.get_voices: two-stage language matching (exact on region, prefix on bare code) (voice_store)
- formatVoiceLabel() now shows language + quality in the dropdown (ui)
- Hardcoded EDGE_TTS_VOICES fallback list removed, edge-tts-voices.ts deleted (frontend)
- German i18n strings and docs now use real umlauts (ä ö ü ß) instead of ASCII substitutes (i18n)
- Default sentence-length threshold for ms-tools changed from 30 to 25 words (ms-tools)
- Passive voice ratio as a percentage instead of a count in the style-check output (ms-tools)

### Security
- Google service account JSON is stored Fernet-encrypted, never in clear text (credential_store)
- ElevenLabs API key is also encrypted when BIBLIOGON_CREDENTIALS_SECRET is set (credential_store)
- Secure delete: credentials are overwritten with null bytes before deletion (credential_store)
- Path traversal protection on all new file-download endpoints (audiobook, help)

## Phase 9: translation, audiobook, infrastructure (v0.10.0)

- plugin-translation (premium): DeepL + LMStudio client, chapter-by-chapter book translation into a new book
- plugin-audiobook (premium): Edge TTS, TTS engine abstraction, MP3 per chapter, ffmpeg merge, preview function
- Freemium licensing: license_tier (core/premium), trial keys (wildcard), Settings UI with premium badges
- Infrastructure: Alembic migrations, GitHub Actions CI, mypy, mutmut, structured logging, async export jobs
- Editor: focus mode, office paste, spellcheck panel, chapter rename (right-click/double-click), audio preview
- i18n: 8 languages (DE, EN, ES, FR, EL, PT, TR, JA), live language switch
- 303 tests (78 backend, 125 plugin, 50 vitest, 52 e2e)

## Phase 8: manuscript quality, editor, export (v0.9.0)

- plugin-manuscript-tools (MIT): style checks (filler words DE+EN, passive voice, sentence length), sanitization (typographic quotes 5 languages, whitespace, dashes, ellipsis), readability metrics (Flesch Reading Ease, Flesch-Kincaid Grade, Wiener Sachtextformel, reading time)
- TipTap extensions: footnotes, find/replace, image resize via drag, image DnD upload
- Export: batch export (EPUB+PDF+DOCX), chapter-type-specific CSS, custom CSS, epubcheck validation
- Import: plain Markdown ZIP without project structure, tiptap_to_md extended (Table, TaskList, Figure)
- UI: dashboard sorting, cover thumbnails, word count target per chapter, keyword tag editor
- Infrastructure: multi-stage Docker build, frontend chunk splitting, roundtrip tests

## Phase 7: extended book metadata (v0.7.0)

- Extended metadata per book: ISBN (ebook/paperback/hardcover), ASIN, publisher, edition, date
- Book description as HTML (for Amazon), back-cover description, author bio
- Keywords per book (7 SEO-optimized keywords for KDP)
- Cover image assignment per book
- Custom CSS styles per book (EPUB styles)
- "Copy config from another book" wizard/dialog
- Extended chapter types: epilogue, imprint, next-in-series, part intros, interludes
- Book metadata editor in the BookEditor (5 sections: General, Publisher, ISBN, Marketing, Design)
- Playwright E2E tests extended to 52 tests

## Phase 6: editor extensions (v0.6.0)

- WYSIWYG/Markdown switching with Markdown-to-HTML conversion on switch
- Drag-and-drop chapter sorting
- Autosave indicator, word count
- plugin-grammar (LanguageTool)
- i18n: ES, FR, EL added (5 languages total)
- Dark mode with 3 themes (Warm Literary, Cool Modern, Nord)
- Settings page with app, plugin and license configuration
- Settings API to read/write YAML configs through the UI
- PluginForge extracted as a PyPI package (pluginforge ^0.5.0)
- Licensing moved to the backend (app/licensing.py)
- pre_activate callback for the license check
- plugin-help and plugin-getstarted as standard plugins
- Export plugin switched over to manuscripta
- Export dialog with format/book-type/TOC-depth/section-order selection
- Trash (soft delete) with restore and permanent delete
- Custom file formats: .bgb (backup), .bgp (project)
- Custom dialog system (AppDialog) instead of native browser dialogs
- Toast notifications (react-toastify)
- Playwright E2E tests (39 tests)
- Comprehensive help (23 FAQ, 12 shortcuts, bilingual DE/EN)
- write-book-template import compatible with real projects

## Phase 5: premium plugins and licensing (v0.5.0)

- Offline licensing (HMAC-SHA256, LicenseStore)
- plugin-kinderbuch, plugin-kdp

## Phase 4: import, backup, chapter types (v0.4.0)

- ChapterType enum, asset upload, full-data backup/restore
- write-book-template ZIP import

## Phase 3: export as a plugin (v0.3.0)

- bibliogon-plugin-export (TipTap JSON -> Markdown, scaffolder, Pandoc)
- Old export code removed, editor switched to TipTap JSON

## Phase 2: PluginForge (v0.2.0)

- PluginManager on pluggy, YAML config, lifecycle, FastAPI integration
- Entry point discovery, hook specs

## Phase 1: MVP (v0.1.0)

- Book/Chapter CRUD, TipTap editor, Pandoc export, Docker
