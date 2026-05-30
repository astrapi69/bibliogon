# Full Application Component-Consistency Audit (2026-05-30)

Phase 1 of the Full Application Component-Consistency Sweep. This
is an **audit-only** deliverable: it inventories every interactive
control type across the frontend, classifies the inconsistencies,
and recommends a remediation sequence. **No code is changed in this
commit.** The user reviews before any Phase 2 migration begins.

Companion to the v0.41.0 UX/UI Theme Audit, which fixed
token-completeness, contrast, and accessibility but explicitly did
**not** address component-level visual consistency (button /
select / input / checkbox / slider / badge / card styling drift
across surfaces).

---

## Executive summary

The frontend has a **partially-built global design system** in
`frontend/src/styles/global.css`. Buttons and text inputs already
have mature global primitives; **selects, checkboxes, sliders,
badges, and cards do not** — each surface re-implements them with
CSS-module or inline styles. Button migration is ~60% done (an
in-flight effort visible in the last ~10 commits: ChapterSidebar,
PageEditor, comics, ComicBookEditor migrated to the global `.btn`
system); the remaining control types are largely un-unified.

### Scale: session-split required

The sweep crosses the stop-condition threshold defined in the plan
(">200 inconsistencies → session-split needed"). Instance-level
counts:

| Control type | Instances | Files | Unified today? |
|---|---:|---:|---|
| Buttons | 884 refs / 66 CSS-module occurrences | ~25 CSS-module files | **~60% migrated** |
| Native `<select>` | 47 | 23 | No (two systems) |
| Native checkboxes | 52 | 29 | No (`<Toggle>` in 5) |
| Text inputs / textarea | 51 | 32 | Partial (`.input` in ~33) |
| Range sliders | 19 | 5 | No |
| Badges (ad-hoc) | — | 38 | No (2 shared, rest inline) |
| Cards (CSS-module) | — | ~30 | No |

Total well above 200. **Recommendation: split Phase 2 into 4
sub-sessions** (see "Recommended remediation sequence" below). Do
not attempt the whole sweep in one session.

---

## Existing global design-system primitives

What is already shared in `frontend/src/styles/global.css`:

| Primitive | Classes | Maturity |
|---|---|---|
| Buttons | `.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-premium` `.btn-sm` `.btn-icon` | Mature |
| Sidebar buttons | `.btn-sidebar-icon` `.btn-sidebar-block` (+`.is-active`) | Mature (added 2026-05-30, C-chapter) |
| Text input | `.input` `.label` `.field` | Exists, partial adoption |
| Radix select | `radix-select-trigger` `radix-select-content` `radix-select-item` (via `settings/RadixSelect.tsx`) | Settings-only |
| Radix Dialog | `.dialog-*` (see global.css "Radix Dialog" block) | Used by `AppDialog` |

**Gaps in the global system** (no global class exists):
`.btn-md` / `.btn-lg` (only `.btn` default + `.btn-sm`), native
`.select`, `.checkbox`, `.slider`/`.range`, `.badge`, `.card`.

The plan's target variant list vs. reality:
- `.btn-primary/-secondary/-danger/-ghost` — **all exist already.**
- `.btn-sm` exists; `.btn-md` (= default `.btn`) implicit; **`.btn-lg`
  missing** (file as new only if a surface needs it — currently
  none does; do not add speculatively).
- `.btn-icon` exists; `.btn-sidebar-*` exist. The docstring at
  `global.css:977` notes a `.btn-sidebar` text base "can follow"
  when needed — not yet needed.

---

## Component inventories + classification

Classification key:
- **CRITICAL** — same control visibly differs on two surfaces a
  user sees in one session.
- **HIGH** — different styling *systems* for the same control type
  (CSS-module vs global vs inline vs Radix).
- **MEDIUM** — minor size/padding/radius drift, same system.
- **LOW** — intentional variant (sidebar context, danger zone,
  documented design-intent exemption).

### 1. Buttons — HIGH (migration ~60% done)

**Already on global `.btn`** (~40 files): ComicBookEditor,
PageEditor, ChapterSidebar, BookCard, ArticleCard, BookListView,
TrashCard, ExportDialog, CreateBookModal, AppDialog, StoryBibleSidebar,
CoverUpload, QualityTab, RichTextToolbar, Toolbar (partial),
settings/PluginSettings, settings/EditorSettings, SshKeySection, and
others.

**Still on CSS-module button classes** (66 occurrences, ~25 files):

| Count | File | Notable classes |
|---:|---|---|
| 4 | `components/Toolbar.tsx` | `controlBtn` (mixed with global `.btn`) |
| 4 | `components/DashboardFilterBar.tsx` | `sortBtn` `sortBtnActive` `resetBtn` |
| 2 | `pages/GetStarted.tsx` | `primaryButton` `navButton` |
| 2 | `components/SupportSection.tsx` | (mixed with global `.btn`) |
| 2 | `components/RichTextToolbar.tsx` | `formatBtn` `formatBtnActive` `btn` `btnActive` |
| 2 | `components/QualityTab.tsx` | `iconButton` (mixed) |
| 2 | `components/PageThumbnails.tsx` | `deleteBtn` `addBtn` |
| 2 | `components/ExportDialog.tsx` | (mixed) |
| 2 | `components/CoverUpload.tsx` | (mixed) |
| 1 ea | Settings, MediumImportPage, Help, Storyboard, SplitButton, PageCanvas, MediumImportUploadZone, KeywordInput, kdp-wizard/ArcStep, Editor, DashboardFilterSheet, CreateBookModal, CollageCanvas, ChapterTemplatePickerModal, articles/ArticleBulkActionBar, AiSetupWizard | various (`closeBtn` `backBtn` `undoButton` `navButtonOutlier` `controlBtn` …) |

**The CRITICAL sub-set** (toolbar buttons that users compare
directly across the four editors): `RichTextToolbar.formatBtn` and
`Toolbar.controlBtn` still differ from the global `.btn-icon` used
elsewhere in editor chrome. Toolbar is half-migrated (some global
`.btn`, some `controlBtn`) which is the worst state — same toolbar,
two systems.

**Action:** migrate all remaining per-module button classes to the
global system; delete orphaned CSS-module button classes after.
`SplitButton.tsx` and any genuine variant needs (sort-toggle active
state) should map to `.btn-secondary` + an `.is-active` modifier,
not a bespoke class.

### 2. Selects / dropdowns — HIGH (two parallel systems)

**System A — native `<select>`** (47 instances, 23 files), inline
or CSS-module styled, no shared class: ArticleEditor, BookMetadataEditor,
comics/ComicGridTemplatePicker, comics/Tier1Section, comics/Tier2Section,
PdfExportControls, PageSizeSelector, ExportDialog, Storyboard,
RichTextToolbar, LayoutConfigImageRow, NewFromTemplateButton,
articles/* (ArticleBulkActionBar, ArticleFilterBar, ContentTypeFieldsSection,
ConvertToBookWizard, PublicationsPanel), BookBulkActionBar,
CommentsAdminSection, EditorDisplaySettingsPopover, kdp-wizard/ArcStep,
medium-import/MediumImportSettings, import-wizard/steps/*.

**System B — Radix `RadixSelect`** (11 files), uses global
`radix-select-*` classes: CreateBookModal, DashboardFilterBar,
SaveAsTemplateModal, and the settings panels (AiAssistantSettings,
EditorSettings, ErscheinungsbildSettings, VerhaltenSettings,
AudiobookSettingsPanel, TranslationSettingsPanel).

**Inconsistency:** Settings dropdowns are themed Radix triggers;
every editor / wizard / comics dropdown is a raw native `<select>`
with browser-default chrome and ad-hoc styling. A user moving from
Settings to an editor sees two different dropdown looks.

**Action (decision needed — see Questions):** either (a) extract a
global `.select` class for native `<select>` matched to `.input`
height/padding/radius (cheaper, keeps native a11y + mobile behavior),
or (b) widen `RadixSelect` adoption to editors (heavier, portal-based,
the happy-dom/Vitest brittleness noted in lessons-learned applies).
**Recommended: (a)** — a global `.select` class. Native selects are
a11y-safe and the styling gap is purely visual (height, border,
font, chevron). Reserve Radix for cases needing rich option rendering.

### 3. Checkboxes / Toggles — HIGH

`<Toggle>` (the SETT-PHASE-3 composition component) is used in only
**5 files** (PdfExportControls, settings/AiAssistantSettings,
settings/EditorSettings, AudiobookSettingsPanel, VerhaltenSettings).
**52 native `type="checkbox"`** remain across **29 files** —
wizards, editors, comics Tier1/Tier2, export dialog, medium-import,
bulk-action bars, list-row selection checkboxes.

**Documented design-intent exemptions** (LOW — keep, do not migrate;
see `Toggle.tsx:16-20` + SETT-PHASE-3-TOGGLE-COMPONENT-01 archive):
- List-row selection checkboxes (BookListView, ArticleList, Dashboard,
  medium-import preview tables) — side-by-side label+description,
  bulk-select semantics, not a settings toggle.
- Generic plugin-setting renderer (`settings/fields/ScalarSettingField.tsx`).

**The real gap (HIGH):** checkboxes inside editors / wizards /
dialogs / comics that *are* settings-like toggles but render as bare
native checkboxes with inconsistent accent-color and sizing
(ExportDialog, PricingStep, comics Tier1/Tier2, MediumImportSettings,
PdfExportControls's remaining native ones). Even the exempt list-row
checkboxes should share one `accent-color` token + size for
consistency, without adopting the full Toggle shape.

**Action:** migrate settings-like checkboxes to `<Toggle>`; for the
exempt list-row + generic renderers, add a shared `.checkbox` class
(or a CSS `input[type=checkbox]` base rule keyed to `--accent`) so
accent + size are consistent everywhere.

### 4. Text inputs / textarea — MEDIUM (partial adoption)

`.input` global class exists (`global.css:1046`). **51 inputs/textarea
across 32 files**; only ~33 className-`input` adoption sites (loose
count). The non-adopting inputs (editor metadata fields, some wizard
steps, EditableTitle's inline input, Storyboard inline editors,
KeywordInput, CategoryInput, BisacCodeInput) use bespoke padding /
border / focus-ring.

**Action:** migrate remaining inputs/textarea to `.input` (textarea
may need an `.input` + `.input-textarea` height modifier). Search
fields already standardize via `SearchClearButton` — verify they wrap
an `.input`.

### 5. Sliders / range — MEDIUM (localized, 5 files)

19 `type="range"` across exactly 5 files, all in the
picture-book / comic layout-config surfaces:
`comics/LayoutConfigComicBubble`, `comics/Tier1Section`,
`comics/Tier2Section`, `LayoutConfigImageRow`, `LayoutConfigSpeechBubble`.
No shared track/thumb styling; each relies on browser-default range
chrome (which differs per OS + per theme, and ignores theme tokens).

**Action:** add a global `.slider` (or `input[type=range].slider`)
class with theme-token track + thumb + value-label placement.
Low blast radius (5 files), high visual payoff (range inputs are the
most browser-divergent native control).

### 6. Badges / tags / chips — HIGH (no shared primitive)

Two shared components exist but **delegate coloring to the caller**
via a `className` prop (`articles/ContentTypeBadge.tsx:24`,
`articles/CommentsCountBadge.tsx:27`) — so the *shape* is shared but
the *color system* is not centralized. `PublicationStatusBadge` is
**inline in `pages/ArticleList.tsx`** (not even extracted). ~38 files
render ad-hoc badge/tag/chip markup (status pills, story-beat tags,
mood-color dots, plugin-tier chips, count badges).

**Action:** extract a shared `<Badge variant="default|success|warning|
danger|info|muted" size="sm|md">` backed by a global `.badge` +
`.badge-{variant}` class set (theme tokens only). Migrate
ContentTypeBadge / CommentsCountBadge / the inline PublicationStatusBadge
+ the highest-traffic ad-hoc badges. Storyboard mood-dots +
comic-bubble convention defaults are allowlisted data-color
exemptions (per architecture rule) — keep.

### 7. Cards — MEDIUM/HIGH (no shared primitive, ~30 re-implementations)

No global `.card`. ~30 files define their own card CSS-module class
(GetStarted has 6 distinct card classes alone; Settings sub-panels
each have one; BookCard, ArticleCard, TrashCard, PluginCard,
ChapterTemplatePickerModal, Storyboard). Border / radius / padding /
shadow / background drift across all of them.

**Action:** add a global `.card` (border, radius, padding, shadow,
bg via tokens) + optional `.card-interactive` (hover) and
`.card-padded` modifiers. Migrate the dashboards (BookCard /
ArticleCard — the CRITICAL pair, side-by-side comparable) first,
then Settings, then the rest.

### 8. Section headers — LOW (already consistent)

`settings/SectionHeader.tsx` is used across ~12 Settings sub-panels
+ SshKeySection. Consistent within Settings. Non-Settings surfaces
(editors, dashboards) use ad-hoc headers but in contexts that don't
sit beside a SectionHeader, so the drift is not user-visible in one
session. **No action required** beyond verifying no Settings panel
re-rolls its own header.

### 9. Modals / dialogs — MEDIUM (mixed AppDialog vs raw Radix)

`AppDialog` used in 22 sites; ~32 files use raw `@radix-ui/react-dialog`.
`WizardShell` standardizes wizards. The raw-Radix dialogs each style
their own overlay/content. Lower priority than the control-level work
(dialogs are seen one at a time, not side-by-side), but the
overlay/content chrome should converge on `AppDialog` or the shared
`.dialog-*` classes. **Defer to a follow-up** unless Phase 2 has
budget.

---

## Prioritized inconsistency list

| # | Item | Class | Surfaces | Effort |
|---|---|---|---|---|
| 1 | Toolbar/RichTextToolbar buttons (half-migrated) | CRITICAL | 4 editors | S |
| 2 | Remaining CSS-module button classes | HIGH | ~25 files | M |
| 3 | Native `<select>` vs Radix select split | HIGH | 23 files | M |
| 4 | Bare native checkboxes (settings-like) | HIGH | ~20 files | M |
| 5 | Ad-hoc badges + inline PublicationStatusBadge | HIGH | 38 files | M |
| 6 | Per-module card classes (BookCard vs ArticleCard first) | MED/HIGH | ~30 files | L |
| 7 | Inputs not on `.input` | MEDIUM | ~15 files | S |
| 8 | Range sliders un-themed | MEDIUM | 5 files | S |
| 9 | Raw-Radix dialogs vs AppDialog | MEDIUM | 32 files | L |
| 10 | Checkbox accent/size on exempt list-rows | LOW | dashboards | S |

---

## Recommended remediation sequence (Phase 2 session-split)

Group by control type, not by surface (per plan), but split across
**4 sub-sessions** to stay under per-session blast-radius limits and
keep `make test` + Playwright green at each atomic commit:

- **Session 2A — Buttons + Inputs + Sliders** (finish what's started):
  items 1, 2, 7, 8. The button work is already 60% done; closing it +
  the cheap input/slider unification is a coherent first session.
- **Session 2B — Selects + Checkboxes**: items 3, 4, 10. Decide the
  native-`.select`-class vs Radix-widening question first (see below).
- **Session 2C — Badges + Cards**: items 5, 6. Extract `<Badge>` +
  `.card`; migrate the dashboard pairs first (most user-visible).
- **Session 2D (optional) — Dialogs**: item 9. Converge raw-Radix
  dialogs onto AppDialog / shared `.dialog-*`.

Then Phase 3 (Playwright visual baselines) + Phase 4 (advisory lint
rule) as originally planned, after 2A–2C land.

Each commit: `make verify-theme` green, `getComputedStyle()`
Playwright assertions for the migrated control, all 12 theme variants
checked, zero CSS-module classes for the migrated type remaining
(except documented exemptions).

---

## Questions and assumptions

Per the self-clarification rule, decisions that change Phase 2 scope:

1. **Selects: native `.select` class vs Radix widening?**
   *Assumption (conservative):* add a global `.select` class for
   native `<select>` matched to `.input` chrome; keep Radix for
   Settings only. Rationale: native selects are a11y- and
   mobile-safe; Radix portals are brittle under happy-dom/Vitest
   (lessons-learned). **Needs user confirmation** — this is the one
   architectural fork.

2. **`.btn-lg` — add it?** *Assumption:* no. No surface needs a large
   button today; adding it would violate "don't build for later."
   File only if Session 2A finds a real need.

3. **Badge extraction depth.** *Assumption:* extract `<Badge>` +
   migrate the shared 2 components + inline PublicationStatusBadge +
   top ad-hoc status pills; leave Storyboard mood-dots /
   comic-bubble convention colors as allowlisted data-color
   exemptions. **Confirm whether to migrate ALL 38 badge sites or
   just the user-comparable status badges.**

4. **Dialogs (Session 2D) — in scope now or deferred?**
   *Assumption:* deferred. Dialogs are seen one-at-a-time, lower
   user-visible drift. Confirm whether to include.

5. **Card migration breadth.** *Assumption:* dashboards + Settings
   first; GetStarted/Help/onboarding cards later. Confirm whether
   the full ~30-file card sweep is one session or split.

No STOP-blocking questions arose during the audit. All inventory
counts were produced by grep against the working tree at HEAD
`5bd5271f` and are reproducible via the commands in the sweep plan.
