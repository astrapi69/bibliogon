# Pre-Inspection — PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01

**Filed:** 2026-05-20
**Status:** Reference document. Audit findings preserved for when the
EXTENDED-FEATURES session lands. **NOT being adjudicated** in the
current session-scope — superseded by the 3 user-findings audit
(`docs/audits/comic-multi-panel-bug-plus-scope-2026-05-20.md`
when filed; OR the chat-thread that produced it).

**State at audit:** HEAD `43f0429` on `origin/main`; backend
baseline 2116/2116/0/0 clean.

---

## Track 1: Backlog entry verification

Backlog entry at `docs/backlog.md:1444` matches expected scope
verbatim. All 9 sub-features present. Effort estimate
"8-12 commits across 1-2 sessions". Priority P3 trigger-driven;
all 3 trigger conditions met.

---

## Track 2: Architecture audit per sub-feature

### #9 Auto-tail nearest-edge picker

- γ-shim at [BubbleTail.tsx:76](../../frontend/src/components/comics/BubbleTail.tsx#L76):
  `const canonicalDirection = direction === "auto" ? "S" : direction;`
- Pure frontend; no backend touch. Mirror in walker
  ([comic_book_pdf.py:220](../../plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py#L220)).
- Geometry: nearest-edge from bubble-anchor vs panel-bounds.
- **Estimate: 2 commits** (frontend + walker mirror).

### #6 Panel-gutter UI — Q1 ⚠️ architecture decision

- `panel_config` is per-panel JSON-as-Text column ✓
- Gutter is page-level (gap between panels in CSS grid), NOT per-panel.
- Current gutter hardcoded:
  [ComicPanelGrid.tsx:101](../../frontend/src/components/comics/ComicPanelGrid.tsx#L101)
  `gap: "6px"`; walker [comic_book_pdf.py:489](../../plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py#L489)
  `gap: 6pt`.
- **Audit recommendation:** store gutter on `Page.layout_config`
  (gutter is a property of the page-grid, not of an individual
  panel). Backlog wording "in panel_config" conflicts.
- **Estimate: 2-3 commits** (Page.layout_config schema check +
  new LayoutConfigComicPage component + walker integration + tests).

### #5 z-order controls — Q2 ⚠️ design decision

- ComicBubble docstring ([models/__init__.py:1037](../../backend/app/models/__init__.py#L1037)):
  *"position doubles as add-order + initial z-order. Session 3
  adds explicit z_order column + drag-to-front/back controls"*.
- Two paths:
  - **(a)** Add `ComicBubble.z_order` column + migration
  - **(b)** Reuse `position` as z-order + swap-via-mutation endpoint
- Foundation a11y mandate ([comic-foundation.md:475](../explorations/comic-foundation.md#L475)):
  Tab order = z-order.
- **Audit slight preference: (a)** column path. Cleaner semantics
  vs migration cost trade-off.
- **Estimate: 2-3 commits** for (a); 1-2 for (b).

### #4 Reading direction LTR/RTL — backend column required

- No existing `Book.reading_direction` column.
- Foundation ([comic-foundation.md:503](../explorations/comic-foundation.md#L503)):
  "probably book-level".
- New `Book.reading_direction` column + Alembic migration; default
  `"ltr"`; Pydantic Literal `{ltr, rtl}`.
- Bubble-traversal logic affects Tab-order. Couples with #5.
- PDF walker affected (page-turn direction).
- **Estimate: 3 commits** (migration + UI toggle + walker + traversal-logic + tests).

### #1 Drag-to-position — NEW drag foundation

- No existing free-position drag pattern in Bibliogon. All
  `@dnd-kit` usages are `useSortable` (list-reorder).
- `@dnd-kit/core` `useDraggable` + custom `DragOverlay` is the
  approach. Dependency already installed.
- Foundation a11y mandate ([comic-foundation.md:484](../explorations/comic-foundation.md#L484)):
  keyboard-drag MUST have equivalent → couples #1 + #2.
- Anchor write-path is debounced (300ms) already in
  LayoutConfigComicBubble.
- Pure frontend; no backend touch (anchor.x_pct/y_pct schema unchanged).
- **Estimate: 3 commits** (useDraggable wiring + debounce + Vitest + Playwright).

### #2 Snap-to-grid + keyboard-nudge

- Couples with #1 per a11y mandate.
- `useKeyboardShortcuts` hook reusable.
- 5%-grid nudge per [comic-foundation.md:478](../explorations/comic-foundation.md#L478).
- **Estimate: 2 commits** (after #1 lands).

### #3 Per-bubble undo/redo — Q3 ⚠️ scope decision

- No existing undo pattern outside TipTap-internal. `notify.bulkAction`
  is toast-undo (different shape).
- Backlog says "separate from global undo" → Comics-scoped stack.
- In-memory `Array<{type, bubbleId, prevState, nextState}>`.
- Backend persistence: NO (across-sessions is unusual).
- Keyboard: Ctrl+Z + Ctrl+Shift+Z via `useKeyboardShortcuts`.
- **Q3 scope ambiguity:** scoped (drag + add/delete only) vs
  full (every field change).
- **Audit recommendation:** scoped. Tier1/Tier2 changes are
  debounced + form-driven; undoing them is unnatural.
- **Estimate: 3 commits** scoped; up to 5 if full.

### #8 Full Playwright E2E coverage matrix

- Existing 3 specs:
  `comic-book-editor.spec.ts`, `comic-panel-bubble-crud.spec.ts`,
  `comic-book-editor-a11y.spec.ts`.
- "Long-suite full-regression" per backlog.
- **Estimate: 1-2 commits** at end of session.

---

## Track 3: Dependency-graph + sequencing

```
Independent:    #9 Auto-tail
                #6 Panel-gutter UI  (Q1)
                #4 Reading-direction  (backend migration)
                #5 z-order  (Q2)

Chained:        #1 Drag → #2 Snap+nudge  (a11y mandate; SHIP TOGETHER)

Couples to #1:  #3 Per-bubble undo  (Q3; undoing drag is killer feature)

Last:           #8 E2E matrix

Deferred:       #7 TipTap-in-bubbles (v2)
```

**Commits estimate (realistic):** 17-23. Backlog estimate
"8-12" is optimistic.

### Session-split (Q4 ⚠️ decision)

- **Option α** single session — NOT RECOMMENDED (17-23 commits)
- **Option β** 2 sessions — RECOMMENDED baseline
  - Session 3a Independent Polish (#9 + #6 + #5 + #4): 8-10 commits
  - Session 3b Drag + Undo + Matrix (#1 + #2 + #3 + #8): 8-12 commits
- **Option γ** trigger-driven granular (mini-sessions): defensible alternative

---

## Track 4: RCU cross-references

| Sub-feature | Existing pattern? | Reuse? |
|---|---|---|
| #1 Drag-to-position | NO (only list-sortable @dnd-kit) | NEW foundation |
| #3 Undo-redo | NO (notify.bulkAction is toast-undo) | NEW foundation |
| #4 LTR/RTL | NO direction-aware components | NEW |
| #5 z-order | NO z-index management; sortedBubbles by `position` | NEW (column OR position-swap) |
| #6 Panel-gutter | Tier1/Tier2 RCU primitives | REUSE Tier-Section pattern |
| #2 Arrow-nudge | `useKeyboardShortcuts` hook | REUSE |
| #3 Ctrl+Z handler | `useKeyboardShortcuts` hook | REUSE |
| #4 Pydantic Literal | `BubbleType` + `BubbleTailDirection` | REUSE |
| Debounced API updates | `useDebouncedCallback` | REUSE |

**No refactor-first prerequisites.**

---

## Track 5: Stop-conditions audit

### Backend schema changes
- #4 RTL: `Book.reading_direction` column + migration
- #5 z-order (path a): `ComicBubble.z_order` column + migration
- #6 panel-gutter: none (uses existing Page.layout_config JSON)

### Architecture-coupling
- #4 RTL touches BookMetadataEditor + plugin-comics PDF walker (minimal)

### Pre-existing bugs uncovered
None.

### Test-baseline impact
- Migrations: ~10-15 backend tests per migration
- Vitest: ~5-15 cases per sub-feature
- Playwright: ~3-5 smokes + 1 matrix spec
- Baseline 2116 expected to hold (PluginForge 0.8.0 cascade fix shipped)

### Shared architecture decisions (4 Q's open)
1. **Q1 #6 storage location** — `Page.layout_config` (recommended) OR `panel_config`?
2. **Q2 #5 z-order design** — column (recommended) OR position-swap?
3. **Q3 #3 undo scope** — scoped (recommended) OR full?
4. **Q4 session-split** — α/β/γ? Recommend β.

---

## Summary

- Backlog NO drift; 9 sub-features confirmed
- Effort estimate IS optimistic (8-12 → realistic 17-23)
- 2 backend migrations likely (RTL + possibly z_order)
- New drag foundation required
- #1+#2 inseparable per a11y mandate
- #3 strongly couples to #1
- RCU reuse opportunities for #6 via Tier-Section pattern
- No refactor-first prerequisites
- Baseline 2116 expected to hold

**Status:** Findings preserved as reference. Q1-Q4 await
adjudication when EXTENDED-FEATURES session-start fires (after
the current 3-user-findings session closes).

---

## Companion docs

- This file: EXTENDED-FEATURES Pre-Inspection (reference)
- Companion (current-session work): the 3-user-findings audit
  (multi-panel-bug + panel-image-upload + LayoutConfigComicPanel)
- Comics-Session-2 close archive entry: `docs/archive/roadmap/2026-05.md`
- Comic-Foundation exploration: `docs/explorations/comic-foundation.md`
