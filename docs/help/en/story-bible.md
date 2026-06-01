# Story Bible

The Story Bible is a per-book database for the recurring elements of
your fiction: the characters, places, plot points, items and lore
that you want to keep consistent while you write. It lives right next
to your manuscript so you can look something up — or jot it down —
without leaving the editor.

The Story Bible is provided by the **plugin-story-bible** plugin. If
you do not see it, enable the plugin under *Settings > Plugins*.

## Opening the Story Bible

Open a book in the editor. When the plugin is active, a **book**
button appears at the top-right corner. Click it to slide in the
Story Bible panel on the right-hand side, alongside the chapter list
on the left. Click the **X** in the panel header to close it again.

## Entity types

Entries are grouped by type. Each type has its own icon, accent
color and set of detail fields:

| Type | What it tracks | Detail fields |
|---|---|---|
| **Characters** | The people of your story — protagonists, antagonists, supporting cast | Aliases, role, traits, arc notes, relationships |
| **Settings** | The places your story happens — cities, buildings, worlds | Setting type, geography, significance |
| **Plot Points** | The beats of your narrative | Timeline position, story beat (setup / inciting incident / rising action / climax / falling action / resolution), involved characters |
| **Items** | The meaningful objects and artifacts | Significance, current holder |
| **Lore** | The rules of your world | Category (magic / technology / culture / history / religion / language / other) |

Each group can be collapsed or expanded, and shows a count of its
entries. The type definitions are the single source of truth in
`backend/config/story-bible-entities.yaml`, so the field set is the
same everywhere it appears.

## Adding, editing and deleting

- **Add** — click the **+** next to a group heading, type a name and
  press *Save*. The entry is created under that type.
- **Edit** — click an entry to open its full detail view in the main
  editing area (the chapter editor steps aside while you do). There
  you can rename it, write a rich-text **description**, and fill in
  the per-type detail fields. Every change saves automatically.
- **Delete** — use the trash icon next to an entry in the list, or
  the *Delete* button in the detail view. You are asked to confirm
  first.

## Relationships

Open a character (or any entity) and scroll to the **Relationships**
section of the detail view. Add a relationship to another entity in
the same book and choose its kind:

| Kind | Color |
|---|---|
| **Ally** | green |
| **Rival** | red |
| **Family** | blue |
| **Mentor** | purple |
| **Romantic** | pink |
| **Neutral** | grey |

Each relationship can carry an optional note ("estranged since the
war", "secretly working against him", ...). Relationships are stored
on the entity itself and drive the optional relationship lines in
[Arc View](story-bible/arc-view.md).

## Linking entities to the text (appearances)

An **appearance** is a link between an entity and a page or chapter
where it shows up. Two ways to create them:

1. **Drag** an entity from the Story Bible sidebar onto a card in the
   [Storyboard](books/storyboard.md). The drop creates an
   appearance link for that page; the entity then shows as a
   color-coded badge on the card.
2. **Auto-detect** — let Bibliogon scan your existing text and
   propose links in one pass. See
   [@-Mentions and auto-detect](story-bible/mentions.md).

Each appearance can carry an optional **role** (e.g. "POV", "cameo")
and **notes**. The entity's detail view lists every page and chapter
it appears on — your at-a-glance appearance tracker. The Storyboard
also offers an **entity filter** that narrows the grid to the pages
where the selected entities appear.

## @-mentions in the text

Type `@` in the chapter editor or a picture-book page to autocomplete
the book's entities and drop in a color-coded inline mention badge.
Clicking a badge opens that entity in the sidebar. See
[@-Mentions and auto-detect](story-bible/mentions.md) for the full
flow.

## Arc View and continuity

Once entities have appearances, the [Arc View](story-bible/arc-view.md)
draws an SVG swim-lane timeline of who appears where across the book,
and the **continuity checker** raises advisory warnings when an
entity disappears, has a long absence, or a page has no entities at
all.

## Exporting the Story Bible

Export the whole Story Bible as a Markdown document, grouped by
entity type, with each entity's description and its list of
appearances. Useful for a series bible you keep outside Bibliogon, or
to hand to a co-author or editor.

## Scope

In this version the Story Bible is **per book**: each book has its
own set of entries. Sharing a bible across a whole series is planned
for a future version.

## Related

- [@-Mentions and auto-detect](story-bible/mentions.md)
- [Arc View and continuity checker](story-bible/arc-view.md)
- [Storyboard view](books/storyboard.md) — where entity badges and the appearance grid live
