# Session Handover — 2026-06-09 (entity-kit trash + offline-PWA hardening)

Fresh-session brief. Two arcs shipped this session: the **entity-kit book-trash
migration** (PoC → real, on entity-kit 0.3.1) and an **offline-PWA hardening
pass** (privacy + gating + toast suppression) driven by Aster's manual testing,
plus the smoke-gate fixes those runs surfaced. Read this before continuing.

## State of `main`

- HEAD = `b3add914` = `origin/main`. Working tree clean (only `.claude/settings.json`
  untracked — do NOT commit it).
- `@astrapi69/entity-kit` at **^0.3.1** (entity-kit-core 0.1.0 auto-installed;
  React entry re-exports types/registry/tokens — imports unchanged).
- Vitest **2876** green · `tsc --noEmit` clean · i18n parity 51.
- Smoke gate: **green except one residual flake** — `offline-pwa.spec.ts > book
  cover uploads` is cold-flaky (first attempt fails, retry passes → exit 0). See
  "Open issues".

## What shipped this session (newest first)

| Commit | What |
|---|---|
| `b3add914` | fix(e2e): book-editor sidebar visibility (collapse helper → `toBeAttached`; composition-mode hides the refactored sidebar by `data-testid` in global.css) |
| `d9dc0693` | fix(offline): gate backend-only surfaces in dexie mode (danger-zone reset disabled, Backups history → OfflineFeatureNotice, BookMetadata kdp/gitSync/translations skipped, CreateBookForm templates empty) |
| `01bc01c9` | fix(offline): suppress offline-guard error toasts — `ApiError.offline=true` + `notify.error` downgrades to `console.warn` |
| `2070e094` | fix(seed): remove personal data from seed files — `generate-seed-data.py` now BLANKS the author (name + pen_names) like it blanks the AI api_key |
| `f4133390` | fix(dashboard): equal-height trash tiles via Tailwind `auto-rows-fr` + `h-full` + `mt-auto` |
| `3747ab78` | feat(dashboard): **migrate book trash to entity-kit views** (the real switch-over) |
| `feb01f04` | chore(deps): entity-kit 0.2.1 → 0.3.1 |
| `e16ab70f` | fix(e2e): reset shared backend settings after dashboard-header tests (the Spanish-render pollution) |

(Earlier in the arc: `b110651f` trash PoC behind `?entitykit=1`; `755f713b` 0.2.1
bump; `544327fb`/`07a49d6c` offline-pwa ESM-load + story-bible/AI seed-default
test fixes — all already on main.)

### entity-kit book-trash migration (the substantive feature)

The book trash is now **entity-kit, no flag**. Files:

- `frontend/src/descriptors/bookDescriptor.ts` — exports `makeBookDescriptor(t)`
  (i18n column + action labels via the 0.2 `label: () => string` factory) +
  a default `bookDescriptor` registered in `descriptorRegistry`. Restore +
  permanent-delete are descriptor `actions` (ids `RESTORE_ACTION_ID` /
  `PERMANENT_DELETE_ACTION_ID`) so one `onAction` serves both views. `deletedAt`
  is omitted (BookOut emits none → column auto-hides). `isDeleted: () => true`
  (the host pre-filters via `api.books.listTrash`).
- `frontend/src/pages/Dashboard.tsx` — list = `EntityTrashView` (`prefiltered`),
  grid = `EntityTileView`, toggled by `EntityViewSwitcher` mapped onto the
  EXISTING `useTrashViewMode("books")` preference (kept). Bibliogon "grid" ↔
  entity-kit "tile". `trashDescriptor = useMemo(() => makeBookDescriptor(t), [t])`.
- i18n: `ui.dashboard.trash_col_title` / `_author` across 8 catalogs + reseed.
- The `trash-grid` / `trash-list` wrapper divs are KEPT (the
  `trash-view-mode-defaults` spec asserts which mode renders); rows/actions use
  entity-kit's auto testids.

**Article trash is untouched** — still TrashCard + ViewToggle. Those components
are shared (ArticleList uses them), so they were NOT deleted.

### offline-PWA hardening (Aster's manual-testing findings)

The live GitHub-Pages build (dexie/backendless) fired `/api` on several surfaces
and showed red error toasts. Root pattern: components call `api.*` directly;
`guardedFetch()` rejects offline; the catch shows a toast.

## Open issues / next candidates

1. **Cover-upload cold flake** (`offline-pwa.spec.ts:188`). CCW's
   `fc2fb201 (ensureSeeded)` fixed the asset-read-before-seed race, but a cold
   residual remains (Vite cold-compile of the metadata route after reload pushes
   `cover-preview-img` past 10s on the FIRST attempt; retry passes). Exit-0
   tolerated. **CCW's asset / DexieStorage lane** — coordinate before touching.
2. **E2E coverage gap (worth doing).** The surfaces gated this session
   (danger-zone reset, Backups history, BookMetadata kdp/gitSync/translations,
   CreateBookForm templates) are NOT exercised by `offline-pwa.spec.ts`'s hard
   `/api`-abort gate — which is exactly why they slipped through to manual
   testing. Extending that spec to visit Settings>Danger-Zone, Settings>Backups,
   and a book's Metadata tab in dexie mode would pin "zero `/api` + no error
   toast" so they can't regress.
3. **git-backup button greying offline** (Aster's first finding, deferred). The
   `sidebar-git-backup` button (ChapterSidebar) navigates to `/git-backup`,
   which already shows the desktop-app gate notice. Greying the button needs a
   prop on `ChapterSidebar`, which is offline-DECOUPLED by design (see its
   `offlineSlot` comment) — so it was left. Low priority.
4. **Article trash → entity-kit** (optional next migration, same descriptor
   pattern) if you want parity with the book trash.

## Gotchas (read these — they will save you time)

1. **Multi-tool with CCW.** A parallel agent (CCW) owns the responsive-mobile
   work, the asset/cover-upload + DexieStorage lane, and docs. Before pushing:
   `git fetch` + check `origin/main`; **explicit-path `git add` only** (never
   `git add -A`) while parallel work may be in flight.
2. **Dev-server vs Playwright port conflict.** Playwright's backend webServer is
   `reuseExistingServer: false` → it starts its OWN uvicorn on :8000 and will
   CONFLICT with a running `make dev-bg`. So: `make dev-down` BEFORE any E2E run,
   then `make dev-bg` AFTER (Aster tests live on the dev servers — leave them up
   when you're done).
3. **Shell cwd persists between Bash calls.** A `cd frontend` in one call leaves
   you there for the next — `git add frontend/src/...` then resolves to
   `frontend/frontend/...` and fails. A push failed this way this session. Run
   git from the repo root (use absolute `cd /…/bibliogon &&` when unsure).
4. **Run vitest from `frontend/`, playwright from `e2e/`.** Wrong cwd → vitest
   loads no config → `document is not defined` on every DOM test (false alarm).
5. **Playwright transient** `Project(s) "smoke" not found. Available projects: ''`
   — a flaky config-load; just re-run.
6. **Offline gating pattern (for NEW surfaces).** `guardedFetch` rejects all
   `/api` offline with `ApiError.offline=true`; `notify.error` now suppresses
   those (console.warn) — so toasts are handled globally. To gate a surface so it
   fires no call: `const {offline} = useOfflineFeatureGate(); if (offline) return;`
   inside the fetching `useEffect` (+ add `offline` to deps). Disable buttons with
   `disabled={offlineGate} title={offlineMsg}` or render `<OfflineFeatureNotice/>`.
   Reserve the gate for genuinely backend-only features (Pandoc export, Git, TTS,
   LAN, danger-zone reset, backups) — everything else should route through
   `getStorage()` (the seam) so it works offline.
7. **Privacy / seed pipeline.** `backend/config/app.yaml` is **gitignored**
   (local, per-developer); `app.yaml.example` (tracked) is the template with an
   empty author. The committed, publicly-served `seed-settings.json` is generated
   FROM the local app.yaml — so `generate-seed-data.py` must scrub anything
   personal. It now blanks `author` (name + pen_names) the same way it blanks the
   AI `api_key`. After ANY app.yaml change: `make generate-seed-data` and grep the
   seeds for PII (`Asterios|Raptis|Draven|Quantum|Stelio|Moon|@`).
8. **Language pollution in desktop smoke tests.** They share the backend dev DB.
   A test that PATCHes persistent settings (UI language, default book type) MUST
   reset in `afterEach` — `dashboard-header-single-line.spec.ts` does now
   (restores `default_language=de` + `ui.defaults.book_type=prose`). If the dev DB
   is left in Spanish (downstream tests render `es` → German/English text
   assertions fail across editor-formatting / export / picture-book / reclassify),
   run that spec (self-cleans) or `PATCH /api/settings/app {app:{default_language:"de"}}`.
9. **entity-kit 0.3.1 specifics.** `descriptorRegistry.get()` now THROWS on an
   unknown name (use `tryGet()`); we only `get("book")` which is registered, so
   we're fine. `FieldDescriptor.label` / `ActionDescriptor.label` accept
   `() => string` for i18n. `EntityTrashView` has `prefiltered`. Rows/tiles get
   `{entityName}-{getId}` testids; action buttons `{entityName}-{getId}-{actionId}`;
   the switcher emits `view-{mode}`.
10. **Responsive sidebar.** `book-editor-sidebar` renders `w-0` when collapsed
    (below the 1200px menu breakpoint) → Playwright reports it `hidden`. Use
    `toBeAttached()` not `toBeVisible()` to wait for it; assert open/closed via
    `boundingBox().width`. composition-mode hides chrome via global.css selectors
    that now target `[data-testid="book-editor-sidebar"]` (the sidebar dropped its
    old `.sidebar-wrapper` class in CCW's refactor).
11. **Known CI flakes** (re-run clears): the cover-upload cold flake (above) and
    the storyboard-annotation React-18 double-mount mock flake.

## Verify baseline (start of next session)

```bash
git -C /home/astrapi69/dev/git/hub/astrapi69/bibliogon log --oneline -5   # expect b3add914 at/under HEAD
cd frontend && npx tsc --noEmit && npx vitest run                          # tsc clean, 2876 green
# Gate (Aster / on demand): make dev-down; cd e2e && npx playwright test --project=smoke
```

## Memory pointers

Project memory `offline-maximal-dexie-direction.md` (the Maximal-Offline program
status + reusable seam/gate shapes). Feedback memories: ask decision questions in
chat prose (not the selection tool); state the clock time on any "waiting" line;
canonical author email is `asterios.raptis@web.de`.
