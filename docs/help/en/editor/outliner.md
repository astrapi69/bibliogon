# Outliner

The **Outliner** is a spreadsheet view of a book's chapters, one row per
chapter, with sortable, inline-editable columns. It's the tabular
counterpart to the card-based [Storyboard](../books/storyboard.md): the
Storyboard is for visual pacing, the Outliner for scanning and
bulk-tweaking metadata across the whole book at once.

## What it offers

The Outliner lays out every chapter as a table. At a glance you see how
long each chapter is, what status it has, and whether it meets its word
target. Several fields can be edited right in the table, without opening
each chapter one by one.

## Opening the Outliner

In a prose book, click the **Outliner** button in the chapter sidebar.
The URL flips to `?view=outline`, so you can deep-link or use the browser
back button to return to the editor. The **Back to editor** button in
the top left also returns you to the editor.

## Columns

| Column | Editable | Notes |
|---|---|---|
| **#** | no | The chapter's position. |
| **Title** | no | Click it to open that chapter in the editor. |
| **Words** | no | Live word count; highlighted when the chapter meets its target. |
| **Target** | yes | Per-chapter [word target](writing-goals.md). An empty field means no target. |
| **Status** | yes | Drafting status (To Do / First Draft / Revised / Final). |
| **Label** | yes | One of the book's [labels](../books/storyboard.md). |
| **Beat** | yes | Story beat (Setup to Resolution). |

All edits save instantly (the same optimistic-locked save as the
Storyboard and the editor).

## How to use it

1. Open the Outliner with the **Outliner** button.
2. To open a chapter, click its **Title**, the editor opens on that
   exact chapter.
3. To set a **word target**, click the Target field, type a number and
   leave the field. Clear it to remove the target again.
4. To change **Status**, **Label** or **Beat**, pick the value in that
   row's select.
5. Click a column header to sort by it.

## Sorting

Click a column header to sort by it; click again to reverse. A small
arrow shows the current sort direction. You can sort by position
(default), title, word count, target, or status, useful for, say,
finding the shortest chapters or grouping everything still marked *To
Do*. Sorting is a view only; it never changes the chapters' actual
order.

## Where to find it

The Outliner is available for prose books (with chapters). The
**Outliner** button sits in the editor's chapter sidebar.

## Tips

- Sort by **Status** to see at a glance what is still left to do, and by
  **Words** to spot unusually short or long chapters.
- The word-count highlight is a handy check on whether a chapter has met
  its target, without opening it.
- Use the Outliner for bulk metadata upkeep and the
  [Storyboard](../books/storyboard.md) for visual planning, both work on
  the same chapters.

## Related

- [Storyboard view](../books/storyboard.md) - the visual card view of the same chapters
- [Writing goals](writing-goals.md) - per-chapter and per-book word targets
- [Editor overview](uebersicht.md) - all the editor basics
