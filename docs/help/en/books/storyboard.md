# Storyboard view

The **Storyboard** is a bird's-eye grid view of a book — every page (or, for prose books, every chapter) as a small card, in order, with a preview, a story-beat / mood / act-group annotation set, and any Story Bible entity badges. Use it to plan pacing across the whole arc: the 32- or 40-page run of a KDP picture book, the panels of a comic, or the chapters of a novel.

## Opening the storyboard

The Storyboard is available for **every book type**:

- **Picture books and comic books** — click the **Storyboard** button in the page-editor header (next to **Metadata** + **Export PDF**). The URL flips to `?view=storyboard`, so you can deep-link or use the browser back-button to return to the editor.
- **Prose books** — click the **Storyboard** button in the chapter sidebar to open the chapter-card variant (see [Prose books](#prose-books-chapter-cards) below).

Picture-book and comic-book pages share the same four annotation columns (`notes`, `story_beat`, `mood_color`, `act_group`); prose books carry the same four on each `Chapter`. The four inline editors are one shared `StoryboardAnnotations` component, so the annotation experience is identical across all three surfaces.

## Reading a card

Each card shows, top-to-bottom:

- **Thumbnail** — the page's image asset (or a placeholder icon for text-only / image-less pages).
- **Position number + title** — first non-empty line of the page text (TipTap-aware: handles both plain-string and JSON layouts; truncates at ~60 chars).
- **Layout tag** + optional **story-beat badge**.
- **Beat selector + mood swatches + act-group input + notes textarea** — inline annotation editors (see below).

The **mood color** also paints the card's left border for at-a-glance scanning across the grid.

## Click + drag

- **Click a card** to return to the editor with that page selected.
- **Drag the grip handle** (top-right of each card) to reorder pages. The grip fades in on hover. Reorder uses the existing pages API — same atomic transaction as the page-thumbnails sidebar.
- **Drag does not change act_group.** Pages stay in their author-set group regardless of where you drop them visually. Set / change the group via the act-group input on each card.

## Annotation editors

All four annotations save **on blur / change** — no explicit Save button. Errors surface via a toast; your edits stay in the textarea so you can retry.

### Notes

A free-text textarea per card. Author memo only — not rendered in the exported book. Common uses: pacing notes, revision flags, "remember to add a transition here", references.

Clearing the textarea writes `NULL` back so the placeholder reappears for cards with no notes.

### Story beat

A dropdown per card with the six standard dramatic-structure beats:

| Beat | When in the arc |
|---|---|
| **Setup** | Opening — establish character + world |
| **Inciting** | The event that disturbs the status quo |
| **Rising** | Tension builds |
| **Climax** | The peak — biggest decision / risk / image |
| **Falling** | Consequences play out |
| **Resolution** | Wind-down, return to a new normal |

The "— no beat —" option clears the beat. The selected beat shows as a colored badge above the dropdown for fast visual scanning of the arc.

### Mood color

A row of 10 preset swatches covering the typical picture-book emotional range:

| Swatch | Mood |
|---|---|
| #FFC857 | Sunny |
| #FF6B6B | Passionate |
| #4ECDC4 | Calm |
| #C7B8EA | Dreamy |
| #7FB069 | Peaceful |
| #F18A07 | Adventurous |
| #F4A6CD | Tender |
| #6C7A89 | Somber |
| #2E4057 | Mysterious |
| #F4ECD8 | Gentle |

Click a swatch to set it. Click the currently-selected swatch to toggle it off. The X-button next to the palette is an alternative clear control (only visible when a color is set).

The chosen color paints the card's left border. Custom hex colors are a future filing (`STORYBOARD-MOOD-FREE-PICKER-01`) — for now the 10 presets cover the common cases without adding a dependency.

### Act group

A free-text input per card. Pages with the same `act_group` value render under a shared group header in the grid; pages without an `act_group` render in an untitled trailing group.

Empty or whitespace-only values clear the act_group. **Enter** confirms the value (same as clicking outside the input).

Typical values: `Act I` / `Act II` / `Act III`, or chapter labels like `Prologue` / `Forest` / `Castle`, or any other grouping the author finds useful.

## Story Bible entities

If the [Story Bible](../story-bible.md) plugin is active, the
Storyboard doubles as your appearance-planning surface:

- **Drag an entity** from the Story Bible sidebar onto a card to
  record that the character / setting / item appears on that page.
- Linked entities show as **color-coded badges** on the card, in
  their entity-type color.
- The **entity filter** at the top of the Storyboard narrows the grid
  to the pages where the selected entities appear — handy for
  checking one character's on-page rhythm, or finding every page two
  characters share.

These links feed the appearance tracker, [Arc View](../story-bible/arc-view.md)
and the continuity checker.

## Prose books (chapter cards)

Prose books (novels, non-fiction, anything chapter-based) get a
chapter-card variant of the Storyboard, opened from the **Storyboard**
button in the chapter sidebar. Each card represents a chapter and
shows:

- The chapter **title** and a **word count** (computed from the
  chapter's TipTap content).
- The same four inline annotations as a page card —
  notes, story beat, mood color and act group — backed by the shared
  `StoryboardAnnotations` editors.

Drag a card by its handle to reorder chapters; click a card to return
to that chapter in the editor. Use the mood colors and act groups to
block out acts and pacing across a whole manuscript at a glance.

## What's not in the Storyboard (yet)

Deferred to follow-up sessions, captured in `PICTURE-BOOK-STORYBOARD-OPERATIONS-01`:

- Add-page-in-between
- Duplicate page
- Split page
- Merge pages
- Print storyboard
- Auto-update act_group when dragging a card across visual groups

These are filed against real user-pull demand. The current v2 covers the **annotation + overview + reorder** flow that the daily picture-book authoring rhythm needs.

## Related

- [Story Bible](../story-bible.md) — the entity database whose badges and appearances surface on the cards
- [Arc View and continuity checker](../story-bible/arc-view.md) — the timeline built from Storyboard appearances
- [Text Configuration for Picture-Book Pages](text-configuration.md) — Tier 1 + Tier 2 properties set per page in the page editor
- [Editor Display Settings](../editor/display-settings.md) — font / size / line-height / column-width per browser
