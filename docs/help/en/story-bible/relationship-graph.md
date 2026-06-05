# Relationship graph

The relationship graph shows your book's whole web of connections as
one interactive map: a node for every Story Bible entry and a
colour-coded line for every relationship. It is the third visual
planning view next to the [Arc View](arc-view.md) (timeline) and the
[Storyboard](../books/storyboard.md) (pacing).

## What it does

Every Story Bible entry (character, setting, item, plot point, lore)
becomes a draggable node, shaped and coloured by its type. Every
relationship you record between two entries becomes a directed,
labelled line in the relationship's colour. You can build new
relationships by dragging between nodes, delete them by clicking a
line, jump straight to an entry, rearrange the whole map and keep that
arrangement, reset it, and export the picture as a PNG.

The colour legend matches the Arc View:

- ally: green
- rival: red
- family: blue
- mentor: purple
- romantic: pink
- neutral: grey

## How to use

### Open the graph

1. Open the book in the editor.
2. In the chapter sidebar, click **Beziehungsgraph** (Relationship
   graph). The button is shown when the Story Bible is active.
3. The URL switches to `?view=relationships`, so the view is
   deep-linkable and the browser Back button returns you to where you
   were.

When the book has no Story Bible entries yet, the view shows a short
hint instead of a graph. Add a few characters, settings and so on
first, then reopen it.

### Read the map

- Nodes start laid out evenly around a circle. The circle grows with
  the size of your cast so nodes do not overlap.
- Each node carries the entry name and a type icon, in the entry's
  type colour.
- Each line points from the source entry to the target entry, carries
  the relationship type as its label, and is drawn in that type's
  colour with an arrowhead.
- Use the on-canvas controls (bottom corner) to zoom in or out and to
  fit the whole graph back into view.

### Create a relationship

1. Hover over the source node and drag from its connection handle onto
   the target node.
2. A small dialog opens. Click one of the relationship-type buttons
   (ally, rival, family, mentor, romantic, neutral). The default
   selection is **ally**.
3. Optionally type a short note in the note field.
4. Click **Hinzufügen** (Add). The relationship is stored on the
   source entry and appears immediately as a new line.

If a relationship between the same two entries already exists in that
direction, creating a new one replaces it, so there is only ever one
line per pair and direction.

### Delete a relationship

1. Click the line you want to remove.
2. Confirm the prompt. The relationship is deleted and the line
   disappears.

### Jump to an entry

- A single click on a node opens a detail panel showing the entry's
  name, type and relationship count.
- In the panel, click **Im Editor öffnen** (Open in editor) to open
  the entry in the Story Bible editor, or **Auftritte anzeigen** (Show
  appearances) to see where the entry appears.
- A double click on a node opens that entry directly in the Story
  Bible editor.

### Rearrange, reset and export

- Drag nodes to lay the map out the way you think about your story.
  Positions are saved automatically per book and are restored the next
  time you open the graph.
- Click **Layout zurücksetzen** (Reset layout) to drop your custom
  positions and return to the automatic circular layout.
- Click **Als Bild exportieren** (Export as image) to download the
  current graph as a PNG file (`relationship-graph.png`), handy as an
  overview graphic or for sharing.

## Where to find it

Book editor, chapter sidebar, the **Beziehungsgraph** button (shown
when the Story Bible is active). Direct URL: the editor with
`?view=relationships`.

## Tips

- Relationships are directional. Drag from the entry that "has" the
  relationship toward its target, for example from a mentor to a
  student.
- The note you add when creating a relationship is a good place for a
  one-line reminder of how the two are connected.
- A node with many lines is a hub of your story. If a key character has
  no lines yet, that is a hint to record their connections.
- Lay related entries near each other before exporting the PNG, so the
  exported overview reads at a glance.

## Related

- [Story Bible overview](../story-bible.md)
- [Arc View](arc-view.md)
- [Mentions](mentions.md)
- [Storyboard](../books/storyboard.md)
