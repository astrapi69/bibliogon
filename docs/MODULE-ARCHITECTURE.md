# Module Architecture Reference

A practical map of how Bibliogon's code is organized and the
reusability principles that keep it that way. This is a companion to
[`.claude/rules/architecture.md`](../.claude/rules/architecture.md)
(the layered/plugin architecture) and
[`.claude/rules/coding-standards.md`](../.claude/rules/coding-standards.md)
(naming, function design, the Recurring-Component Unification Rule). Read
those for the *why*; read this for *where things live* and *how to keep
new code reusable*.

> **`src/modules/` is a barrel seam, NOT a tree rewrite.** The
> concern-first folders below stay the target for *implementations*; a new
> feature still adds files *across* `pages/` / `components/` / `lib/` /
> `storage/`, never into a feature folder. What `src/modules/module-{name}/`
> adds (Maximal Offline, #34) is a thin **plugin-parity barrel layer**: one
> directory per backend plugin (`bibliogon-plugin-{name}`) whose `index.ts`
> *re-exports* that plugin's browser-side offline counterpart from its
> canonical concern-first location, with TSDoc + a `README.md` recording the
> module's offline status. No code is relocated; the concern-first file
> remains the single source of truth. Do NOT move implementation code into
> `modules/` and do NOT create a `modules/` entry that re-implements (rather
> than re-exports) existing logic. See
> [`frontend/src/modules/README.md`](../frontend/src/modules/README.md) and
> [`MAXIMAL-OFFLINE-PARITY.md`](MAXIMAL-OFFLINE-PARITY.md).

## Folder structure

### Frontend (`frontend/src/`)

Concern-first, not feature-first. A new feature adds files *across* these
folders rather than a single new folder.

| Folder | Holds | Reuse rule |
|--------|-------|------------|
| `pages/` | Route-level screens (Dashboard, BookEditor, Settings, …). One file per route. | Thin: compose components + hooks; no business logic, no `fetch`. |
| `components/` | Shared, reusable UI built from Radix/shadcn primitives + Tailwind. | Props-driven; a component is reusable only if it takes its data via props, not by reaching into globals. |
| `hooks/` | Reusable stateful logic (`useI18n`, `useTheme`, selection/view-mode hooks). | One responsibility per hook; no JSX. |
| `lib/` | Pure helpers and utilities with **no app imports** (`cn()`, geometry/style helpers). | Must be import-safe from anywhere: no side effects at import, no reach-back into `pages/` or `api/`. |
| `storage/` | The `IStorageService` seam (`getStorage()` → `ApiStorage` online / `DexieStorage` offline), sync queue, connectivity monitor. | All persistence goes through the seam — never `fetch`/Dexie directly in a component. |
| `api/` | The typed API client (`api/*`). The **only** place that talks HTTP. | Components call `api.*`, never `fetch`. |
| `features/` | The feature-strategy registry (`featureConfig.ts`, `AppFeatureProvider`, `useFeature(id)`) for offline/desktop gating. | Gate surfaces through `useFeature`, not ad-hoc `mode === "dexie"` checks. |
| `contexts/`, `themes/`, `styles/` | Cross-cutting providers + the CSS-variable theme system. | See "Global state is allowed" below. |
| `extensions/` | TipTap editor extensions. | Prefer an official extension before writing one (see lessons-learned). |
| `modules/` | Plugin-parity barrels (`module-{name}/`): one per backend plugin, re-exporting its offline counterpart from the concern-first folders. | Barrel + `README.md` only. Re-export, never relocate or re-implement. Gate browser-impossible plugins via `useFeature`. |

### Backend (`backend/app/`)

The 4-layer flow is unidirectional: **router → service → repository →
model**. See `architecture.md` "Data flow".

| Folder | Holds | Reuse rule |
|--------|-------|------------|
| `routers/` | FastAPI endpoints only: validate input, call a service, return the response. | Thin. No business logic, no `db.query`. `git_sync.py` is the goldstandard. |
| `services/` | Business logic + orchestration. Raises `BibliogonError` subclasses, never `HTTPException`. | Pure-ish, testable without a FastAPI context; FastAPI types (`Request`/`Depends`) do not belong here. |
| `repositories/` | The Service↔Data boundary: abstract interfaces + `SqlAlchemy<Entity>Repository` impls. | The only place `db.query`/`session.commit` live. No HTTP concepts, no business rules. |
| `models/` | SQLAlchemy mapped models (declaration-only). | One concern; declarations only, no behaviour. |
| `schemas/` | Pydantic v2 request/response contracts (declaration-only). | Validators live here, not in routers. |
| `middleware/`, `ai/`, `data/`, `import_plugins/` | Cross-cutting middleware, the AI client/config, seed data, the import-handler registry. | — |

App wiring lives in `app/main.py` (the FastAPI instance + lifespan)
delegating to focused setup modules: `router_registration.py`,
`exception_handlers.py`, `config_loader.py`, `routes_misc.py`,
`routes_admin.py`. Keep `main.py` thin — new routers register in
`router_registration.py`, not inline.

## Where the post-burn-down splits live

The 2026-06 god-file burn-down (PRs #166–#229) reshaped two hub files and
extracted reusable helpers. Concrete current layout:

### `api/` — the HTTP client (split from the former 5212-line `client.ts`)

`client.ts` is now a **13-line re-export barrel** (211 call sites unchanged).
Behind it:

- `api/http.ts` — `guardedFetch`-backed transport core (request/upload/blob).
- `api/errors.ts` — `ApiError` + `SaveAbortedError`.
- `api/apiObject.ts` — assembles the single `api` surface by spreading the
  five domain namespaces.
- `api/{books,articles,chapters,media,platform}.ts` — domain-grouped API
  namespaces; `api/import.ts` for the import wizard.
- `api/types.ts` — all request/response DTOs in one declaration file
  (whitelisted single-concern; mirrors the backend `schemas/__init__.py`
  rationale).

### `lib/` and `shared/` — reusable extractions

- `lib/utils.ts` — `cn()` (shadcn class-merge).
- `lib/components/SortableList.tsx` — generic `SortableList<T>` / sortable
  group (extracted from ChapterSidebar / ConvertToBookWizard / Storyboard).
- `lib/utils/{chapterGroups,markdownToHtml,pageLayoutStyles,pageTextContent}.ts`
  — pure helpers lifted out of god-files (zero app imports).
- `shared/utils/downloadBlob.ts` — the de-duplicated
  `createObjectURL → anchor → revoke` helper (was triplicated across
  Dashboard + ArticleList).

### `storage/dexie/` — the split offline backend (barrel + modules)

`storage/dexie-storage.ts` is now a **13-line re-export barrel**; the former
2214-line monolith was split into `storage/dexie/` and dropped from
`.filesize-baseline`. Behind the barrel:

- `dexie/schema.ts` — the Dexie database declaration. Schema **version 11**
  today; each `.version(N).stores({...})` is an append-only migration step
  (v1 base tables → v2 `syncQueue` → v3 `syncBaselines` → v4 offline
  reference data → v5 `authors` → v7 binary `assets` → v8 `articleComments`
  → v10 `articleAssets` → v11 `eventLog`). Never rewrite a past version;
  add the next.
- `dexie/serialized-update.ts` — the generic per-`(table, id)`
  `serializedUpdate` write-queue (see "Storage patterns" below).
- `dexie/{books,chapters,articles,pages,comics,authors,story-bible,
  chapter-labels,comments,covers,writing,reference,graph}.ts` — per-entity
  CRUD modules that the `DexieStorage` seam composes.
- `dexie/{helpers,blobs,article-assets,assets,seed,backend-only}.ts` —
  shared helpers, binary-asset storage, the seed pipeline, and the
  offline-gated stubs.
- `dexie/index.ts` — the barrel that assembles the `IStorageService`-shaped
  `DexieStorage` object.

This is now a second instance of the barrel-directory split goldstandard
(after `api/`); the per-entity modules are the template for any further
storage growth.

## Storage patterns

Beyond the seam itself (`getStorage()` → `ApiStorage` / `DexieStorage`),
three patterns recur across the offline backend:

- **Serialized write-queue (`dexie/serialized-update.ts`).** Every
  read-modify-write on a record routes through `serializedUpdate(table, id,
  fn)`, which chains operations on a promise queue keyed by `"${table}:${id}"`.
  Same-key writes run strictly in call order (no two read the same pre-write
  state and clobber each other); different keys run concurrently. This closed a
  real settings-clobber data-loss class — any new RMW path on a Dexie record
  must go through it, never a bare `get` + `put`.
- **Offline article assets (`#157`).** Article featured-image *bytes* are
  stored in IndexedDB as an **`ArrayBuffer`** (not a `Blob` — see
  lessons-learned: Blobs lose their prototype through the test stack's
  structured-clone), in the `articleAssets` table (`dexie/article-assets.ts`,
  written via `storeArticleAssetBlob` in `dexie/helpers.ts`). The
  `useArticleImageUrl` hook (`hooks/useArticleImageUrl.ts`) resolves an image to
  a `blob:` URL offline (reconstructing the Blob on read, revoked on unmount)
  and falls back to the CDN URL online; Medium-import caches the CDN thumbnail
  bytes on import.
- **Selective export (`#247`).** `export/selectiveExport.ts` +
  `components/settings/SelectiveExportSection.tsx` let the user tick which
  sections (books+chapters, articles, authors, chapter-labels, story-bible,
  writing-sessions, settings) go into a JSON backup. The output shape is
  identical to the full backup, so it re-imports through the same
  `importFullBackup` path (unselected sections emit empty and the importer
  skips them). Gated by `FEATURES.SELECTIVE_EXPORT`; works online and offline
  through the seam. All formats are inventoried in
  [`EXPORT-IMPORT-FORMATS.md`](EXPORT-IMPORT-FORMATS.md).

## Frontend resilience + diagnostics

- **`lib/lazyWithReload.ts` — chunk-load recovery.** A `React.lazy` drop-in
  used by all eight lazy routes in `App.tsx`. It retries the dynamic
  `import()` a few times with a short backoff (transient cold-load hiccups),
  then, as a last resort, does a **sessionStorage-guarded one-time full
  reload** to pull the fresh shell — the recovery for the PWA's
  `autoUpdate` + `skipWaiting` + `cleanupOutdatedCaches` worker deleting the
  old precache out from under an open tab. The guard rethrows on a second
  consecutive failure so a genuinely broken deploy surfaces instead of
  looping. (See the lessons-learned "stale-shell" entry; issue #320.)
- **Service-worker update banner.** `shared/utils/swUpdateManager.ts`
  listens for `registration.updatefound` / `statechange`; when a fresh worker
  reaches `waiting` it surfaces `components/AppUpdateBanner.tsx` (built on the
  generic `lib/components/UpdateBanner.tsx`). "Update now" posts
  `{type:"SKIP_WAITING"}` → `skipWaiting()` → `controllerchange` → reload.
  In-flight editor content is flushed to IndexedDB on the `beforeunload` /
  `pagehide` path before the reload, so the controlled update never loses an
  edit.
- **Event recording → error reports.** `lib/utils/RingBuffer.ts` is a
  framework-free fixed-capacity FIFO (100 events). `utils/eventRecorder.ts`
  wraps it, **sanitizing** every event first (redacts password/token/key/
  secret/license/credential values, strips URL query params, truncates text
  to 200 chars) — no keystrokes, no textarea content, nothing leaves the
  browser. `utils/eventRecorderPersist.ts` mirrors the buffer into the Dexie
  `eventLog` table (error-class events immediately, others on a ~10s debounce)
  so it survives a reload/crash. `components/ErrorReportDialog.tsx` reads the
  log to pre-fill a GitHub issue (copy or JSON download).

## Backend service-extraction + facades

The 2026 router→service sweep moved business logic out of routers so each
router is the thin "validate input, call a service, shape the response" layer
(`architecture.md` "Error handling"). Two shapes recur:

- **One service module per router** for focused concerns:
  `routers/git_backup.py` → `services/git_backup.py`,
  `routers/covers.py` → `services/covers.py`,
  `routers/ssh_keys.py` → `services/ssh_keys.py`. The router only maps service
  exceptions to HTTP and shapes the response.
- **A service sub-package behind a facade barrel** when the concern is large:
  `services/backup/__init__.py` re-exports `export_backup_archive`,
  `import_backup_archive`, `restore_book_from_data`, `compare_backups`, … from
  focused sub-modules (`serializer`, `markdown_utils`, `asset_utils`,
  `archive_utils`, `backup_export`, `backup_import`, `project_*`). Consumers
  import from the package, not the internals.
- **Dependency-injection-as-parameter.** A router composes several small
  services by passing collaborators in (e.g. `chapters.py` calls
  `validate_book_toc`, `snapshot_plain_text`, `count_words`,
  `record_progress`) rather than a DI container — same intent as the frontend
  props rule.
- **Canonical config reads (`services/app_settings.py`).** A single place for
  the handful of `app.yaml` flags routers used to read inline
  (`is_permanent_delete()`, `allow_books_without_author()`,
  `get_trash_auto_delete_config()`), removing a Router→Config layering
  violation. New config-driven behaviour reads through here, not via inline
  `config_overlay` calls in a router.
- **Plugin PDF god-file splits.** `plugins/bibliogon-plugin-export/
  bibliogon_export/picture_book_pdf/` and
  `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf/` are each a
  barrel `__init__.py` (re-exporting the `generate_*_pdf` orchestrator) over
  focused sub-modules (`styles`, `layout`, `page_renderer` / `panel_renderer`,
  `bubble_renderer`, `assets`). The public import surface is unchanged.

## The `lib/` catalogue

`lib/` is the home for **app-import-free, reusable** building blocks (the
"props-driven, zero reach-back" rule). Reach for one of these before writing a
new component/util; extend the catalogue rather than re-implementing.

**Components (`lib/components/`)** — generic, theme-token-styled, Vitest-friendly:

| Component | Purpose |
|-----------|---------|
| `SortableList` | dnd-kit drag-reorder list with full render-prop control (chapters, pages, …). |
| `ComboboxSelect` | Dependency-free combobox (input + filtered list, optional "+ Add" custom value). |
| `EditorMenu` | Generic portal-based grouped menu: group headings, one accordion submenu level, separators, icons, right-aligned shortcuts, disabled-with-reason, 44px rows. |
| `EditorStatusBar` | Editor footer: word count + reading time (250 wpm) + char count, responsive. |
| `UpdateBanner` | App-agnostic "new version available" banner (icon + message + update/dismiss). |
| `DropZone` | HTML5 drag-drop wrapper with drag-depth tracking + optional extension filter. |
| `MetricsTable` | Sortable table with traffic-light thresholds + optional totals row. |
| `FleschScale` | Four-band readability scale with marker + genre-comparison line. |
| `StatusBadge` | Publication-status pill (draft/ready/published/archived → themed variant). |
| `NavigationSidebar` | Grouped nav (desktop sidebar / mobile hamburger) with active tracking + badges. |

**Utilities (`lib/` + `lib/utils/`)** — pure, zero-side-effect:

| Util | Purpose |
|------|---------|
| `utils.ts` (`cn`) | shadcn class-merge (`clsx` + `tailwind-merge`). |
| `lazyWithReload.ts` | `React.lazy` drop-in with retry + guarded reload (above). |
| `chapterTypeLabels.ts` | `ChapterType → translated label` map shared by BookEditor + ChapterSidebar. |
| `bookLanguages.ts` | The 8 endonym book-language defaults + option shape for `ComboboxSelect`. |
| `utils/RingBuffer.ts` | Fixed-capacity FIFO ring buffer (event recorder). |
| `utils/textStats.ts` | `getTextStats(text)` → word/char counts + reading-time. |
| `utils/relativeTime.ts` | Locale-aware relative time via `Intl.RelativeTimeFormat`. |
| `utils/markdownToHtml.ts` | Pure line-based Markdown → HTML (client export). |
| `utils/sentenceComplexity.ts` | Sentence split-candidate scoring (words + commas). |
| `utils/chapterGroups.ts` | Front/back-matter `groupChapters()` splitter. |
| `utils/pageLayoutStyles.ts`, `utils/pageTextContent.ts` | Picture-book layout style math + TipTap↔text (de)serialization. |

## Dependency hierarchy + Library-Grade

Two things govern everything that lands under `lib/` and `shared/` (and, by
analogy, the backend service helpers): a **4-stage dependency hierarchy**
(Language → Framework → Library → Build-it-yourself) that decides *whether* to
write code at all, and the **Library-Grade** rule that governs *how* the code
you do write is shaped. See `.claude/rules/library-first.md` for the working
rule and `docs/audits/library-first-audit-2026-06-17.md` for the first audit.

### Library-Grade — write `lib/` code as a standalone library

Every module in `lib/` (and `shared/`) MUST be shippable as if it were its own
npm package:

- **No app-specific imports** — no `getStorage()`, no `useI18n()`/`t()`, no
  `api.*`, no reach-back into pages/components. (App-bound *types* — the
  `PageLayout`/`ChapterType` unions — are allowed and mark a util as
  `lib/utils/` rather than the cross-app `shared/`.)
- **Own, exported TypeScript types.**
- **TSDoc with a usage `@example`.**
- **Its own colocated test file** (`*.test.ts(x)`), not folded into a page's
  tests.
- **Usable in isolation** — a consumer could import just this file and nothing
  else of Bibliogon would come with it.

### The 4-stage dependency hierarchy — search before you build

"Library-First" is the third rung of a stricter ladder. Walk it **top to
bottom**; only drop to the next stage when the current one genuinely cannot do
the job. Most utilities should never reach stage 4.

1. **LANGUAGE FIRST — native platform APIs.** Reach for what the runtime
   already ships before anything else.
   - JS: `Intl`, `crypto.subtle` / Web Crypto, `URL`, `fetch`,
     `structuredClone`, `Array`/`Set`/`Map` methods, `IntersectionObserver`.
   - Python: `pathlib`, `dataclasses`, `json`, `hashlib`, `functools`.
2. **FRAMEWORK — what is already wired in.** If the platform doesn't cover it,
   use the framework already in the stack.
   - React: `useState`, `useEffect`, `useRef`, `useMemo`, Context.
   - Vite: `define`, `import.meta.env`, plugins.
   - FastAPI: `Depends`, `BackgroundTasks`, `HTTPException`.
3. **LIBRARY — npm / PyPI, only when 1 + 2 fall short.** Prefer a library
   **already in the project** (`react-markdown`, `marked`, `dexie`, `recharts`,
   `lucide-react`, `tailwind`, `PyYAML`, …). A *new* dependency must clear:
   **>1000 weekly downloads**, **last update <6 months**, and **bundle size
   <100 kB** for anything we could write in <50 LOC ourselves. Compare the top
   2–3 candidates on size, maintenance, parity, and transitive deps. Do **not**
   adopt a library that would *change* behaviour we deliberately want (e.g. a
   slug helper that transliterates umlauts we keep on purpose).
4. **BUILD IT YOURSELF — only when 1–3 don't fit.** Then, under these
   restrictions:
   - **Library-Grade** (below): no app imports, own types, TSDoc, single-use
     viable.
   - **Cohesion:** <500 lines, one concern.
   - **Complexity:** cyclomatic complexity <20.
   - **Tests:** its own colocated test file.
   - **The PR documents WHY** it was built in-house rather than using stages
     1–3.

The model cases already in the tree sit at the right rung: `relativeTime.ts`
is **stage 1** (platform `Intl.RelativeTimeFormat`, zero bundle cost) and
`utils.ts` `cn` is **stage 3** (wraps the installed `clsx` + `tailwind-merge`).
The anti-pattern the first audit caught: `markdownToHtml.ts` sitting at
**stage 4** while the already-installed `marked` (stage 3) does the job
(tracked in #387).

## Feature gating (feature-strategy)

Offline/desktop gating runs through `@astrapi69/feature-strategy` + the
`features/featureConfig.ts` registry, consumed via `useFeature(id)` under
`AppFeatureProvider`. Every gated surface resolves to **active**,
**disabled-with-reason**, or **hidden** (policy #78: nothing the user owns is
hidden — it is active or disabled with an explanation). Features fall into
three buckets in `featureConfig.ts`:

- **`ALWAYS_ACTIVE`** — works in both modes (export, story-bible, storyboard,
  backup import/export, selective export, export preview, `.bgb` import, …);
  no strategy rule, the `active` default wins.
- **`NEEDS_KEY`** — AI features (`ai-fill`, `ai-generate`) that work
  browser-direct **with** a configured key; in Dexie mode without a key they
  resolve to `disabled` with `ui.feature.requires_ai_key`.
- **`DESKTOP_ONLY`** — genuinely browser-impossible (git sync/backup, TTS,
  Pandoc/LaTeX export, LAN mode, version history, …); `disabled` with
  `ui.feature.requires_desktop_app` in Dexie mode, abstains (active) online.

Gate new surfaces through `useFeature`, not ad-hoc `mode === "dexie"` checks.
Online-vs-offline *implementation* routing (which export engine, which import
path) stays a `useStorageMode()` branch, not a registry gate. See
`.claude/rules/architecture.md` "Three-state feature visibility".

## CI tiers (3-tier + Test Impact Analysis)

CI runs in three tiers — see `docs/VIBE-CODING-POLICY.md` Principle 3 for the
authoritative description:

- **PR (`ci.yml`, fast)** — `tsc`, `ruff` + `mypy`, pre-commit, `madge`, the
  frontend build, and **selective** tests via Test Impact Analysis (#332):
  `vitest run --changed origin/<base>` and `pytest --testmon`, each with a
  full-suite fallback so a failure can never pass falsely.
- **Nightly (`nightly.yml`)** — the full-suite safety net: 10-plugin matrix,
  backend/plugin/frontend coverage, the complexity + cohesion file-size
  watchers, and an unconditional full re-run of every test.
- **Weekly (`security-scan.yml`)** — pip-audit + bandit + npm audit, blocking
  on Critical/High, with `.security-ignore.yml` as the single source of truth
  for accepted/deferred advisories.

## Reusability principles

1. **Dependency injection over reach-back.** Pass collaborators in
   (props on the frontend, `Depends(...)`/repository interfaces on the
   backend). A component or service that imports a global singleton to
   get its data is not reusable in a second surface or a test.
2. **Barrel exports for public surfaces.** A folder that exposes a small
   public API (e.g. `api/`) re-exports it from one entry point so
   consumers import from the module, not from deep internal files. Don't
   barrel-export everything — only the intended public surface.
3. **No import-time side effects in reusable code.** `lib/` helpers,
   `components/`, `hooks/`, and backend `services/`/`repositories/` must
   be safe to import without booting anything. Side effects (registering
   handlers, opening connections, reading config) belong in explicit
   setup functions called at startup, not at module load.
4. **Props-driven `lib/` and components.** `lib/` is for pure functions
   with zero app imports; components take data + callbacks via props.
   This is what lets the Recurring-Component Unification Rule extract a
   pattern once and reuse it across surfaces without visual/i18n drift.
5. **One seam per cross-cutting concern.** Persistence → `getStorage()`;
   HTTP → `api/`; offline gating → `useFeature()`. A second path for the
   same concern is the bug, not the feature.

## Goldstandards to copy

- **Thin router:** [`backend/app/routers/git_sync.py`](../backend/app/routers/git_sync.py)
  — the only logic is a small `_is_dirty()` check; everything else
  delegates to `services/git_sync_*`. New routers should look like this.
- **Storage seam:** [`frontend/src/storage/`](../frontend/src/storage/)
  — `IStorageService` + `getStorage()` route reads/writes to
  `ApiStorage` (online) or `DexieStorage` (offline). New data CRUD goes
  through the seam so it works in the backendless PWA. The export/import
  surfaces (client export engine, JSON full-data backup, import wizard) all
  flow through this seam — every format is inventoried in
  [`EXPORT-IMPORT-FORMATS.md`](EXPORT-IMPORT-FORMATS.md) (which also explains
  the JSON-backup vs `.bgb`-archive distinction).
- **Feature gating:** [`frontend/src/features/featureConfig.ts`](../frontend/src/features/featureConfig.ts)
  + `AppFeatureProvider` + `useFeature(id)` — the central registry that
  resolves a gated surface to active / disabled-with-reason / hidden.
  New gated surfaces use `useFeature`, not ad-hoc connectivity checks.
- **Barrel-directory split:** [`frontend/src/api/`](../frontend/src/api/)
  — a family module that outgrew one file, split into transport + domain
  namespaces behind a 13-line `client.ts` barrel so the 211 call sites stay
  unchanged. The template for splitting any hub file (next: `dexie-storage.ts`).
- **Props-driven `lib/`:** [`frontend/src/lib/components/SortableList.tsx`](../frontend/src/lib/components/SortableList.tsx)
  — a generic, app-import-free component extracted once and reused across
  surfaces (the Recurring-Component Unification Rule in practice).

## Global state is allowed (and necessary)

Concern-first folders do **not** forbid global state. Genuinely
app-wide, cross-cutting state belongs in a context/provider and is the
right design:

- **i18n** (`useI18n` / the i18n provider) — every surface needs the
  active language + catalog.
- **Theme** (`useTheme` + the CSS-variable system) — palette/dark-mode is
  app-wide by definition.
- Long-running job contexts (audiobook, bulk-AI-fill) own their
  SSE/WebSocket lifecycle in a provider, with components as pure
  consumers (see lessons-learned "SSE-in-context-not-in-modal").

The principle is *direction*, not prohibition: components consume global
providers; they do not reach sideways into another feature's internals.
If global state grows beyond contexts, introduce Zustand (not Redux) —
see `architecture.md` "State management".
