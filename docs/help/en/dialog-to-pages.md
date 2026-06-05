# Dialogs become pages

Eight large dialogs in Bibliogon are now full pages with their own address. Instead of an overlay that locks the rest of the screen, each one now opens as its own page with the familiar app header and centered content.

## What changed

Previously, large functions such as creating a book or exporting opened as a modal dialog on top of the current view. These overlays were often too cramped on a phone and could only be left through a close button.

Now, for these eight functions:

- Each has a real address (URL) you can bookmark or share.
- The browser Back and Forward buttons work as expected.
- On a phone the page fills the whole screen instead of trapping you in a tiny window.
- The header stays the same as on the Dashboard, so you can clearly see you are still inside Bibliogon.

## The new pages

These eight functions are now their own pages. Bibliogon fills in the placeholders in the addresses (for example the book number) automatically when you click the matching button.

- **Create book** at `/books/new?type=`: the part after `type=` records which book type you are creating.
- **Create text** at `/articles/new?type=`: the part after `type=` records the text type.
- **Export** at `/books/:bookId/export`: per book, with all export formats in one place.
- **Writing history** at `/writing-history`: global across all books, not per book.
- **Chapter snapshots** at `/books/:bookId/chapters/:chapterId/snapshots`: the saved versions of a single chapter.
- **Git backup** at `/books/:bookId/git-backup`: per book.
- **Git sync** at `/books/:bookId/git-sync`: per book.
- **Keyboard shortcuts** at `/help/shortcuts`: the full reference. `Ctrl + /` now jumps straight here.

## Chapters are directly linkable

In the editor, the currently open chapter is now part of the address (`?chapter=<id>`). That lets you bookmark or share a link to one specific chapter. It also means that when you restore a snapshot, you return to exactly the right chapter afterward.

## How to use the new pages

- **Bookmark them:** save the writing history or a specific chapter as a browser bookmark and jump back there with one click.
- **Share links:** send yourself (or collaborators, if they have access) the address of an export page or a chapter.
- **Browser navigation:** use Back and Forward to move between pages without hunting for a close button.
- **Work on mobile:** on a phone these pages fill the whole screen and are much more comfortable to use.

## What stays a dialog

Not everything was changed. These deliberately stay dialogs:

- **Confirmations:** short yes/no prompts and safety checks before deleting or restoring.
- **Wizards with in-progress state:** the import wizard, the convert-text-to-book wizard, and the AI setup. A link into the middle of such a step would be meaningless without the in-progress state.
- **The donation nudge** on first start, which the app shows on its own.
- **Small, context-bound dialogs** that are only needed briefly in place.

## Tips

- If a bookmark to a chapter or a book leads nowhere, the content was probably deleted or its number changed. Open the book again from the Dashboard.
- The keyboard shortcuts page is now a plain reference page. Bookmark it if you use it often.

## Related topics

- [Writing history](editor/writing-history.md)
- [Snapshots](editor/snapshots.md)
- [EPUB Export](export/epub.md)
- [PDF Export](export/pdf.md)
- [Git backup](git-backup/basics.md)
- [Keyboard shortcuts](shortcuts.md)
