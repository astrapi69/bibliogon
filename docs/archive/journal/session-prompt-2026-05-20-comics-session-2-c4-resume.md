# Session resume prompt — Comics-Session-2 C4 (2026-05-20)

Paste the prompt block below into the new session.

---

```
Comics-Session-2 C3 (walker + dispatch) shipped at commit b8e8c82
(local, UNPUSHED). Mid-Session-Stop is closed; C4-C7 pending.

Read first:
- docs/journal/session-handoff-2026-05-20-comics-session-2-c3-close.md
  (full state at session close: what C3 shipped, regression delta
  vs baseline, architectural decisions honoured, gotchas observed,
  recommended C4 opening move)

Discipline reminders in effect:
- Atomic-green per-commit-delta (modified atomic-green per the
  user's work-on-broken-baseline authorization).
- Don't-push-unprompted — C3 is local only; don't push C4-C7
  without explicit user GO.
- Pre-Inspection STOP gate before any non-trivial new work.
- Pre-Coding-Reality-Check: re-grep the immediate touch-surface
  at keystroke time (lessons-learned added 2026-05-20).
- Per-commit stop-condition at ~5-9 commits per session.
- Recurring-Component-Unification (2-surfaces threshold for
  UI patterns).
- Single-Router-Per-Plugin convention (lessons-learned added
  2026-05-20).
- Half-Wired-Lifecycle Prevention: every write surface needs its
  consumer in the same commit; every new query-param needs ALL
  callers updated or filed.

Current state:
- Latest tag: v0.35.1 (LIVE on GitHub)
- HEAD (local main): b8e8c82 (C3 unpushed)
- HEAD on origin/main: ebcfc3e (1 commit behind local)
- Working tree: clean
- Full backend sweep: 14 failed + 13 errored vs baseline 13+13
  (+1 pure recursion-cascade in already-failing class; no new
  logic-level failures)

Architectural decisions to preserve in C4-C7:
- Q1 β: page-level grid template in Page.layout_config.comic_grid_template
- Q2 a: plain-text bubbles (TipTap deferred to Session 3+)
- Q4 a: reuse picture-book KDP formats + bleed-marks pattern
- One-way dependency: plugin-export does NOT depend on plugin-comics
- Single-Router-Per-Plugin: one router per get_routes()
- Field-name parity: ComicBubble.bubble_config mirrors picture-book
  layout_config.bubbles[0] shape (Tier 1+2 properties)

Pending streams (in order):

1. C4 — Frontend BubbleTail.tsx SVG primitive + 6 bubble-type CSS
   variants + Vitest. Mirror the walker's _TAIL_DIRECTION_VECTORS
   and _BUBBLE_TYPE_CSS verbatim in TypeScript so the in-editor
   preview matches the rendered PDF.

2. C5 — ComicPanelGrid + ComicPanel + ComicBubble + LayoutConfigComicBubble
   React components + Tier1Section / Tier2Section extraction
   (Recurring-Component-Unification: mirror picture-book layout-config
   pattern; check for shared primitives at 2-surfaces threshold).

3. C6 — Full ComicBookEditor.tsx shell + PdfExportControls rename
   (extend from picture-book-only to comic-book also per
   PDF-BLEED-MARKS-01 C2 pattern) + plugin version 1.0.0 → 1.1.0.

4. C7 — i18n × 8 catalogs + Playwright (3 specs) + backlog close
   (PLUGIN-COMICS-SESSION-2) + Session 3 deferred-tracker + archive.

Recommended opening move:

Pre-Inspection (STOP gate) on C4 specifically:
- grep frontend for existing BubbleTail-shaped patterns
  (none expected; picture-book has no tail primitive)
- grep for useBubbleType-shaped hooks (none expected)
- confirm walker's _TAIL_DIRECTION_VECTORS + _BUBBLE_TYPE_CSS
  shapes can be mirrored verbatim in TypeScript
- check whether any existing SVG-primitive component lives near
  the picture-book frontend that should be extracted/shared
- surface findings + commit plan BEFORE writing any code

If "continue" or "next item" is the opening message: interpret as
"resume C4 per Pre-Inspection" — not "start a new feature".

Open questions to surface to the user when reached:
- Push C3 to origin now, or batch C3-C7 in one push at session end?
- C5 component extraction granularity: if picture-book +
  comic-book share a Tier1Section primitive at 2-surfaces, extract
  now (Recurring-Component-Unification fires) — or ship comic-book
  version first and extract in a follow-up?
- C6 PdfExportControls: rename in place or create a shared component
  that picture-book + comic-book both consume?
```
