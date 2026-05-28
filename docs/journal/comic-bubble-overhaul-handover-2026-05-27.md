# Comic Bubble Visual Overhaul — Handover (2026-05-27)

Long-form state document for continuing the comic-bubble visual
overhaul (approach A — single SVG path + bezier tail) in a new
session. This doc replaces conversation context; it is
self-contained.

## TL;DR

- The **path-generator approach A** is already implemented and
  shipped (commits `89137e0` frontend + `3183d2b` walker mirror
  + `9b65064` axe-core fixes). Bubble outline + tail now render
  as ONE ``<svg>`` with ONE ``<path>``; the bubble-mode CSS-
  shape + separate ``<BubbleTail>`` polygon are gone.
- The plan in the kickoff message presumed undone work. Most of
  Session 1 (C1-C7) is already shipped; the behavioral details
  for **thought**, **shout**, and **narration** diverge from the
  plan's spec.
- An adjudication question is **OPEN**: Path A (literal plan
  execution including rename/move) vs Path B (behavioral gaps
  only). My recommendation: **Path B**.
- The Pre-Inspection at the start of the previous session
  surfaced this discrepancy and stopped for adjudication. No
  code shipped after that stop.

## What the plan called for

The kickoff said: ship a phased commit plan that replaces every
bubble's CSS-styled-div shape + separate-SVG-polygon-tail with a
**single ``<svg>`` per bubble carrying ONE ``<path>``** for the
outline + tail integrated as one continuous shape, plus a text
overlay div on top.

Six bubble types, each with its own outline geometry:

| Type | Shape | Tail integration |
|---|---|---|
| **speech** | Ellipse via 4 cubic beziers (kappa = 0.5522847498) | 2 cubic beziers from base-left → tip → base-right, S-curve organic look |
| **thought** | Rounded-rect (4 lines + 4 arcs) | **NO integrated tail; instead 2-3 progressively smaller circles in the tail direction** |
| **narration** | Rectangle (4 lines, optional 2-4px corner radius) | **NO tail ever** (force `tail_direction="none"`) |
| **shout** | 20-vertex star polygon | **Extend the spike closest to `tail_direction` by `tail_length_px`** (natural geometry, no separate path) |
| **whisper** | = speech path + `stroke-dasharray="6 4"` + `stroke-linecap="round"` + `fill-opacity: 0.9` | Same as speech (bezier S-curve) |
| **sound_effect** | No SVG shape | No tail; text overlay only |

Mirror discipline: every path-generation function in TS AND
Python; same inputs → byte-identical path strings; verified via
cross-language snapshot tests.

Plan-mandated file layout:
- TS: `frontend/src/components/comics/generateBubblePath.ts`
- Py: `plugins/bibliogon-plugin-export/bibliogon_export/bubble_path.py`

Signature:
```typescript
generateBubblePath(
  type: BubbleType,
  width: number,
  height: number,
  tailDirection: TailDirection,
  tailPositionPct: number,
  tailLengthPx: number,
  borderRadius: number
): string
```

Phased commit plan (Session 1 = 8 commits; Session 2 = 5
commits):

- **C1** TS path generator + snapshot tests
- **C2** Python mirror + cross-language snapshot tests
- **C3** ComicBubble migrated to single SVG path (speech only,
  progressive)
- **C4** Walker migrated for speech (progressive)
- **C5** Thought circle-chain (TS + Py)
- **C6** Narration + Sound Effect (trivial, ship together)
- **C7** axe-core fixes + new i18n
- **C8** Playwright smoke for new rendering
- **C9** Shout star + extended spike (TS + Py)
- **C10** Whisper (Speech + dashed)
- **C11** Remove `BubbleTail.tsx` + old CSS shape classes
- **C12** Cross-type integration pins + visual regression
- **C13** Backlog close + help docs

## What's actually shipped

Recent commit history (newest first):

```
3183d2b feat(comics): walker mirror for single SVG path bubble+tail
89137e0 feat(comics): single SVG path bubble+tail (approach A, frontend)
9b65064 fix(a11y): button-name + contrast for comic editor (axe-core)
a3a6ca9 feat(comics): drag-to-position for the bubble tail tip
e67292d fix(comics): preserve tail protrusion distance after overlap+mask sizing tweak
1eb0011 feat(comics): bubble + tail render as one continuous shape (overlap + mask)
7b6977b feat(comics): pointer-drag comic bubbles on the canvas
```

Concrete state per file:

### `frontend/src/components/comics/bubblePath.ts`

Pure module exporting `buildBubblePath` (NOT `generateBubblePath`
per plan). Covers all 6 bubble types with bezier-curved tail
diversion.

- `buildBubblePath(input: BubblePathInput): BubblePathOutput`
  returns `{d, viewBox, bubbleLeft, bubbleTop, bubbleWidth,
  bubbleHeight}`.
- Per-type generators inside the module:
  `ellipsePath(cx, cy, rx, ry, tail, dir)` — speech (4 cubic
  beziers + tail as separate closed sub-path overlapping bubble
  interior by 2 units).
  `roundedRectPath(left, top, w, h, rx, ry, tail, dir)` —
  thought / whisper / narration. Tail INTERLEAVED into the
  outline trace at the relevant edge.
  `shoutPath(left, top, w, h, tail, dir)` — 20-vertex star;
  tail appended as separate closed sub-path overlapping bubble
  interior by 3 units.
- `tailSubpath(baseLeft, baseRight, tip, direction)` returns 2
  cubic beziers (`bulgeFactor = 0.55`, `tipPullback = 0.15`).
- ViewBox is `0 0 width height` (bubble bbox); tail coords
  extend OUTSIDE via SVG `overflow: visible`.

### `frontend/src/components/comics/bubblePath.test.ts`

15 vitest cases pinning:
- sound_effect returns empty path
- narration emits rectangle
- speech emits cubic beziers
- thought emits 4 arc commands
- whisper = thought d-string
- shout emits 20-vertex polygon
- tail emits cubic beziers (one per side) for all 5 non-soundeffect types
- viewBox stays at bubble bbox; tail path coords extend past

### `frontend/src/components/comics/ComicBubble.tsx`

Renders via `buildBubblePath` + an SVG `<path>` + a text-overlay
`<div>`. Old CSS-class-based shape (`BUBBLE_BASE_CLASS`,
`bubbleTypeClassName`) NO LONGER applied. The existing
drag-to-position handle + bubble-drag handlers still work.

Per-type defaults baked in (`defaultFill`, `defaultStroke`,
`defaultStrokeWidth`, `defaultStrokeDasharray`); `bubble_config`
overrides flow into SVG `fill` / `stroke` / `stroke-width` /
`stroke-dasharray`.

Test IDs:
- `comic-bubble-${id}` — the bubble root div (interactive,
  carries role="button" + aria-label fallback for empty
  text_content)
- `bubble-shape-svg-${id}` — the SVG element
- `bubble-shape-path-${id}` — the `<path>` inside

The new testids deliberately avoid the `comic-bubble-` prefix
because `[data-testid^="comic-bubble-"]` selectors elsewhere
(e.g. `ComicPanel.test.tsx`) would overmatch otherwise. Per the
existing "Prefix testid selectors match every nested testid"
lessons-learned rule.

### `frontend/src/components/comics/BubbleTail.tsx`

**LEGACY** — no longer rendered by any component. Still in the
tree because:
1. `ComicBubble.tsx` imports the `BubbleTailDirection` type from
   it (`import type {BubbleTailDirection} from "./BubbleTail";`)
2. `tailDerivation.ts` also imports the type
3. The component's `BubbleTail` function export is unused

Action item for C11: either delete the file (move
`BubbleTailDirection` type to a shared types module) or keep
just the type export and delete the component body.

### `frontend/src/components/comics/tailDerivation.ts`

Pure functions for drag-to-position math:
- `computeVisibleTipPosition` — forward (data fields → visible
  tip xy)
- `deriveTailFromTip` — inverse (drag tip xy → 8-octant snap →
  field values)

UNCHANGED by the approach A migration. Drag handle still
functional. 14 vitest cases pass.

### `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py`

Python mirror of `bubblePath.ts` lives INLINE (not in a
separate module). Functions:
- `_build_bubble_path(shape, width, height, tail_direction,
   tail_position_pct, tail_length_px)` → SVG path d-attr
- `_ellipse_path`, `_rounded_rect_path`, `_shout_path` (mirror
  the TS helpers)
- `_tail_subpath` (mirror the TS bezier-subpath helper)
- `_compute_tail_geometry`
- `_BUBBLE_DEFAULT_FILL/STROKE/STROKE_WIDTH/DASHARRAY` dicts

`_render_comic_bubble` now emits:
```html
<div class="comic-bubble" data-bubble-type="..." style="positioning">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow: visible">
    <path d="..." fill="..." stroke="..." stroke-width="..." stroke-dasharray="..." stroke-linejoin="round" />
  </svg>
  <div style="text overlay css"><span>{text}</span></div>
</div>
```

The legacy `_render_bubble_tail_svg` function is still in the
module (back-compat) but no longer called by `_render_comic_bubble`.

### `backend/tests/test_comic_book_pdf.py`

79 tests passing. Recent updates (commit `3183d2b`):
- `test_render_comic_bubble_emits_svg_path_when_tail_direction_set`
- `test_render_comic_bubble_no_tail_for_direction_none`
- `test_render_comic_bubble_applies_bubble_config_background_color`
  (asserts SVG `fill` attr, not CSS `background-color`)

## Gap analysis vs the kickoff's plan

| Plan item | Status | Differences |
|---|---|---|
| **C1** TS generator + tests | ✓ shipped (`89137e0`) | Named `buildBubblePath`, not `generateBubblePath`. File `bubblePath.ts`, not `generateBubblePath.ts`. 15 cases, not snapshot-shaped. |
| **C2** Python mirror + tests | ✓ shipped (`3183d2b`) | Lives inline in `comic_book_pdf.py` (plugin-comics), NOT in `bibliogon-plugin-export/.../bubble_path.py`. No cross-language byte-identical snapshot tests. |
| **C3** ComicBubble migration | ✓ shipped (`89137e0`) | All 6 types migrated at once, NOT progressive per-type. |
| **C4** Walker migration | ✓ shipped (`3183d2b`) | All 6 types at once. |
| **C5** Thought circle-chain | ✗ **BEHAVIORAL GAP** | Current: thought uses rounded-rect with bezier tail (same generator as whisper). Plan: rounded-rect with NO tail + 2-3 progressively smaller circles. |
| **C6** Narration | ✗ **BEHAVIORAL GAP** | Current: narration accepts a tail. Plan: narration has NO tail ever (force `tail_direction="none"`). |
| **C6** Sound effect | ✓ matches plan | Empty path, text-only overlay. |
| **C7** axe-core fixes | ✓ shipped (`9b65064`) | Fullscreen button, ComicBubble role-button, tail handle role+label, ComicPanel role-button, plugin-info contrast. |
| **C7** New i18n for migration | ⚠ partial | Aria-label on tail-drag handle is hardcoded English (`"Drag the tail tip to reposition"`). Should be an i18n key. |
| **C8** Playwright smoke for new rendering | ✗ TBD | No visual-regression baseline yet. |
| **C9** Shout star + extended spike | ✗ **BEHAVIORAL GAP** | Current: 20-vertex star + tail appended as separate closed sub-path. Plan: extend the spike closest to `tail_direction` by `tail_length_px`. |
| **C10** Whisper | ⚠ partial | Whisper uses the same rounded-rect d-attr as thought today, NOT the same speech d-attr. Plan: whisper = speech path + dashed stroke. |
| **C11** Remove BubbleTail.tsx + CSS shape classes | ✗ TBD | `BubbleTail.tsx` still exports `BubbleTailDirection` type. `bubble-types.module.css` still in tree (no longer applied). `_render_bubble_tail_svg` still in walker. |
| **C12** Cross-type integration pins + Playwright | ✗ TBD | |
| **C13** Backlog close + docs | ✗ TBD | |

## The two paths

**Path A — literal plan execution.** Rename `buildBubblePath` →
`generateBubblePath`, move the Python mirror from
`bibliogon-plugin-comics/.../comic_book_pdf.py` to
`bibliogon-plugin-export/.../bubble_path.py`, add the
cross-language byte-identical snapshot test infrastructure, then
fix the behavioral gaps. Estimated 8-10 commits.

**Path B — behavioral gaps only.** Implement the 3 behavioral
differences (thought circle-chain, shout spike-extension,
narration no-tail) + whisper-as-speech-path + Playwright smoke +
remove BubbleTail.tsx legacy + close-out. Estimated 5-6 commits.

### Recommendation: Path B

Rationale:
- Renaming `buildBubblePath` → `generateBubblePath` is naming-
  convention churn that doesn't change behavior or testability.
  The cost is touching every callsite (ComicBubble + tests +
  walker references); the benefit is style-compliance only.
- Moving the Python mirror to `bibliogon-plugin-export` is
  arguably cleaner (export is the shared cross-plugin module),
  but it has cost: comics imports from export today, so this
  inverts an existing dependency. Worth doing IF the path
  module truly becomes a cross-plugin shared utility, but with
  only comics consuming it, putting it in comics is fine.
- Cross-language byte-identical snapshot tests are nice safety
  but the existing TS + Python tests both pin behavior. The
  byte-identical pin is a stricter contract than necessary —
  if either side is correct independently, the rendering works.
  Could ship as a follow-up.
- The 3 behavioral gaps + whisper-shape + Playwright are real
  user-visible value.

If the next session prefers Path A, it's still viable — just
costs more commits for less user-visible improvement.

## Stop-condition assessment

From the kickoff's stop conditions:

| Condition | Status |
|---|---|
| Ellipse bezier approximation produces visible artifacts at small sizes (< 40px) | Untested. The kappa=0.5522847498 is the mathematically optimal 4-cubic approximation; should be fine. Verify with the Playwright smoke (C8). |
| WeasyPrint doesn't render complex SVG paths correctly in PDF export | Untested in this session. The walker emits the same shape it always did (just with new path d-attr). Need to run `make test-plugin-comics` + a real export to confirm PDF output. |
| Text overlay positioning breaks (z-index, overflow) | Verified via vitest. ComicBubble's overflow: visible + SVG pointer-events: none + text overlay inset:0 with pointer-events:none doesn't conflict with the bubble's interactive surface. |
| Shout star polygon doesn't compose with tail extension | Currently composed as separate sub-path (works). Path B's spike-extension approach is cleaner but untested. |
| Cross-language snapshot mismatch | Not enforced today. Each side has independent tests; if they drift, only one side's tests catch the drift. |
| Drag-to-position handle breaks after refactor | Verified — handle still functional. `tailDerivation.ts` unchanged; the handle is a sibling element to the SVG, positioned independently. |

## Gotchas / lessons learned this arc

1. **Testid prefix overmatch** — when adding new SVG / path
   elements as children of a `data-testid="comic-bubble-${id}"`
   div, do NOT use the same `comic-bubble-` prefix. Use a
   different prefix like `bubble-shape-` to avoid the
   `[data-testid^="comic-bubble-"]` overmatch in other tests
   (e.g. `ComicPanel.test.tsx`). This rule is already filed in
   `.claude/rules/lessons-learned.md` ("Prefix testid selectors
   match every nested testid that shares the prefix").

2. **IDE diagnostics around cross-plugin imports** — the
   IDE-attached diagnostics for
   `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py`
   show errors for `bibliogon_export.picture_book_pdf` +
   `bibliogon_export.picture_book_fonts` + `weasyprint` because
   the per-plugin pyproject.toml's import root is the plugin's
   own dir. These imports DO resolve at runtime (path-deps in
   the plugin's pyproject + backend's poetry.lock). Ignore the
   IDE error messages; verify via `poetry run pytest`.

3. **Pre-existing ruff F401 + I001 in `comic_book_pdf.py`** —
   `PICTURE_BOOK_FORMATS` + `_resolve_picture_book_format`
   imports are unused. `import math` was added in this arc but
   is properly sorted. The unused imports are pre-existing
   debt; they would be a clean-up in a separate commit (e.g.
   alongside C11 when removing the legacy `_render_bubble_tail_svg`).

4. **SVG viewBox + overflow: visible** — the path generator
   emits viewBox=`"0 0 width height"` (bubble bbox); tail path
   coords extend OUTSIDE this range and render via
   `overflow: visible` on the SVG element. This required a
   `style: {position: absolute; inset: 0; overflow: visible;
   pointer-events: none;}` on the SVG; the bubble container div
   also needs `overflow: visible` (default for div, but
   explicitly set in the new code).

5. **Cross-language float formatting** — both TS and Python
   format coords via `toFixed(1)` / `f"{n:.1f}"` and strip
   trailing ".0" via regex / slice. The two implementations
   produce identical strings for the same numeric inputs.
   Verified by manual spot-check; NOT enforced by an automated
   cross-language test.

6. **`-0.0` vs `0.0` in SVG strings** — JavaScript's
   `(-0).toFixed(1)` returns `"-0.0"` while Python's `f"{-0:.1f}"`
   returns `"-0.0"` too. So they match. But initial test
   assertions that expected `"-0.0"` for a value that came out
   `"0.0"` (depending on the upstream computation's sign
   handling) tripped a Vitest test once. Resolved by using
   `parseFloat(attr)` numeric comparison instead of string
   comparison for the line endpoint coords.

7. **PluginInfo opacity → text-muted** — the axe-core color-
   contrast violation was on a `style={{opacity: 0.7}}` block
   in ComicBookEditor. Opacity multiplies the foreground color
   toward the background and often drops contrast below 4.5:1.
   Always use `color: var(--text-muted)` instead — theme-
   coordinated muted palette guaranteed AA-compliant across
   all 5 themes.

8. **Tail drag handle aria-label** — the handle has
   `aria-label="Drag the tail tip to reposition"` hardcoded.
   This is the one user-facing string in the recent changes
   that wasn't i18n-keyed. Add a key like
   `ui.page_editor.config.comic_bubble.drag_tail_handle` and
   propagate to all 8 i18n catalogs.

9. **`buildBubblePath` callsites** — only TWO production
   callsites in TS: `ComicBubble.tsx` line 457 (in the render
   block). One callsite in tests. Renaming to
   `generateBubblePath` (Path A) touches 1-3 files in TS + the
   equivalent Python.

10. **Approach B (overlap+mask) leftovers** — the `bubblePath.ts`
    module's `ellipsePath` and `shoutPath` functions still use
    the "separate closed sub-path overlapping bubble interior
    by N units" pattern for the tail. This is approach-B-like;
    Path B's spike-extension for shout would replace this. For
    speech (ellipse), the separate closed sub-path is the
    pragmatic choice because integrating the tail bezier into
    a single closed path around an ellipse is geometrically
    complex (the bezier joins at non-tangent points on the
    ellipse).

11. **`backend/config/i18n/*.yaml` parity** — i18n parity test
    (`test_i18n_parity.py`) covers 75 keys × 8 catalogs. Adding
    new keys requires updating all 8. Current state: 75/75
    parity green.

## File index

Files touched in this arc:

```
frontend/src/components/comics/bubblePath.ts        NEW (89137e0)
frontend/src/components/comics/bubblePath.test.ts    NEW (89137e0)
frontend/src/components/comics/ComicBubble.tsx       refactored (89137e0)
frontend/src/components/comics/ComicBubble.test.tsx  refactored (89137e0)
frontend/src/components/comics/ComicPanel.tsx        a11y label (9b65064)
frontend/src/components/comics/BubbleTail.tsx        LEGACY (only type export still used)
frontend/src/components/comics/bubbleTypeStyle.ts    UNUSED by ComicBubble (still imported elsewhere?)
frontend/src/components/comics/bubble-types.module.css UNUSED for shape; text styling still applied?
frontend/src/components/comics/tailDerivation.ts     unchanged
frontend/src/components/comics/tailDerivation.test.ts unchanged
frontend/src/components/ComicBookEditor.tsx          a11y + contrast fixes (9b65064)
plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py  walker mirror (3183d2b)
backend/tests/test_comic_book_pdf.py                 regression pins (3183d2b)
```

Test surfaces:

```
Vitest:    2276 passing
pytest:    2302 passing + 1 skipped
i18n:      75/75 parity green
tsc:       clean
ruff:      pre-existing F401 + I001 in comic_book_pdf.py (not introduced by this arc)
```

## Concrete next-session commit plan (Path B)

If the next session chooses Path B:

**C(B1)** `feat(comics): thought bubble circle-chain (replaces tail diversion)`
- TS: in `bubblePath.ts`, special-case `shape === "thought"`:
  emit rounded-rect WITHOUT tail integration (pass `tail=null`
  to `roundedRectPath`).
- TS: in `ComicBubble.tsx`, when `bubble_type === "thought"` and
  `tail_direction !== "none"`, render 2-3 progressively smaller
  `<circle>` elements as children of the SVG. First circle:
  `radius = max(12, bubble_height_norm * 0.12)`. Each next:
  `prev_radius * 0.6`. Position: from bubble edge in the
  tail_direction vector, spaced by `tail_length_px / 3`.
- Python mirror in `comic_book_pdf.py`: same circle-chain
  emission, same algorithm.
- Vitest: 3+ cases (no integrated tail, circles exist, sizing
  follows the spec).
- pytest: 1-2 cases for the walker.

**C(B2)** `feat(comics): shout star with extended spike for tail`
- TS: in `bubblePath.ts`, `shoutPath` rewrites. Compute the
  20-vertex star vertices as today. Identify the OUTER-radius
  vertex closest to `tail_direction`. Extend that vertex by
  `tail_length_px` along the direction vector. The 2 adjacent
  INNER-radius vertices form a natural base. No separate
  closed sub-path.
- Python mirror.
- Vitest + pytest cases.

**C(B3)** `feat(comics): narration has no tail; whisper = speech path`
- TS: in `bubblePath.ts`, force `tail = null` when `shape ===
  "narration"`. And: route `shape === "whisper"` to
  `ellipsePath` (not `roundedRectPath`). Whisper renders the
  speech ellipse with dashed stroke applied by the consumer
  (ComicBubble already sets `stroke-dasharray: "4 3"` for
  whisper; update to `"6 4"` per the kickoff spec + add
  `stroke-linecap: round` + `fill-opacity: 0.9`).
- Python mirror.
- Vitest + pytest.

**C(B4)** `feat(comics): i18n key for tail drag handle aria-label`
- Add `ui.page_editor.config.comic_bubble.drag_tail_handle:
  "Drag the tail tip to reposition"` to en.yaml + translations
  to other 7 catalogs.
- Replace hardcoded English in ComicBubble.tsx.
- i18n parity stays green.

**C(B5)** `test(comics): Playwright smoke for new bubble rendering`
- One spec, multiple scenarios: create each of 6 bubble types,
  assert bubble-shape-svg-${id} is visible, screenshot for
  visual-regression baseline.

**C(B6)** `refactor(comics): remove BubbleTail.tsx + legacy walker code`
- Move `BubbleTailDirection` type to a shared types module
  (`bubble-types.ts` or similar in the comics dir).
- Delete `BubbleTail.tsx`.
- Delete `_render_bubble_tail_svg` from `comic_book_pdf.py`.
- Fix pre-existing F401 + I001 ruff issues while touching the
  file.
- Optionally remove `bubble-types.module.css` shape classes
  (keep text-styling classes if any).

**C(B7)** `docs(comics): backlog close + help docs update + archive`
- Close `COMIC-BUBBLE-VISUAL-OVERHAUL-01` in `docs/backlog.md`
  (if filed) or in the next backlog hygiene pass.
- Update help docs at `docs/help/{de,en}/...` if any reference
  bubble shapes/types.
- Archive close-out at `docs/archive/roadmap/2026-05.md` (or
  `2026-06.md` depending on date).

Total: 7 commits. Each atomic-green, each independently
verifiable.

## Concrete next-session commit plan (Path A)

Add 2 commits at the start before C(B1)-C(B7):

**C(A0a)** `refactor(comics): rename buildBubblePath → generateBubblePath`
- Rename function + file: `bubblePath.ts` → `generateBubblePath.ts`.
- Update 2-3 callsites in TS.
- Python: rename `_build_bubble_path` → `_generate_bubble_path`
  for consistency.
- Tests: rename `bubblePath.test.ts` →
  `generateBubblePath.test.ts`.

**C(A0b)** `refactor(comics): move bubble path module to bibliogon-plugin-export`
- Create `plugins/bibliogon-plugin-export/bibliogon_export/bubble_path.py`
- Move all the helper functions from `comic_book_pdf.py` into
  this new module. Re-export from `comic_book_pdf.py`.
- Update walker to import from new location.
- Mirror the TS layout: `frontend/src/components/comics/`
  already houses `generateBubblePath.ts` — that's fine,
  frontend layout doesn't need to change.

**C(A1)** Cross-language byte-identical snapshot test infra:
- A test harness that runs the TS implementation (via Node)
  and the Python implementation, asserts string equality for a
  fixed set of input combinations.
- Could be a single pytest case that shells out to Node, OR a
  generated fixtures dir + cross-language reader.

THEN proceed with C(B1)-C(B7) for the behavioral gaps.

Total: 9-10 commits.

## Open questions for the next session

1. **Path A or Path B?** Recommendation: Path B. The
   user's call.

2. **Concept doc location.** The kickoff mentions
   `docs/audits/comic-bubble-konzept.md` or
   `/mnt/user-data/outputs/comic-bubble-konzept.md`. Neither is
   accessible from this session's sandbox. If the doc contains
   visual specs not captured in the kickoff's inline
   description, the next session needs to read it before C(B1).

3. **WeasyPrint compatibility.** The path generator was
   verified via pytest but not via a real PDF export run. The
   next session should run `make test-plugin-comics` + a sample
   export to confirm WeasyPrint renders the SVG paths correctly.

4. **Cross-language snapshot tests (Path A item).** If the
   user wants them, they're a separate infra commit. If not,
   skip per Path B.

5. **`bubble-types.module.css` cleanup.** Currently still in
   the tree, no longer applied for shape (since `ComicBubble`
   no longer uses `BUBBLE_BASE_CLASS` + `bubbleTypeClassName`).
   Check if any other component still applies these classes
   before deleting. C11 / C(B6) cleanup.
