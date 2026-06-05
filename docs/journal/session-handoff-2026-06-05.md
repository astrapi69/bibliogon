# Session Handover — 2026-06-05

Handover from a long CC session (offline-PWA work) to the next. Captures the
state of `main`, what shipped, and the remaining `/api` tail to close.

## State of `main`

- **Version:** 0.46.0 (tagged + GitHub Release published; both GitHub Pages
  sites live: app at `/bibliogon/`, docs at `/bibliogondocs/`).
- **HEAD:** `b6d3d301`.
- **Test baselines:** backend pytest green; Vitest **2715 passed** (226 files);
  `npm run build` green; `tsc --noEmit` clean. E2E run by Aster (Pre-Release Gate).
- **Working tree:** clean.

## What shipped this session

### v0.46.0 release + GitHub Pages
- v0.46.0 changelog/tag/Release; `feature/ccw-ghpages-deploy` rebased + merged
  (`68b2e3a3`); both Pages sites verified live.

### Menu single-line header (2 iterations)
- First attempt was a ResizeObserver content-aware collapse — **rejected** by
  Aster (toggled on language/default-type change).
- Final: **fixed Tailwind `menu:` breakpoint (1200px)** — viewport-only, never
  toggles. Worst-case width is the Book Dashboard in es/pt/el (long "Backup"
  translation). Commit `b91388f9`.

### Settings persistence fix
- `behavior.skip_non_destructive_confirmations` was dropped by the backend PATCH
  (no `behavior` field in `AppSettingsUpdate`). Fixed + regression test (`eb8707fe`).

### Offline PWA — Track A (feature gates), COMPLETE
Backend-only triggers disabled in dexie mode with the translated
`ui.feature.requires_desktop_app` hint (all 8 catalogs); no dead `/api` call:
- `32376c07` pt1 — dashboards backup/import/Medium + bulk-bar export/AI.
- `3cd07713` pt2 — backend-only pages (Export/Git/Medium → `OfflineFeatureNotice`).
- `c9c43869` pt3 — LAN / danger-zone backup / AI-setup.
- Shared hook `useOfflineFeatureGate()` + `OfflineFeatureNotice` (Tailwind-only).
- Fixed `api-storage.ts` frozen-import (call-time getters).

### Offline PWA — Track B (storage seam + seed), CORE COMPLETE
- **Part 1** `778da075` — `scripts/generate-seed-data.py` + `make generate-seed-data`
  → committed JSON under `frontend/src/storage/seed/` (8 i18n catalogs, settings
  defaults, book/content types, plugin metadata), shapes mirror the API.
- **Part 2:**
  - `d808c022` — `IStorageService` extended (settings, i18n, bookTypes,
    contentTypes, writingSessions); `ApiStorage` getters + `DexieStorage` v4
    reference tables + idempotent `ensureSeeded()`.
  - `c506f6e1` — useI18n, Settings (getApp/updateApp), useBookTypes,
    useContentTypes routed through `getStorage()` (**fixes the reported offline
    "Fehler beim Speichern"**).
  - `04574c8b` — plugins/writing wiring; gated WritingHistory + editor inline-AI
    + AITemplatePanel.
  - `adfa1e37` — core book/article/chapter CRUD call sites routed (CreateBookPage,
    CreateArticlePage, Dashboard, ArticleList, BookEditor, ArticleEditor,
    ChapterOutliner, GetStarted, settings writes in hooks).
  - `fcc1313d` — App-level config routed; trash loads skipped offline;
    create-book-offline E2E activated.
  - `b6d3d301` — BookEditor git-status probes skipped offline.
  - `2185750b` — `e2e/smoke/offline-pwa.spec.ts` (forces dexie via
    `localStorage["bibliogon.storage_mode"]`).

**Result:** books/articles/chapters create/edit/delete fully offline; settings,
i18n (8 langs), type registries, plugin list from the seed.

## The `/api` tail — CLOSED (`41a5e745`..`bb9ffad1`)

Literal whole-app **zero `/api` in dexie mode** is now met:
- `guardedFetch()` in `client.ts` is the single network egress; on the
  backendless build (`VITE_STORAGE_MODE=dexie`) it rejects before any fetch, so
  every `request()`/raw upload/blob/export call AND `import.ts` are covered.
- Advanced editors (`api.pages`/`api.comics`/`api.storyBible`) gated via
  `useOfflineFeatureGate()`; secondary reads (authors, chapter labels, imported
  comments, story-bible probe) stubbed to defaults offline.
- Offline E2E installs a global `page.route('**/api/**', r => r.abort())` hard
  gate — any `/api` request fails the run.

## Documentation discipline — no inline comments (`aade1dbd` + `0428b727`)

New rule in `.claude/rules/code-hygiene.md`: no inline `#`/`//` comments; code
self-explanatory, explanations go in docstrings/TSDoc (allowed: `TODO`/`FIXME`
with issue ref, regex/complex-why, license headers). The Track A+B inline
comments were cleaned up in one sweep (20 files): repetitive offline-gating
comments deleted, genuine "why" moved into `guardedFetch`/`makeQueueingStorage`/
`updateApp`/`generate_settings` docstrings. Vitest 2715 + tsc green.

## Next — v0.47.0 release

Offline-PWA + menu/settings fixes + doc-rule cleanup are all on `main`. The
companion handover `session-handoff-2026-06-05-offline-pwa-complete.md` carries
the long-form offline architecture. v0.47.0 is being prepared (version bump +
CHANGELOG); tag is gated on Aster's offline-E2E confirmation (Pre-Release Gate).

## Conventions / gotchas observed

- **Tailwind-only** for visual changes (Aster, repeatedly reinforced). No raw CSS /
  `@media` / CSS-module layout logic. Custom screens via `@theme { --breakpoint-* }`.
- **No `Co-Authored-By` AI trailers** (coding-standards.md overrides the harness default).
- Run Vitest from `frontend/`; bump `NODE_OPTIONS=--max-old-space-size=4096` for the
  full run (occasional OOM).
- The ECONNREFUSED:3000 lines in Vitest output are pre-existing telemetry noise,
  flaky as a counted "error".
- `make test`/scripts assume the backend poetry env; `make generate-seed-data` runs
  the Python seed generator there.
- Seam-routing pattern: replace `api.<entity>.<method>` → `getStorage().<entity>.<method>`;
  `getStorage()` is a no-op in api mode (apiStorage delegates) and resolves to Dexie
  in dexie mode. The seam covers books/chapters/articles/settings/i18n/bookTypes/
  contentTypes/writingSessions only — everything else stays on `api` and must be
  gated offline.

## Update — post-v0.47.0 (empty-dropdowns fix + rules)

- **v0.47.0 released + deployed.** Tag + GitHub Release live; both Pages sites
  serving v0.47.0 (verified the live bundle).
- **Empty-dropdowns bug (issue #32) fixed + deployed** (`2b8eb1c7`). Root cause:
  `getStorage()` is sync but DexieStorage is lazy-loaded, so the one-shot
  type/i18n/settings providers raced the import at mount, fell back to
  ApiStorage (rejected offline), and never retried → Settings Verhalten
  default-type dropdowns empty. Fix: preload DexieStorage before first render
  when explicit dexie mode is set; skip `verifyBackendVersion()`'s `/api/health`
  on the forced-offline build. Offline E2E 5/5 green, zero `/api`.
- **Stale Service Worker** is the reason older reports showed v0.46.0 firing
  `/api` 404s: users must clear the SW once (DevTools > Application > SW >
  Unregister + Clear site data) to leave the pre-offline cached build.
- **Rules synced from adaptive-learner** (`e15268dd`): issue discipline,
  TOUCH-TARGETS, DEXIE-MODE-REGEL, BACKUP-PARITY-PIN; `needs-repro` label added.
- **Two conflicts adjudicated** (2026-06-05): FUNKTION-NICHT-VERFUEGBAR
  overridden (keep disable+explain); CSS-first replaced by Tailwind-first.
- **Next:** v0.47.1 patch (the dropdown + E2E fixes), gated on Aster's offline
  smoke confirmation before tagging.
