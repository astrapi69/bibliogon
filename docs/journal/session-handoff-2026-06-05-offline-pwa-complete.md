# Session Handover — 2026-06-05 (Offline PWA complete)

Supersedes `session-handoff-2026-06-05.md` (mid-session). Long-form state +
gotchas for continuing in a new session. The offline-PWA work (Track A + B) is
functionally complete and on `main`; what remains is verification + release.

## TL;DR

- `main` @ `bb9ffad1`, clean, in sync with origin. Version **0.46.0** (already
  tagged + released; both GitHub Pages sites live).
- The backendless GitHub Pages app (`astrapi69.github.io/bibliogon/`) now boots,
  authors prose books + articles, and persists settings **entirely from
  IndexedDB**, with a **guaranteed zero `/api` calls** in the offline build.
- Baselines: `tsc --noEmit` clean; **Vitest 2715 passed (226 files)**;
  `npm run build` green. Backend pytest green. E2E run by Aster.
- **Not yet done:** Aster runs the offline E2E live; a release (v0.47.0) bundling
  the offline-PWA + the menu/settings fixes; optionally redeploy the offline
  GH-Pages build to confirm the live Network tab is empty.

## How the offline mode works (read this first)

There are two builds and three runtime states - don't conflate them:

| Context | Build flag | Runtime mode | Backend? |
|---|---|---|---|
| Desktop / `make dev` / Docker / LAN-online | (unset) | `api` | yes |
| LAN client, taken offline | (unset) | `dexie` (auto: offline-capable + disconnected) | yes, later (sync on reconnect) |
| **GitHub Pages app** | `VITE_STORAGE_MODE=dexie` | `dexie` (explicit) | **no, ever** |

- **Storage seam:** components call `getStorage()` (returns `IStorageService`).
  In `api` mode -> `ApiStorage` (delegates to the `api` client). In `dexie` mode
  -> `DexieStorage` (IndexedDB). The seam covers **books, chapters, articles,
  settings, i18n, bookTypes, contentTypes, writingSessions** only. Routing a
  call site = replace `api.<entity>.<method>` with `getStorage().<entity>.<method>`
  (no-op in api mode, Dexie offline).
- **Reference data is seeded:** `frontend/src/storage/seed/*.json` (8 i18n
  catalogs + settings defaults + book/content types + plugin metadata),
  generated from the backend YAML SSoT by `scripts/generate-seed-data.py`
  (`make generate-seed-data`, runs in the backend poetry env). `DexieStorage`
  populates its reference tables on first init via `ensureSeeded()` (idempotent;
  never overwrites user-edited settings). **Re-run + commit the JSON after
  changing any i18n catalog / app.yaml default / type registry.**
- **The zero-`/api` guarantee:** `frontend/src/api/client.ts` has a single
  `guardedFetch()` choke point that EVERY fetch in the client (and
  `src/api/import.ts`) flows through. It rejects immediately (no network) when
  `isBackendlessOffline()` is true (`VITE_STORAGE_MODE=dexie` at build, or
  `localStorage["bibliogon.storage_mode"]==="dexie"`). So any `api.*` call -
  routed, gated, or forgotten - fires zero network requests in the offline
  build. `DexieStorage` never calls `guardedFetch`; the guard is inert in api
  mode / tests / LAN auto-offline (those degrade gracefully + are UI-gated).
- **Backend-only features are UI-gated** via `useOfflineFeatureGate()` (`{offline,
  message}` off `useStorageMode()`), showing the translated
  `ui.feature.requires_desktop_app` hint (all 8 catalogs) or the
  `OfflineFeatureNotice` (Tailwind-only). Export, AI, TTS, Git, .bgb
  backup/import, Medium import, LAN, picture-book/comic editors, story-bible /
  storyboard / relationship-graph views, writing-history.

## What shipped this session (newest first)

- **`/api` tail closed** (`41a5e745`, `ff0d6c1c`, `bb9ffad1`): request-layer
  guard -> single `guardedFetch` egress -> `import.ts` routed. Advanced-editor
  surfaces gated wholesale (PageEditor/ComicBookEditor at the BookEditor
  dispatch; prose storyboard + relationship views). Secondary mount reads
  stubbed to defaults offline (chapter labels, authors-DB, imported comments,
  story-bible probe). Offline E2E got a **global `page.route('**/api/**')`
  abort+assert gate**.
- **Track B Part 2 - CRUD routing** (`adfa1e37`, `fcc1313d`, `b6d3d301`): core
  book/article/chapter CRUD call sites routed (Create pages, dashboards,
  editors, ChapterOutliner, GetStarted, settings-writing hooks); App-level
  config routed; trash loads + BookEditor git probes skipped offline.
- **Track B Part 2 - storage + wiring** (`d808c022`, `c506f6e1`, `04574c8b`):
  `IStorageService` extended; `ApiStorage` getters + `DexieStorage` v4 reference
  tables + `ensureSeeded()`; useI18n / Settings / useBookTypes / useContentTypes
  / plugins / writing routed; editor inline-AI + AITemplatePanel + WritingHistory
  gated.
- **Track B Part 1 - seed** (`778da075`): generator + `make generate-seed-data`
  + committed JSON.
- **Track A - feature gates** (`32376c07`, `3cd07713`, `c9c43869`): complete.
- **Earlier this session (already released in v0.46.0 line):** menu single-line
  header via fixed Tailwind `menu:` breakpoint (1200px) - replaced a rejected
  ResizeObserver attempt; settings `behavior.skip_non_destructive_confirmations`
  persistence fix; v0.46.0 tag + GitHub Release; GH Pages deploy merged + live.

## Remaining work (suggested next session)

1. **Aster runs the offline E2E:** `cd e2e && npx playwright test --project=smoke`
   (especially `offline-pwa.spec.ts`). The global gate fails on any `/api` call.
   If something fires, route it through `getStorage()` (if a seam entity) or
   gate it (`useOfflineFeatureGate`) - the failing URL tells you which.
2. **Live confirmation:** rebuild the offline GH-Pages bundle
   (`VITE_STORAGE_MODE=dexie VITE_BASE_URL=/bibliogon/ npm run build`), serve it
   statically with no backend, open DevTools -> Network -> filter `/api` ->
   expect empty. (The deploy-pages workflow already builds with these flags.)
3. **Release v0.47.0** bundling the offline-PWA + menu + settings fixes (follow
   `.claude/rules/release-workflow.md`; CHANGELOG entry; `make release-tag`
   after Aster's E2E gate; `make release-publish`). Then the deploy-pages
   workflow ships the offline build live.
4. **Optional polish:** advanced-feature surfaces currently show the desktop-app
   notice offline; if any should work offline later, extend the seam + Dexie
   tables for that entity (do NOT blanket-route advanced namespaces - they're
   genuinely backend-only). Picture-book/comic offline authoring is explicitly
   out of scope.

## Gotchas / conventions (learned the hard way)

- **Tailwind-only for visual changes** (Aster, repeatedly + emphatically). No raw
  CSS, no `@media`, no CSS-module layout logic, no inline themable styles. Custom
  responsive breakpoints via a Tailwind `@theme { --breakpoint-NAME: … }` in
  `frontend/src/styles/tailwind.css` (e.g. the `menu:` screen). Inline `style`
  only for computed values (drag transforms, `width:${pct}%`).
- **No `Co-Authored-By` AI trailers** in commits (coding-standards.md overrides
  the harness default). I slipped once and amended it out - watch for it.
- **Explicit-paths `git add`** + plain `git status` before each commit (multi-tool
  coordination discipline). No `git add -A`.
- **Vitest:** run from `frontend/`; full run needs
  `NODE_OPTIONS=--max-old-space-size=4096` (occasional OOM / exit 137 = re-run).
  The `ECONNREFUSED 127.0.0.1:3000` lines are pre-existing telemetry noise and
  are flaky as a counted "error" - re-run to confirm.
- **Circular-import trap:** do NOT `import` anything from `src/storage/*` into
  `src/api/client.ts`. `storage/types.ts` does `import type { api } from
  "../api/client"`; importing back into the client makes TS resolve `typeof
  api.*` (the seam interface types) as `any` across ~15 files. That's why the
  offline guard reads the mode **inline** (`isBackendlessOffline()` reads
  `localStorage` + `import.meta.env`), not via `resolveStorageMode()`.
- **`api-storage.ts` uses call-time getters** (`get books() { return api.books }`)
  not top-level captures - a top-level `api.books.create` froze the import and
  threw under partial test mocks once the seam entered the dashboard graph.
  Keep that pattern for any new seam domain.
- **`guardedFetch` preserves the single-arg call shape**
  (`init===undefined ? fetch(input) : fetch(input, init)`) because some tests
  assert `toHaveBeenCalledWith(url)` exactly.
- **Tests don't trigger the offline guard** (no `VITE_STORAGE_MODE`, no
  localStorage pin) - so Vitest is unaffected; the offline E2E forces dexie via
  `addInitScript` localStorage.
- **`make generate-seed-data`** runs `python scripts/generate-seed-data.py` in
  the backend poetry env (imports `app.services.*` registry loaders so the
  book/content-type JSON gets the Pydantic defaults). The i18n + settings + the
  generated JSON are committed artifacts; the frontend/GH-Pages build needs no
  Python or YAML dep.
- **Backend `behavior` settings:** `AppSettingsUpdate` (backend/app/routers/
  settings.py) must list every top-level section it accepts - `behavior` was
  missing and silently dropped the toggle. Add the field + a merge branch for any
  new top-level settings section.

## Key files

- Seam: `frontend/src/storage/{index.ts,types.ts,api-storage.ts,dexie-storage.ts,
  seed/}`; gate hook `frontend/src/storage/useOfflineFeatureGate.ts`; notice
  `frontend/src/components/OfflineFeatureNotice.tsx`.
- Guard: `frontend/src/api/client.ts` (`isBackendlessOffline` + `guardedFetch`),
  `frontend/src/api/import.ts`.
- Seed generator: `scripts/generate-seed-data.py`, `make generate-seed-data`.
- Offline E2E: `e2e/smoke/offline-pwa.spec.ts` (global `/api` abort gate).
- Deploy: `.github/workflows/deploy-pages.yml` (builds with
  `VITE_STORAGE_MODE=dexie` + `VITE_BASE_URL=/bibliogon/`).
