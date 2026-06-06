# Session Handover — P3c: Assets/Media offline via IndexedDB blobs (#34)

Fresh-session brief for the LAST + most complex P3 entity: binary image
assets offline. Everything else in P3 shipped (see "State of main"). The seam
pattern is established; assets differ because they are BINARY + referenced by
URL, not by id (read the "Critical finding" below before coding).

## State of `main`

HEAD around `3a6f80e7`. All of P1, P2, P3a/b are live (deploy-pages auto-deploys
each push). Shipped this run, all green (tsc + Vitest 2740 + build):

- **#33 closed** (offline article gaps + `.split` crash class + build-info +
  SW update reliability).
- **P2 client-side export** (#34): Markdown/HTML/Text/PDF/EPUB/DOCX, no Pandoc.
  `frontend/src/export/`, `ClientExportMenu`, ExportPage offline. Deferred:
  Settings > Export engine chooser.
- **P3 via the Dexie storage seam** (#34): chapter labels + prose storyboard
  (`fd0a6ff4`), Story Bible (`1ae549c8`), picture-book pages + comic
  panels/bubbles (`1b1e23c4`). Removed the 3 BookEditor offline gates.

The seam recipe (copy it): add a `*Storage` interface in
`frontend/src/storage/types.ts` (members typed `typeof api.<ns>.<m>`), an
apiStorage getter in `api-storage.ts`, a DexieStorage impl in
`dexie-storage.ts`, a sync-queue passthrough in `sync-queue.ts`, then route the
call sites through `getStorage()`. Tables for the offline graph already exist
(created by offline-download). DexieStorage tests live in
`dexie-storage.test.ts`; offline E2E in `e2e/smoke/offline-pwa.spec.ts`
(enforces literal zero `/api` in dexie mode).

## Step-1 audit (done — call-site inventory)

**`api.assets` surface** (`frontend/src/api/client.ts`):
- `list(bookId)` -> `Asset[]`
- `upload(bookId, file, assetType)` -> multipart POST (raw `fetch`, not
  `request()`), returns `Asset`
- `delete(bookId, assetId)`
- (No get-by-id; metadata comes from `list`.)

**Asset shape:** `{ id, book_id, filename, asset_type, path, uploaded_at }`.

**`api.assets.*` call sites (9):**
- upload: `CollageCanvas.tsx:625`, `Editor.tsx:349`, `PageCanvas.tsx:636` +
  `:659`, `comics/LayoutConfigComicPanel.tsx:72`
- list: `ComicBookEditor.tsx:492`
- delete: `BookMetadataEditor.tsx:1080`
- (comment-only mentions in `ComicBookEditor.tsx:479`,
  `comics/LayoutConfigComicPanel.tsx:21`)

**Asset-URL construction sites (~8 book + 2 article):** all build
`/api/books/${bookId}/assets/file/${filename}` (BY FILENAME):
`CoverUpload.tsx:44`, `BookListView.tsx:116`, `ComicBookEditor.tsx:495`,
`Editor.tsx:350`, `BookCard.tsx:57`, `BookMetadataEditor.tsx:1135`,
`kdp-wizard/CoverValidation.tsx:80`; articles:
`ArticleImageUpload.tsx`, `client.ts:2726`.

**Combined ~17 sites** — at/over the prompt's >15 STOP-condition scope check.
Treat assets as its own multi-commit session; consider splitting
(book covers + picture-book + comic + TipTap-editor images).

## CRITICAL FINDING — read before following the prompt's Step 4/5

The prompt assumes images are referenced by **asset id** (`useAssetUrl(id)` ->
`/api/assets/{id}`). **They are not.** In Bibliogon:

1. Image src is the full URL `/api/books/{bookId}/assets/file/{filename}`,
   keyed by **filename**, not id.
2. TipTap stores that URL as the `src` attr of an `imageFigure` node (see
   lessons-learned "TipTap image node is imageFigure"). So chapter/article/page
   bodies contain `/api/...assets/file/...` URLs embedded in their JSON.
3. `Book.cover_image` / page `image_asset_id` etc. resolve to the same
   filename-based URL.

Consequence: a `useAssetUrl(id)` hook does NOT fit the embedded-in-TipTap case,
because at render time the editor has a URL string, not an id. The offline
resolver must map an existing `/api/books/{id}/assets/file/{filename}` URL ->
the IndexedDB blob (by filename), AND `upload()` offline must mint a URL of the
SAME shape so the stored src is stable across modes.

### Two viable offline architectures (decide in the session)

- **(A) Service-worker intercept (recommended):** add a workbox runtime route
  for `/api/books/*/assets/file/*` that, in dexie mode, serves the blob from
  IndexedDB. Pro: every existing `<img src="/api/.../assets/file/...">` "just
  works" with ZERO call-site rewiring; the stored TipTap URLs stay valid in
  both modes. Con: SW + IndexedDB access from the SW context; the offline E2E's
  `route.abort('**/api/**')` gate would need to allow `/assets/file/` (it
  currently aborts all `/api/`). Verify the gate interaction carefully.
- **(B) Resolver + rewrite:** a `useAssetUrl(urlOrFilename)` resolver hook +
  rewrite every display site to use it, and offline store the blob keyed by
  filename. Con: ~10 display sites to rewire + the embedded-in-TipTap URLs
  still need interception at render (img-load), which pushes you back toward
  (A) for the editor body anyway.

Architecture (A) is likely the smaller, more correct change given the embedded
URLs. Confirm with the user before committing to a path.

## Dexie table (schema bump v7)

`assets`: `id, bookId, filename, mimeType, blob, createdAt` (+ optional
width/height). Index `bookId` AND `filename` (lookups are by filename per the
finding). Bump `BibliogonOfflineDB` to `version(7)` in `dexie-storage.ts`
(v6 added `storyEntityTypesRef`). Store the `File` as a native `Blob` (NOT
base64). NOTE: the offline-download `ingestBookGraph` already pulls a
`graph.assets` array (currently unused) — wire it to populate this table so a
downloaded book's images are available offline too.

## Remaining prompt steps (unchanged)

Steps 2/3 (seam + DexieStorage blob CRUD), 6 (verify: upload -> display ->
reload-persist -> delete -> zero `/api/assets`), 7 (quota warning via
`navigator.storage.estimate()`, >80% -> translated "Speicher fast voll" in 8
catalogs, warning only). E2E: asset upload + display round-trip in the offline
spec. Keep the zero-`/api` gate green (mind the SW-intercept interaction).

## STOP-conditions hit / to watch

- Scope: ~17 call sites (>15). Split the work; confirm path (A) vs (B) first.
- The id-vs-filename/URL mismatch (above) invalidates the prompt's
  `useAssetUrl(id)` shape — adapt to URL/filename resolution.
- `upload()` uses raw `fetch` (multipart), not `request()` — the offline branch
  replaces the whole upload, fine, but note it when typing the seam member
  (`typeof api.assets.upload` carries the `(bookId, file, assetType)` shape).

## Conventions

The user explicitly **waived the originating prompt's "Do NOT" list** — do not
treat those bullet restrictions as binding (the next session may, e.g., touch
comments/P4 if it fits, use `git add -A` when the tree is solely its own work,
etc.). The authority is the standing project rules in `.claude/rules/`
(`architecture.md`, `coding-standards.md`), NOT that prompt. Per those rules,
the sensible defaults still hold: Tailwind-first for visual work, TSDoc over
inline comments, store images as native Blobs (base64 is wasteful), and assets
are DATA -> route through Dexie rather than gate. The user pushes feature work
to `main` directly (deploy-pages deploys it live); branch + ff-merge as in this
run.
