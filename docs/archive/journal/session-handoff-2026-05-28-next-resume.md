# Session-Handoff: Next Session Resume (2026-05-28)

Long-form handover for the next Claude Code session. Companion
to [session-prompt-2026-05-28-next-resume.md](
session-prompt-2026-05-28-next-resume.md) (the copy-paste resume
prompt).

## Current State

- **HEAD:** `10db8e6c` (docs(journal): picture-book layout
  expansion Phase 1 close-out)
- **Branch:** `main`, parity with `origin/main`
- **Working tree:** clean (verified 2026-05-28 19:42 UTC)
- **Current version:** v0.39.0 (v0.40.0 pending — Phase 1
  + comic-bubble overhaul + 3 bug fixes are unreleased commits
  on `main`)

### Test baselines (verified 2026-05-28 19:42 UTC)

| Suite | Count |
|---|---|
| Backend pytest (collected) | 2334 |
| Frontend Vitest | 2308 passed across 178 files |
| Plugin-export pytest (collected) | 331 |
| Plugin-comics pytest | 19 |
| i18n parity + structure | 75 passed |
| Playwright smoke specs | 75 spec files |

## Recent Session Arc

### Picture-Book Layout Expansion Phase 1 (closed today)

7 atomic commits + 1 close-out journal across the C1-C7
sequence. 3 new single-image layouts shipped end-to-end:

- `image_bottom_text_top` — mirror of `image_top_text_bottom`
  (rows swapped). TipTap text layout.
- `image_right_text_left` — mirror of `image_left_text_right`
  (columns swapped). TipTap text layout.
- `image_full_no_text` — full-bleed image, no text region (Q5
  silent-ignore stored `text_content`).

Surfaces touched per commit:

| Commit | Scope |
|---|---|
| `d15c8027` | C1 — `PageLayout` Literal/union +3 across 7 type-exhaustive sites |
| `51aa274b` | C2 — `PageCanvas` branches + CSS module classes; `!isImageFullNoText` text-region gate |
| `5664ffba` | C3 — PDF walker CSS rules + `_layout_class` whitelist + `_image_layout_style` mirror branches + `_render_page` text-region suppression |
| `7d5ec4d2` | C4 — `LayoutPicker` category grouping (4 sections) + LayoutConfig bodies with `flipDirection` prop for mirrors + new `LayoutConfigImageFullNoText` body |
| `17868555` | C5 — i18n in all 8 catalogs (3 layout labels + `layout_category` dict + 3 config headings + 56 Tier1/2 keys × 2 mirror trees) |
| `b734d9e4` | C6 — Playwright smoke spec (4 tests, 4 passing on live dev) + stale `more-toggle` reference cleanup |
| `10db8e6c` | C7 — close-out journal |

### Comic Bubble Visual Overhaul (closed days before today)

Multi-arc closure across the prior days; all complete on `main`
before this session opened:

- Approach A single-SVG-path rendering for all 6 bubble types.
- Path B behavioral gaps: thought circle-chain, shout
  spike-extension, narration force-no-tail.
- Speech/Thought shape swap (user-directed).
- CSS module trimmed to text-styling only.
- WeasyPrint visual verification + `inset: 0` fix.
- Playwright visual baselines (7 PNGs committed).
- Help-doc pair (DE + EN) with 7 screenshots committed to
  `docs/help/assets/screenshots/`.
- 2 close-out journals committed at session-end.

### Bug fixes shipped mid-session (this session)

| Commit | Bug |
|---|---|
| `4e642a05` | Add-Panel button now disables at the active comic-grid template's panel capacity (`COMIC_GRID_MAX_PANELS` Record + i18n tooltip in 8 catalogs + 2 Vitest pins). |
| `7b30a325` | Comic bubble PDF position mismatch — walker had a stray `transform: translate(-50%, -50%)` treating `anchor` as the centre while the editor has always treated it as the top-left. Shifted every PDF bubble up-left by `(width_pct/2, height_pct/2)`. 5 regression-pin tests. |
| `8fb5f99d` | Comic bubble text faded by default — Approach A migration moved typography defaults to inline-style but missed `color`. Overlay inherited a muted `--text-sidebar` against the bubble's white interior. Fix: explicit `color: "black"` (matches walker). 2 regression pins. |

### Earlier session work (already shipped before this session)

- Settings nice-to-haves (#22 PDF defaults, #23 bleed marks,
  #30 KDP marketplace, #33 confirmation-skip).
- Date-locale bug fix across 8 sites (`formatDate.ts`).
- Collapsible section state persistence
  (`useCollapsibleState` hook).
- Search clear button (`SearchClearButton`, 4 surfaces).
- White-Label feature flag (tab count 13 → 12).
- Backup history delete controls.
- Autoren tab UX clarification (Path C).

## Next Session Direction: Picture-Book Layout Expansion Phase 2

Pre-Inspection already shipped (see
[picture-book-layout-expansion-phase1-closeout-2026-05-28.md](
picture-book-layout-expansion-phase1-closeout-2026-05-28.md)
for the adjudication recap). All 8 questions adjudicated; no
fresh adjudication needed before C1.

Phase 2 scope — 4 multi-image layouts using **M1** (JSON in
`layout_config`):

- `two_images_text_center` — top image + bottom image with a
  text band in the centre. Tier-Property for the text band.
- `split_horizontal` — two equal-width images side by side.
  Optional Tier-Property captions.
- `split_vertical` — two equal-height images stacked. Optional
  Tier-Property captions.
- `image_border_text_center` — image fills the page as a
  decorative frame/border; text region centered with semi-
  transparent panel. Tier-Property text region.

Key decisions already adjudicated:

- **M1 storage**: secondary asset IDs live as
  `layout_config[layout].secondary_image_asset_id` (or
  `image_asset_ids: [...]` for variable count). `Page
  .image_asset_id` stays as the PRIMARY image — zero migration
  for existing rows.
- **Tier-Property** for all Phase 2 text regions.
- **LayoutPicker categories** already shipped in Phase 1 —
  Phase 2 just adds entries to the `bild_mit_text` and
  introduces the `mehrere_bilder` category.

Estimated: **8-10 commits** per the Phase 2 plan in the
Pre-Inspection report.

Phase 3 (collage, 5-7 commits) follows after Phase 2. M1-vs-M2
decision deferred to the start of Phase 3.

## Current Backlog State

Counts as of `10db8e6c`:

| Tier | Open |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 17 |
| P4 | 28 |
| P5 | 21 |
| **Total active** | **66** |
| BLOCKED / Upstream Wait | 3 entries |

Header in `docs/backlog.md` still reads "57 active" — its last
prose-update was 2026-05-27 before this session's additions.
Counts above are the authoritative current figures from
mechanical counting.

## Critical Constraints + Active Disciplines

These are the lessons-learned rules that have fired during the
recent session arc — copy across or read in full at
`.claude/rules/lessons-learned.md`. The full file is the
canonical source; this section is just the high-recency subset
that's most likely to apply to Phase 2 work.

### Mirror discipline (TS + Python)

The frontend and the WeasyPrint walker MUST produce visually-
equivalent output for the same page row. Every PageCanvas
branch needs a corresponding `_render_page` / `_image_layout_style`
branch in `plugins/bibliogon-plugin-export/bibliogon_export/
picture_book_pdf.py`. The two bubble-overhaul bugs this session
(`7b30a325` position mismatch + `8fb5f99d` faded text) were
both editor↔walker divergences that the test suite did not
catch because no pin asserted the parity. Phase 2 + Phase 3
work should add parity pins for each new layout's PDF render.

### Walker is source of truth on PDF emission

When the editor and walker disagree on output, prefer the
walker's behaviour and migrate the editor to match (the walker
is what users print). Both this session's bubble fixes used
this rule — the walker's `color: black` and lack-of-translate
were the correct answers; the editor matched them.

### Editor↔PDF regression pins

Every new layout's PDF render should be pinned with at least
one pytest case asserting key CSS positioning properties
(`left: X%`, `top: Y%`, `grid-template-columns: ...`) match
the editor's `baseStyle` or layout-class shape. The C3 pytest
sweep includes 9 of these for the Phase 1 layouts.

### German typographic quotes in YAML

When adding German strings to `backend/config/i18n/de.yaml`,
both quotes must be the German codepoints (`„` U+201E and
`"` U+201D) OR both must be the ASCII `"` with `\"` escapes
inside. Mixing terminates the scalar early; Phase 2 will add
~50 new DE-side strings (mirror Tier1/2 trees) so this is
load-bearing.

### Run vitest from `frontend/`

`npx vitest run` outside the `frontend/` directory produces
`ReferenceError: document is not defined` because Vitest can't
find the config that picks the `happy-dom` environment. Make
target `make test-frontend` does the cd correctly; manual
invocations need `cd frontend &&` first.

### Pre-Coding-Reality-Check

Before any commit's first code edit, re-grep the immediate
touch-surface for: existing endpoints/functions whose name or
scope overlaps; architectural assumptions in the plan that
depend on upstream/downstream code paths; half-wired siblings
(other callers of the same contract being changed). 30-60
seconds at the keystroke saves multi-hour cleanups after.

### Mocked-API contract drift across test files

When introducing a new hook / API consumer that reads from a
key of an already-mocked API response, update EVERY existing
test file that mocks the same API + run the FULL `make test`
before committing. Phase 2 will add new
`readSecondaryImageAssetId` etc. consumers; the existing
`api.pages.list` mocks need to honour the new keys.

### Explicit-paths-only `git add`

In Multi-Tool-Coordination sessions where parallel-session work
may be in flight, NEVER use `git add -A` / `git add .` /
`git add <dir>/`. Always name files individually. The Phase 1
work followed this rigorously across 10 commits without
absorbing any cross-session work.

### Plain `git status` before every commit

Filter-free. Confirms there's no accidental absorption of
parallel-session work. Pairs with the explicit-paths rule.

### Don't ask Vitest's happy-dom to handle Radix DropdownMenu

Reliable open-then-assert on DropdownMenu content is impossible
in Vitest; defer those assertions to Playwright. The bubble-
work made the Cope-via-Playwright split explicit.

### Half-wired feature lifecycle

When shipping a feature that has a write surface AND a read
surface, ship both halves in the same commit or file an
explicit backlog item with a load-bearing trigger. Phase 2
multi-image layouts have a write (the new asset picker) AND
a read (PageCanvas + walker rendering of the secondary image);
both halves must land together per layout commit.

## Open Architecture-Decisions

None for Phase 2 — all 8 Pre-Inspection questions were
adjudicated at the start of the Phase 1 session. Phase 3
collage will need an M1-vs-M2 decision but that's not blocking
Phase 2.

## Files to Read (in order)

For Phase 2 work, in order of priority:

1. `docs/backlog.md` — current P-tier state + recent closures.
2. `docs/journal/picture-book-layout-expansion-phase1-closeout-2026-05-28.md` — adjudication recap + scope cap.
3. `docs/journal/session-handoff-2026-05-28-next-resume.md` — this file.
4. `.claude/rules/lessons-learned.md` — all active rules.
5. `.claude/rules/coding-standards.md` — function-design + naming + recurring-component unification.
6. `.claude/rules/architecture.md` — layered architecture + plugin structure.
7. `backend/config/book-types.yaml` — book-type SSoT (untouched by Phase 1; confirm still untouched in Phase 2).
8. `backend/app/schemas/__init__.py:997-1004` — `PageLayout` Literal current state.
9. `frontend/src/components/PageCanvas.tsx` — rendering dispatch.
10. `plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py` — walker.

## Recommended Next Session Direction

**Phase 2 Layout Expansion C1** — the M1 utility commit:

- `frontend/src/utils/layoutConfig.ts` —
  `readSecondaryImageAssetId(layout_config, layout)` +
  `writeSecondaryImageAssetId(layout_config, layout, asset_id)`.
  Mirrors the existing `readLayoutNamespace` Fix B shape.
- Python mirror in
  `plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py`
  for the walker-side read path.
- Vitest + pytest pins for both.

C2-C5 add the per-layout enum + rendering + walker + LayoutConfig
bodies per layout. C6 i18n. C7 smoke. C8 close-out.

User-Direction-Override always supersedes this recommendation.

## Open Bugs / Flake Watchlist

- **9 pre-existing `picture-book-editor.spec.ts` failures.**
  `getByText("Erstellen")` strict-mode-violation at the
  Dashboard create-button entry + drag-reorder timing. NOT from
  this session's work; surfaced when running the full smoke
  suite during C6. Need a separate triage pass — possibly file
  as a backlog item if root cause is non-trivial.
- **Orphan i18n key `ui.page_editor.more_layouts`** — left in
  all 8 catalogs (C4 removed the disclosure that used it).
  Orphan-key cleanup is a separate hygiene pass; not blocking.
- **Dead-code candidates from prior session** — backend Python
  `_BUBBLE_TYPE_CSS` dict and frontend `BubbleTail.tsx` legacy
  component. Flagged in the prior comic-bubble close-out;
  still untouched. Not Phase 2 scope.
