# Dashboard pagination

Both the Books and the Articles dashboard load their entries page-by-page so large collections render fast.

![Load-more button + per-page selector](../../assets/screenshots/dashboard-pagination.png)

## Controls

At the bottom of the list, two controls appear:

- **Load more (N / M)** — shows the next page. N is the count of currently visible entries, M is the filtered total.
- **Per page** — dropdown with 10, 25, 50, or 100 entries per page. The choice is stored separately per dashboard (Books and Articles have independent values).

## Persistence

The per-page choice lives in the app settings under `ui.dashboard.books_page_size` / `ui.dashboard.articles_page_size`. It follows your account, not your browser — the same value applies on every device.

## Selection and bulk actions

"Select all" always operates on the **full filtered set**, not just the currently visible page. That makes sure bulk export or bulk delete doesn't silently skip entries the filter just made visible.

## Clearing a search field

Every search and filter input across the Books and Articles dashboards (and the Authors database and the Help panel) shows a small **clear (X) button** at the right edge once it has text in it. Clicking it empties that one field without touching the others — so you can drop a title search while keeping a status or content-type filter applied. The list re-filters immediately.

## Related

- [Trash and restore](trash-and-restore.md) — paginated trash view with bulk restore
- [Settings sidebar](../settings/sidebar.md) — where the global per-page choice lives
