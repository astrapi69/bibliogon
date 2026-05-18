# Bibliogon Comic-Foundation Exploration

**Status:** Open Brainstorming, Decisions Pending
**Last Updated:** 2026-05-18
**Trigger:** Finding E from the 4c-B-1 manual smoke
(2026-05-18) — user-want for "Multi-Bubble with Tails" on
picture-book pages. Surfaced + scoped during the v0.35.0
release cycle as a strategic deferral: the immediate
4c-B-1 fix-track shipped the 9-position anchor grid +
bubble width/height, but Multi-Bubble + Tail + Drag-to-
Position were promoted to a dedicated post-v0.35.0
session.

## Scope

The Comic-Foundation Session consolidates three filed
backlog items into one coherent bubble-system upgrade:

- **`PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01`** (P3) —
  architectural anchor. Schema shift from
  `layout_config.speech_bubble` (single bubble) to
  `layout_config.speech_bubbles[]` (array). Add-bubble +
  delete-bubble + active-bubble-selector UI.
- **`PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`** (P3) —
  tail-triangle with direction (8 octants) + position
  along the edge + length slider. Visual cue
  distinguishing "bubble for character A" from "bubble
  for character B" on the same scene.
- **`PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01`** (P5)
  — pointer-drag handle on the bubble. Gains real value
  once multiple bubbles coexist (presets get coarse when
  3+ bubbles overlap).

## Strategic note (from MULTI-BUBBLE-01)

> Comic-Foundation Session establishes the Multi-Bubble +
> Tail + Drag pattern that future Comic-Plugin will reuse.
> Plus matches Single-Source-of-Truth discipline: one
> bubble-system, multiple usage-contexts (single-page
> picture-book scene vs. multi-panel comic page).

## Schema-decision (deferred to Comic-Foundation
Pre-Inspection)

Two paths:

- **(a)** Extend the existing `speech_bubble` PageLayout
  with the multi-bubble array shape. The single-bubble
  picture-book use case stays valid (array of length 1);
  the multi-bubble use case ships with the same layout.
- **(b)** Introduce a new `comic_bubble` (or
  `comic_panel`) PageLayout dedicated to multi-bubble +
  panel work. The single-bubble picture-book path stays
  on `speech_bubble`; comic-style multi-bubble uses the
  new layout.

User's framing: "quasi Comic for one page within
Picture-Book Layout" — points at (a) for the picture-
book MVP + a separate `comic_panel` layout later for
true multi-panel comic work.

## Open questions

- Bubble z-order / overlap handling when multiple
  bubbles coexist.
- Per-bubble Tier-Property scope: do all extended
  properties (background, border, font, etc. from
  `EXTENDED-PROPERTIES-01`) apply per-bubble?
- Drag UX: snap-to-edge? Snap-to-grid? Keyboard nudge?
- Tail rendering tech: SVG `<path>` (clean at any zoom)
  vs CSS `clip-path` on a pseudo-element (simpler but
  pixelated)?
- Picture-Book vs Comic-Plugin separation: where does
  the bubble component live (`frontend/src/components/`
  vs a future `plugins/bibliogon-plugin-comic/`)?

## Related material

- `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`
  (P3) — Tier-Property work for the bubble's visual
  styling. Per-bubble in the multi-bubble world.
- `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01` (P3,
  Tier 3) — shape variants (oval / rectangle / cloud /
  explosion). Comic-style explosion shape may be the
  natural unlock for Comic-Foundation.
- `docs/explorations/children-book-plugin.md` — older
  exploration; predates Picture-Book Phase 4 + the
  Comic-Foundation framing.

## Next step

Pre-Inspection at session-start time. NOT scheduled
yet — triggers when the v0.35.x cycle closes + the
user picks Comic-Foundation as the next stream.
