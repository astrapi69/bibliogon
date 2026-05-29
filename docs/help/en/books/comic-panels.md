# Arranging comic panels

The comic-book editor lets you reorder the panels on a page and move a panel to a different page. Both work on the panels you have already added under the page's grid template (Splash, side-by-side, 2x2, and so on).

## Reordering panels on the same page

Each panel carries a small drag handle in its top-left corner. Grab the handle and drag the panel onto another cell of the grid; the panels swap into the new order and the change saves automatically.

- The order is the panel **position**, which is what the PDF export reads when it lays panels into the grid cells. Reordering in the editor reorders the exported page.
- Dragging uses the handle only — clicking the panel body still selects it, and dragging a speech bubble inside a panel still moves the bubble, not the panel.
- The new order is written in one step, so a half-reordered page can't happen if something goes wrong mid-save.

## Moving a panel to another page

Select a panel, then click **Move to page** in the panel action bar. A small menu lists the book's other pages, each with its current capacity — for example `Page 3 - 2/4 panels`. Pick a page and the panel moves there, keeping its image and its speech bubbles.

- **Full pages are greyed out** with a `(full)` hint. A page's capacity is its grid template's cell count (Splash holds 1, a 2x2 grid holds 4, and so on), so a page that is already full can't receive another panel.
- The panel is appended after the target page's existing panels.
- The page you moved the panel **from** is re-numbered so its remaining panels stay in a clean 1, 2, 3 order with no gap.
- A toast confirms the move (`Panel moved to page N`).

If the book has only one page, the menu shows "No other pages available" — add a second page from the sidebar first.

## Why moving is a menu, not a drag

Dragging a panel all the way onto a page in the sidebar would mean the canvas and the page sidebar shared one drag context. The page sidebar is the same component the picture-book editor uses, and wiring a shared drag context through it would have been a large change for both editors. The menu does the same job — pick a target, see its capacity, move the panel — without that cost.
