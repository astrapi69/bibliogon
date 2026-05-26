# Trash and restore

Deleted books and articles first land in the **trash**, where they stay for 90 days before being permanently auto-deleted. Within that window they can be restored at any time.

![Trash view with one book + Restore action](../../assets/screenshots/trash-and-restore.png)

## Open the trash

In the Books or Articles dashboard, the trash icon in the top-right corner opens the trash view. A small badge shows how many entries are currently in the trash.

## Actions

- **Restore** — moves the entry back into the dashboard. Immediate action; no confirmation dialog.
- **Delete permanently** — removes the entry forever (confirmation required).
- **Empty trash** — permanently deletes every entry in the trash at once.

## Bulk restore

When you soft-delete a multi-row selection, the dashboard immediately shows an **Undo** toast. Clicking it restores the whole set in a single API call (single round-trip). If the toast is already dismissed, the selection can also be restored later from the trash via "Restore selected".

## Auto-delete

The 90-day limit is adjustable under **Settings → Behavior** (1 to 365 days) and can be turned off entirely. Without auto-delete, trash entries grow without bound — useful for research projects where soft-deleted content rarely needs to go for good.
