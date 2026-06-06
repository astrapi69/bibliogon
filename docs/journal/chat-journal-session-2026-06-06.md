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

## Remaining (tracked in #34)

P3 — remaining data entities via Dexie (story-bible, storyboard, picture-book
pages, comic panels, chapter labels, comments, writing sessions, assets).
P4 — AI via the user's own provider key + client-side Medium import. Plus the
deferred export-engine chooser. Both multi-session.
