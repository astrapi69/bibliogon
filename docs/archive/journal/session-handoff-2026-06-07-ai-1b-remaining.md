# Session Handover — #34 Maximal-Offline: core DONE, only AI 1b remains

Fresh-session brief. The Maximal-Offline program (#34) shipped its entire core
this arc; one feature is left. Read this before starting AI 1b.

## State of `main`

HEAD around `273e794f` (a parallel agent pushed a 10-commit backend
**repository-pattern refactor** arc on top of the offline work at ~16:35 on
2026-06-07 — backend Service<->Data boundary; does NOT touch the frontend
offline layer). All offline work is intact in history (verify:
`git merge-base --is-ancestor 8cd399c8 HEAD` -> yes). Watch the first-parent
`git log` — it shows the refactor tip; the offline commits are further down.

**Shipped + live this arc (every offline feature, all CI green):**
- P3c assets (SW-intercept + `useAssetUrl` resolver) — `1f74b36c`
- export-engine chooser (`behavior.export_engine` auto/client/backend) — `53970493`
- client Medium import (fflate unzip + TS walker port) — `f7c1773e`
- **AI via user key — 1a** — `bb761161`
- git-sync credential 500 fix (#35) — `be97295a`
- comments offline (Dexie v8 + Medium-import data source) — `8cd399c8`

Vitest ~2829; backend + plugins + i18n parity 51 green.

## The ONLY remaining #34 item: AI 1b (template `aiFill` offline)

1a shipped the **foundation**: browser-direct LLM calls. 1b is the big port —
the in-editor "Fill with AI" template flow (`AITemplatePanel`) that fills an
article's / book's metadata fields in one structured call.

### What 1a already gives you (reuse, don't rebuild)

- `frontend/src/ai/llmClient.ts`: `aiChat(config, messages, {maxTokens})` over
  OpenAI-compat + Anthropic. `getAiConfig()` reads provider/base_url/model/
  api_key from the settings seam (offline IndexedDB). `isAiConfigured(config)`.
- The AI config (incl. `api_key`) already persists offline via the settings
  seam — **no new table** (it lives in `appSettings.ai`).
- `frontend/src/ai/marketingPrompts.ts` is the pattern for porting a backend
  prompt set verbatim to TS.

### What 1b must port (backend `app/ai/`, ~the heavy part)

- `template_schema.py` (801 lines) — the structured fill schema: `TemplateField`
  / `ArticleTemplate` / `BookTemplate`, `extract_body_text` / `extract_body_
  preview`, `apply_field` (the per-field apply with `APPLY_SKIP_EMPTY` /
  `APPLY_SKIP_POPULATED` / `APPLY_UPDATED` reasons), `serialize_template_to_yaml`
  / `parse_template_from_yaml`, and the `_article_field_specs()` /
  `_book_field_specs()` field maps.
- `article_template_prompts.py` (193) + `book_template_prompts.py` (211) — the
  system+user prompts for the fill.
- The fill endpoint logic: builds the template from current entity state ->
  prompt -> LLM -> parse structured response -> `apply_field` per requested
  `field_classes` -> return updated/skipped/tokens/cost. (`api.articles.aiFill`
  / `api.books.aiFill`, `AiFillRequest { field_classes, force, inline_image_
  count }`.)

### 1b plan sketch (mirror the 1a + Medium-import shape)

1. Port `template_schema` + the two prompt sets to `frontend/src/ai/` (pure TS,
   heavy unit tests — this is the risk surface).
2. A client `aiFillArticle(article, fieldClasses)` / `aiFillBook(book, ...)`
   that builds the template, calls `aiChat`, parses, applies via the ported
   `apply_field`, returns the same `AiFillFieldClassResult` shape.
3. Wire offline in `AITemplatePanel` (branch on `offline`, like
   BookMetadataEditor's marketing generate did): offline -> client aiFill;
   online -> `api.*.aiFill`. Availability follows `isAiConfigured` offline.
4. Offline E2E: configure key (mock provider via `page.route` on the provider
   URL — NOT under `/api/`, so the gate allows it), open the panel, Fill with
   AI, assert a field populates + zero `/api`.

Estimate: 2-3 sessions (the schema + apply port is the bulk). Keep `aiChat`
unchanged; the work is prompts + schema + apply + wiring.

## Live-verify gaps (only checkable in a real browser — flag for Aster)

- **SW asset-intercept** (`public/asset-intercept-sw.js`): build-validated,
  NOT unit/E2E covered (no SW in the dev test env). Verify on the live GH-Pages
  build: embed an image in a prose chapter / picture-book offline -> reload ->
  the SW serves it from IndexedDB. URL-shape regexes are pinned in
  `asset-url.test.ts`.
- **AI CORS per provider**: built against documented browser-access patterns
  (OpenAI/Google/LMStudio direct; Anthropic needs the
  `anthropic-dangerous-direct-browser-access` header, already sent). Real
  per-provider CORS needs the user's key in a real browser.

## Insider notes / discipline (will save you time)

- **Run `pre-commit run --all-files` before every backend push.** I skipped it
  once (#35) -> a ruff-format nit slipped through the staged-files hook ->
  one CI red + a hotfix. ruff-format only runs on `^backend/`.
- **The Dexie seam recipe** (used for every P3 entity): add a `*Storage`
  interface in `storage/types.ts` (members `typeof api.<ns>.<m>`; extra
  offline-only members are fine — see assets' getBlob/cacheBlob, comments'
  create) -> apiStorage getter -> DexieStorage impl -> sync-queue passthrough
  -> route call sites through `getStorage()`. apiStorage getters resolve
  `api.<ns>` at CALL time, so existing component tests stay green in api mode.
- **Un-gating leaves unused imports** (tsc silent with noUnusedLocals off;
  eslint/pre-commit catches). Grep the file after removing a gate / an
  `api.X` usage.
- **Offline E2E gate**: `offline-pwa.spec.ts` aborts + records every `/api/`
  request (regex anchored to the origin, so it does NOT catch provider URLs
  like `api.openai.com/v1/...` — those are allowed; mock them with
  `page.route`). The dev server has NO service worker (`devOptions.enabled:
  false`), so SW-only behaviour can't be E2E'd there.
- **i18n inserts**: when adding a key under a namespace that already exists
  later in the catalog, add it to the EXISTING block (grep `^  <ns>:` must
  stay 1 per file) + reseed (`make generate-seed-data`) + assert it's in the
  seed JSON, not just the YAML. Use the German-typographic-quote-vs-ASCII
  escaping carefully in double-quoted scalars.
- **Multi-tool coordination**: a parallel agent (CCW) runs responsive-mobile +
  docs + the backend repository-pattern refactor. Before pushing, `git fetch`
  + check `origin/main`; rebase the feature branch onto it; explicit-path
  staging only (no `git add -A`) while parallel work is in flight. Shared file
  touched by both: `ComicBookEditor.tsx` (my asset blob-URLs + CCW's
  collapsible sidebar) — coexists.
- **git-sync credentials UI responsiveness** is CCW's lane (not the #35 backend
  fix, which is done and covers LAN/mobile).

## Memory pointers

Project memory: `offline-maximal-dexie-direction.md` (the program status +
reusable shapes for AI/comments/assets/#35). Feedback: ask questions in chat
prose (not the selection tool); state the clock time on any "waiting" line.
