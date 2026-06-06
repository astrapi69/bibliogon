# Mobile responsive audit (375px+ baseline)

Date: 2026-06-06
Branch: `feature/responsive-mobile`
Baseline device: iPhone SE (375px). Secondary checks: 390px (iPhone 14),
768px (iPad portrait).

## Method

This audit is a **code-read audit**: the execution environment has no
browser, so each surface was assessed by reading its JSX layout and the
`.module.css` / `global.css` rules that drive it, looking for the
mobile-break patterns (fixed-pixel multi-column grids, fixed-width
panels, `white-space: nowrap` clusters, sub-16px input fonts, sub-44px
tap targets, non-wrapping button groups). Verification is delivered as
Playwright smoke specs (`e2e/smoke/responsive-mobile.spec.ts`) that
assert **zero horizontal overflow** and the list-view scroll geometry at
the three target widths, for Aster to run in a real browser.

## Architectural constraint (read first — it shapes every fix)

Two facts about the styling stack bound what a "Tailwind-only" responsive
pass can fix:

1. **Cascade layers.** `tailwind.css` imports utilities into
   `@layer utilities`. `global.css` (mostly) and **every `.module.css`**
   are *unlayered*, and unlayered rules outrank layered ones at equal
   specificity. So a Tailwind responsive utility (`md:flex-row`,
   `text-base`) added to an element that already carries a conflicting
   `.module.css` rule for the **same property** *loses the cascade*.
2. **`global.css` is frozen** (Tailwind-first rule in
   `coding-standards.md`): no new classes, no extensions.

Consequences for this pass:

- **Cascade-safe fixes** (used here): add Tailwind responsive classes to
  a **wrapper / new element that has no competing module class**, or to a
  property the module rule does not set (e.g. `position`/`z-index` on a
  panel whose module rule only sets width). `overflow-x-auto` on a
  wrapper is the canonical safe fix for a fixed-width grid.
- **Blocked-by-constraint fixes**: anything that must override a
  same-property unlayered rule in `global.css`. The two global ones —
  `.input` font-size (15px → iOS zoom) and the `.btn*` heights (<44px) —
  were resolved by a requester-authorized **surgical `global.css` edit**
  (see "Cross-cutting blockers — RESOLVED").

## Already handled before this branch

- **App header**: hamburger collapse at the `menu:` (75rem) breakpoint.
- **Editor sidebars**: `useSidebarCollapse` + overlay-below-`menu:`
  layout for BookEditor (chapter list) and ArticleEditor (metadata).
  ArticleEditor's old `300px 1fr` grid (`ArticleEditor.module.css:39`) is
  now **dead code** — the body is a Tailwind flex layout.
- **Settings**: `Settings.module.css:86` `@media (max-width:768px)`
  collapses the `220px 1fr` two-column layout to one column and hides the
  desktop sidebar; `SettingsMobileMenu` provides the mobile tab nav.
- **Dialog→Pages pages** (Export, Writing-History, Git, Shortcuts,
  Snapshots): rendered through `PageLayout`, which is pure Tailwind
  (`px-4 sm:px-6`, `max-w-*`, wrapping header) and already responsive.
- **Filter / bulk-action bars**: `DashboardFilterBar` (`.row` is
  `flex-direction:column`, `.controlsRow` is `flex-wrap:wrap`) and the
  shared `BulkActionBar` (`.bar` is `flex-wrap:wrap`) already wrap.
- **Modals**: Radix dialog content is `width: min(720px, 95vw)`
  (`global.css`), so dialogs already fit the viewport.

## Per-surface findings

| # | Surface | Status | Issue (file:line) | Fix |
|---|---------|--------|-------------------|-----|
| 1 | Dashboard — book **cards** | OK | `Dashboard.module.css:117` `auto-fill minmax(300px,1fr)` → 1 col at 375 | none |
| 1 | Dashboard — book **list view** | FIXED | `BookListView.module.css:20/31` fixed grid `50px 1fr 180px 80px 160px 50px` (~520px+gaps) → horizontal overflow | `overflow-x-auto` wrapper + mobile `min-w` reset at `menu:` |
| 1 | Dashboard header / SplitButton / bulk bar | OK | header flex + `flex-shrink`, bars wrap | none |
| 2 | Create Book / Article forms | OK | `CreateBookForm.module.css:60` `auto-fill minmax(240px,1fr)` → 1 col; rendered in `PageLayout` | none |
| 3 | BookEditor — toolbar / outline / editor | OK | sidebar collapse landed | none |
| 4 | ArticleEditor — toolbar / metadata / editor | OK | flex layout + overlay sidebar landed | none |
| 5 | Settings — all tabs | OK | media-query collapse + `SettingsMobileMenu` | none |
| 6 | Export page | OK | `PageLayout` | none |
| 7 | Story Bible — **sidebar panel** | FIXED | `StoryBibleSidebar.module.css:8` `width:280px` fixed; mounted as flex child in BookEditor (`BookEditor.tsx:1074`) + Storyboard (`Storyboard.tsx:538`) → eats 280px of 375px | fixed overlay below `menu:`, static at/above |
| 7 | Story Bible — entity editor | OK | `StoryEntityEditor` fills remaining flex; fields stack | none |
| 7 | Story Bible — **relationship graph** | OK | xyflow v12 ships pinch-zoom + drag-pan + zoom `<Controls>` by default; detail panel `width:240px` fits 375; empty state `width:min(440px,95vw)` | none (not gated) |
| 8 | Storyboard — card grid | OK | `Storyboard.module.css:88` `auto-fill minmax(220px,1fr)` → 1 col | none (shares Story Bible sidebar fix) |
| 9 | Writing History | OK | stats `auto-fit minmax(110px,1fr)`; chart row `overflow:auto`; recharts responsive; `PageLayout` | none |
| 10 | GetStarted | OK | `GetStarted.module.css:230` `auto-fit minmax(180px,1fr)` → collapses | none |
| 10 | Help | OK | `max-width:900px` content, `flex-direction:column` | none |
| + | PageEditor (picture-book / comic, adjacent) | DEFERRED | `PageEditor.module.css:57` fixed `200px 1fr 280px` (~480px) → overflow | needs dedicated visually-verified pass (see note) |

## Fixes applied on this branch

1. **List-view table overflow** (cascade-safe): wrap `BookListView` and
   the `ArticleList` list-view in `overflow-x-auto`; the grid keeps a
   mobile `min-w` (`680px` / `820px`) that resets to 0 at `menu:`
   (≥75rem). The dense list degrades to a horizontally scrollable table
   on phones and stays full-width on desktop; the card/grid view modes
   already collapse to one column.
   **PageEditor (picture-book/comic) is DEFERRED**: its `.body`
   3-column grid carries `flex:1; min-height:0`, so an `overflow-x-auto`
   wrapper would break the flex-height chain; stacking the columns needs
   to override an unlayered module rule (cascade-blocked) and the surface
   is a complex drag editor outside the named 10. Needs its own
   browser-verified pass.
2. **Story Bible sidebar**: the root `<aside>` self-sizes
   (`height:100vh`) and sets no `position`, so it becomes a fixed
   right-anchored overlay below `menu:` (out of flow → content gets full
   width) and resets to `static` at/above it — no width change, no
   desktop regression. The existing `story-bible-close` button dismisses
   it.
3. **Inputs + tap targets** (surgical `global.css` edit — see below).

## Cross-cutting blockers — RESOLVED via surgical `global.css` edit

Requester-authorized (2026-06-06) a minimal, documented deviation from
the `global.css` freeze, because it is the only single-point fix that
actually satisfies the 44px + 16px requirement (per-element Tailwind
loses the cascade to the unlayered rules). Implemented:

- **`.input` font-size 15px → 16px** (`1rem`). Kills iOS Safari
  focus-zoom on every form field app-wide.
- **`@media (pointer: coarse)`** min-size bump to 44px on `.btn`,
  `.btn-sm`, `.btn-icon`, `.btn-sidebar-icon`, `.radix-select-trigger`
  (and 44px min-width on the icon buttons). Scoped to coarse pointers so
  dense **desktop** (mouse) toolbars keep their current density — no
  desktop regression.

`make verify-theme` token-completeness + all 96 WCAG contrast checks
still pass (the edit adds no color).

Original analysis, for the record — these could NOT be fixed under
"Tailwind utilities only / no raw CSS / `global.css` frozen" because the
offending rule is an unlayered same-property declaration in `global.css`:
`.input { font-size 0.9375rem }` (15px), `.btn` ≈ 36px / `.btn-sm` ≈ 28px
/ `.btn-icon` ≈ 28px (padding-only, no min-size). A per-element Tailwind
override loses to the unlayered rule (font-size) or is unbounded churn
that would inflate dense desktop toolbars (44px on every button).

## Questions and assumptions

- **Assumption**: list-view horizontal scroll (vs. full card-reflow) is
  acceptable for the dense power-user list mode, because a mobile-friendly
  card/grid view already exists on Dashboard and ArticleList. Basis:
  prompt explicitly offers `overflow-x-auto` as a sanctioned table fix.
- **Assumption**: PageEditor (picture-book/comic) is the one adjacent
  editor left DEFERRED (flex-height risk + cascade-blocked stacking +
  outside the named 10) — flagged for a browser-verified follow-up.
- **Resolved decision**: global `.input` font-size and `.btn*` heights —
  requester chose the surgical `global.css` edit (16px inputs +
  `pointer:coarse` 44px). Documented above.
- **Out of scope / pre-existing**: `make verify-theme` flags hardcoded
  hex in `frontend/src/export/formatHtml.ts` + `formatPdf.ts` (P3c
  offline-export work already on `main`; not touched by this branch).
