# Chat journal — 2026-06-06 (Maximal Offline: #33 close + client export)

Session driven by live bug reports from `astrapi69.github.io/bibliogon` and a
prioritized "Maximal Offline" plan. All work landed on `main` (deploy-pages
auto-deploys each push).

## 1. Diagnosis — live reports were a stale service worker

The live reports (`POST /api/authors -> 503`, `/api/settings/app` spam) showed
already-fixed behavior. Verified by curling the deployed `dexie-storage` chunk:
it already carried `version(5)` + the `authors` table — i.e. the fix WAS
deployed. Root cause: a stale precached service worker in the reporter's
browser, not a deploy/code problem. Recorded as memory + lessons-learned.

## 2. Build info in Settings > Über + offline About (e4d7c458)

Vite `define` injects `__BUILD_HASH__` (git short SHA) + `__BUILD_DATE__`
alongside `__APP_VERSION__`. AboutSettings now renders version/build/date from
those build-time literals and no longer gates its whole body on the backend
`systemInfo`, so the About page (version + build provenance + seeded plugin
list) renders in Dexie mode. Makes a stale SW self-diagnosable. i18n
`build_label`/`build_date_label` across 8 catalogs + reseed.

## 3. Service-worker update reliability (86c1aa8d)

`main.tsx` nudges `registration.update()` on focus/visibility + hourly, so a
long-open/reopened PWA tab picks up a new deploy without a manual cache clear.
vite-plugin-pwa still owns activation+reload (skipWaiting/clientsClaim); no
competing reload (no loop risk). Production-only.

## 4. P1 — offline article gaps closed, #33 done (117ccdd4, f7cae04a)

- `t()` guarded against a non-string key (`typeof key !== "string" ->
  fallback`), eliminating the `.split` crash CLASS that took down the
  article-list subtree. Extracted the pure `translate()` resolver, shared it
  with its test (was a drifted local copy), added a regression pin.
- Routed `api.publications` / `api.articlePlatforms` / `api.editorPluginStatus`
  through the storage seam with Dexie empty-defaults (no `/api` offline).
- `buildArticle` brought to the exact ArticleOut shape (article_metadata `{}`,
  comments_count `0`, original_published_at/deleted_at `null`).

## 5. DEXIE-MODE-REGEL -> Maximal Offline (6417e19d)

Rule updated: gate is now the EXCEPTION (only Pandoc export / Git / audiobook
TTS / LAN); everything else works via Dexie or a browser-native alternative.

## 6. P2 — client-side export engine (99d18efd, 7547bb37, 7c7c6b80)

Backend-free export (#34), 6 formats:
- `src/export/`: format-agnostic `ExportDocument`; self-contained TipTap-JSON
  -> HTML walker; Markdown via turndown(HTML); plain text via the shared
  `nodeToPlainText`; PDF via pdfmake (pure content walker + lazy render); EPUB
  via epub-gen-memory; DOCX via docx. `downloadExport(doc, format)` dispatch;
  binary libs lazy-loaded (pdfmake/vfs are separate ~1.8 MB chunks, only on
  PDF export).
- `ClientExportMenu` dropdown; ExportPage offline renders it (loads the book
  from Dexie with content) instead of the gate; ArticleEditor's export buttons
  route through the client engine offline. Online keeps Pandoc (two-engine).
- `ui.export.*` i18n × 8 + reseed. Offline E2E: create book -> export -> assert
  a real `.md` download.
- New deps: turndown, pdfmake, epub-gen-memory, docx (0 vulnerabilities).
- Deferred (#34): Settings > Export 'Export-Engine' chooser (today
  offline=TS, desktop=Pandoc automatically).

## Verification

tsc clean; Vitest 2715 -> 2736; backend i18n parity 51 + structure 111 green;
`npm run build` green (pdfmake/vfs lazy-chunked); P2 deploy queued.

## 7. P3a — chapter labels + prose storyboard via Dexie (fd0a6ff4)

Chapter labels are pure CRUD over the existing (offline-download) Dexie
`chapterLabels` table: `ChapterLabelStorage` seam (list/create/update/remove)
+ apiStorage getter + DexieStorage impl (book-scoped, position-ordered) +
sync-queue passthrough. Wired ChapterLabelManager, ChapterOutliner and
ProseStoryboard through `getStorage()`; ProseStoryboard's direct
`api.chapters` reads were routed too, so the whole prose storyboard works
offline. Dexie round-trip test + existing component tests green (delegate
through the seam). Vitest 2737. Pushed live.

Also confirmed `writingSessions` is already offline-complete (DexieStorage
returns an empty list → the writing-history page renders its empty state).

## 8. P3 — Story Bible offline (1ae549c8)

The per-book fiction-entity database now works on the backendless build:
- Seeded the entity-type registry (`generate_story_entity_types()` in the seed
  pipeline → `seed-story-entity-types.json` → a new Dexie `storyEntityTypesRef`
  table at schema v6, populated by `ensureSeeded()`).
- `StoryBibleStorage` seam (16 methods) + apiStorage getter + sync-queue
  passthrough. DexieStorage: entity CRUD + entity-page/chapter link CRUD over
  the existing `storyEntities` / `storyEntityPageLinks` tables, relationship
  resolution, `getInfo` (reports available so the UI un-gates), client-side
  Markdown export. `autoDetect` / `continuityCheck` return empty offline.
- Routed all 9 story-bible call sites through `getStorage()`; removed the
  BookEditor offline early-return so `storyBibleAvailable` is the seam probe.
  StoryEntityEditor skips its `api.pages` probe offline + reads chapters via
  the seam → zero `/api`.
- DexieStorage round-trip test (CRUD + relationships + links + export +
  cascade) + offline E2E (add a character, persists). Vitest 2738; build
  green. Pushed live.

## Remaining (tracked in #34)

## 9. P3 — picture-book pages + comic panels/bubbles offline (1b1e23c4)

`PageStorage` + `ComicsStorage` seams + apiStorage getters + sync-queue
passthrough; DexieStorage CRUD over the existing `pages` / `comicPanels` /
`comicBubbles` tables (scoped, position-ordered, cascade-on-delete, backend
bubble defaults mirrored; `comics.getInfo` reports available). Routed the 8
page/comic call sites through `getStorage()`; ComicBookEditor skips its
`api.assets` thumbnail probe offline (images = P3e). Removed the three
BookEditor offline gates (page/comic editor, prose Storyboard, relationship
graph) — all render offline now. Dexie round-trip tests (pages reorder +
panel/bubble cascade) + offline E2E (picture-book → add page). Fixed a
lazy-import teardown race in useStorageMode.test. Vitest 2740; build green.
Pushed live.

## Remaining (tracked in #34)

- **comments**: needs a new Dexie table (schema bump) + admin CRUD. Low offline
  value until P4 (no offline data source — comments come from Medium import).
- **assets**: IndexedDB blobs (binary upload + blob-URL serving) — unlocks
  images in the picture-book/comic editors offline. Most complex; last.
- **P4**: AI via the user's own provider key + client-side Medium import; plus
  the deferred Settings > Export engine chooser.

P4 — AI via the user's own provider key + client-side Medium import. Plus the
deferred export-engine chooser. All multi-session.
