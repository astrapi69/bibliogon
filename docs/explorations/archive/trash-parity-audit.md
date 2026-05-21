# Trash-View Parity Audit (Phase 1)

Datum: 2026-04-30. Status: Audit only, no code changes.

Aster reported three asymmetries:

1. Books-Trash has NO view-toggle.
2. Articles-Trash has view-toggle but it appears broken.
3. Books-Trash has Back-button, Articles-Trash does not.

This document captures what each side actually renders and why
the toggle feels broken on the articles side.

---

## 1. File map

| Side | File | Component | Route | Trash entry-point |
|------|------|-----------|-------|--------------------|
| Books | [frontend/src/pages/Dashboard.tsx](../../frontend/src/pages/Dashboard.tsx) | inline trash-view inside `Dashboard` | `/` | `data-testid="trash-toggle"` icon button (line 206) |
| Articles | [frontend/src/pages/ArticleList.tsx](../../frontend/src/pages/ArticleList.tsx) | local `TrashPanel` function (line 613) inside `ArticleList` | `/articles` | `data-testid="article-list-trash-toggle"` icon button (line 420) |

Shared infrastructure:

- [ViewToggle](../../frontend/src/components/ViewToggle.tsx): single component, used by both dashboards' live-list headers. Two buttons, `onClick` fires the supplied `onChange`. Component itself is correct.
- [useViewMode](../../frontend/src/hooks/useViewMode.ts): hook keyed by `"books" | "articles"`, persists to `app.yaml ui.dashboard.{books,articles}_view`. Both dashboards use it.

There is no shared `TrashView` component. Books trash markup lives inline inside `Dashboard.tsx`. Articles trash markup lives in the local `TrashPanel` function inside `ArticleList.tsx`.

---

## 2. Diff table

| Feature | Books-Trash | Articles-Trash |
|---------|-------------|----------------|
| Title | "Papierkorb" + book count | "Papierkorb (N)" |
| Title icon | `Trash2` (line 281) | none |
| Back-button | yes — chevron-left, line 278 | **no** |
| Empty-trash action | "Papierkorb leeren" red button, line 286 | "Papierkorb leeren" ghost button, line 651 |
| ViewToggle | **no** — toggle is gated to the live-list branch (line 359 inside the `:`/non-trash branch) | **yes**, but in main header (line 530, unconditional) |
| Layout when populated | `styles.grid` cards (line 301) | `<ul>` list (line 662) |
| Layout when empty | dedicated empty-state block (line 295) | dedicated empty-state block (line 625) |
| Empty-state testid | `trash-empty-state` | `article-trash-empty` |
| Restore action | per-card primary button | per-row ghost button + icon |
| Permanent-delete | per-card danger button | per-row ghost-danger button |
| Theme-toggle visible while in trash | yes (in main header, unconditional) | yes (in main header, unconditional) |
| Trash-toggle button | aria-pressed not set | `aria-pressed={showTrash}` (line 428) |
| Trash-count badge | yes (after [a535060](../../frontend/src/pages/Dashboard.tsx#L211)) | yes (line 431) |

---

## 3. ViewToggle "broken" — root cause

The `ViewToggle` component itself works (see [ViewToggle.test.tsx](../../frontend/src/components/ViewToggle.test.tsx), 4 passing cases). The hook updates state. The persistence path saves to `app.yaml`.

What makes the toggle feel broken:

**Articles-Trash**: `ViewToggle` lives in the **main page header** at [ArticleList.tsx:530](../../frontend/src/pages/ArticleList.tsx#L530), OUTSIDE the `showTrash` conditional. So the toggle is visible while the user is in the trash. Clicking it correctly mutates `viewMode`. But [`TrashPanel`](../../frontend/src/pages/ArticleList.tsx#L613-L706) hard-codes its layout to `<ul>` (line 662) and never reads `viewMode`. From the user's perspective: "I clicked the toggle and nothing changed."

**Books-Trash**: `ViewToggle` lives INSIDE the live-list branch at [Dashboard.tsx:359](../../frontend/src/pages/Dashboard.tsx#L359). When `showTrash=true`, the live-list branch is short-circuited (line 274: `{showTrash ? (...) : ...}`), so the toggle disappears entirely. The trash view itself renders only `styles.grid` cards (line 301), so even if a toggle were rendered there, no list-view branch exists to switch to.

Summary: same underlying cause — neither trash view has a viewMode-driven branch. Articles surfaces the toggle anyway (no-op on trash); Books hides it. Both end up with cards-only or list-only depending on the side.

| Side | Toggle visible in trash | Toggle wired | Trash respects viewMode |
|------|------------------------|--------------|------------------------|
| Books | no | n/a | n/a (cards always) |
| Articles | yes | yes (sets state) | **no** (TrashPanel renders fixed `<ul>`) |

---

## 4. Reuse opportunities

In scope for Phase 2:

- `ViewToggle` already shared. Phase 2 just needs to render it inside both trash branches AND wire the trash markup to read `viewMode`.
- `useViewMode` already supports both scopes. A separate `*-trash-view` localStorage key per the prompt is doable, but useViewMode currently persists to the backend. **Decision needed before Phase 2**: keep the trash view's mode in localStorage as the prompt suggests, OR reuse `useViewMode("books"|"articles")` so the trash view inherits the live-list preference.

Recommendation: **reuse useViewMode**. Splitting trash from live introduces a new persistence layer, breaks the project's "trash mirrors live" UX expectation, and forces a new backend field. The smoke test goal is parity, not divergence.

Out of scope (follow-up):

- Books-Trash currently inlined in `Dashboard.tsx`. Articles-Trash is a separate local `TrashPanel`. Consolidating into a single `<TrashView>` component is a candidate refactor but **explicitly excluded** by the prompt. Track as follow-up.
- Empty-trash button uses different styles (`btn-danger btn-sm` vs `btn-sm btn-ghost` with inline color). Cosmetic; align in commit 4.

---

## 5. Phase 2 plan (4 atomic commits)

### Commit 1 — Articles-Trash: viewMode-driven layout

Make `TrashPanel` accept `viewMode`. Render cards when `grid`, list when `list`. Re-use `ArticleCard` for grid mode if its props line up; otherwise build a thin `TrashArticleCard` adapter that wraps the existing row data.

Files touched:
- [ArticleList.tsx](../../frontend/src/pages/ArticleList.tsx) — pass `viewMode` to `TrashPanel`, branch render.

Tests:
- New Vitest case in `ArticleList.test.tsx`: toggle while showing trash flips between grid and list.

### Commit 2 — Books-Trash: render ViewToggle + viewMode-driven layout

Lift the ViewToggle out of the live-list-only branch so it renders inside the trash branch too. Add a `viewMode === "list"` branch with `<ul>` markup using existing book-row patterns; or re-use `BookCard`/`BookRow` if it exists.

Files touched:
- [Dashboard.tsx](../../frontend/src/pages/Dashboard.tsx) — render `ViewToggle` inside the `<div data-testid="trash-view">` header. Branch trash render on `viewMode`.

Tests:
- New Vitest case: trash view in books dashboard renders both layouts.

### Commit 3 — Articles-Trash: add Back-button

Mirror the chevron-left back button from Books trash header. Same icon, same `onClick={() => setShowTrash(false)}` semantics, same i18n key (`ui.dashboard.back`).

Files touched:
- [ArticleList.tsx](../../frontend/src/pages/ArticleList.tsx) — render back button as first element of the trash header (above or replacing the trash-toggle in main header is out of scope; just add it inside the trash panel header).

Tests:
- Vitest case: back button calls `setShowTrash(false)`.

### Commit 4 — Header chrome parity sweep

Diff the rendered trash headers byte-for-byte after commits 1–3. Align:

- Title icon: both should have `Trash2` next to the heading.
- Empty-trash button styling: pick one (suggest `btn btn-danger btn-sm`).
- Title format: pick one (`"Papierkorb"` + count span vs `"Papierkorb (N)"`).
- Theme-toggle: both already render in main header, no change needed.

Files touched:
- Both dashboards. Cosmetic only.

Tests:
- Existing Vitest still green.

---

## 6. Stop-conditions

Phase 1 done. No code touched.

Wait for Go before Phase 2.

## 7. Open question for Aster

Per Section 4: should the trash view's view-mode preference share the live-list preference (`useViewMode` already keyed by scope) or get its own localStorage key (`books-trash-view`, `articles-trash-view`) per the original prompt?

Recommendation: share. Splitting introduces a new persistence dimension without UX justification. If Aster prefers split, commits 1+2 add a `useViewMode("books-trash"|"articles-trash")` extension — small, additive, no breaking change.
