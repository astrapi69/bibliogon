# Picture-Book Layout Expansion — Phase 1 Close-out (2026-05-28)

Closure document for Phase 1 of the picture-book layout
expansion: the 3 single-image layouts shipped + 2 paired bug
fixes that surfaced mid-stream. Phase 2 (multi-image layouts via
M1 JSON storage) and Phase 3 (collage with free-positioning)
remain queued per the adjudicated session-split.

## What shipped this phase

| Commit | Scope |
|---|---|
| `4e642a0` | Comic Editor Add-Panel button respects the active grid template's panel capacity. ``COMIC_GRID_MAX_PANELS`` Record + disabled gate + i18n tooltip in 8 catalogs + 2 Vitest pins. |
| `d15c802` | **Phase 1 C1** — ``PageLayout`` Literal/union extended with 3 single-image layouts (``image_bottom_text_top``, ``image_right_text_left``, ``image_full_no_text``) across 7 type-exhaustive sites: Pydantic + TS union + ``KNOWN_LAYOUTS`` (frontend + walker) + ``LAYOUT_CLASS`` + ``LAYOUT_LABEL_FALLBACKS``. Parametric pytest pin for each new layout via ``POST /api/books/{id}/pages``. |
| `7b30a32` | Comic bubble PDF position mismatch — walker carried a stray ``transform: translate(-50%, -50%)`` treating ``anchor`` as the centre while the editor has always treated it as the top-left. Shifted every PDF bubble up-left by ``(width_pct/2, height_pct/2)``. Fix + docstring + 5 regression-pin tests (1 explicit + 4 parametric). |
| `51aa274` | **Phase 1 C2** — PageCanvas branches + CSS module classes for the 3 new layouts. Mirrors share image_position / image_fit / Tier1/2 with their parents; right_text_left flips the split-ratio column order; full_no_text uses ``!isImageFullNoText`` to gate the text region (silent-ignore stored ``text_content``). TIPTAP_LAYOUTS set extended for the mirrors. 4-layout group rule for the text-region tint. +8 Vitest cases. |
| `5664ffb` | **Phase 1 C3** — Picture-book PDF walker. New ``.page--*`` CSS rules + ``_layout_class`` whitelist +3 + ``_image_layout_style`` per-layout branches for the mirrors + image_full_no_text. ``_render_page`` text-region suppression (mirror of the existing image-region suppression for ``text_only``). +9 pytest cases. |
| `8fb5f99` | Comic bubble text color faded by default — Approach A migration moved typography defaults to inline-style but missed ``color``. Overlay inherited a muted ``--text-sidebar`` against the bubble's white interior. Fix: explicit ``color: "black"`` (mirrors the walker's existing ``color: black;``). +2 Vitest regression pins. |
| `7d5ec4d` | **Phase 1 C4** — LayoutPicker restructured with 4 category sections per the adjudicated Q3 (``bild_mit_text`` / ``nur_bild`` / ``nur_text`` / ``spezial``); the "More layouts" disclosure removed. LayoutConfig dispatcher routes 3 new layouts; mirror bodies share their parent component via a ``flipDirection`` prop (Q6). New ``LayoutConfigImageFullNoText`` for the minimal image-fit-only body. PageEditor + LayoutPicker test files updated for the new shape. |
| `1786855` | **Phase 1 C5** — i18n in all 8 catalogs. 3 new layout labels + ``layout_category`` dict (4 entries) + 3 new config-body headings + ``image_bottom_text`` and ``image_right_text`` Tier1+Tier2 trees (56 keys each as DE-EN proper translations + 6 passthrough catalogs). 75 i18n parity tests green. |
| `b734d9e4` | **Phase 1 C6** — Playwright smoke. New ``picture-book-phase1-layouts.spec.ts`` (4 tests, 4 passing on the live dev host): 4 categories + mirror bodies + ``image_full_no_text`` silent-ignore. ``picture-book-editor.spec.ts`` + ``picture-book-tier-sections.spec.ts`` updated to drop stale ``page-editor-layout-more-toggle`` references (3 → 4 tests passing). |

## Test deltas (cumulative across the phase)

- Frontend Vitest: 2190 → ~2320+ (8 PageCanvas + 10 LayoutPicker + 2 ComicBubble + various dispatcher pins).
- Backend pytest: 2294 → 2333 (parametric layout pins + walker tests + comic-bubble position pins + comic-bubble color pin + i18n parity).
- Plugin-export pytest: 227 → 236 (+9 walker pins for the new layouts).
- Comic-plugin pytest: 19 (unchanged).
- Playwright smoke: +1 new spec (4 passing tests on the live dev backend).

## Adjudicated answers consumed

| Q | Decision | How it landed |
|---|---|---|
| Q1 | M1 (JSON in layout_config) for layouts 4-7 | Phase 2 will use this; Phase 1 didn't need it (3 layouts are all single-image). |
| Q2 | Phase 1 (1-3) / Phase 2 (4-7) / Phase 3 (8) | Phase 1 closed in this commit chain. |
| Q3 | Category-grouped picker with 5 named buckets | 4 buckets active in Phase 1; ``mehrere_bilder`` + extended ``spezial`` arrive with Phase 2. |
| Q4 | Layouts 1+2 = TipTap; layouts 4-7 = Tier-Property | C2's ``TIPTAP_LAYOUTS`` set extended for 1+2; layout 3 has no text region. |
| Q5 | ``image_full_no_text``: silent-ignore stored ``text_content`` | C2 + C3 + C6 all enforce this (text region not rendered; smoke verifies). |
| Q6 | Mirror bodies share via ``flipDirection`` prop | C4 ships it: ``LayoutConfigImageTopTextBottom`` + ``LayoutConfigImageLeftTextRight`` both accept the prop. |
| Q7 | No cross-language snapshot pins for picture-book layouts | Confirmed — picture-book is CSS-grid-driven, not SVG-path-driven; no path-string contract to byte-pin. |
| Q8 | +30-50 tests tolerated | Roughly hit the upper end across all 6 commits + 2 bug fixes. |

## Two priority bugs surfaced + fixed mid-phase

The user surfaced two production bugs during the Phase 1 work
that were unrelated to the layout-expansion scope but real
regressions from the Approach A bubble-overhaul that had landed
the day before:

1. **Bubble position mismatch (`7b30a32`).** Walker's
   ``transform: translate(-50%, -50%)`` shifted every PDF bubble
   up-left vs the editor canvas. Fix + 5 regression-pin tests
   asserting the editor↔PDF parity at multiple anchor + size
   combos.
2. **Bubble text faded by default (`8fb5f99`).** Text overlay
   inherited a muted ``--text-sidebar`` because the Approach A
   migration missed the explicit ``color`` default. Walker had
   it; editor didn't. Fix + 2 regression pins (default-is-black
   + user-override-still-works).

Both fixes use the same parity contract: the walker is the
source of truth for what the PDF emits, and any
production-visible discrepancy with the editor canvas is a bug
regardless of which side is "more right". The walker had
``color: black`` and no centre-translate — the editor matches
both now.

## What did NOT ship (deliberate scope cap)

- **Phase 2** — multi-image layouts (``two_images_text_center``,
  ``split_horizontal``, ``split_vertical``,
  ``image_border_text_center``) under the M1 JSON strategy.
- **Phase 3** — ``collage`` with free image positioning, drag-
  to-position component extraction from the comic-bubble drag
  pattern. M1 vs M2 decision deferred to the start of Phase 3.
- **9 pre-existing flakes in ``picture-book-editor.spec.ts``** —
  the ``getByText("Erstellen")`` strict-mode-violation +
  drag-reorder timing existed before this phase. C6's toggle-
  reference cleanup actually fixed 1 of them (3 → 4 passing).
  The remaining 9 are unrelated to layout expansion; flagged
  here for a separate investigation.
- **Orphan i18n key ``ui.page_editor.more_layouts``** — left
  in all 8 catalogs (C4 removed the disclosure that used it).
  Orphan-key cleanup is a separate hygiene pass.
- **Backend Python ``_BUBBLE_TYPE_CSS`` dict + ``BubbleTail.tsx``
  legacy component** — flagged in the prior comic-bubble close-
  out as dead-code-cleanup candidates; still untouched.

## Push state

11 commits pushed to ``origin/main`` autonomously across the
arc. ``main`` at ``b734d9e4`` at this commit's tip; this
close-out commit will become the new tip.
