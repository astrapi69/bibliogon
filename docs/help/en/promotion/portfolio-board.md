# Portfolio board

The portfolio board is a matrix of which book exists in which retail format, and which format is still missing. One row per book, one column per format: eBook, paperback, hardcover.

Open it from the grid icon in the book dashboard header, or go to `/portfolio` directly.

## What the board is for

This information used to live in a hand-maintained CSV plus a notes list with entries like "hardcover missing". Both drifted. The board reads the same state from the database, and every change is saved immediately.

## Status per format

Every cell carries a status:

- **On sale** — the format is published and buyable.
- **Draft** — uploaded but not published yet.
- **Missing** — the format does not exist yet.

Draft and missing both count as a gap. Gaps are marked in the cell and summarised as a chip in the book row. A book without a gap reads "complete".

The status is changed directly in the cell's select. One choice, one write.

## Store link and ASIN

The pencil icon in a cell opens a field for the store link. Saving writes it immediately; the cell then shows the link as "Store" and opens it in a new tab.

The ASIN is shown, never edited. It lives in the book's own metadata (`asin_ebook`, `asin_paperback`, `asin_hardcover`), which the KDP plugin also reads. Change it in the book's metadata editor so there is only one source.

## Universal link

The last column holds the cross-platform link per book, a books2read link for example. The save button stays inactive until you change the value. An empty field clears the link.

## Filters

- **Pen name** and **language** filter server-side. The option lists come from the full board rather than the filtered view, so you can always switch back.
- **Gaps only** shows just the books with at least one format that is not on sale. That is the worklist.
- **Reset filters** appears as soon as a filter is active.

If no book matches, the board reports "no matches". That is different from the first-run state, which appears while no book exists at all.

## Desktop app only

The per-format state lives in a table the promotion plugin owns and has no offline copy in the browser. In the browser-only build the board is therefore visible but disabled, with a notice explaining why.
