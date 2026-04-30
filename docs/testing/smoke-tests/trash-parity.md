# Smoke Test: Trash-View Parity (Books + Articles)

**Shipped:** 2026-04-30
**Commits:** e1280a2 (Articles-Trash viewMode), 94e7e0c (Books-Trash ViewToggle + list), e7266da (Articles back-button), 4f5e545 (header chrome parity)
**Reference:** [docs/explorations/trash-parity-audit.md](../../explorations/trash-parity-audit.md)

Books-Trash and Articles-Trash had three asymmetries pre-fix: missing view-toggle, broken view-toggle, missing back-button. After fix both render byte-equivalent chrome.

## Prerequisites

- Backend running.
- At least 1 book + 1 article created.

## Flow 1 — Articles-Trash view-toggle works

1. Open `/articles`.
2. Soft-delete an article (3-dot menu → "In den Papierkorb").
3. Click trash-toggle in header (`data-testid="article-list-trash-toggle"`).
4. **Expected:** trash panel renders with header (ChevronLeft + Trash2 icon + "Papierkorb" + count + empty-trash + ViewToggle).
5. Click ViewToggle "list" button.
   **Expected:** rows render (`data-testid="article-trash-list"`).
6. Click ViewToggle "grid" button.
   **Expected:** cards render (`data-testid="article-trash-grid"`); each card has Restore + Permanent-Delete buttons (see also [trash-card-permanent-delete.md](./trash-card-permanent-delete.md)).
7. Reload page → ViewToggle preference persists (shared with live list via `useViewMode("articles")`).

## Flow 2 — Books-Trash view-toggle works (added in 94e7e0c)

1. Open `/`.
2. Soft-delete a book.
3. Click trash-toggle (`data-testid="trash-toggle"`).
4. **Expected:** trash-view renders with ViewToggle in header.
5. Click "list" → `data-testid="trash-list"` renders rows.
6. Click "grid" → `data-testid="trash-grid"` renders cards.
7. Reload → preference persists via `useViewMode("books")`.

## Flow 3 — Both trash views have ChevronLeft Back-button

1. `/articles` → trash → click ChevronLeft (`article-trash-back`). **Expected:** trash panel hides, live list returns.
2. `/` → trash → click ChevronLeft (existing). **Expected:** same.

## Flow 4 — Header chrome side-by-side equivalence

Open `/` and `/articles` in two windows. Soft-delete one item each. Open trash on both.

**Expected:** identical chrome layout:
- ChevronLeft back button (left)
- Trash2 icon (muted)
- h2 "Papierkorb" title
- count span (count + "Bücher" / "Artikel")
- spacer (flex 1)
- empty-trash button (`btn-danger btn-sm`, only when count > 0)
- ViewToggle (right)

## Flow 5 — Actions work in both layouts

1. Restore: any restore button (`trash-restore-{id}` or `article-trash-restore-{id}`) → row leaves trash, returns to live list.
2. Permanent-delete: confirms dialog, then row gone from trash + cannot be restored.
3. Empty-trash button: confirms dialog, then full trash list cleared.

## Known issues / by-design

- View-mode persists across live-list ↔ trash-view (shared `useViewMode` scope per dashboard). Decision: was Aster's "share" preference in audit Phase 1 question.
- Per-row testids in trash differ between books (`trash-card-{id}` / `trash-row-{id}`) and articles (`article-trash-card-{id}` / `article-trash-row-{id}`) — preserved for smoke-spec compat with prior tests.

## Failure modes

| Symptom | Likely cause |
|---------|---|
| Toggle visible but layout doesn't change in trash | TrashPanel hardcoded layout (regression on commit e1280a2). |
| Toggle missing in books trash | regression on commit 94e7e0c — ViewToggle gated to live-list branch again. |
| Back-button missing in articles trash | regression on commit e7266da — TrashPanel header lacks ChevronLeft. |
| Two headers visible in articles trash | regression on commit 4f5e545 — page mainHeader not hidden when `showTrash=true`. |
