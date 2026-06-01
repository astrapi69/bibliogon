# @-Mentions and auto-detect

Two ways to connect your manuscript text to the [Story Bible](../story-bible.md):
type an `@-mention` as you write, or run **auto-detect** over text you
have already written.

## @-mentions

While writing in the **chapter editor** (prose books) or a
**picture-book page**, type `@` to open an autocomplete list of the
book's Story Bible entities. The list is grouped by type
(characters, settings, plot points, items, lore) and narrows as you
keep typing — it matches on the entity name.

Pick an entry to insert a **color-coded inline mention badge** that
reads `@Name` in the entity's type color. The badge is part of your
document text; it travels with the chapter.

Click a badge to open that entity in the Story Bible sidebar — a fast
way to jump from "wait, who was this again?" to the full entry
without losing your place.

> @-mentions are available in the chapter editor and picture-book
> page text. Comic-book speech bubbles use plain text and do not
> offer @-mention autocomplete.

## Auto-detect

Auto-detect scans the text you have already written and proposes
appearance links for entity names it finds — so you do not have to
go back and `@`-mention everyone by hand.

1. Trigger auto-detect for the book (from the Story Bible surface).
2. Bibliogon scans every chapter / page and matches entity names.
3. It lists the proposed links — each one a name found on a specific
   page or chapter that is not already linked.
4. Choose **Link automatically** to create the appearance links in
   one go.

### How matching works

- **Exact name match** on a word boundary — "Mara" matches the word
  *Mara*, not *Maranello* or *summary*.
- **Case-insensitive** — *mara*, *Mara* and *MARA* all match.
- **Short names are skipped** — names shorter than 3 characters
  (single initials, very short aliases) are ignored to avoid noise.
- **Already-linked entities are excluded** — if an entity is already
  linked to that page or chapter, auto-detect will not propose a
  duplicate.

Auto-detect only *proposes* links; nothing changes until you confirm
with **Link automatically**. The created links behave exactly like
links you make by dragging an entity onto a Storyboard card — they
power the entity badges, the appearance tracker, [Arc View](arc-view.md)
and the continuity checker.

## Related

- [Story Bible overview](../story-bible.md)
- [Arc View and continuity checker](arc-view.md)
- [Storyboard view](../books/storyboard.md)
