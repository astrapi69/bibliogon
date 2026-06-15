# Module Architecture Reference

A practical map of how Bibliogon's code is organized and the
reusability principles that keep it that way. This is a companion to
[`.claude/rules/architecture.md`](../.claude/rules/architecture.md)
(the layered/plugin architecture) and
[`.claude/rules/coding-standards.md`](../.claude/rules/coding-standards.md)
(naming, function design, the Recurring-Component Unification Rule). Read
those for the *why*; read this for *where things live* and *how to keep
new code reusable*.

> **No `src/modules/` rewrite.** This document describes the structure
> that already exists. It is NOT a proposal to reshuffle the tree into a
> feature-module layout. The current concern-first folders (below) are
> the target; do not introduce a parallel `src/modules/<feature>/`
> hierarchy.

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

### `storage/dexie-storage.ts` — still a monolith (debt)

`storage/dexie-storage.ts` (2214 lines, in `.filesize-baseline`) is **not**
currently split into a `storage/dexie/` directory. PR #204 introduced that
directory, but the #210 merge (branched pre-#204) reverted it back to the
monolith. The re-split into `storage/dexie/{schema,seed,blobs,graph,<entity>}.ts`
behind a barrel is a tracked follow-up. It now also hosts the generic
per-`(table, id)` `serializedUpdate` write-queue (read-modify-write seam).

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
  through the seam so it works in the backendless PWA.
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
