# Managing backups

The **Settings > Backups** tab is the central place for backup-related operations. It shows the version history of recent backups and lets you compare two backup snapshots against each other.

## Version history

When the tab opens, the recent backup history loads automatically (up to 20 entries). Each entry shows:

- **Date + time** of the backup
- **Action** (export, import, automatic backup)
- **Number of books** in the snapshot
- **Filename** of the backup file

## Delete individual entries

Each entry in the list carries a trash icon. Clicking it removes that single entry from the history — the underlying `.bgb` file on disk is NOT touched; only the history reference disappears.

Optimistic update: the entry disappears from the view immediately. If the server rejects the deletion, the list reappears with the entry in its original state and an error toast surfaces.

## Clear the entire history

The **Clear all entries** button removes every reference from the version history at once. A confirmation dialog warns before the action. Again, `.bgb` files on disk are NOT touched — only the history list gets emptied.

## Compare backups

The **Compare** button opens a dialog where you can pick two `.bgb` snapshots and diff them. The comparison shows per book:

- New books (present in only one snapshot)
- Deleted books (present in only one snapshot)
- Modified books (content hash differs)

Useful when you want to know what changed between two backup points — for example when hunting down an accidentally deleted chapter.

## Where the backup files live

The actual `.bgb` files are stored in the user-specific data directory:

- Linux / macOS: `~/.local/share/bibliogon/backups/`
- Windows: `%LOCALAPPDATA%\bibliogon\backups\`
- Docker (production): inside the named volume `bibliogon-data` under `/app/data/backups/`

Manual disk cleanup (for example to free up storage) happens directly on the file system; the version history is independent.

## Related topics

- [Danger Zone — system reset](danger-zone.md) — full reset of all data
- [Settings navigation](sidebar.md) — where the Backups tab sits
- [Git backup](../git-backup/basics.md) — alternative backup strategy via git remote
