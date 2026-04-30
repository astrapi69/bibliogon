# Smoke Test: Trash-Card Permanent-Delete Visible

**Shipped:** 2026-04-30
**Commits:** cfb3a3e (TrashCard CSS-Module + flex-wrap fix)
**Reference:** [docs/explorations/trash-card-parity-audit.md](../../explorations/trash-card-parity-audit.md), [docs/explorations/trash-card-permanent-delete-recheck.md](../../explorations/trash-card-permanent-delete-recheck.md)

Articles-Trash card view was missing the Permanent-Delete button. Root cause: `layout.trashCard` lacked `flex-wrap: wrap` → second button overflowed off-screen at narrow grid columns. Pilot fix extracted shared `TrashCard` CSS-Module + component.

## Prerequisites

- Backend running.
- 1+ articles + 1+ books available to soft-delete.

## Flow 1 — Articles-Trash card view shows BOTH action buttons

1. Open `/articles`.
2. Soft-delete an article.
3. Click trash-toggle.
4. Switch to grid view (ViewToggle).
5. Find the trashed article card (`data-testid="article-trash-card-{id}"`).
6. **Expected:** BOTH buttons visible inside the card boundary:
   - "Wiederherstellen" (primary, RotateCcw icon)
   - "Endgültig löschen" (danger, Trash2 icon)
7. Resize browser window to ~600px wide. **Expected:** card wraps; buttons drop below the title block, both still visible.
8. Click "Endgültig löschen". **Expected:** confirm dialog → confirm → article gone from trash.

## Flow 2 — Books-Trash card view (regression check)

1. Open `/`.
2. Soft-delete a book.
3. Trash → grid view → trash card.
4. **Expected:** same shape — Wiederherstellen + Endgültig löschen visible inside card.
5. Click Endgültig löschen → works.

## Flow 3 — List view actions also work

1. Either dashboard, trash, list view.
2. Each row has both action buttons inline.
3. Restore + permanent-delete both fire correctly.

## Flow 4 — Side-by-side parity

Open `/` trash and `/articles` trash in two windows. Switch both to grid.

**Expected:** card shape identical:
- Title (strong, block)
- Subtitle (muted, small) [only books have author]
- Meta line (only articles have `deleted_at` timestamp)
- Action buttons in flex container with `flex-wrap: wrap`

## Known issues / by-design

- Books trash card lacks `deleted_at` meta line; articles has it. Information asymmetry favoring articles. Audit flagged as cosmetic; not in scope for the fix.
- Test in `TrashCard.test.tsx` asserts class-presence, not computed visibility (jsdom has no layout engine). Real layout regression caught by E2E or manual smoke only.

## Failure modes

| Symptom | Likely cause |
|---------|---|
| Permanent-Delete button missing on narrow window | `flex-wrap: wrap` removed from `TrashCard.module.css` `.card`. Regression on cfb3a3e. |
| Card chrome diverges between books/articles | TrashCard component bypassed by inline JSX in one of the two dashboards. Re-audit. |
| Click on card opens editor (should NOT) | TrashCard has an unwanted `onClick` to navigate. Trashed entities must NOT click-to-edit. |
