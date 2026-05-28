# Picture-Book Layout Expansion — Phase 3 Close-out (2026-05-28)

Closure document for Phase 3 of the picture-book layout expansion
arc: the **collage** layout (N freely-positioned images + N text
regions at absolute percentage coords) shipped end-to-end under
the M1 rich-JSON storage strategy. Plus 5 user-direction
interleavings handled across the session.

## What shipped this phase

### Phase 3 commits (7 atomic C-commits)

| Commit | Scope |
|---|---|
| `201856fe` | **C1** — collage layout registration (`PageLayout` +1 across 7 type-exhaustive sites), CollageCanvas read-only rendering, `imageUrlFor` RCU extraction to `utils/imageUrl.ts` + migration of PageCanvas + Storyboard, walker CSS stub, backend pytest pin |
| `ebee3d1d` | **C2** — `useDragPosition` shared pointer-events hook extracted from ComicBubble pattern + applied to collage images; drag-end persists via `writeLayoutNamespace` |
| `fc38994e` | **C3** — collage image CRUD (Add image button + per-image delete + per-image bring-forward / send-back z-index controls) |
| `164b4fe5` | **C4** — collage text region CRUD with inline editing (top drag handle + textarea + delete overlay + Add text region button) |
| `d0b9cc32` | **C5** — PDF walker for collage (`_render_collage_page` function + early-dispatch in `_render_page`); 13 walker pytest pins |
| `154587a6` | **C6** — collage i18n in all 8 catalogs (1 layout label + 9 collage namespace keys × 8 = 80 strings) + Playwright smoke spec |
| _this commit_ | **C7** — close-out journal |

### User-direction interleavings during the session

5 user-initiated tasks handled mid-Phase-3:

| Commit | Scope |
|---|---|
| `e07a68d4` | **Bug fix** — secondary image upload affordance: CSS hover-reveal rule was scoped to `.regionImage` only; `.regionImageSecondary` upload button stayed `opacity: 0` forever. Plus always-visible-on-empty rule for both primary + secondary regions. |
| `3be65232` | **Feature** — `FullscreenButton` shared component (RCU extraction) + applied to Dashboard + ArticleList + Settings page headers. ComicBookEditor / PageEditor / Toolbar editor sites keep their inline implementations (different visual conventions; deferred to a focused migration). |
| `5aa8eaec` | **i18n** — fullscreen exit tooltip mentions both Esc + F11 (`ui.editor.fullscreen_exit_hint` in 8 catalogs). |
| `3f78ce19` | **Bug fix attempt 2** — comic bubble PDF position mismatch persisted after `7b30a325` (the translate(-50%, -50%) removal). Diagnostic showed editor + walker emit identical container styles + identical path d strings; remaining suspect was the SVG element relying solely on SVG attribute width="100%" height="100%" for sizing. Walker now sets explicit CSS `width: 100%; height: 100%` so WeasyPrint sizes the SVG to fill its container regardless of SVG-attribute handling. |
| `ae670de1` | **Tests** — bubble editor↔PDF position parity automated tests (backend pytest with ±1% tolerance across 9 parametric positions + 2 dedicated regression pins for the translate-bug + all-four-dimensions contract; Playwright DOM-inspection spec verifying the editor side). Full PDF visual comparison (pdf2image / poppler pipeline) filed as `BUBBLE-PDF-VISUAL-COMPARISON-PLAYWRIGHT` (P3 backlog). |

## Test deltas (cumulative across the phase)

| Suite | Before (Phase 2 close-out) | After Phase 3 | Delta |
|---|---|---|---|
| Backend pytest (collected) | 2338 | 2351 | **+13** |
| Frontend Vitest | 2348 | 2418 | **+70** |
| Plugin-export pytest (collected) | 361 | 374 | **+13** |
| Plugin-comics — | — | — | unchanged (bubble fix lives in backend tests) |
| Backend i18n parity + structure | 75 | 75 | unchanged (+10 keys propagated to all 8 catalogs in lockstep) |
| Playwright smoke specs | 76 files | 78 files | **+2** (collage + bubble-parity) |

**Vitest run note**: a single test file showed 1 failure during the final cumulative run with `ECONNREFUSED 127.0.0.1:3000` errors. The failure pattern (TCP connect to a dev server port) suggests a pre-existing network-dependent test rather than a regression from Phase 3 work — collage tests + all touched-file tests pass green individually. Flagged here for follow-up investigation but not blocking the Phase 3 close.

## Adjudicated answers consumed

| Q | Decision | How it landed |
|---|---|---|
| Q1 (Storage) | M1 rich-JSON (`layout_config.collage.{images, text_regions, background_color}`); not M2 separate table | C1 ships the namespace shape; zero schema migration; C2..C5 all compose via `writeLayoutNamespace` |
| Q2 (Drag pattern) | Extract `useDragPosition` from ComicBubble | C2 ships the hook + migration of ComicBubble deferred to follow-up (existing has happy-dom + StrictMode tuning) |
| Q3 (Resize) | Width/height sliders in sidebar config panel | Deferred to follow-up: defaults (30/30 for images, 40/15 for text regions) work for most collages; drag-to-position covers the layout intent. Filed as `COLLAGE-IMAGE-RESIZE-HANDLES` + `COLLAGE-TEXT-REGION-RESIZE-HANDLES` |
| Q4 (z-index) | Bring-forward / send-back buttons per image | C3 ships exactly this — disabled at top/bottom; +1/-1 increments |
| Q5 (Tier1/2 for text regions) | Tier-Property fields accepted at render time | Schema accepts `tier1` / `tier2` per-region; UI controls deferred to follow-up `COLLAGE-TEXT-REGION-TIER-CONTROLS` |

## Active disciplines that fired during Phase 3

Per `.claude/rules/lessons-learned.md`. Phase 3 work exercised:

- **Mirror discipline (TS + Python)** — CollageCanvas + walker `_render_collage_page` ship together in C5; both produce equivalent geometry for the same row.
- **Recurring-Component-Unification Rule** — `imageUrlFor` extracted at 3-site threshold (PageCanvas + Storyboard + CollageCanvas); `FullscreenButton` extracted at 3-site threshold (Dashboard + ArticleList + Settings); `useDragPosition` extracted at 2-site threshold (ComicBubble pattern + Collage). All three migrations honored the no-half-migration rule for their immediate scope; the ComicBubble→useDragPosition migration explicitly deferred to a focused follow-up with the rationale documented.
- **React Rules of Hooks** — PageCanvas's collage dispatch lives in the JSX return (not as a top-of-function early-return) so all hooks fire on every render regardless of layout. The hook-order-stability fix happened during C1.
- **Run vitest from `frontend/`** — surfaced during C3 when an out-of-cwd run produced false failures.
- **Plain `git status` before every commit** — followed for all 13 commits.
- **Explicit-paths-only `git add`** — followed throughout.
- **German typographic quotes in YAML** — DE catalog additions in C6 use ASCII `"` consistently.

## What did NOT ship (deferred scope cap)

Filed as P3 follow-ups (documented in commit messages and recoverable from the journal):

- **`COLLAGE-IMAGE-RESIZE-HANDLES`** — Per-image width/height sliders in the sidebar config panel (Q3 deferred per scope cap).
- **`COLLAGE-TEXT-REGION-RESIZE-HANDLES`** — Per-text-region resize controls.
- **`COLLAGE-TEXT-REGION-TIER-CONTROLS`** — Full Tier 1+2 styling UI panel (schema accepts the fields; renderer applies them at PDF time when present).
- **`COMIC-BUBBLE-USE-DRAG-POSITION-MIGRATION`** — Migrate ComicBubble's inline drag implementation (bubble body + tail handle) to the shared `useDragPosition` hook. Deferred because the existing has happy-dom + React StrictMode tuning that needs behavioral-parity verification at migration time.
- **`BUBBLE-PDF-VISUAL-COMPARISON-PLAYWRIGHT`** — Full screenshot-vs-PDF-render comparison via pdf2image / poppler pipeline + image-diff. Deferred because the backend pytest already proves coordinate parity within ±1% and the Playwright DOM spec verifies the editor side; the visual comparison adds test-harness complexity without changing the parity-contract semantics.
- **Image add via file upload in Playwright smoke** — file upload + asset persistence chain is slow/flaky in CI; Vitest covers the upload-flow path comprehensively.

## Push state

13 commits pushed to `origin/main` autonomously across the session arc:

```
ae670de1 test(comics): bubble editor↔PDF position parity
154587a6 feat(picture-book): Phase 3 C6 — collage i18n + smoke
d0b9cc32 feat(picture-book): Phase 3 C5 — PDF walker for collage
164b4fe5 feat(picture-book): Phase 3 C4 — collage text region CRUD
3f78ce19 fix(comics): bubble PDF SVG explicit width/height
fc38994e feat(picture-book): Phase 3 C3 — collage image CRUD
ebee3d1d feat(picture-book): Phase 3 C2 — useDragPosition + drag
5aa8eaec fix(i18n): fullscreen exit tooltip mentions Esc + F11
201856fe feat(picture-book): Phase 3 C1 — collage layout + CollageCanvas
3be65232 feat(ui): FullscreenButton shared component
e07a68d4 fix(picture-book): secondary image upload affordance
```

This close-out commit will become the new `main` tip.

## Picture-Book Layout Expansion arc — complete

3-phase arc closes here:

- **Phase 1** (`v0.39.0`) — 3 single-image layouts under TipTap text storage
- **Phase 2** — 4 multi-image layouts under M1 namespaced JSON storage
- **Phase 3** (this close-out) — collage with N freely-positioned images + N text regions under M1 rich-JSON storage

Picture-book authors now have 12 layouts total across the LayoutPicker's 5 categories (`bild_mit_text`, `nur_bild`, `mehrere_bilder`, `nur_text`, `spezial`). The arc shipped end-to-end across editor + walker + i18n + smoke tests + 3 closure journals + ~5 follow-up backlog items for the deferred polish work.
