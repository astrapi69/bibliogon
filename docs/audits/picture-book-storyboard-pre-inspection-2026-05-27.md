# Picture-Book Storyboard-View — Pre-Inspection Audit

**Date:** 2026-05-27
**Backlog item:** `PICTURE-BOOK-STORYBOARD-VIEW-01` (P3, filed 2026-05-18)
**Source:** [docs/backlog.md:701-806](../backlog.md#L701-L806)
**Status:** Audit complete; STOP for adjudication before any code-write.

---

## TL;DR

- Page model + Page API + PageThumbnails already exist in shapes well-suited to the Storyboard scope. **No backend infrastructure missing.**
- **PageThumbnails is already a shared component** (PageEditor + ComicBookEditor via `testidNamespace` prop). Storyboard adds a 3rd surface, but the grid+annotations shape is conceptually different from the sidebar-strip shape — recommend keeping Storyboard's per-card rendering separate (NOT a 3rd-level shared card).
- Schema additions are a single `batch_alter_table` migration with 4 nullable columns, zero data migration.
- Mount via `?view=storyboard` query-param toggle in [BookEditor.tsx](../../frontend/src/pages/BookEditor.tsx), mirroring the existing `?view=metadata` pattern.
- Scope: 14-20 commits total across 2-3 sessions. Recommended: **Session 1 = Schema-Foundation + Storyboard MVP (6-8 commits)**, **Session 2 = Annotations (5-7c)**, **Session 3 = deferred-trigger Operations (split/merge/duplicate/insert-after, 4-6c)**.
- 8 architecture-decisions surfaced (A1-A8); all have recommended defaults; user adjudication required before code-write.

---

## Track 1: Page Model + PageThumbnails Audit

### Page model

**Location:** [backend/app/models/__init__.py:281-352](../../backend/app/models/__init__.py#L281-L352) — shared backend model, NOT plugin-owned. Used by both `picture_book` and `comic_book` book-types via `BookTypeRegistry.pageable_book_types()` (filter on `content_model: pages` in [backend/config/book-types.yaml](../../backend/config/book-types.yaml)).

| Column | Type | Notes |
|---|---|---|
| `id` | String(32) PK | UUID-style |
| `book_id` | FK `books.id`, NOT NULL, CASCADE on book delete | |
| `position` | Integer, NOT NULL | One-indexed (1, 2, 3, ...), dense, no UNIQUE constraint, composite index `ix_pages_book_id_position` |
| `layout` | String(50), NOT NULL | Validation via Pydantic `Literal` enum, NOT SQL ENUM (matches `Chapter.chapter_type` precedent) |
| `text_content` | Text, nullable | Dual-format: plain string OR TipTap JSON; frontend discriminates by layout. Per lessons-learned: **TipTap node type must be `imageFigure`, never `image`** |
| `image_asset_id` | FK `assets.id`, nullable, SET NULL on asset delete | Allows orphan-on-image-delete |
| `layout_config` | Text, nullable | JSON-as-Text; renamed from `speech_bubble_config` in [migration oc4d5e6f7a8b](../../backend/migrations/versions/oc4d5e6f7a8b_rename_speech_bubble_config_to_layout_config.py) |
| `created_at` / `updated_at` | DateTime(tz=True) | Standard timestamps |

**No soft-delete** on pages (`deleted_at` absent). Hard-delete cascades.

### Page API

**Location:** [backend/app/routers/pages.py](../../backend/app/routers/pages.py) — all endpoints gated on `book.book_type IN pageable_book_types()` via `_get_pageable_book_or_400()`.

- `GET /api/books/{book_id}/pages` — list, ordered by `position ASC`, returns `list[PageOut]`
- `POST /api/books/{book_id}/pages` — create (always appends to end; computes `max(position) + 1`)
- `PATCH /api/books/{book_id}/pages/{page_id}` — update (position is NOT mutable here)
- `DELETE /api/books/{book_id}/pages/{page_id}` — delete + shift remaining pages down to keep positions dense
- `POST /api/books/{book_id}/pages/reorder` — apply new order via `payload.page_ids: list[str]`; two-phase position update (sentinel-shift then write); stale-client check (existing_ids must equal requested_ids)

50 tests already in [backend/tests/test_pages_routes.py](../../backend/tests/test_pages_routes.py).

### PageThumbnails component (KEY FINDING)

**Location:** [frontend/src/components/PageThumbnails.tsx](../../frontend/src/components/PageThumbnails.tsx)

**This component is ALREADY shared between PageEditor and ComicBookEditor via a `testidNamespace` prop.** Both editors mount the same `PageThumbnails` for their vertical-strip thumbnail sidebar. The RCU extraction was done previously.

Props:
```typescript
interface Props {
  pages: Page[]
  activePageId: string | null
  onSelect: (pageId: string) => void
  onAddPage: () => void
  onReorder: (pageIds: string[]) => void
  onDelete?: (pageId: string) => void
  testidNamespace?: string  // "page-editor" (default) | "comic-book-editor"
}
```

Renders per-page:
- Position number, FileText icon (invariant), GripVertical drag handle, optional Trash2 delete
- NO thumbnail image preview, NO title preview, NO layout-preview tag (sidebar strip is intentionally minimal)

Reorder via `@dnd-kit/core` + `@dnd-kit/sortable` (`DndContext` + `SortableContext` + `verticalListSortingStrategy` + `useSortable`); calls `onReorder(newOrderedIds)` callback; parent calls `api.pages.reorder(bookId, ids)`.

### @dnd-kit pattern across codebase

5 components use @dnd-kit (PageThumbnails, ChapterSidebar, KeywordInput, OrderedListEditor, ConvertToBookWizard). **Reorder logic is inline per-component — no shared hook.** Vitest doesn't drive @dnd-kit drag (brittle with happy-dom per existing lessons-learned); Playwright covers actual drag-reorder.

### BookEditor dispatch

**Location:** [frontend/src/pages/BookEditor.tsx](../../frontend/src/pages/BookEditor.tsx). Uses `BookTypeRegistry` + `editor_component` field from `book-types.yaml` to pick `PageEditor` (picture_book) or `ComicBookEditor` (comic_book). Toggles `?view=metadata` to flip to `BookMetadataEditor`.

---

## Track 2: Schema Design

Single Alembic migration adding 4 nullable columns to `pages`. Pattern mirrors [s8c9d0e1f234_add_book_repository_url.py](../../backend/migrations/versions/s8c9d0e1f234_add_book_repository_url.py).

| Column | SQL Type | Pydantic | Validation |
|---|---|---|---|
| `notes` | Text, nullable | `str \| None` | Free-text author memo. No length cap (Text). Not rendered in book output. |
| `story_beat` | String(20), nullable | `Literal["setup", "inciting", "rising", "climax", "falling", "resolution"] \| None` | 6 fixed values; validates in Pydantic, NOT SQL ENUM (matches existing precedent for layout / chapter_type) |
| `mood_color` | String(7), nullable | `str \| None` | Hex `#RRGGBB`; Pydantic regex `^#[0-9a-fA-F]{6}$` |
| `act_group` | String(100), nullable | `str \| None` | Free-text label; grouping in UI derived from distinct values. NOT a structured Act model (deferred) |

**Migration revision:** `t9d0e1f23456_add_page_storyboard_columns.py`, `down_revision = "s8c9d0e1f234"`.

```python
def upgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("story_beat", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("mood_color", sa.String(length=7), nullable=True))
        batch_op.add_column(sa.Column("act_group", sa.String(length=100), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table("pages") as batch_op:
        for col in ("act_group", "mood_color", "story_beat", "notes"):
            batch_op.drop_column(col)
```

Pydantic schemas extended (PageCreate, PageUpdate, PageOut) with the 4 fields as Optional. Backward-compat: existing pages get NULL on every new column; no rendering impact for any non-Storyboard surface.

Per lessons-learned **"Schema 'preserved' / 'always set' claims must survive real-data audit"**: each new column ships with at least one test that flips the value to a non-default and asserts an observable difference in `PageOut.field`.

---

## Track 3: Storyboard Component Design

**File:** new `frontend/src/components/Storyboard.tsx` + `frontend/src/components/Storyboard.module.css` + `frontend/src/components/StoryboardCard.tsx` (sub-component for per-card rendering).

### Component tree

```
Storyboard (page-level)
  ├─ DndContext + SortableContext (grid sorting)
  │   └─ StoryboardCard × N  (sortable items)
  │       ├─ Thumbnail (image asset or placeholder by layout)
  │       ├─ Title (first non-empty line of text_content; ~30 chars)
  │       ├─ Layout-preview tag (small)
  │       ├─ Mood-color border/swatch (when set)
  │       ├─ Story-beat tag (when set)
  │       ├─ Position number
  │       └─ [Session 2] inline annotations panel: notes textarea, beat dropdown, color picker, act input
  ├─ Empty state ("No pages yet")
  └─ Act-group headers (when distinct act_group values exist) — derived in render, not stored as rows
```

### Drag-reorder

Mirrors PageThumbnails pattern (`useSensors([PointerSensor, KeyboardSensor])`, `closestCenter`, `arrayMove`, parent `onReorder` → `api.pages.reorder`). **Inline reorder logic** (no shared hook) — matches codebase convention.

Grid layout uses CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`) with responsive breakpoints. Cards are ~200x280px.

### Click navigation

Click a card → navigate to `?view=` (default editor) with page focused. Wiring: `navigate(`/books/${bookId}`, {state: {focusPageId}})`, PageEditor consumes the focus on mount.

---

## Track 4: Integration Surface

### Mount point

**Recommended:** `?view=storyboard` query-param flip in BookEditor, mirroring the existing `?view=metadata` toggle.

```typescript
// in BookEditor render
const view = searchParams.get("view")
if (view === "storyboard" && pageableBookTypes.has(book.book_type)) {
  return <Storyboard bookId={...} bookTitle={...} onBack={onBack} onExit={() => setView(null)} ... />
}
if (view === "metadata") return <BookMetadataEditor ... />
return <EditorComponent ... />  // PageEditor or ComicBookEditor
```

### Entry-point button

In PageEditor header (NOT BookEditor header — PageEditor owns its toolbar). Next to Metadata + Export-PDF buttons, per backlog. Same shape as `onShowMetadata` callback.

```typescript
<button onClick={onShowStoryboard}>{t("ui.storyboard.button")}</button>
```

`onShowStoryboard` callback flips `?view=storyboard` in BookEditor.

### Storyboard → PageEditor return path

Card click + back-button both call `navigate(`/books/${bookId}`)` (drops the `?view=storyboard` query param).

### Book-type gating

Storyboard route gates on `pageableBookTypes.has(book.book_type)`. With A4 = picture_book-only-in-v1, additional gate `book.book_type === "picture_book"` until Session 2+ extends to comic_book.

---

## Track 5: PageThumbnail RCU Assessment (key decision)

**Existing state:** PageThumbnails is ALREADY a shared component (PageEditor + ComicBookEditor). RCU was done in a prior session.

**Storyboard scenario:** Adds a 3rd surface that displays the same `Page[]` data, but the rendering shape is conceptually different:

| Aspect | PageThumbnails (sidebar) | Storyboard (grid) |
|---|---|---|
| Layout | Vertical strip, ~50px wide rows | CSS Grid, ~220x280px cards |
| Per-row content | Position + icon + drag handle + delete | Thumbnail + title + tag + color + position + (Session 2) annotations |
| Reorder direction | Vertical only | 2D grid (still effectively linear in `position` terms) |
| Use case | Quick page selection while editing | Story-flow overview + annotation editing |

### Recommendation: do NOT extract a 3rd-level shared card

The 2-surfaces RCU rule fires when the patterns are **conceptually the same**. The Storyboard card's rendering needs (thumbnail, title, color border, beat tag, annotations) would force PageThumbnails to either:

1. Grow N optional render-slot props (`renderThumbnail?`, `renderTitle?`, `renderAnnotations?`) — props-bloat anti-pattern, and the sidebar would never use any of them.
2. Use a controlled-variant prop (`variant: "sidebar" | "grid"`) with conditional branches inside the component — even worse, the component then knows about both consumers.

Both shapes are violations of the design-intent-axis precedent (per lessons-learned "Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter").

**Recommended path:**
- Keep `PageThumbnails` unchanged (sidebar strip).
- Ship new `StoryboardCard` component with its own rendering needs.
- Both reuse the same `@dnd-kit/sortable` primitives (already standard library; not a custom abstraction).
- Future cross-cutting concern (e.g. cross-book-type Outline View per exploration-features #5) MAY trigger a 3rd-level extraction THEN, when 3 conceptually-similar surfaces coexist with a more constrained shape. Not now.

### Audit findings cross-reference

Per [docs/audits/exploration-features-2026-05-15-evaluation.md:72](exploration-features-2026-05-15-evaluation.md#L72): the future OutlineTreeView extraction is gated on Storyboard + Outline-View landing together. Storyboard alone does NOT trigger it.

---

## Track 6: Scope + Session-Split

Backlog estimate: 10-15 commits. Refined estimate: **14-20 commits across 2-3 sessions.**

### Session 1: Schema-Foundation + Storyboard MVP (6-8 commits)

Goal: ship Storyboard read-only grid + drag-reorder + minimal i18n + Vitest in a coherent, independently-shippable feature.

| # | Commit subject | Files |
|---|---|---|
| C1 | `feat(pages): add storyboard schema columns (notes, story_beat, mood_color, act_group)` | Alembic migration + model columns |
| C2 | `feat(pages): extend Pydantic schemas for storyboard fields` | PageCreate / PageUpdate / PageOut + tests |
| C3 | `test(pages): pin storyboard-field round-trip behavior` | 4-6 new pytest cases (one per field + 1 multi-field) |
| C4 | `feat(storyboard): Storyboard + StoryboardCard component skeleton (read-only grid)` | Storyboard.tsx + module.css + StoryboardCard.tsx |
| C5 | `feat(storyboard): wire ?view=storyboard mount + PageEditor button` | BookEditor.tsx + PageEditor.tsx + nav state |
| C6 | `feat(storyboard): drag-reorder via existing /reorder endpoint` | DndContext wiring + Vitest |
| C7 | `feat(storyboard): i18n basics (8 catalogs)` | 8 × yaml + i18n-parity test |
| C8 | `test(storyboard): structural Vitest pins (rendering, navigation, reorder callback)` | Storyboard.test.tsx |

**Outcome:** Storyboard view is reachable from PageEditor header, shows all pages in a grid with thumbnails + titles + layout tags, supports drag-reorder, and clicking a card returns to PageEditor with that page focused. Annotations columns exist in DB but are not yet UI-editable.

### Session 2: Annotations (5-7 commits)

| # | Commit subject |
|---|---|
| C1 | `feat(storyboard): notes inline textarea per card + PATCH wiring` |
| C2 | `feat(storyboard): story-beat dropdown + 6-value selector` |
| C3 | `feat(storyboard): mood-color swatch picker + border rendering` |
| C4 | `feat(storyboard): act-group label + grid grouping headers` |
| C5 | `feat(storyboard): extended i18n (8 catalogs) + parity test` |
| C6 | `test(storyboard): Vitest + E2E Playwright happy-path` |
| C7 | `docs(help): Storyboard view (DE + EN)` |

### Session 3 (deferred, trigger-gated): Operations

Operations from backlog: add-page-inbetween, duplicate-page, split-page, merge-pages. Split + merge need UX clarity for picture-book context (what does "split a page" mean when the page IS the atomic image+text unit?). Defer until user requests OR a clear UX decision is made.

Filing recommendation post-Session-2: `PICTURE-BOOK-STORYBOARD-OPERATIONS-01` (P5, trigger-gated, ~4-6 commits).

### Session-boundary discipline

Per [coding-standards.md](../../.claude/rules/coding-standards.md) + release-workflow.md 5-commit stop-condition: Session 1's 6-8 commits exceeds the soft limit, but the extraction-plus-migration discipline ("better to ship 7 coherent commits than 5 leaving the codebase in mixed state") applies here — half-shipping Schema-Foundation without the consumer surface would create a state-write-without-consumer half-wired purgatory. Session 1's commit count is justified by the half-wired-prevention rule.

### Atomic-green discipline

Per lessons-learned: each commit ships green individually (backend pytest baseline 2269/2270 + Vitest 2080). Schema migration commit (C1) regenerates `backend/bibliogon.db` after running, per the existing lessons-learned "Alembic migration + fresh test DB" rule.

---

## Track 7: Architecture Decisions — STOP for adjudication

| # | Decision | Default | Alternatives | Rationale |
|---|---|---|---|---|
| **A1** | Schema columns: 4 nullable cols on `pages` table | **YES, single migration, all nullable, zero data migration** | Defer columns to Session 2 (UI-only first) | Schema-Foundation-Pre-Commitment per backlog. Lets Storyboard ship UI-only in Session 2 commits without a second migration. Storyboard MVP ships only `Storyboard.tsx` + `StoryboardCard.tsx` (no annotation editing UI) but the columns exist for forward-compat. |
| **A2** | `story_beat` shape | **Literal enum** (Setup / Inciting / Rising / Climax / Falling / Resolution) stored as String(20) | Free-text String (no validation) | 6 known values per backlog. Constraints to enable future beat-sheet templates. Free-text would prevent later filtering features. |
| **A3** | Mount point | **`?view=storyboard` query-param** in BookEditor + button in PageEditor header | (a) new BookEditor tab (b) new top-level route (c) new editor_component in book-types.yaml | (a) PageEditor already toggles via `?view=metadata` — same convention. (b) new top-level route diverges from existing pattern. (c) new editor_component implies picture-book has TWO editors, contradicting BookEditor dispatch semantics. |
| **A4** | Book-type scope | **picture_book only in v1**; comic_book deferred | Both picture_book + comic_book day-1 | Per backlog explicit scope ("Picture-Book only initially"). Comic-book has different per-page complexity (multi-panel + multi-bubble); needs separate UX consideration. |
| **A5** | PageThumbnail RCU extract | **DO NOT extract 3rd-level shared card.** Storyboard ships `StoryboardCard` as a sibling; share `@dnd-kit/sortable` primitives only. | Extract `<PageThumbnailCard variant="sidebar" \| "grid">` shared component | Sidebar-strip vs grid+annotations shapes are conceptually different. Forced extraction creates props-bloat OR controlled-variant anti-pattern. Future Outline View extraction (per exploration-features #5) MAY trigger then. |
| **A6** | @dnd-kit reorder pattern | **Inline reorder logic in Storyboard** (mirror PageThumbnails) | Extract shared `useSortableList` hook across 5 sites | Codebase convention is inline. Extracting now would be a separate refactor session affecting 5 existing components. Out of scope for STORYBOARD-VIEW-01. |
| **A7** | `act_group` shape | **Flat String(100) label** in v1; grouping headers derived from distinct values | Structured Act model (`acts` table + FK from pages) | Structured model needs lots of UX (drag-into-act, rename, delete-with-pages). Flat label is sufficient for v1 storyboard grouping. |
| **A8** | Session split | **Session 1 (6-8c) Schema + MVP + drag-reorder; Session 2 (5-7c) Annotations; Session 3 (deferred-trigger) Operations** | (a) Single 10-15-commit session (b) Schema-only Session 1, MVP+Annotations in Session 2 | (a) too large for one coherent atomic-green session. (b) violates half-wired-prevention (schema lands without consumer surface, then nothing renders for a session-gap). |

---

## Pre-Coding-Reality-Check Findings

Run before any code-write per lessons-learned. Findings:

- **PageThumbnails already shared** — RCU done; no missing 2-surfaces extraction step before Storyboard ships. RCU re-evaluation deferred to future 3rd-conceptually-similar-surface trigger (Outline View). 
- **Position field exists + reorder endpoint exists + stale-client check works** — SSoT preserved; Storyboard reuses `api.pages.reorder`.
- **BookEditor dispatch via `editor_component` from book-types.yaml** — Storyboard mounts as `?view=storyboard` query-param flip; NOT a new editor_component row. No registry change required.
- **Backend models in core (not plugins)** — schema migration goes in `backend/migrations/versions/`. Picture-book + comic-book are sub-types of shared backend Page model. No plugin schema changes.
- **Architecture-doc consultation** — `docs/architecture/state-machines.md` not relevant (Storyboard not a state-machine). `docs/explorations/exploration-features-2026-05-15.md` + `docs/audits/exploration-features-2026-05-15-evaluation.md` flag OutlineTreeView extraction as a FUTURE concern when Storyboard + cross-book-type Outline coexist — NOT a Session 1 concern.
- **STORY-BIBLE-PLUGIN-01 pairing** — earlier exploration-features triage suggested "single coordinated session" pairing Storyboard with Story-Bible. STORY-BIBLE is a 5-entity-type plugin scaffold (XL scope, ~20+ commits). Realistically they're two separate big-feature sessions; coordinated pairing is not viable. Surface for user awareness but recommend deferring pair-session question.

**No STOP-conditions surfaced.**

---

## Stop-Conditions (per resume-prompt)

- ❌ Page model has unexpected constraints — NO. Clean shape.
- ❌ PageThumbnails tightly coupled to PageEditor — NO. Already shared with ComicBookEditor.
- ❌ @dnd-kit pattern differs between PageEditor / ComicBookEditor — NO. Both use the SAME shared PageThumbnails.
- ❌ Storyboard concept conflicts with BookEditor navigation — NO. `?view=storyboard` matches existing `?view=metadata` convention.

All clear. Audit ready for adjudication.

---

## Questions and Assumptions

- **Evidence-based answer (A4 picture_book-only):** Backlog explicitly says "Picture-Book only initially". Comic-book extension is in the "Deferred to follow-up sessions" list ("Multi-Book-Type migration").
- **Evidence-based answer (A8 session split):** Two-session split derived from 10-15-commit backlog estimate split into the natural Schema/MVP vs Annotations boundary + the Operations natural-trigger-gate boundary. The half-wired-prevention rule blocks a Schema-only-Session-1.
- **Parked assumption:** Schema migration revision id `t9d0e1f23456` is the next-letter-after-`s` convention; will verify against `backend/migrations/versions/` contents at C1 commit time.
- **STOP-blocking question — NONE.** All decisions have recommended defaults; user adjudication is to confirm or override, not to resolve uncertainty.

---

## Files to Read Before Implementation

1. [backend/app/models/__init__.py:281-352](../../backend/app/models/__init__.py#L281-L352) — Page model
2. [backend/app/routers/pages.py](../../backend/app/routers/pages.py) — Page API endpoints
3. [backend/app/schemas/__init__.py](../../backend/app/schemas/__init__.py) — `PageCreate` / `PageUpdate` / `PageOut`
4. [frontend/src/components/PageThumbnails.tsx](../../frontend/src/components/PageThumbnails.tsx) — sidebar-strip reference
5. [frontend/src/pages/BookEditor.tsx](../../frontend/src/pages/BookEditor.tsx) — dispatch + `?view=metadata` convention
6. [backend/migrations/versions/s8c9d0e1f234_add_book_repository_url.py](../../backend/migrations/versions/s8c9d0e1f234_add_book_repository_url.py) — migration template
7. [backend/config/i18n/en.yaml:2123-2160](../../backend/config/i18n/en.yaml#L2123-L2160) — `ui.page_editor.*` namespace (mirror as `ui.storyboard.*`)
8. [docs/backlog.md:701-806](../backlog.md#L701-L806) — STORYBOARD-VIEW-01 entry

---

## End of Pre-Inspection

**Next action:** STOP for user adjudication on A1-A8. After adjudication, proceed with Session 1 C1-C8 per the plan above.
