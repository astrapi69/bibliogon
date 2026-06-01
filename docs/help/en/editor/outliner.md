# Outliner

The **Outliner** is a spreadsheet view of a book's chapters — one row
per chapter, with sortable, inline-editable columns. It's the tabular
counterpart to the card-based [Storyboard](../books/storyboard.md):
the Storyboard is for visual pacing, the Outliner for scanning and
bulk-tweaking metadata across the whole book at once.

## Opening the Outliner

In a prose book, click the **Outliner** button in the chapter sidebar.
The URL flips to `?view=outline`, so you can deep-link or use the
browser back button to return to the editor.

## Columns

| Column | Editable | Notes |
|---|---|---|
| **#** | — | The chapter's position. |
| **Title** | — | Click it to open that chapter in the editor. |
| **Words** | — | Live word count; turns green when the chapter meets its target. |
| **Target** | yes | Per-chapter [word target](writing-goals.md). |
| **Status** | yes | Drafting status (To Do / First Draft / Revised / Final). |
| **Label** | yes | One of the book's [labels](../books/storyboard.md). |
| **Beat** | yes | Story beat (Setup … Resolution). |

All edits save instantly (the same optimistic-locked save as the
Storyboard and the editor).

## Sorting

Click a column header to sort by it; click again to reverse. You can
sort by position (default), title, word count, target, or status —
useful for, say, finding the shortest chapters or grouping everything
still marked *To Do*. Sorting is a view only; it never changes the
chapters' actual order.

## Related

- [Storyboard view](../books/storyboard.md) — the visual card view of the same chapters
- [Writing goals](writing-goals.md) — per-chapter + per-book word targets
