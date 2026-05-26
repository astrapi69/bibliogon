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
