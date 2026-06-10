# Session Handover — 2026-06-05 (offline-PWA gaps, issue #33)

Continuation of the offline-PWA work after v0.47.0/v0.47.1. Captures what was
fixed this session and the remaining gaps to close **fresh against issue #33**.

## State of `main`

- HEAD: `30c73fc9`. Version 0.47.1 (tagged + released earlier this session).
- Baselines: tsc clean; Vitest **2715 passed**; offline E2E
  (`e2e/smoke/offline-pwa.spec.ts`) **6/6 green** (incl. the new authors test);
  zero `/api` in dexie mode for every surface the spec touches.
- The web app deploys on push to `main` via `deploy-pages.yml` (no tag needed).

## FIXED this session

### Authors work offline (`30c73fc9`, #33)
The Authors-DB is pure CRUD, so it now works offline instead of erroring
("Offline: /api/authors requires the Bibliogon backend" on book/article
create). Added `authors` to the storage seam:
- `frontend/src/storage/types.ts` — `AuthorStorage` interface + `authors` on
  `IStorageService`.
- `frontend/src/storage/api-storage.ts` — `authors` getter delegating to
  `api.authors`.
- `frontend/src/storage/dexie-storage.ts` — v5 `authors` table
  (`id, name, slug`), `buildAuthor()` + `slugify()` (client-side slug), and the
  `authors` impl (list with search+ordering, get, create, update, delete).
- `frontend/src/storage/sync-queue.ts` — `authors` passes through (local-only;
  **NOT yet queued for replay** — offline-created authors do not sync to the
  server on reconnect; extending the `SyncQueueEntry.model` union is a
  follow-up).
- Call sites routed `api.authors.*` → `getStorage().authors.*`:
  `CreateBookForm.tsx`, `BookMetadataEditor.tsx`,
  `articles/ConvertToBookWizard.tsx`, `settings/AuthorsDatabase.tsx`,
  `pages/ArticleEditor.tsx` (the latter was un-gated — it previously skipped
  the load offline; now it reads from Dexie).
- Regression pin: `e2e/smoke/offline-pwa.spec.ts` "authors work offline".

### Preload race hardening (`70e3a28c`, #33)
`frontend/src/main.tsx` `boot()` now **retries** the lazy `DexieStorage` import
(4 attempts, backoff). Root cause of the live `/api/settings/app` 503 spam: a
**stale-Service-Worker race** — a clean production build fires zero `/api`
(verified via `vite preview` of the dexie build), but the live build raced
because ~6 rapid deploys churned chunk hashes and the dexie chunk transiently
failed to load → `boot()` rendered without Dexie → every `getStorage()` call
fell back to the offline-rejected API client. Retry survives the transient
failure. (Also earlier: `a9fab5c1` fixed a Vitest teardown flake from the same
lazy import.)

## Diagnosis split (important for the remaining work)

Two distinct causes behind the live reports:
1. **Stale-SW race** → the repeated `/api/settings/app` 503 on every nav. Fixed
   by the boot retry. Users must do ONE clean reload after a deploy
   (DevTools → Application → Service Workers → Unregister + Clear site data) to
   leave a stale precache; then it is stable.
2. **Real direct-`api` gaps** → components that call `api.*` directly (bypass
   the seam) and reject offline regardless of build freshness. Authors was one
   (fixed). The rest are below.

## OPEN — remaining gaps (do fresh against #33)

All of these fire `ApiError` ("Offline: …requires the backend") offline because
they call `api.*` directly. Backend-only publishing/plugin features → **gate**
offline (disable + explain via `useOfflineFeatureGate()` / `OfflineFeatureNotice`,
the Bibliogon rule — do NOT hide). Pure-data ones could go in the seam, but
publications/platforms are publishing-related and backend-only, so gating is
the right call.

1. **`api.publications`** (article publications). Surfaces:
   - `frontend/src/components/articles/PublicationsPanel.tsx` (the editor panel)
   - `frontend/src/pages/ArticleEditor.tsx` (loads publications for the article)
   - Symptom: `GET /api/articles/{id}/publications -> 503`, toast "Konnte
     Publikationen nicht laden."
2. **`api.article-platforms`** (`GET /api/article-platforms`). Reference data
   for the publishing UI. Surfaces: `ArticleEditor.tsx` / `PublicationsPanel`.
   Option: seed it like content-types (it is static-ish) OR gate. Gate is
   simpler and consistent with the publish surface being backend-only.
3. **`api.editor.pluginStatus`** (`GET /api/editor/plugin-status`). Surfaces:
   `frontend/src/components/Editor.tsx` (editor plugin-status probe). Gate /
   stub to a safe default offline.
4. **`.split` ErrorBoundary crash** on `/articles` (offline). Caught by
   `error-boundary-article-list`. `TypeError: Cannot read properties of
   undefined (reading 'split')`. NOT yet root-caused.

### `.split` crash — reproduction + leads
- Repro (live, offline build): clear SW → create an article offline
  (`/articles/new` → Erstellen) → navigate to `/articles`. The list subtree
  throws and the ErrorBoundary fallback renders.
- Local repro path: `cd frontend && VITE_STORAGE_MODE=dexie npm run build` then
  `npx vite preview --port 4173`; drive with Playwright (chromium) — set NO
  localStorage (build-time dexie). NOTE: capturing `/api` via
  `page.on('request')` does NOT work — `guardedFetch()` rejects BEFORE the
  network call, so there is no request event. Capture `page.on('pageerror')`
  and the ErrorBoundary fallback DOM instead. (Also kill stray `uvicorn`/chrome
  procs first; a stuck `uvicorn --workers 2` on :8000 caused Playwright exit 144
  this session.)
- Leads: `ArticleList.tsx` itself has NO `.split`. `formatDate.ts` is
  null-safe (not it). The offline-created article (`buildArticle` in
  `dexie-storage.ts`) leaves several fields null/undefined that a normal `/api`
  article has populated — notably `article_metadata` can be `undefined`, and
  `original_published_at` is absent (ArticleRow falls back to `updated_at`,
  which is fine). The `.split` is likely in a shared child of the list (a
  filter bar / topic / content-type label / publication-platform badge) reading
  one of those undefined offline fields. `PublicationsPanel.tsx:369` has a
  `.split(",")` but that is the editor, not the list — check whether the list
  renders any publication/platform-derived string. Start by reproducing, then
  read the unminified stack (dev/preview build) to get the exact file:line.

## Tracking

- Issue **#33** (this work). Issue **#32** (the dropdown fix) closed by
  `2b8eb1c7`.
- Conventions: offline rule = "works in Dexie OR gated, same commit" (DEXIE-MODE-REGEL,
  architecture.md). "Disable + explain, do not hide" (FUNKTION-NICHT-VERFUEGBAR
  is overridden for Bibliogon). Every offline surface must keep the E2E hard
  gate (zero `/api`) green.
