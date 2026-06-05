# Snapshots and versions

Bibliogon protects your chapters in two ways that meet on the same page,
the **version history**:

- **Automatic versions:** every time you save, Bibliogon stores the
  previous state as a version. The last 20 per chapter are kept; older
  automatic versions are discarded.
- **Manual snapshots:** a deliberately taken, named state, for example
  "Before restructure". Manual snapshots are exempt from the 20-version
  limit and stay until you delete them.

## What it offers

For a single chapter, the version history shows the automatic versions
and your manual snapshots in one list, newest first. You can take a
named snapshot, compare any version with the current content, restore a
version, and delete manual snapshots.

## Opening the version history

Right-click a chapter in the chapter sidebar to open its context menu,
then choose **Version history**. A dedicated page opens with the list of
versions. The page's back button, or the browser back button, returns
you to the editor.

## Taking a snapshot

Type an optional name at the top of the page and click **Take
snapshot**. Bibliogon stores the chapter's currently saved state as a
manual snapshot. Manual snapshots carry a **Snapshot** badge and their
name; automatic versions show their version number (`v3`) instead.

You can also take a snapshot straight from the editor: right-click in the
text to open the [context menu](context-menu.md), which has a **Take
snapshot** entry.

## Comparing with the current version

The compare icon next to an entry opens a line-by-line diff against the
**current** chapter content:

- Green lines (`+`) are present in the chapter now but were missing from
  the chosen version.
- Red lines (`-`) were in the chosen version but are now gone.
- A note at the top flags a changed title.
- If there are no text differences, it says so explicitly.

**Back to list** returns you to the overview.

## Restoring

**Restore** replaces the current chapter content with the chosen
version. This is safe: Bibliogon first saves the current state as a new
version, so nothing is lost. A confirmation prompt guards the action.
After restoring, you land back in the editor with that chapter selected.

## Deleting a snapshot

Manual snapshots can be permanently removed via the trash icon (with a
confirmation prompt). Automatic versions cannot be deleted individually,
they are managed by the 20-version retention.

## Tips

- Take a named snapshot before a big restructure, then you can return to
  it any time without worrying about the 20-version limit.
- Use the diff before you restore, so you see exactly what would change.
- Restoring is risk-free because the current state is saved first, you
  can undo a restore by restoring the newly created version.

## Related

- [Writing history](writing-history.md) - your writing progress over time
- [Context menu](context-menu.md) - take a snapshot straight from the editor
- [Editor overview](uebersicht.md) - all the editor basics
