# Smoke Test: Inline-Styles Migration (T-01 Phase A + B)

**Shipped:** 2026-04-30
**Commits:**
- Phase A pilot: cfb3a3e (TrashCard module)
- Phase A quick-wins: 62f92e9 (.icon-row), d9b708f (.muted)
- Phase B Session 1: a342aee (Settings), 795d74c (BookMetadataEditor), 9bdca50 (Dashboard), ee88ce4 (ArticleList)
- Phase B Session 2: 754fc75 (ExportDialog), 29d2c87 (Editor), dae611b (ChapterSidebar), 05edb69 (ArticleEditor)

**Reference:** [docs/explorations/inline-styles-audit.md](../../explorations/inline-styles-audit.md), [docs/ROADMAP.md T-01 entry](../../ROADMAP.md)

Migration of component-local `const styles` / `const layout` JS objects to Vite-native CSS-Modules. Theme tokens via `var(--*)` — 6-theme cascade unchanged.

## Prerequisites

- Backend + frontend running.
- Browser with DevTools.

## Flow 1 — Visual regression check across 6 themes × light/dark

For each theme variant, click through the migrated UI surfaces below and confirm no visual breakage.

Themes (set via Settings → App → Thema):
1. Warm Literary (light + dark)
2. Cool Modern (light + dark)
3. Nord (light + dark)
4. Studio (light + dark)
5. Notebook (light + dark)
6. Classic (light + dark)

**Note:** the project ships 6 themes, each with light + dark = 12 variants. Smoke flow targets the first 3 themes × dark mode (worst-case contrast). Deeper coverage on full release smoke.

## Flow 2 — Migrated surfaces per file

Click through each surface to verify rendering.

### Settings.tsx (`Settings.module.css`)
- All 6 tabs render: App, AI, Author, Topics, Plugins, Support (when donations enabled)
- White-label section reveal: still has accent-border card.
- Plugin badges (free / active / standard) render with correct colors.

### BookMetadataEditor.tsx (`BookMetadataEditor.module.css`)
- All metadata tabs render correctly: General, Publisher, ISBN, Marketing, Backpage, Quality
- Multiline-description textarea resizes vertically.
- Audiobook chapter list rows render with play/pause buttons + muted meta-text.
- "Copy from book" picker shows author muted secondary.

### Dashboard.tsx (`Dashboard.module.css`)
- Books grid renders. Theme switching live-updates colors.
- Trash view: list AND grid both render (see [trash-parity.md](./trash-parity.md)).
- Empty state + filter-empty state both render correctly.

### ArticleList.tsx (`ArticleList.module.css`)
- Articles list view, grid view, trash view all render.
- Search box, status filter, sort dropdown align.
- Cover thumbnail in list-row mode.

### ExportDialog.tsx (`ExportDialog.module.css`)
- Format-grid renders (3-column).
- Active format gets accent-border + accent-light background (CSS-Module `formatBtnActive` class).

### Editor.tsx (`Editor.module.css`)
- Editor wrapper, toolbar, status bar all render.
- AI panel + spellcheck panel slide in correctly.
- Word-goal input + progress bar render.
- Save-status badge color flips per state (saving / error / saved).

### ChapterSidebar.tsx (`ChapterSidebar.module.css`)
- Sidebar 260px wide. Scrollable list area (the `min-height: 0` flex-scroll fix from F-8 era).
- Drag-and-drop chapter rows: dragging row gets opacity 0.5.
- Active chapter row highlighted via `color-mix` blend.
- Export buttons at footer: Save-as-template + Export render correctly.

### ArticleEditor.tsx (`ArticleEditor.module.css`)
- Sidebar (300px) + editor pane.
- Title input full-width header.
- Sidebar field labels + inputs render with correct typography.
- Delete button bottom-aligned.

### Quick-win utilities (Phase A)
- `.icon-row` (`global.css`): horizontal flex with gap=8px. Used in 14 sweep sites including page headers + audiobook chapter rows.
- `.icon-row-sm`: same with gap=6px.
- `.muted` / `.muted-sm` (`global.css`): muted text color (+ optional 0.8125rem font-size). Used in 15 sweep sites.

### TrashCard pilot (`TrashCard.module.css`)
- Shared component used by both dashboards (`/` and `/articles`) trash views in grid mode.

## Flow 3 — Test contract sanity

```bash
make test-frontend
```

**Expected:** 682 tests pass. Includes 3 new TrashCard tests + 1 regression-pin test (in `ChapterSidebar.test.tsx` — moved from inline-style assertion to CSS-Module source check).

## Known issues / by-design

- Phase B remaining: 24 files with `const styles`/`const layout` blocks still in source. Top-of-list: `pages/GetStarted.tsx` (38 inline-uses), `components/QualityTab.tsx` (33), `pages/Help.tsx` (28). Estimated ~6-9h to finish.
- 882 pure literal `style={{...}}` inline still present (one-offs, dynamic styles, Tier 4 in audit). Migration is opt-in per-shape via global utility classes.
- jsdom cannot compute layout — visual regressions only catchable via E2E or manual smoke.

## Failure modes

| Symptom | Likely cause |
|---------|---|
| Card / row missing border or background after migration | CSS-Module class not applied; check `className={styles.X}` matches a key in the .module.css file. |
| Button visually overlapping siblings | spread site converted incorrectly; `style={{...styles.X, override}}` should become `className={styles.X} style={{override}}`. |
| Theme colors don't change on theme switch | CSS-Module hardcoded a color literal instead of `var(--token)`. |
| Vitest fails on `flex-wrap` regression check | `TrashCard.module.css` `.card` rule lost `flex-wrap: wrap`. |

## Phase B follow-up

Continue migration in next session, top-of-list first: `pages/GetStarted.tsx`. See [inline-styles-audit.md](../../explorations/inline-styles-audit.md) for the full Phase B sequencing.
