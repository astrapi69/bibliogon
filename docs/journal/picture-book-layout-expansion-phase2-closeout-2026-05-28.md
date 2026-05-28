# Picture-Book Layout Expansion — Phase 2 Close-out (2026-05-28)

Closure document for Phase 2 of the picture-book layout
expansion: 4 multi-/single-image layouts shipped end-to-end
under the M1 storage strategy + 1 user-directed bug fix
(ThemeToggle cross-editor placement parity). Phase 3 (collage
with free-positioning) remains queued per the adjudicated
session-split.

## What shipped this phase

| Commit | Scope |
|---|---|
| `96177110` | **Phase 2 C1** — M1 storage utilities. ``PageLayout`` Literal/union +4 across 7 type-exhaustive sites (Pydantic + TS union + KNOWN_LAYOUTS frontend + walker + LAYOUT_CLASS + LAYOUT_LABEL_FALLBACKS placeholders). New helpers: ``readSecondaryImageAssetId`` + ``writeSecondaryImageAssetId`` (TS) + ``_read_secondary_image_asset_id`` (Python walker). Parametric pytest pin for each new layout via ``POST /api/books/{id}/pages``. 4-axis Vitest coverage for read/write helpers (sibling isolation, defensive shape-drift guard, legacy-flat back-compat, clear via null). |
| `60aecd23` | **Phase 2 C2** — ``two_images_text_center`` (40 / 20 / 40 row grid: PRIMARY + Tier-Property text band + SECONDARY) + the multi-image foundation. ``MULTI_IMAGE_LAYOUTS`` set (TS + Python). ``.regionImageSecondary`` CSS + walker mirror. PageCanvas: ``handleSecondaryFileChange`` + secondary file input + replace button + placeholder. ``LayoutConfigTwoImagesTextCenter`` body. Walker emits a second ``.region-image-secondary`` block for any layout in ``_MULTI_IMAGE_LAYOUTS``. |
| `29a659cb` | **Phase 2 C3** — ``split_horizontal`` (50 / 50 cols, 75 / 25 rows: two equal-width images side by side, Tier-Property caption row below spanning both columns). Extends ``MULTI_IMAGE_LAYOUTS`` +1. ``LayoutConfigSplitHorizontal`` body. |
| `d84a6385` | **Phase 2 C4** — ``split_vertical`` (1 col, 45 / 45 / 10 rows: two equal-height images directly stacked + thin caption strip). Distinct from ``two_images_text_center``: images adjacent here, not separated by a prominent text band. ``LayoutConfigSplitVertical`` body. |
| `98e57360` | **Phase 2 C5** — ``image_border_text_center`` (single-image, NOT in MULTI_IMAGE_LAYOUTS). PRIMARY image fills the page; centred semi-transparent text panel sits on top. ``borderTextStyle`` inline-style block in PageCanvas composes background_color × text_backdrop_opacity. ``LayoutConfigImageBorderTextCenter`` body with ``image_fit`` + ``text_backdrop_opacity`` slider + Tier 1+2 sections. |
| `27a8d85f` | **User-directed bug fix** — ThemeToggle cross-editor placement parity. ComicBookEditor was missing ThemeToggle entirely (parallel-surface asymmetry — every other editor in the app mounted one). PageEditor mounted ThemeToggle BEFORE fullscreen + PdfExportControls; every other surface puts it LAST. Fix: add ThemeToggle to ComicBookEditor as the last header item; move PageEditor's ThemeToggle to after PdfExportControls. New regression pin in ComicBookEditor.test.tsx mirroring PageEditor's "Finding D" pin. |
| `ce460a86` | **Phase 2 C6** — i18n in all 8 catalogs (DE + EN proper translations; ES/FR/EL/PT/TR/JA passthrough with EN content per Phase 1 precedent). 4 layout labels + 4 config-body headings + 4 Tier 1+2 sub-trees (26 keys each) + 3 PageCanvas secondary image strings + 1 new ``mehrere_bilder`` layout category. ~115 new keys × 8 catalogs ≈ 920 strings. **+ closes the LayoutPicker half-wired surface**: Phase 2 C1..C5 had added layouts to the union but not to LayoutPicker categories — users couldn't see them in the picker. C6 introduces the new ``mehrere_bilder`` category for the 3 multi-image layouts + adds ``image_border_text_center`` to ``bild_mit_text``. |
| `5b309aaa` | **Phase 2 C7** — Playwright smoke spec. 5 tests in `e2e/smoke/picture-book-phase2-layouts.spec.ts`: LayoutPicker categories + 3 multi-image positive pins (LayoutConfig body mounts, BOTH image regions render, placeholder + upload affordance visible, page row's data-layout updates) + 1 single-image discipline pin (image_border_text_center: secondary region MUST NOT render). |

## Test deltas (cumulative across the phase)

| Suite | Before (handover baseline) | After Phase 2 | Delta |
|---|---|---|---|
| Backend pytest (collected) | 2334 | 2338 | **+4** |
| Frontend Vitest | 2308 (178 files) | 2348 (178 files) | **+40** |
| Plugin-export pytest (collected) | 331 | 361 | **+30** |
| Plugin-comics pytest | 19 | 19 | unchanged |
| i18n parity + structure | 75 | 75 | unchanged (parity holds; +920 strings added in lockstep) |
| Playwright smoke specs | 75 files | 76 files | **+1 (5 tests)** |

## Adjudicated answers consumed

All 8 Phase 1 Pre-Inspection adjudications honoured:

| Q | Decision | How it landed in Phase 2 |
|---|---|---|
| Q1 | M1 (JSON in layout_config) for layouts 4-7 | C1 ships ``readSecondaryImageAssetId`` / ``writeSecondaryImageAssetId`` + Python walker mirror. PRIMARY stays on ``Page.image_asset_id``; SECONDARY in ``layout_config[layout].secondary_image_asset_id``. Zero migration for existing rows. |
| Q2 | Phase 1 (1-3) / Phase 2 (4-7) / Phase 3 (8) | Phase 2 closed in this commit chain. |
| Q3 | Category-grouped picker | C6 adds ``mehrere_bilder`` to the existing 4-category shape (5 total). |
| Q4 | Tier-Property for Phase 2 text regions | All 4 LayoutConfig bodies mount Tier1 + Tier2 sections. i18n trees for each. Walker's ``_compute_tier_text_style`` mirrors the editor's ``computeTierTextStyles``. |
| Q5 | (only applied to Phase 1 image_full_no_text) | No new application in Phase 2. |
| Q6 | Mirror bodies share via flipDirection prop | Not applicable in Phase 2 — none of the 4 layouts are mirror geometries. Each is a distinct shape. |
| Q7 | No cross-language snapshot pins | Confirmed — picture-book is CSS-grid-driven; no byte-pinned path strings. |
| Q8 | +30-50 tests tolerated | Roughly hit the upper end (+30 walker + ~40 Vitest + 5 E2E ≈ 75). |

## One priority user-directed bug fix mid-phase

Mid-phase, the user surfaced a ThemeToggle cross-editor inconsistency:

- ComicBookEditor was missing ThemeToggle entirely (the only editor in the app without one in its header).
- PageEditor mounted ThemeToggle BEFORE fullscreen + PdfExportControls (outlier vs Dashboard / ArticleEditor / BookEditor's sidebar header which all put ThemeToggle LAST).

Fixed in commit `27a8d85f` between Phase 2 C5 and C6: ComicBookEditor gets the toggle as its last header item; PageEditor's toggle moves to after PdfExportControls. New regression pin in ``ComicBookEditor.test.tsx`` mirrors PageEditor's existing "Finding D" pin. Cross-editor convention now standardized: **ThemeToggle is the LAST item in every editor's header**. Pre-Coding-Reality-Check rule applied per the active disciplines.

## Active disciplines that fired during Phase 2

Per the handover's "Critical Constraints + Active Disciplines" section. Phase 2 work exercised the following from `.claude/rules/lessons-learned.md`:

- **Mirror discipline (TS + Python)** — every PageCanvas branch shipped with a paired walker branch. C2 example: secondary image region in JSX mirrors the walker's ``.region-image-secondary`` emission.
- **Editor↔PDF regression pins per layout** — each C2..C5 commit ships pytest pins asserting key CSS positioning / image rendering for the walker.
- **German typographic quotes in YAML** — C6's DE catalog additions use ASCII ``"`` consistently (no mixed-quote bug).
- **Run vitest from `frontend/`** — every Vitest invocation cd'd into ``frontend/`` first.
- **Pre-Coding-Reality-Check** — surfaced the LayoutPicker half-wired gap at C6 keystroke time (Phase 2 layouts in the union but invisible in the picker). Fix landed in the same commit per the Half-Wired-Feature-Lifecycle rule.
- **Mocked-API contract drift** — no Vitest mocks needed updating (the new helpers use existing ``api.assets.upload`` + ``api.pages.update`` shapes unchanged).
- **Explicit-paths-only `git add`** — every commit named files individually.
- **Plain `git status` before every commit** — done before each of the 8 commits.
- **Half-wired feature lifecycle** — closed two latent gaps: (1) Phase 1 C5 used the layout-name as i18n prefix without registering keys; Phase 2 C6 adds the full Tier 1+2 trees; (2) Phase 2 C1..C5 added layouts to the union without LayoutPicker category wiring; C6 closes it.

## What did NOT ship (deliberate scope cap)

- **Phase 3** — ``collage`` with free image positioning + drag-to-position component extraction from the comic-bubble drag pattern. M1 vs M2 decision deferred to the start of Phase 3.
- **Pre-existing flakes in `picture-book-editor.spec.ts`** (9 cases) — carried forward from Phase 1 close-out; still unrelated to layout expansion work.
- **Orphan i18n key `ui.page_editor.more_layouts`** — Phase 1 left this untouched; Phase 2 inherits the orphan. Cleanup remains a separate hygiene pass.
- **Phase 2 per-image image_fit** — both images in multi-image layouts share a single ``image_fit`` field (M1 design). Per-image-slot fit is a Phase 3+ decision.
- **`AUTHORS-DATABASE-PHASE2` integration** — Authors-DB wizard datalist deferred to a separate session per the handover.

## Push state

8 commits pushed to `origin/main` autonomously across the
session arc:

```
5b309aaa test(picture-book): Phase 2 C7 — Playwright smoke spec
ce460a86 feat(picture-book): Phase 2 C6 — i18n in all 8 catalogs + LayoutPicker categories
27a8d85f fix(editors): ThemeToggle cross-editor placement parity
98e57360 feat(picture-book): Phase 2 C5 — image_border_text_center
d84a6385 feat(picture-book): Phase 2 C4 — split_vertical
29a659cb feat(picture-book): Phase 2 C3 — split_horizontal
60aecd23 feat(picture-book): Phase 2 C2 — two_images_text_center + multi-image foundation
96177110 feat(picture-book): Phase 2 C1 — M1 storage utilities + PageLayout +4
```

This close-out commit will become the new `main` tip.
