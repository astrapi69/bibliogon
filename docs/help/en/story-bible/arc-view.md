# Arc View and continuity checker

Once your Story Bible entities have [appearances](mentions.md), Arc
View turns them into a bird's-eye picture of who is on stage when —
and the continuity checker flags the gaps that tend to slip past a
read-through.

## Arc View

Arc View is an **SVG swim-lane timeline**:

- **Pages run left to right** along the x-axis, in book order.
- **Each entity that appears anywhere gets its own horizontal lane.**
- **Every appearance is a dot** on that entity's lane, in the column
  of the page it appears on. The dot's **color** is the page's
  [mood color](../books/storyboard.md#mood-color), and its **size**
  reflects the entity's role — lead / protagonist entities draw a
  larger dot, the rest a smaller one.
- A **polyline** connects an entity's dots so you can follow its
  continuity across the book at a glance.

**Click any dot** to jump straight to that page in the editor.

Reading the lanes top-to-bottom tells you the cast of each page;
reading a single lane left-to-right tells you one character's
presence rhythm — long gaps, late entrances, early exits all jump
out visually.

### Relationship lines

Arc View has a **Show relationships** toggle (off by default to keep
the view uncluttered). Turn it on to draw color-coded bezier curves
between two entities' lanes wherever they share a page, using the
[relationship](../story-bible.md#relationships) colors (ally = green,
rival = red, family = blue, mentor = purple, romantic = pink,
neutral = grey). The curves sit behind the dots so the timeline stays
readable.

## Continuity checker

The continuity checker produces **advisory** warnings — it never
blocks anything, and it recomputes each time you open the view. It
raises three kinds:

| Warning | When it fires |
|---|---|
| **Entity disappears** | An entity's last appearance is followed by a long run of pages to the end of the book — *"{name} disappears after this page"*. |
| **Absence gap** | An entity is absent for a long stretch between two appearances — *"{name} is absent until page {n}"*. |
| **Empty page** | A page has no linked entities at all — *"No entities on this page"*. |

These are prompts, not errors: a character *meant* to vanish at the
midpoint is fine, and an empty page may be a deliberate interlude.
Treat the warnings as a checklist to glance over before you call a
draft done.

## Related

- [Story Bible overview](../story-bible.md)
- [@-Mentions and auto-detect](mentions.md)
- [Storyboard view](../books/storyboard.md)
