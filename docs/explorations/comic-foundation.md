# Comic-Foundation Exploration (plugin-comics)

**Status:** Awaiting Picture-Book Phase 4 close + plugin-comics
session scheduling. Resolved as `plugin-comics` work, NOT
Picture-Book extension.
**Last updated:** 2026-05-18 (reframe + Pre-audit + 4-option
architecture analysis + multi-session roadmap; replaces the
2026-05-18 stub).
**Trigger:** Finding E from the 4c-B-1 manual smoke (user
request for "Multi-Bubble with Tails") + the existing
`Book.book_type = "comic_book"` schema reservation that was
filed at Picture-Book Phase 4 design time (see Pre-audit
below). The two converge: the user has expressed comic-
authoring interest; the schema already anticipates a separate
`plugin-comics` for that scope.

---

## Context

The 2026-05-18 4c-B-1 manual smoke surfaced Finding E:
"Multi-Bubble with Tails (Comic-Foundation)" as a user-want
beyond what Picture-Book's single-bubble shape supports.
User-framing at smoke time: "quasi Comic for one page within
Picture-Book Layout".

The first-draft of this exploration (stub commit `de83dcc`,
2026-05-18) treated that framing as an architectural decision
to extend Picture-Book's `speech_bubble` layout with a multi-
bubble array. The Pre-audit step below shows that framing
conflicts with an existing architectural commitment filed at
Picture-Book Phase 4 design time. After the conflict was
surfaced (CC critique 2026-05-18) the user confirmed:

- **NQ1**: Comic-Foundation is `plugin-comics` work, NOT a
  Picture-Book extension.
- **NQ2**: 4c-B-2 Tier-Property work ships per-bubble shape
  (`bubbles[0]`) for scope-anticipate compatibility with the
  future multi-bubble world.
- **NQ3**: `plugin-comics` work starts AFTER Picture-Book
  Phase 4 closes completely (4c-B-2 + EXTENDED-SHAPE-01 +
  PDF-KDP-FORMATS-01 + remaining Picture-Book backlog).
- **NQ4**: Separate comic-authoring workflow desired, NOT
  multi-bubble within Picture-Book.

This doc is the reframe.

---

## Pre-audit: current state of the moving parts

The architectural commitments that constrain Comic-Foundation
work. Frozen here so later sessions do not re-derive them.

### Existing `comic_book` reservation

[backend/app/models/__init__.py:72-75](../../backend/app/models/__init__.py#L72-L75):

```python
#   "comic_book"   -> reserved for future plugin-comics. The
#                     value is defined in the Pydantic schema
#                     layer so a comics plugin can ship without
#                     migrating this column.
```

`Book.book_type ∈ {"prose", "picture_book", "comic_book"}`.
The `comic_book` value is **already in the schema**; it does
NOT require an Alembic migration to land. A future
`plugin-comics` ships its own page/panel/bubble tables under
the reserved value.

Same point at [children-book-plugin.md:13-23](children-book-plugin.md):

> `comic_book` → future separate `plugin-comics`. The value
> is reserved in the schema layer so the comics plugin can
> ship its own `panels` and `speech_bubbles` migration WITHOUT
> re-migrating the `book_type` column.

The schema commits to plugin-owned tables for comic-specific
shapes (`panels`, `speech_bubbles`). Picture-Book's
`speech_bubble` layout + its single `layout_config.bubble_*`
fields stay picture-book-scoped.

### Picture-Book single-bubble shape (v0.35.1)

The current shipped picture-book `speech_bubble` layout:

- Single bubble per page (no array, no panel hierarchy).
- `layout_config` stores `{anchor_position, opacity,
  bubble_width, bubble_height}` at the top level.
- Plain-string `text_content` (NOT TipTap rich-text — Tier-
  Property layouts use plain text per 4c-B-1 D2).
- 9-position anchor grid + width-slider + height-slider +
  opacity-slider (Finding A + Bug 1 fixes, v0.35.0/v0.35.1).

`PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01` (P3) ships
the Tier-Property extension (per-bubble visual / typography
styling) in the 4c-B-2 session.

### 4c-B-2 Tier-Property roadmap status

`PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01` ships Tier
1 (background/border/shadow) + Tier 2 (typography) per the
backlog spec. Per NQ2: 4c-B-2 ships the per-bubble shape as
`layout_config.bubbles[0].{properties}` — even though Picture-
Book stays single-bubble. The `[0]` wrapper is forward-
compatible with the future plugin-comics `bubbles[]` shape;
costs ~30% scope expansion to 4c-B-2 but avoids a migration
when plugin-comics lands.

This is the **scope-anticipate** decision per NQ2. Concrete
implication: 4c-B-2 must NOT ship the flat `layout_config.
{background_color, border_color, ...}` shape; it ships the
nested `layout_config.bubbles[0].{background_color,
border_color, ...}` shape from day one.

### Mobile-strategy intersection

[mobile-strategy.md](mobile-strategy.md) is its own
exploration. Multi-bubble UX on touch devices needs:

- Tap-to-select bubble (not hover)
- Pinch-to-resize bubble (no drag-handles)
- Larger anchor-preset hit targets (44px+ per Apple HIG)

Comic-Foundation does NOT need to solve mobile in v1; mobile
is a separate work-stream. But the bubble-rendering primitive
(SVG path for tail + CSS positioning for bubble) should NOT
hard-depend on mouse-only events.

### Existing plugin system architecture

Per [.claude/rules/architecture.md](../../.claude/rules/architecture.md):

- New plugin folder: `plugins/bibliogon-plugin-comics/`
- Python package: `bibliogon_comics`
- Entry point: `[project.entry-points."bibliogon.plugins"]`
- License tier: `"core"` (all plugins are free during the
  current development phase)
- Plugin class: `ComicsPlugin(BasePlugin)`,
  `depends_on = ["export"]`
- Backend routes under `/api/comics/`
- Frontend manifest via `get_frontend_manifest()`

Comic-Foundation work fits this pattern without architectural
changes. The plugin owns its own Alembic migrations (per the
`comic_book` reservation comment).

---

## Architecture proposal

Four options analysed; option C selected with elements of D.

### Option A — Extend Picture-Book `speech_bubble` with bubbles[] array (REJECTED)

Picture-Book `speech_bubble` layout's `layout_config` grows
a `bubbles[]` array. Multi-bubble lives inside picture_book
book_type.

**Rejected because:** violates the existing `book_type =
"comic_book"` reservation. Mixes comic-style work into the
picture_book scope. Picture-Book users (single-bubble use
case) carry the cost of array-shape complexity for a feature
they don't need.

### Option B — Add `comic_panel` PageLayout to Picture-Book (REJECTED)

Picture-Book grows a 6th PageLayout variant `comic_panel` that
hosts multi-bubble. Still inside picture_book book_type.

**Rejected because:** same root issue as A. Comic-panel layout
semantically belongs to comic_book, not picture_book. The
schema's per-book-type plugin-ownership pattern (per Picture-
Book Phase 4 design) is the architectural commitment to
respect.

### Option C — Multi-bubble in `plugin-comics` under `book_type = "comic_book"` (ACCEPTED)

`plugin-comics` ships:

- `book_type = "comic_book"` (value already reserved; no
  migration needed)
- Its own `comic_pages` table (or reuses Picture-Book's `Page`
  table with `book.book_type = comic_book` discriminator —
  evaluated at session-1 Pre-Inspection time)
- Its own `comic_panels` table (panel hierarchy)
- Its own `comic_bubbles` table (separate table per CC
  recommendation, not JSON array — see Schema details
  below)
- Its own layouts (panel grid, splash page, etc.)
- Its own PDF/EPUB export pipeline (WeasyPrint-backed,
  parallel to picture-book's `picture_book_pdf.py`)

Picture-Book stays single-bubble. The two book_types are
independent at the plugin layer.

**Pros:**
- Respects the existing `comic_book` reservation.
- Picture-Book complexity stays bounded.
- Comic-Plugin's full feature set (panels, gutters, reading
  direction, sound effects, splash pages) lives in its own
  scope.
- Clean separation enables independent versioning.

**Cons:**
- Picture-Book + Comic-Book share zero plugin code by default.
- Multi-bubble component code lives only in plugin-comics; if
  Picture-Book ever wants multi-bubble it's a separate
  decision.

### Option D — Extract bubble as Bibliogon-core shared primitive

A `<BubbleComponent>` lives in `frontend/src/components/`,
parameterised by `{anchor, opacity, width, height, text,
tail, ...}`. Both Picture-Book and plugin-comics consume it.

**Status:** rejected as the primary path (per the Recurring-
Component Unification Rule's "When NOT to apply" clause —
speculative-abstraction before 2nd surface exists), but
**elements applied** within Option C. Specifically:

- Bubble visual/render primitive lives in `frontend/src/
  components/`.
- plugin-comics consumes it via per-bubble wrappers.
- When/if Picture-Book gains multi-bubble (NOT planned), the
  same primitive serves both.

### Selected: Option C with elements of Option D

| Aspect | Decision |
|--------|----------|
| Book-type ownership | `plugin-comics` owns `comic_book`; Picture-Book unchanged |
| Bubble entity storage | Separate `comic_bubbles` table (NOT JSON array) |
| Page model | New `comic_pages` table OR reuse `pages` with discriminator (TBD at session 1) |
| Panel hierarchy | Yes — `comic_panels` table; bubbles belong to panels, not pages |
| Bubble visual primitive | Shared in `frontend/src/components/` (Option D element) |
| Bubble assembly logic | plugin-comics owns (Option C) |
| PDF export | plugin-comics WeasyPrint walker |
| Migration burden on Picture-Book | Zero |

---

## Schema details

### Why separate tables, not JSON

JSON-in-Text scales poorly for 10+ bubbles per page (comic
strips typically have 3-8 bubbles per panel × 4-9 panels =
12-72 bubbles per page). Concrete costs:

- Per-render JSON parse cost (PageCanvas re-renders on every
  bubble edit).
- No SQL indexing on inside-JSON fields.
- Migration via read-time shims compounds with each schema
  evolution.

Separate tables sidestep all three. The plugin-comics Alembic
migration ships these tables, owned and versioned by the plugin.

### Proposed plugin-comics schema (session 1 Pre-Inspection
will finalise)

```
comic_pages
  id (uuid)
  book_id (fk books.id)
  position (int)
  layout (enum: single_panel, grid_2x2, grid_3x3, splash, irregular)
  reading_direction (enum: ltr, rtl)  -- manga support
  layout_config (json text)
  created_at, updated_at

comic_panels
  id (uuid)
  comic_page_id (fk comic_pages.id)
  position (int)  -- panel order within page
  image_asset_id (fk assets.id, nullable)
  bounds (json)  -- {x_pct, y_pct, width_pct, height_pct}
  panel_config (json)  -- border-style, gutter, motion-lines, etc.

comic_bubbles
  id (uuid)
  comic_panel_id (fk comic_panels.id)
  position (int)  -- z-order + add-order
  bubble_type (enum: speech, thought, narration, shout, whisper, sound_effect)
  anchor (json)  -- {x_pct, y_pct} OR preset string
  width_pct, height_pct (int)
  tail_direction (enum: N, NE, E, SE, S, SW, W, NW, none, auto)
  tail_position_pct (int, 0-100 along edge)
  tail_length_px (int)
  bubble_config (json)  -- per-bubble Tier-Properties
  text_content (text)  -- TipTap JSON for rich-text variants
```

The `bubbles[0]`-wrapped shape that 4c-B-2 ships for Picture-
Book's `layout_config.bubbles[0].properties` translates to
this comic_bubbles row shape cleanly — no schema redesign.

### Picture-Book Page model stays unchanged

Picture-Book continues using the existing `pages` table with
`book_type = picture_book` books. Comic-Book uses
`comic_pages` (or extends `pages` with discriminator — TBD).
No cross-book-type data sharing.

---

## Comic-specific features (out of scope for Picture-Book)

The features below are why Comic-Foundation needs its own
plugin scope, not a Picture-Book extension:

- **Panel grid layouts**: 2×2 / 3×3 / irregular / inset panels
  (small panel overlapping a larger one) / splash pages
  (single full-page panel).
- **Gutter spacing**: the whitespace between panels controls
  reading pace; configurable per-page or per-book.
- **Reading direction**: LTR (Western) vs RTL (manga). Affects
  panel-order interpretation + bubble-tail conventions.
- **Bubble-type variants**: speech (solid border) /
  thought (cloud outline) / narration (rectangle) /
  shout (jagged) / whisper (dashed) /
  sound_effect (no bubble, typography-as-illustration).
- **Motion lines / speed effects**: per-panel decoration.
- **Sound-effect text**: "BAM!" "POW!" rendered as styled
  text overlaying the panel (typography-as-illustration,
  separate from bubble content).
- **Tail-direction**: 8 octants (N/NE/E/SE/S/SW/W/NW) + none
  + auto (auto-picks nearest edge to character). Tail-position
  slider along the edge. Tail-length slider.
- **Z-order management**: which bubble renders on top when
  bubbles overlap.

None of these belong in Picture-Book's scope.

---

## Resolved decisions

### plugin-comics owns Comic-Foundation work

Picture-Book stays single-bubble. All multi-bubble + panel
+ comic-typography work ships under `plugin-comics`.

### Picture-Book stays single-bubble

The existing single-bubble shape (anchor / opacity / width /
height) is sufficient for picture-book typography. Multi-
bubble within picture-book is NOT a goal.

### 4c-B-2 Tier-Property = scope-anticipate

Ships `layout_config.bubbles[0].{properties}` shape (not flat
`layout_config.{properties}`) for forward compatibility with
plugin-comics. Cost: ~30% scope expansion. Benefit: zero
migration when plugin-comics lands.

### Tail-Triangle on single-bubble = optional Picture-Book polish

`PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01` (P3) can ship as a small
Picture-Book improvement on the existing single bubble BEFORE
plugin-comics work starts. Decision deferred to session
sequencing (see Multi-session roadmap below).

### plugin-comics timing = AFTER Picture-Book Phase 4 close

Trigger: all Picture-Book Phase 4 backlog items closed (4c-B-2
+ EXTENDED-SHAPE-01 + PDF-KDP-FORMATS-01 + PDF-BLEED-MARKS-01
+ remaining picture-book items). Plus user explicitly requests
plugin-comics start.

### Migrated backlog items

Three items from the picture-book backlog migrate to
plugin-comics scope (or update):

- **`PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01`** (P3) → CLOSED
  in picture-book scope; superseded by
  `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`.
- **`PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01`** (P5) →
  CLOSED in picture-book scope; superseded by plugin-comics
  bubble-system work (drag-to-position on plugin-comics
  multi-bubble pages).
- **`PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`** (P3) → KEPT in
  picture-book scope as optional polish on single bubble.
  Visual primitive (SVG tail rendering) reusable in plugin-
  comics regardless of when picture-book ships it.

---

## Half-wired risks + mitigation

The lessons-learned rule "Half-wired feature lifecycle"
fires when a feature ships one half of a contract without
the other half. Plugin-comics work has at least 5 concrete
half-wire risks:

### Risk 1 — Multi-bubble add without delete

Add-bubble UI lands without the corresponding delete-bubble
affordance. User adds 5 bubbles, can't remove the 3 unused.

**Mitigation:** Ship add + delete in the SAME commit. Per-
bubble row in `comic_bubbles` table makes delete a simple
DELETE statement; no excuse for half-shipping.

### Risk 2 — Multi-bubble write without read-shim

Schema migration lands with new `comic_bubbles` table but
existing-data read paths don't handle the new shape.

**Mitigation:** plugin-comics ships its own migration AND its
own read paths in lockstep. Picture-Book read paths stay
unchanged (no shared data model). Risk is naturally bounded
to plugin-comics scope.

### Risk 3 — Tail-direction picker without "no tail" option

Picker offers 8 octant directions + maybe "auto" but omits
"no tail". User can't make a thought-bubble (which has no
tail by convention) or a narration-box (also no tail).

**Mitigation:** Tail-direction enum includes `none` from day
one. Default for `bubble_type = thought` and `narration` is
`tail_direction = none`. Pin via pytest contract test.

### Risk 4 — Drag-to-position without undo

User accidentally drags bubble to wrong position; no undo.

**Mitigation:** Multi-bubble work cannot ship drag without an
undo path. Two options:
- (a) Bibliogon-wide undo system (large scope, deferred).
- (b) Per-bubble "Undo last move" affordance (lightweight,
  ships with drag).

Recommend (b) for plugin-comics v1; (a) is its own backlog
item.

### Risk 5 — N bubbles in editor without N bubbles in PDF walker

Editor shows multi-bubble; PDF export renders only the first
bubble (or none).

**Mitigation:** Every editor commit shipping bubble-count > 1
MUST also ship the corresponding PDF walker change. The
existing v0.35.0 PDF walker (`_speech_bubble_style` for single
bubble) is the wrong abstraction; plugin-comics ships its own
`_render_comic_bubbles(panel_bubbles)` walker from day one.

### Risk 6 — Bubble TipTap rich-text decision deferred indefinitely

Comic bubbles may carry rich text (bold for emphasis, italic
for thought). Decision: TipTap JSON in `comic_bubbles.text_
content` column, parallel to Picture-Book's TipTap layouts.

**Mitigation:** Session-1 Pre-Inspection MUST decide: TipTap
or plain text? If TipTap, the per-bubble TipTap editor
mount-points are non-trivial (N editors per page) — Vitest
+ Playwright coverage is mandatory.

---

## Accessibility

Multi-bubble work MUST match Bibliogon's existing a11y bar
(per the 9-position anchor grid's per-cell aria-labels, the
v0.35.1 banner's aria-live=polite, etc.). Concrete
requirements:

- **Per-bubble ARIA**: each bubble has `role="group"`,
  `aria-label="<bubble-type> by <speaker>"`, and an
  `aria-describedby` pointing at the bubble text.
- **Bubble navigation**: Tab order = z-order (front to back).
  Arrow-keys nudge selected bubble by 5% (anchor-preset
  compatible).
- **Focus order**: stable across renders; bubble identity
  preserved via uuid primary key.
- **Screen-reader announcement**: when user adds a bubble,
  `aria-live="polite"` announces "Bubble added at <position>"
  without stealing focus. Same pattern as the v0.35.1
  donation reminder banner.
- **Keyboard drag**: drag-to-position MUST have a keyboard-
  equivalent. Arrow-keys for nudge + a "Position" dialog
  with explicit number-input for x_pct/y_pct.
- **Tail-direction picker**: same 8-cell grid pattern as the
  9-position anchor grid (Finding A). Per-cell aria-labels.

---

## Open questions (deferred to implementing session)

- **comic_pages vs extending pages table**: dedicated comic-
  pages table OR add `book_type` discriminator to existing
  `pages` table? Session-1 Pre-Inspection decides; impacts
  asset reuse + cross-type queries.
- **TipTap per bubble**: yes / no / opt-in by bubble_type?
- **Bubble z-order resolution**: by position column (db-side)
  OR by user drag-to-front/back (UI-side)?
- **Reading direction enforcement**: at page level OR per
  book? RTL manga book has all pages RTL; LTR Western
  comic has all pages LTR. Probably book-level.
- **Comic-Plugin licensing**: stays `"core"` tier per
  Bibliogon's all-plugins-free phase. Re-evaluate at
  monetization-track decision time.
- **PDF format for comics**: 8.5×11 portrait? 11×17 (tabloid)?
  Manga 5.5×8.25? Multi-format like Picture-Book PDF
  (KDP-FORMATS-01)?
- **Multi-page layouts (spread)**: facing-page support for
  comic book trade-paperback printing?

---

## Multi-session roadmap

Total estimate: 16-22 commits across 3-4 sessions. Within the
session stop-condition (5-9 commits per session per
release-workflow.md).

### Session 0 (optional): Tail-Triangle on Picture-Book single
bubble

**Scope:** SVG tail rendering primitive + tail-direction +
tail-position + tail-length on the existing Picture-Book
single bubble.

**Triggers:** picture-book authoring polish OR plugin-comics
session-1 needs the primitive battle-tested before multi-
bubble.

**Estimated commits:** 2-3.

**Output:** SVG `<path>` tail renderer in `frontend/src/
components/SpeechBubbleTail.tsx`; tail-config UI in
`LayoutConfigSpeechBubble`; PDF walker emits tail; i18n
entries.

**Note:** This session is OPTIONAL — if plugin-comics
session-1 wants to start without it, the tail primitive
ships inside plugin-comics from day one.

### Session 1: plugin-comics scaffolding + Comic-Page layout

**Scope:**
- Create `plugins/bibliogon-plugin-comics/` package
- `ComicsPlugin(BasePlugin)` with `depends_on = ["export"]`
- Alembic migration: `comic_pages` table
- `comic_book` book_type wired in book-create flow
- Comic-Page editor surface (no panels yet, no bubbles —
  just a "comic book exists" foundation)
- Pre-Inspection: pages-table-reuse vs new-table decision

**Estimated commits:** 3-4.

### Session 2: Panels + Multi-Bubble (without drag)

**Scope:**
- `comic_panels` + `comic_bubbles` Alembic migrations
- Panel-grid layouts (single panel, 2×2, 3×3)
- Add-panel + delete-panel UI
- Add-bubble + delete-bubble UI (per-panel)
- Bubble-type variants (speech/thought/narration/shout/
  whisper/sound-effect)
- Anchor-preset positioning (no drag yet)
- Tail rendering (SVG primitive — reuses session 0 if
  shipped)
- PDF walker for multi-bubble
- Vitest + Playwright

**Estimated commits:** 5-7.

### Session 3: Drag-to-Position + Polish + Reading Direction

**Scope:**
- Pointer-drag handle on bubble + on panel
- Snap-to-preset within 5%
- Keyboard nudge (arrow keys, 5% step)
- Per-bubble "Undo last move" affordance
- Reading direction (LTR vs RTL) at book level
- Z-order controls (bring-forward / send-back)
- Gutter spacing config
- i18n × 8 catalogs
- E2E Playwright for full flow

**Estimated commits:** 6-8.

### Total

- 16-22 commits across 3-4 sessions.
- User-smoke gate between each session per established
  discipline.

---

## Competitor / reference study

Study these before session 1 to ground the design in real
comic-authoring workflows:

| Tool | What to learn |
|------|---------------|
| **Toon Boom Storyboard Pro** | Industry-standard storyboard + comic; bubble + tail + drag model. Reference for the "production quality" bar. |
| **Clip Studio Paint EX** | Manga-oriented; per-panel bubble system + RTL reading direction conventions. Reference for tail-direction defaults + manga-specific UX. |
| **Pixton** | Web-based comic authoring; drag-and-drop bubbles + preset characters. Reference for the casual-author UX. |
| **Krita** | Open-source raster paint; comic templates with bubble asset set. Reference for OFL-licensed bubble assets we might bundle. |
| **Affinity Publisher** | Desktop publishing; speech-bubble shapes via SVG primitive. Reference for the SVG-tail rendering approach. |
| **Comicfury / Webtoons editor** | Minimal-feature web editors. Reference for what NOT to build (avoid the cliffs of over-simplification). |

What we DO ship learn from these:

- Bubble-type variants are universal (speech / thought /
  narration / shout / whisper / sound-effect) — pin these as
  the v1 set.
- Tail-direction 8 octants + none + auto is the Toon Boom
  + Clip Studio convention.
- Drag-with-snap-to-preset is industry default (avoid pure
  free-form drag without snap).
- RTL reading direction is a book-level setting in Clip
  Studio; matches what Bibliogon should do.

What we do NOT ship (deferred):

- AI-generated characters (Pixton's territory; out of scope).
- Real-time multi-user collaboration (Webtoons; out of scope
  for offline-local-first Bibliogon).
- Tone shading / screentones (Clip Studio EX-specific; not
  a v1 need).

---

## Triggers for reconsidering

This work moves up the priority queue when:

- **Picture-Book Phase 4 fully closed** — 4c-B-2 +
  EXTENDED-SHAPE-01 + PDF-KDP-FORMATS-01 + remaining
  picture-book items at `[x]`.
- **User explicitly requests plugin-comics start** — beyond
  the single family-member-episode trigger.
- **User-research confirms comic-authoring demand** — at
  least one concrete user (beyond Aster + the original
  family-member feedback) asking for comic authoring.
- **Solo-dev bandwidth available** — plugin-comics is 16-22
  commits, 3-4 sessions; bandwidth needs to be earmarked.
- **Comic-market user signals beyond single episode** —
  pattern of users asking for the feature in GitHub Issues
  or community channels.

---

## Deferral reasoning

Why this work is deferred (not P0 / P1 / P2):

- **Picture-Book Phase 4 stability first**: Phase 4 still
  has multiple open items (4c-B-2 Tier-Property work,
  EXTENDED-SHAPE-01, PDF-KDP-FORMATS-01). Adding plugin-
  comics work mid-Phase-4 fragments solo-dev focus.
- **Substantial scope (16-22 commits)**: 3-4 sessions of
  focused work. Not a fast-follow; not a side-quest. Needs
  dedicated session bandwidth.
- **Solo-dev bandwidth constraint**: Bibliogon is a solo-dev
  AI-assisted project. Plugin-comics work would crowd out
  Picture-Book improvements + the broader v0.36.x roadmap.
- **Comic-market validation needed**: outside-the-author
  user demand should be observed before committing the
  scope. Currently 1 user-signal (family-member episode);
  not enough to commit a 3-4-session arc.

The `comic_book` schema reservation is the architectural
commitment. The implementation is the timeline question.

---

## Backlog item migrations (filed in same commit as this
rewrite)

### New backlog item

- **`PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`** (P3, trigger-
  gated): file plugin-comics + multi-session roadmap. Trigger:
  Picture-Book Phase 4 complete OR explicit user-go-ahead.

### Migrated items

- **`PICTURE-BOOK-MULTI-BUBBLE-PER-PAGE-01`** (P3) → CLOSED
  in picture-book scope. Multi-bubble work moved to
  plugin-comics architecture under
  `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`. Closure note
  references this exploration doc.
- **`PICTURE-BOOK-SPEECH-BUBBLE-DRAG-POSITION-01`** (P5) →
  CLOSED in picture-book scope. Drag-to-position belongs to
  plugin-comics' bubble-system (Session 3).
- **`PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`** (P3) → KEPT in
  picture-book scope (optional polish on existing single
  bubble per Session 0 above). Visual primitive (SVG tail)
  reusable in plugin-comics regardless of when picture-book
  ships it.

---

## Cross-references to rules + memory

- [`.claude/rules/coding-standards.md`](../../.claude/rules/coding-standards.md) — Recurring-Component
  Unification Rule. Applied as Option D elements within
  Option C (bubble visual primitive shared; bubble assembly
  logic per-plugin).
- [`.claude/rules/lessons-learned.md`](../../.claude/rules/lessons-learned.md) — Single-Source-of-Truth
  for cross-cutting concerns. Picture-Book + plugin-comics
  share the bubble visual primitive but each owns its own
  assembly + data model.
- [`.claude/rules/lessons-learned.md`](../../.claude/rules/lessons-learned.md) — Half-wired feature
  lifecycle. The 6 half-wired risks above are concrete
  applications of the rule's prevention pattern.
- [`.claude/rules/ai-workflow.md`](../../.claude/rules/ai-workflow.md) — Pre-Inspection
  discipline. The 2026-05-18 incident (stub doc shipped
  without auditing the comic_book reservation) is filed as
  a new lessons-learned entry in the same commit as this
  rewrite.
- [`.claude/rules/architecture.md`](../../.claude/rules/architecture.md) — Plugin architecture
  rules. plugin-comics conforms.
- [`children-book-plugin.md`](children-book-plugin.md) — parent
  exploration; established the `book_type` discriminator
  + per-book-type plugin ownership.

---

## Status field summary

**Current:** Awaiting Picture-Book Phase 4 close + plugin-
comics session scheduling.

**Next action:** No work until trigger fires. When triggered,
Session 0 (optional Tail polish) or Session 1 (plugin-comics
scaffolding) Pre-Inspection — whichever the user picks.
