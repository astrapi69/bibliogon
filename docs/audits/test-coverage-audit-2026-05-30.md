# Test Coverage + Insider-Sweep Audit — 2026-05-30

Pre-v0.42.0 audit. **Phase 1 (audit only)** — gap-fill (Phases 2-5) is
deferred to user review per the workstream plan. Read-only findings.

Baseline HEAD at audit time: `922821d1` (after the deps + content-type
rename + Story Bible button + storyboard-comic commits this session).

---

## 1. Coverage map (headline numbers)

All numbers produced this session via the authoritative commands.

| Layer | Result | Verdict |
|---|---|---|
| **Backend** (`pytest --cov=app`) | **89%** overall (12353 stmts, 1384 miss); 2418 passed, 1 skipped | Above the 80% target |
| **Frontend** (`vitest --coverage`) | **67.5%** stmts / 69.9% lines / 61.5% funcs | Below the 70% line target — concentrated in page components |
| **E2E** (Playwright smoke) | 85 specs / 410 `test()` cases | Strong; covers nearly every major flow |

### Plugins (per-plugin-venv `pytest --cov`)

| Plugin | Plugin-local cov | Note |
|---|---|---|
| export | 63% | `routes.py` 14% — covered by backend integration tests |
| comics | 7% | `panels.py`/`bubbles.py`/`comic_book_pdf.py` 0-8% — **heavily covered by `backend/tests/test_comic_routes.py` (866 LOC) + `test_comic_book_pdf.py` (1278 LOC)** |
| kdp | 31% | `package.py`/`publishing_state_service.py`/`routes.py` 0% — covered by `backend/tests/test_kdp_*` |
| medium-import | 66% | importer/preview/downloader 50-59% — covered by `backend/tests/test_medium_import_*` |
| audiobook | 65% | **`routes.py` 0% — GENUINE GAP (see DEBT-1)** |
| story-bible | n/a | plugin venv not installed (`pytest` missing); covered by `backend/tests/test_story_bible_routes.py` |

> **Critical interpretation (do not misread the 0%s):** Bibliogon plugins
> are tested via **two installation paths** — each plugin's own `tests/`
> (the per-venv coverage source) AND `backend/tests/` (TestClient + full
> plugin mount, NOT counted in the plugin's own coverage). Almost every
> "0%" module above is heavily exercised by backend integration tests.
> The single genuine gap is `audiobook/routes.py` (TTS-dispatch
> `/generate` + `/preview`), which has no indirect backend coverage.

### Frontend low-coverage hot-spots (< 50%, real gaps)

`pages/` is the weak layer (36% — E2E covers these instead): `Settings.tsx`
(29%), `BookEditor.tsx` (30%), `ArticleEditor.tsx` (31%), `ArticleList.tsx`
(29%). Components with low coverage + logic worth pinning: `AudioExportProgress`
(11%), `AudiobookPlayer` (1.9%), `PluginCard` (42%), `Toolbar` (43%),
`BookMetadataEditor` (41%), `settings/panels/*` + `settings/fields/*` (0%),
`hooks/useI18n` (19%), `hooks/useWebSocket` (6.5%), `useKeyboardShortcuts` (16%),
`utils/notify` (29%), `contexts/AudiobookJobContext` (3%).

---

## 2. Insider sweep — findings (BUG / DEBT / NOTE)

Four parallel read-only audit streams (backend security+data-integrity,
backend hygiene, frontend health, plugin gaps). Classified per the
directive.

### BUG (fix-now class)

| ID | Finding | Evidence |
|---|---|---|
| **BUG-1** | **Zip Slip** — archive extraction with no path-traversal guard. A crafted `.bgb`/WBT/BGB archive can write files outside the temp dir (arbitrary file write). | `services/backup/backup_import.py:105`, `backup_compare.py:92`, `import_plugins/handlers/wbt.py:455`, `bgb.py:256,500` all call `zf.extractall(...)` directly. Only `plugin_install.py` has the `_validate_zip_paths` guard. Mitigated by single-user/local-first (user imports their own file) — but a shared/crafted archive is a real vector. Fix: mirror `plugin_install._validate_zip_paths` before every `extractall`. |
| **BUG-2** | **No React error boundary** anywhere except the import wizard. A render-time throw in BookEditor/ArticleEditor/Settings/ComicBookEditor/wizards blanks the whole app (white screen, no recovery). | `App.tsx:139-148` mounts `<Routes>` with no boundary; only `WizardErrorBoundary` exists (import-wizard-scoped). Fix: top-level boundary around `<Routes>` reusing `ErrorReportDialog`. |

### DEBT (fix-this-session-or-soon class)

| ID | Finding | Evidence |
|---|---|---|
| **DEBT-1** | `audiobook/routes.py` TTS-dispatch (`/generate`, `/preview`) is the one plugin module with **no direct AND no indirect** test coverage. | Add `test_generate_happy_path` + error-surface + `_preview_cache_key`/voice-isolation tests (mock `get_engine`). |
| **DEBT-2** | **ESLint is entirely absent** — no config, no devDep, no `lint` script — despite `code-hygiene.md` documenting `.eslintrc.json` + a pre-commit `eslint --max-warnings=0` hook. `tsconfig` also has `noUnusedLocals:false`, so unused vars are caught by nothing. | `frontend/package.json` (no eslint); `npx eslint` fails "no config". The documented frontend lint path does not exist. |
| **DEBT-3** | Asset-upload endpoints lack size cap + filename path-traversal sanitization (raw `file.filename` into the path). | `routers/assets.py:24-59` (no type/size/traversal guard), `article_assets.py:36-77` (has ext-whitelist, but no size cap / raw filename). `covers.py` is the correct reference (whitelist + 10MB cap + server-generated filename). |
| **DEBT-4** | **13 divergent `_slugify`/`slugify` definitions**, behaviorally inconsistent (some fold umlauts `ä→ae`, others NFKD-strip `ä→a`) → different filenames for the same German title across export/import. | `article_export.py:63`, `article_ai_template.py:87`, `book_ai_template.py:79`, `authors.py:80`, `chapters.py:456`, `git_backup.py:905`, `git_sync_diff.py:699`, `ai/review_store.py:38`, plugins `export/scaffolder.py:541`, `kdp/package.py:52`, `audiobook/generator.py:683`, `audiobook/routes.py:261`. Consolidate to one shared helper. |
| **DEBT-5** | ~20 `except Exception`/`except: pass` blocks that swallow without logging (violates the "no except without logger.error()" rule). Dominated by config-read fallbacks. | `git_import_adopter.py:197`, `routers/audiobook.py:165,542`, `routers/settings.py:399`, `export/routes.py:740,1055,1297,1319`, `ms-tools/routes.py:242`, + ~10 `app.yaml`-read fallbacks across `articles.py/books.py/licenses.py/main.py`. A shared logged `_read_app_config()` retires most at once. |
| **DEBT-6** | 5 plugin ruff F401/F841 (unused imports / dead var) — plugins aren't in the pre-commit ruff scope so they drift. | `audiobook/routes.py:3` (`json`), `comics/comic_book_pdf.py:56,58`, `export/tiptap_to_md.py:187` (`is_header_row` — also incomplete table-header logic), `medium_import/importer.py:389`. Auto-fixable; add `plugins/` to pre-commit ruff scope. |
| **DEBT-7** | Frontend load/reorder handlers `console.error`-only (no toast) — silent failure on chapter reorder + dashboard/editor/settings list loads. | `BookEditor.tsx:533` (reorder — closest to BUG: silent persistence failure), `Dashboard.tsx:314,325`, `Settings.tsx:100,106`, `ArticleList.tsx:371`, `BookEditor.tsx:253`. |

### NOTE (record-for-future / acceptable)

- **Danger Zone reset HMAC is validated correctly** — `system.py:155-178` checks `confirmation=="RESET"` AND `reset_token.verify_token()` (constant-time `hmac.compare_digest`, TTL-enforced) before truncation. Sound.
- **No raw SQL** anywhere (all ORM, parameterized); `PRAGMA foreign_keys=ON` so declared cascades fire.
- **FK cascades fully declared** for Book→Chapter/Page/Asset, Page→ComicPanel→ComicBubble, Article→ArticleAsset; `ArticleComment`/`image_asset_id` use intentional `SET NULL`.
- **PDF/export HTML-escaping** is correct (`escape()` on all user text in `picture_book_pdf.py` + `comic_book_pdf.py`); fonts allowlisted.
- **Alembic chain healthy** — single head, no forks, intact `down_revision` links, no no-op downgrades.
- **No TODO/FIXME/HACK**, no commented-out code, no circular imports, backend ruff F401/F811/F841 clean.
- **JSON columns** (`article_metadata`, `layout_config`, `content_json`, ...) store unvalidated structure (`dict[str,Any]`) — low risk single-user, but malformed JSON can break editor/export downstream.
- **ms-tools → audiobook** undeclared cross-plugin coupling (`ms_tools/routes.py:236` imports `bibliogon_audiobook.generator` with no `depends_on`).
- **Frontend memory-leak hygiene is clean** — SSE/WS/timers all torn down; `Editor.tsx:242` has one uncleared 2s `setTimeout` (minor).
- **Naming consistency clean** — no snake_case leaking into component state; API-mirror types intentionally snake_case.

---

## 3. Recommended gap-fill priority (Phase 2+, pending review)

1. **BUG-1 Zip Slip** — shared `_safe_extractall` helper + regression tests (security; do first).
2. **BUG-2 error boundary** — top-level `<ErrorBoundary>` around `<Routes>` + report-dialog wiring.
3. **DEBT-1** audiobook routes tests; **DEBT-7** reorder/load toast feedback (silent data-persistence failure).
4. **DEBT-3** upload validation (adopt `covers.py` pattern); **DEBT-4** `_slugify` consolidation.
5. **DEBT-2** restore/establish ESLint; **DEBT-6** plugins into pre-commit ruff scope; **DEBT-5** logged config-read helper.
6. Frontend page-component coverage is intentionally E2E-covered — no action unless a specific regression surfaces.

---

## Questions and assumptions

- Plugin "0%" figures assumed to be the per-plugin-venv path (CI matrix),
  not a unified run — evidenced by the systematic 0% on modules with
  extensive `backend/tests/` coverage (the documented two-installation-paths
  split). If it was a unified run, comics/kdp/story-bible would be CRITICAL
  rather than LOW — worth confirming how coverage is invoked in CI.
- BUG-1 severity is "fix-now class but mitigated" for a single-user
  local-first offline app (no remote attacker; requires importing a
  maliciously-crafted archive). Surfaced here for the review gate rather
  than fixed mid-stream, per the "STOP after Phase 1" instruction.
- The per-module backend < 80% list was not transcribed (the `--cov`
  Missing column made automated extraction noisy); backend is 89% overall
  and the genuine gaps are captured in the insider findings above.
