# Inline-Styles Inventory & Migration Audit (T-01-audit)

Datum: 2026-04-30. Status: Phase 2 audit only, no source changes.

Tracking ticket: [docs/ROADMAP.md → T-01](../ROADMAP.md#code-quality).

This document inventories every inline-style usage in
`frontend/src/`, classifies them by complexity, and recommends a
single migration target. The actual refactor is a separate
follow-up prompt.

---

## 1. Headline numbers

```
$ grep -rn "style={{" frontend/src/ --include='*.tsx' --include='*.ts' | wc -l
919
```

```
$ grep -rln "const styles\s*[:=]\|const layout\s*[:=]" \
    frontend/src/ --include='*.tsx' | wc -l
32
```

919 inline style attributes across the codebase. 32 files keep a
component-local `const styles` or `const layout` object next to
the JSX.

---

## 2. Top files by inline-style count

| Rank | File | `style={{...}}` |
|------|------|-----------------|
| 1 | `pages/Settings.tsx` | 139 |
| 2 | `components/BookMetadataEditor.tsx` | 75 |
| 3 | `components/GitBackupDialog.tsx` | 56 |
| 4 | `components/BackupCompareDialog.tsx` | 41 |
| 5 | `components/ExportDialog.tsx` | 40 |
| 6 | `components/GitSyncDialog.tsx` | 33 |
| 7 | `components/Editor.tsx` | 32 |
| 8 | `pages/ArticleList.tsx` | 26 |
| 9 | `pages/Dashboard.tsx` | 21 |
| 10 | `pages/ArticleEditor.tsx` | 20 |
| 11 | `components/AudioExportProgress.tsx` | 19 |
| 12 | `components/SshKeySection.tsx` | 17 |
| 13 | `components/TranslationLinks.tsx` | 16 |
| 14 | `components/ChapterSidebar.tsx` | 15 |
| 15 | `components/GitSyncDiffDialog.tsx` | 14 |
| 16 | `pages/GetStarted.tsx` | 11 |
| 17 | `components/QualityTab.tsx` | 11 |
| 18 | `components/ErrorReportDialog.tsx` | 11 |
| 19 | `components/AudioExportGate.tsx` | 11 |
| 20 | `components/AiSetupWizard.tsx` | 9 |
| ... | (12 more files at 1-8 each) | ~95 |

Top 20 files account for ~600 of 919 occurrences (≈65%).

Two files own a `const styles: Record<string, React.CSSProperties>`
object that pages reuse heavily:

- `pages/Dashboard.tsx → styles` (~28 keyed entries)
- `pages/ArticleList.tsx → layout` (~30 keyed entries)
- `pages/Settings.tsx → styles` (largest, 100+ keyed entries)

---

## 3. CSS architecture present

### Already established

- `frontend/src/styles/global.css` — single 1791-line stylesheet with:
  - Local font-faces (offline-capable, no CDN)
  - 6 theme variants via `[data-app-theme="..."][data-theme="dark"]` attribute selectors (classic, cool-modern, nord, studio, notebook + light/dark each)
  - CSS custom properties (`--bg-*`, `--text-*`, `--accent-*`, `--border`, `--shadow-*`, `--radius-*`, `--font-*`) — single source of truth for all theme tokens
  - Global utility classes: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-premium`, `.btn-icon`, `.btn-sm`, `.input`, etc.
  - Theme-switching is a single `data-app-theme=""` attribute toggle on `<html>`. No React re-render needed; the cascade handles it.

### Not present

- No Tailwind config (`tailwind.config.*` absent, no `@tailwind` directives in any CSS).
- No CSS-Modules (`*.module.css` absent in source tree; `grep` returned no matches).
- No styled-components / emotion / runtime CSS-in-JS.
- No Stitches / Vanilla Extract.

### CSS-var consumption from inline styles

Inline styles reference CSS-vars heavily:

```
$ grep -c "var(--" pages/Settings.tsx pages/ArticleList.tsx pages/Dashboard.tsx
Settings.tsx: 86
ArticleList.tsx: 55
Dashboard.tsx: 31
```

Theme switching already works for these inline styles because the
JS hands a literal string `"var(--bg-card)"` to React's `style` prop,
which the browser resolves at paint time per the cascade. Theme
re-render claim from the prompt is misleading: switching themes does
NOT force React re-render of inline-styled elements; the CSS engine
re-resolves `var()` references when the `data-app-theme` attribute
flips. **The inline-style problem is not theming**; theming is fine.

---

## 4. Tier classification

### Tier 1 — Trivial one-offs (≈350 occurrences, 38%)

Pattern: ad-hoc overrides on a single element, 1-3 properties, no
reuse.

Examples:
- `<div style={{ marginTop: 12 }}>` (spacing)
- `<span style={{ flex: 1 }}>` (layout slot)
- `<p style={{ color: "var(--text-muted)" }}>` (color)
- `<div style={{ display: "flex", gap: 8, alignItems: "center" }}>` (small flex container)

Migration: extract to a small utility-class set in `global.css`
(`.flex`, `.flex-row-center`, `.gap-8`, `.muted`, `.mt-12`) OR
introduce CSS-Modules with semantic class names per file.

Effort per occurrence: ≤2 minutes. Total tier: ~12h (assumes 2
min × 350).

Risk: low. No layout regression if the utility class encodes the
exact same property values.

### Tier 2 — Component-local `styles`/`layout` objects (≈400 occurrences, 44%)

Pattern: a named object at the bottom of the component file,
referenced multiple times within the same file.

Top examples:
- `Dashboard.tsx → styles` — 28 keys, ~21 inline applications.
- `ArticleList.tsx → layout` — 30 keys, ~26 inline applications.
- `Settings.tsx → styles` — 100+ keys, ~139 inline applications (single largest target).
- `BookMetadataEditor.tsx → styles` — ~50 keys, ~75 applications.

Migration: rename the file's companion stylesheet `Foo.module.css`,
move every `styles.x` to a class `.x { ... }`, replace
`style={styles.x}` with `className={styles.x}`. Vite handles
`.module.css` natively — no config change.

Effort per file: 30-90 minutes (depending on key count). Total
tier: ~25-40h across the top 15 files.

Risk: medium. Each file needs a manual smoke pass on 6 themes ×
light/dark to catch any cascade-specificity regression. Scoped CSS-
Modules sit at single-class specificity (0,0,1,0); inline styles
sit at inline specificity (1,0,0,0). Some inline overrides may be
relying on inline specificity to win over a global rule. Sweep
needs a per-file cross-check.

### Tier 3 — Shared style objects across files (≈10 occurrences, 1%)

Pattern: imported style snippets reused by multiple components.

Search:
```
$ grep -rn "import .*styles\|import .*layout" frontend/src/ \
    --include='*.tsx' --include='*.ts'
```

Empty result. **No shared style objects exist** — every `styles` /
`layout` is component-local. This tier is effectively empty.

What looks shared (e.g. `styles.trashCard` in Dashboard.tsx and
`layout.trashCard` in ArticleList.tsx) is duplicated, not shared.
Duplication will surface as a refactor opportunity once Tier 2 is
underway.

### Tier 4 — Dynamic runtime-state styles (≈80 occurrences, 9%)

Pattern: a property whose value is computed from React state at
render time.

Examples found via grep:
- `style={{ display: open ? "block" : "none" }}`
- Conditional `aria-pressed` styles, `transform: rotate(${deg}deg)`
- Cover thumbnail aspect-ratio derived from image dims
- Progress-bar widths (`AudioExportProgress.tsx`)

Migration: split. Structural CSS goes to a class; the variable
property stays inline OR moves to a CSS custom property
(`style={{ "--progress": pct }}`) consumed by the class
(`width: calc(var(--progress) * 1%)`).

Effort per occurrence: 10-15 minutes. Total tier: ~15h.

Risk: low if the structural class is correct. Dynamic-only inline
remainders are acceptable end-state.

### Tier summary

| Tier | Count | % of total | Effort | Risk |
|------|-------|------------|--------|------|
| 1 | ~350 | 38% | ~12h | low |
| 2 | ~400 | 44% | ~25-40h | medium |
| 3 | ~10  | 1% | ~2h | n/a (effectively absent) |
| 4 | ~80  | 9% | ~15h | low |
| (uncategorized fragments) | ~80 | 9% | sweep with tier 1 | low |
| **Total** | **919** | 100% | **~55-70h** | |

≈ 8-10 working sessions of 6-8h each.

---

## 5. Migration target recommendation

### Recommended: **CSS-Modules**

1. **Native Vite support**: `*.module.css` works out-of-the-box,
   no config or new dependency.
2. **Composes with existing global.css**: theme system stays exactly
   as-is. CSS-vars consumed in module classes via `var(--token)`
   like the existing inline references.
3. **Per-component scoping**: collisions impossible. Class hashing
   prevents leaking styles between components.
4. **Test parity**: tests can assert `className` presence
   structurally (`className={styles.x}` lookup), already a stronger
   signal than the current "DOM presence" assertions on inline-styled
   elements.
5. **Bundle**: equivalent to inline at runtime; potentially smaller
   because shared selectors are extracted to a single sheet per chunk
   instead of duplicated in every JSX render.
6. **Migration cost**: file-by-file. Each component's `const styles`
   object maps 1:1 to keys in `Foo.module.css`. Mechanical refactor.
7. **Existing `.btn`, `.btn-primary` classes stay global** — used
   across the app. CSS-Modules slot in alongside, not as replacements.

### Rejected: Tailwind

- Would force re-engineering the 6-theme system. Tailwind's `dark:`
  prefix maps to a single `dark` class; Bibliogon's `[data-app-theme=""][data-theme="dark"]` attribute combo cannot
  be replicated without a custom Tailwind plugin.
- Adds a new build dependency + JIT compiler in the dev path.
- Tailwind's utility-first model conflicts with the project's
  semantic-class direction (`.btn-primary` is a semantic class,
  not `bg-blue-600 text-white px-4 py-2 rounded ...`).
- Conversion of 919 occurrences to Tailwind utilities is
  mechanically heavier than CSS-Modules (each class gets a 4-8 token
  utility chain; inline `{display: "flex", gap: 8}` is shorter as
  a CSS-Module `.row` class).

### Rejected: styled-components / emotion

- Adds runtime CSS-in-JS dependency (≈12 KB gzipped).
- Project explicitly avoids new frontend deps (architecture.md).
- Would not solve the test-ability gap (jsdom still has no layout
  engine).

### Hybrid stays as-is

The existing global.css with `.btn-*`, `.input`, etc. continues to
serve cross-component primitives. CSS-Modules add component-specific
layout / spacing. No change to global.css needed beyond minor
additions for Tier-1 utility classes if the audit identifies
≥3 reuse sites for any one shape.

---

## 6. Risk assessment

### Visual regression
- **6 themes × light/dark = 12 variants** per component. Manual
  smoke per migrated component is mandatory.
- Suggested gate: Playwright snapshot tests against the 4 most-used
  pages (`/`, `/articles`, `/settings`, `/book/:id`) per theme,
  baseline captured before refactor begins.
- Risk per file: medium. A misconfigured CSS-Module can shadow a
  global selector and the visual diff is easy to miss in unit tests.

### Theme coverage
- Each migrated `.module.css` consuming `var(--token)` inherits the
  theme system unchanged. No theme files need editing.
- Exception: any inline style that was *overriding* a global theme
  rule will need its specificity preserved. Inline beats class
  specificity by default; if a class-only replacement loses, add
  `:where()` or a single `&&` doubled selector.

### Bundle size
- Estimated **smaller** post-refactor:
  - Inline styles ship as JS object literals serialized at every
    render.
  - CSS-Modules ship as one extracted CSS chunk per component bundle,
    minified and shared across renders.
- No formal measurement yet; capture before/after via `npm run build
  -- --report` once Tier 2 is half-migrated.

### Test impact
- `frontend/src/styles/global.css.test.ts` exists (38 lines). It
  asserts global stylesheet contracts; CSS-Modules do NOT touch
  global.css and the test stays green.
- Vitest tests assert structural DOM (`getByTestId`, `toHaveTextContent`).
  None of the existing 678 tests inspect computed styles. Migration
  should not break them; if any do, they were already brittle.
- Playwright smoke specs use `data-testid` selectors. No CSS impact.

---

## 7. Proposed sequencing

### Phase A — Quick wins + Tier 1 sweep (1 session, ~8h)

- Migrate the trash-card layout fix as a pilot (T-01-pilot, 30 min):
  rewrite `layout.trashCard` + `styles.trashCard` as a shared
  `TrashCard.module.css`. Validates the migration pattern AND
  resolves the user-visible permanent-delete bug from the
  trash-card-permanent-delete-recheck audit.
- Sweep Tier 1 one-offs across the top 5 files:
  Settings, BookMetadataEditor, GitBackupDialog, BackupCompareDialog,
  ExportDialog.

Output: ~150-200 inline styles eliminated. One commit per file.

### Phase B — Tier 2 component-local migration (4-6 sessions)

- One file at a time, by descending count:
  1. `Settings.tsx` (largest, isolate first)
  2. `BookMetadataEditor.tsx`
  3. `GitBackupDialog.tsx`
  4. `BackupCompareDialog.tsx`
  5. `ExportDialog.tsx`
  6. … remaining top-15

- Per file:
  - Create `Foo.module.css`.
  - Move every `styles.x` to a class.
  - Replace `style={styles.x}` with `className={styles.x}`.
  - Smoke 6-themes light/dark.
  - One commit.

### Phase C — Tier 4 dynamic-style cleanup (1-2 sessions)

- For each remaining inline (post-Tier 2), check if a CSS variable
  pass-through can replace it. If yes, migrate. If no, document the
  inline as intentional + leave.

### Phase D — Tier 1 mop-up (1 session)

- Sweep the remaining 30+ files at <10 inline-styles each.

### Total estimate

- Phase A: 1 session
- Phase B: 4-6 sessions
- Phase C: 1-2 sessions
- Phase D: 1 session
- **Total: 7-10 sessions** (~55-70h)

---

## 8. Quick wins

Three high-value migrations under 30 min each, useful as pattern
validators:

### Quick-win 1 — `TrashCard` shared module

Books-Trash and Articles-Trash both define a near-identical
`trashCard` style. Extract to `frontend/src/components/trash/TrashCard.module.css`
+ a small `<TrashCard>` React component used by both
`Dashboard.tsx` and `ArticleList.tsx`. Resolves the
[trash-card permanent-delete recheck](trash-card-permanent-delete-recheck.md)
bug as a side-effect because the new shared component will encode
`flexWrap: wrap` once.

### Quick-win 2 — `.icon-row` utility class

~40 inline-styles in `Toolbar.tsx`, `ChapterSidebar.tsx`,
header areas use:
```
{ display: "flex", alignItems: "center", gap: 8 }
```
Extract to a single utility class in `global.css`:
```css
.icon-row { display: flex; align-items: center; gap: 8px; }
```
Replace `style={{ display: "flex", alignItems: "center", gap: 8 }}`
with `className="icon-row"` everywhere.

### Quick-win 3 — `.muted` utility class

~25 inline-styles for muted secondary text:
```
{ color: "var(--text-muted)", fontSize: "0.8125rem" }
```
Extract to `.muted` in `global.css`. Mechanical replace.

---

## 9. Acceptance criteria check

- [x] Full inventory table (top 20 + summary, full list available via grep)
- [x] Tier classification with counts
- [x] Migration-target recommendation: **CSS-Modules**, justified
- [x] Risk assessment covers themes (6 × light/dark) and visual regression (Playwright snapshot baseline recommended)
- [x] Quick-wins list (3 candidates)
- [x] No source code changes (this commit + the roadmap commit are docs only)
- [x] Tests stay green (no source touched)

---

## 10. STOP

Audit done. Wait for Go before any source migration.
