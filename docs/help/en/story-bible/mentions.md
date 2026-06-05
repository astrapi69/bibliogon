# Mentions and auto-detect

There are two ways to link your manuscript text to the
[Story Bible](../story-bible.md): type an @-mention while you write, or
run auto-detect over text you have already written.

## What it does

- An @-mention inserts a colour-coded badge for a Story Bible entry
  right into your text. The badge stays part of the document and lets
  you jump to the entry with one click.
- Auto-detect scans your existing chapters and pages for entity names
  and proposes appearance links for the ones that are not linked yet,
  so you do not have to mention everyone by hand.

## How to use: @-mentions

While writing in the chapter editor (prose books) or in a picture-book
page's text, follow these steps:

1. Type `@`. An autocomplete list of the book's Story Bible entities
   opens.
2. The list is grouped by type (characters, settings, plot points,
   items, lore) and narrows as you keep typing. It matches on the
   entity name.
3. Use the Up and Down arrow keys to move through the list, or hover an
   entry with the mouse.
4. Press Enter, or click an entry, to insert it. Press Escape to close
   the list without inserting anything.

The inserted item is a colour-coded inline mention badge that reads
`@Name` in the entity's type colour. The badge is part of your document
text and travels with the chapter or page.

Click a badge to open that entity in the Story Bible sidebar, a fast
way to jump from "wait, who was this again?" to the full entry without
losing your place.

@-mentions are available in the chapter editor and in picture-book page
text. Comic-book speech bubbles use plain text and do not offer
@-mention autocomplete.

## How to use: auto-detect

Auto-detect reads the text you have already written and proposes
appearance links for entity names it finds.

1. Open the Story Bible sidebar in the book editor.
2. In the sidebar header, click the **Detect mentions** button (the
   sparkles icon).
3. Bibliogon scans every chapter and page and matches entity names. A
   panel appears listing the proposed links, each showing the entity
   name, the chapter or page it was found on, and the number of
   occurrences when it appears more than once.
4. Click **Link automatically** to create all proposed appearance links
   in one go, or **Dismiss** to discard the proposals without changing
   anything.

If nothing new is found, you get a short "no new mentions" message
instead of a panel.

### How matching works

- Exact name match on a word boundary. "Mara" matches the word *Mara*,
  not *Maranello* or *summary*.
- Case-insensitive. *mara*, *Mara* and *MARA* all match.
- Names shorter than 3 characters are skipped (single initials, very
  short aliases) to avoid noise.
- Already-linked entities are excluded. If an entity is already linked
  to that page or chapter, auto-detect will not propose a duplicate.

Auto-detect only proposes links; nothing changes until you click
**Link automatically**. The created links behave exactly like links you
make by dragging an entity onto a Storyboard card. They power the
entity badges, the appearance tracker, the [Arc View](arc-view.md) and
the continuity checker.

## Where to find it

- @-mentions: type `@` in the chapter editor or in picture-book page
  text.
- Auto-detect: the Story Bible sidebar header, the sparkles
  (**Detect mentions**) button.

## Tips

- Use @-mentions as you draft for the entities you reference often;
  use auto-detect to catch up on chapters you wrote before adding those
  entities.
- Review the proposal list before linking. The occurrence count helps
  you spot the chapters where an entity really matters.
- After a big writing session, run auto-detect once to keep the
  appearance tracker and the Arc View in sync with your text.
- If a name keeps getting missed, check that the entity's name in the
  Story Bible matches how you spell it in the prose.

## Related

- [Story Bible overview](../story-bible.md)
- [Arc View](arc-view.md)
- [Relationship graph](relationship-graph.md)
- [Storyboard](../books/storyboard.md)
