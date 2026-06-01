# Snapshots and versions

Bibliogon protects your chapters in two ways that meet in a single
dialog - the **version history**:

- **Automatic versions:** every time you save, Bibliogon stores the
  previous state as a version. The last 20 per chapter are kept;
  older automatic versions are discarded.
- **Manual snapshots:** a deliberately taken, named state - for
  example "Before restructure". Manual snapshots are exempt from the
  20-version limit and stay until you delete them.

## Opening the version history

Right-click a chapter in the chapter sidebar to open its context
menu, then choose **Version history**. The dialog lists the automatic
versions and your manual snapshots, newest first.

## Taking a snapshot

Type an optional name at the top of the dialog and click **Take
snapshot**. Bibliogon stores the chapter's currently saved state as a
manual snapshot. Manual snapshots carry a **Snapshot** badge and their
name; automatic versions show their version number (`v3`) instead.

## Comparing with the current version

The compare icon next to an entry opens a line-by-line diff against
the **current** chapter content:

- Green lines (`+`) are present in the chapter now but were missing
  from the snapshot.
- Red lines (`-`) were in the snapshot but are now gone.
- A note at the top flags a changed title.

**Back to list** returns you to the overview.

## Restoring

**Restore** replaces the current chapter content with the chosen
version. This is safe: Bibliogon first saves the current state as a
new version, so nothing is lost. A confirmation prompt guards the
action.

## Deleting a snapshot

Manual snapshots can be permanently removed via the trash icon (with
a confirmation prompt). Automatic versions cannot be deleted
individually - they are managed by the 20-version retention.
