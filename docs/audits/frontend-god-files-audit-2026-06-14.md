# Frontend God-Files Cohesion Audit — 2026-06-14 (enhanced)

Read-only audit (no code changed). Frontend pendant to the backend
god-file audit. All 18 files were read directly; line counts verified
with `wc -l`.

**Status note:** an earlier cut of this audit (table + split order +
cross-cutting findings) is committed on branch
`docs/frontend-god-files-audit` (`d3cb952`). This enhanced version adds
the reusability dimension requested in the expanded prompt: §4 Top-3
Quick Wins, §5 Reusable-Component Candidates (with props sketches), and
a per-file generic-vs-app-specific split. Kept **uncommitted** per the
spec ("nicht committen, nicht pushen").

**Format deviation:** the referenced
`docs/audits/backend-god-files-audit-2026-06-14.md` is not on this
branch, so the backend format isn't mirrored field-for-field. Importer
counts are "distinct non-self files importing the module specifier" and
include test files (a typical component shows ~2 = its consumer + its
test).

---

## 0. Status update (2026-06-15, post-burn-down)

The prioritized split order below was worked through across the frontend
god-file burn-down (PRs #204–#229). Line counts re-verified with `wc -l`.

| # | File | before | after | Status |
|---|------|------:|------:|--------|
| 1 | `api/client.ts` | 5212 | 13 | DONE — split into `api/http.ts` + `api/errors.ts` + `api/apiObject.ts` + 5 domain modules + `api/types.ts` barrel; `client.ts` is now a 13-line re-export barrel (211 call sites unchanged) |
| 2 | `components/BookMetadataEditor.tsx` | 2699 | 797 | DONE (< 1000; WARN) |
| 3 | `components/Editor.tsx` | 2043 | 1837 | PARTIAL — `markdownToHtml` + extension-builder extracted; **still > 1000, stays in `.filesize-baseline`** |
| 4 | `storage/dexie-storage.ts` | 1978 | 2214 | RE-GRANDFATHERED — #204 split it into `storage/dexie/*`, but the #210 merge (branched pre-#204) reverted it to a monolith and it grew. **> 1000, back in `.filesize-baseline`; re-split is a tracked follow-up.** |
| 5 | `pages/ArticleEditor.tsx` | 1640 | 948 | DONE (< 1000) |
| 6 | `pages/ArticleList.tsx` | 1633 | 995 | DONE (< 1000) |
| 7 | `import-wizard/steps/PreviewPanel.tsx` | 1622 | 403 | DONE (< WARN) |
| 8 | `components/articles/ConvertToBookWizard.tsx` | 1336 | 790 | DONE (< 1000) |
| 9 | `components/ComicBookEditor.tsx` | 1323 | 568 | DONE (< 1000) |
| 10 | `components/PageCanvas.tsx` | 1281 | 358 | DONE (< WARN) |
| 11 | `pages/Dashboard.tsx` | 1276 | 982 | DONE (< 1000) |
| 12 | `components/CommentsAdminSection.tsx` | 1141 | 685 | DONE (< 1000) |
| 13 | `pages/BookEditor.tsx` | 1119 | 987 | DONE (< 1000) |
| 14 | `components/ChapterSidebar.tsx` | 1033 | 428 | DONE (< WARN) |
| 15 | `components/Storyboard.tsx` | 955 | 761 | reduced (was WARN, still WARN) |
| 16 | `pages/GitBackupPage.tsx` | 922 | 282 | DONE (< WARN) |
| 17 | `components/LayoutConfigImageRow.tsx` | 864 | 864 | unchanged (still WARN) |
| 18 | `components/CollageCanvas.tsx` | 859 | 859 | unchanged (still WARN) |

**Result:** of the 14 files that were > 1000 (in `.filesize-baseline`), **12
are now under 1000**. Only **two frontend baseline entries remain**:
`Editor.tsx` (1837) and `storage/dexie-storage.ts` (2214, re-grandfathered).
Reusable extractions landed: `lib/components/SortableList.tsx`,
`lib/utils/{chapterGroups,markdownToHtml,pageLayoutStyles,pageTextContent}.ts`,
and `shared/utils/downloadBlob.ts` (X3 DRY fix). The Tier-0 `useFeature`
migrations (X1) shipped via #63.

> Sections 1–6 below are the original read-only 2026-06-14 analysis and
> describe the state BEFORE the burn-down (the LOC column = before). The
> table above is the authoritative after-state.

## 1. Summary table

| # | File | LOC | Cohesion | Top concern-mix | Split proposal (headline) | Importers | Risk |
|---|------|-----|----------|-----------------|---------------------------|-----------|------|
| 1 | `api/client.ts` | 5212 | 2 | HTTP transport + 184 inline DTOs + 48 entity API namespaces | `client/http.ts` + `client/types/*` + `client/<entity>.ts` + barrel | 211 | Medium |
| 2 | `components/BookMetadataEditor.tsx` | 2699 | 2 | ~30-field form + 5 fetch effects + AI gen + save + 10 tabs + 13 in-file sub-components | form/AI/git/KDP hooks + per-tab components + `metadataHelpers.ts` | 2 | Medium |
| 3 | `components/Editor.tsx` | 2043 | 3 | TipTap config + toolbar + autosave + draft-recovery + AI review + 2 MD serializers | `useAutosave`/`useDraftRecovery`/`useAiReview`/`useTiptapEditor` + `utils/markdownToHtml.ts` | 2 | Med-High |
| 4 | `storage/dexie-storage.ts` | 1978 | 5 | schema/9 migrations + seeding + 22 entity CRUD + blobs + book-graph | `storage/dexie/{schema,seed,blobs,graph,<entity>}.ts` + barrel | 10 | Low |
| 5 | `pages/ArticleEditor.tsx` | 1640 | 3 | load + save + translation + export + AI-meta (no hooks) | `useArticleSave`/`useArticleTranslation`/`useArticleExport`/`useArticleAiMeta` | 2 | Medium |
| 6 | `pages/ArticleList.tsx` | 1633 | 5 | list/trash + ~11-handler bulk cluster (list mechanics already in hooks) | `useArticleBulkActions` + `useArticleTrash` + `utils/downloadBlob.ts` | 2 | Medium |
| 7 | `import-wizard/steps/PreviewPanel.tsx` | 1622 | 6 | import step-3 field-select form (13 sub-components) + git sub-flow + inline styles | `previewFormState.ts` + `GitAdoptionSection.tsx` + `previewAssets.tsx` | 2 | Low |
| 8 | `components/articles/ConvertToBookWizard.tsx` | 1336 | 3 | 6-step state machine + dnd + API + 6 inline `renderStep*` | `useConvertToBookWizard` + `convertWizardPayload.ts` + `steps/*` | 2 | Medium |
| 9 | `components/ComicBookEditor.tsx` | 1323 | 3 | page/panel/bubble CRUD + image upload + grid-overflow logic + 3-col JSX | `gridTemplateOverflow.ts` + `useComicPages`/`useComicPanelsAndBubbles`/`useComicAssetUrls` | 2 | Medium |
| 10 | `components/PageCanvas.tsx` | 1281 | 4 | ~450 LOC pure layout/style math in render + per-layout branching + upload | `pageLayoutStyles.ts` + `pageTextContent.ts` + `usePageImageUpload` | 2 | Low |
| 11 | `pages/Dashboard.tsx` | 1276 | 4 | list/trash + bulk cluster + one ~740-LOC return | `useBookBulkActions` + `useBookTrash` + `DashboardHeader`/`BookGridOrList` + `downloadBlob` | 1 | Medium |
| 12 | `components/CommentsAdminSection.tsx` | 1141 | 4 | list+filter+pagination + selection/bulk + trash + ~200-LOC inline row | `useCommentsAdmin` + `CommentRow.tsx` | 2 | Low-Med |
| 13 | `pages/BookEditor.tsx` | 1119 | 4 | URL/view state machine + chapter switch + 135-LOC save + chapter CRUD | `useEditorViewState`/`useChapterSave`/`useChapterCrud`/`useGitSyncStatus` | 2 | High |
| 14 | `components/ChapterSidebar.tsx` | 1033 | 6 | presentational list + dnd + menus + 30-prop footer (clean seam) | sub-components + `chapterGroups.ts` | 2 | Low |
| 15 | `components/Storyboard.tsx` | 955 | 6 | grid+dnd + annotations + story-bible integration | `useStoryboardData` + `useStoryBibleIntegration` | 2 | Low |
| 16 | `pages/GitBackupPage.tsx` | 922 | 6 | git status/forms + conflict state machine + badge (best gating) | `useGitBackup` + `ConflictResolution`/`SyncBadge`/`GitRemoteConfig` | 0 | Low |
| 17 | `components/LayoutConfigImageRow.tsx` | 864 | 6 | 8 per-layout config-form components + shared helpers | `layoutConfig/` directory + `shared.tsx` | 2 | Low |
| 18 | `components/CollageCanvas.tsx` | 859 | 6 | collage dnd + z-index/geometry math + image/text CRUD | `collageNamespace.ts` + item components + `useCollageEditor` | 2 | Low |

---

## 2. Prioritized split order (lowest risk × highest benefit)

Weighting: **architecture violation > raw size; few importers > many; clear concern boundaries > interwoven logic.**

**Tier 0 — Architecture-violation quick wins** (small, separable, no full split):
- BookEditor: git-sync gated by raw `mode==="dexie"` → `useFeature(FEATURES.GIT_SYNC)`.
- BookMetadataEditor: audiobook/git/KDP/AI gated by ad-hoc `offline`/`pluginStatus` → `useFeature()`.
- Storyboard: `getStorage().storyBible.getInfo().catch()` probe → `useFeature('story-bible')`.

**Tier 1 — Pure-helper extractions** (Low risk, no behavior change):
PageCanvas `pageLayoutStyles.ts`+`pageTextContent.ts`; ComicBookEditor `gridTemplateOverflow.ts`; Editor `utils/markdownToHtml.ts`; CollageCanvas `collageNamespace.ts`; ConvertToBookWizard `convertWizardPayload.ts`.

**Tier 2 — Family-module directory splits** (Low; barrel preserves imports):
LayoutConfigImageRow → `layoutConfig/`; dexie-storage → `storage/dexie/` (preserve migration order); client.ts → `client/` + types barrel (Medium — 211 importers).

**Tier 3 — Hook extraction from clean-seam components** (Low–Low-Med):
ChapterSidebar; Storyboard; GitBackupPage; PreviewPanel; CommentsAdminSection.

**Tier 4 — Page/editor hooks** (Medium; pair Articles↔Books):
ArticleList + Dashboard (`use*BulkActions`/`use*Trash` + shared `downloadBlob`); ArticleEditor; BookMetadataEditor.

**Tier 5 — Highest risk** (regression-pinned):
BookEditor (`useEditorViewState` concentrates `setSearchParams` clobber risk + `useChapterSave` 409-lock).

---

## 3. Cross-cutting findings

- **X1 Feature-gating split** — `useFeature()` used in Editor/ArticleList/Dashboard/GitBackupPage; bypassed in BookEditor, BookMetadataEditor, Storyboard (Tier 0). GitBackupPage is the reference pattern.
- **X2 Page-body logic not in hooks** — list mechanics are (useViewMode/useSelection/usePagedList), but bulk/trash/save/translation/export orchestration still in component bodies (ArticleEditor worst).
- **X3 Duplicated `downloadBlob`** — `createObjectURL→anchor→revoke` in ArticleList (×2) + Dashboard → one util.
- **X4 Parallel bulk/trash (Articles↔Books↔Comments)** — same shape thrice → parallel hooks, keep in lock-step.
- **X5 Pure logic in render path** — PageCanvas style math, ComicBookEditor overflow, Editor serializers, CollageCanvas geometry, ConvertToBookWizard payload. Biggest low-risk wins.
- **X6 Inline themable styles** (Tailwind-first violation) — GitBackupPage, PreviewPanel, ConvertToBookWizard, ComicBookEditor (mid-migration). Distinct from legitimate dynamic geometry styles in PageCanvas/CollageCanvas.
- **X7 Family modules outgrew one file** — client.ts, dexie-storage, LayoutConfigImageRow → barrel-directory.
- **X8 Two hub files** — client.ts (211) + dexie-storage (10) need a barrel; the other 16 have ~0–2 importers.
- **X9 No half-wired picker→renderer** in picture-book/collage/layout-config (contracts closed — positive).
- **X10 `setSearchParams` clobber** mitigated in BookEditor but latent; `useEditorViewState` would contain it.

---

## 4. Top-3 Quick Wins (effort ÷ impact)

1. **`utils/downloadBlob.ts`** — extract the triplicated `URL.createObjectURL → anchor.click() → revokeObjectURL` from `Dashboard` + `ArticleList` (×2). ~15 LOC, zero behavior change, removes a 3-site DRY violation, used immediately by both bulk-export paths. **Lowest effort, real cleanup.**
2. **PageCanvas → `pageLayoutStyles.ts` + `pageTextContent.ts`** — relocate ~450 LOC of already-pure style/geometry + text (de)serialization out of the render body. Biggest LOC-out-of-a-god-file per unit risk; backed by existing picture-book E2E + the functions are already pure (several already exported).
3. **Tier-0 `useFeature` migration** (BookEditor git-sync + Storyboard story-bible + BookMetadataEditor) — small diffs that remove three architecture violations (the prompt weights architecture > size). Pattern to copy is in-repo (`GitBackupPage`). Closes the registry-vs-ad-hoc gating split (X1) without a full file split.

---

## 5. Reusable-component candidates (→ `src/lib/components/` or `src/shared/`)

Props-driven, no app imports (no `getStorage`/`guardedFetch`/`IStorageService`/routing/i18n-keys), generic naming, TSDoc with usage example. "Consumers" = how many god-files would use it today.

| Candidate (generic name) | Extract from (file) | Rough props | Consumers today |
|---|---|---|---|
| `SortableList<T>` / `SortableGroup<T>` | ChapterSidebar `SortableChapterItem`/`SortableGroup`; ConvertToBookWizard `SortableArticleRow`; Storyboard `SortableStoryboardCard` | `{items: T[]; renderItem:(t:T)=>ReactNode; onReorder:(ids:string[])=>void; groupBy?}` | 3+ |
| `FieldRow` + `CharCounter` + `RichHtmlField` | BookMetadataEditor `Field`/`Row`/`CharCounter`/`HtmlFieldWithPreview`; PreviewPanel `FieldRow` | `{label; value; onChange; hint?; max?}` / `{value; max}` / `{value; onChange; allowedTags}` | 3+ |
| `DraggableCanvasItem` | CollageCanvas `CollageImageItem`/`CollageTextRegionItem`; PageCanvas overlay items | `{x;y;w;h;z?;rotate?;onChange:(geom)=>void; children}` (wraps existing `useDragPosition`) | 2 |
| `ImageUploadSlot` | ComicBookEditor panel upload; PageCanvas primary/secondary; CollageCanvas add-image | `{currentUrl?; onFile:(File)=>Promise<void>; busy?; placeholder?}` | 3 |
| `StatusBadge` | GitBackupPage `SyncBadge` | `{state: 'ok'\|'pending'\|'error'\|...; label; icon?}` | 1 (→ generic) |
| `WizardStep` / `WizardShell` (promote existing) | ConvertToBookWizard `renderStep*`; import-wizard steps | `{title; children; onNext; onBack; canNext}` | 2+ |
| `FilterBar` + `ViewSwitcher` (consolidate) | Dashboard `DashboardFilterBar`; ArticleList inline filter bar | `{filters; onChange; slots[]}` / `{mode; onMode}` | 2 |
| `CopyButton` (split-button) | Editor/Toolbar copy split-button (`copy-toolbar`) | `{getText:()=>string; variants?: {label;format}[]}` | 1 (→ generic) |
| `SearchClearButton`, `CoverPlaceholder` | scattered list/search surfaces | `{onClear}` / `{seed; label}` | several |
| `CollapsibleSection` / `SplitButton` / `EditableTitle` | already shared — keep as the reference primitives | — | many |

**App-specific (keep, do NOT genericize):** chapter-type grouping + `SidebarToolsFooter` (ChapterSidebar), `AuthorAssetsPanel` (BookMetadataEditor), `StoryboardCard` + arc/continuity (Storyboard), `ConflictResolution` (GitBackupPage), `CommentRow` (CommentsAdminSection), the per-layout config bodies (LayoutConfigImageRow — though `ImageFitDropdown`/`ImagePositionRadio` are generic form controls worth lifting).

---

## 6. Per-file reusability split (generic-extractable vs app-bound)

- **client.ts / dexie-storage.ts** — infra, not UI; no reusable *components*, but both benefit from the barrel-directory split (§2 Tier 2).
- **BookMetadataEditor** — generic: `FieldRow`/`CharCounter`/`RichHtmlField`, tab-shell. App-bound: KDP/audiobook/author-DB panels.
- **Editor** — generic: `markdownToHtml` util, `RecoveryBanner`, toolbar widgets. App-bound: Story-Bible mention + AI-review wiring.
- **ArticleEditor / ArticleList / Dashboard** — generic: `downloadBlob`, `FilterBar`/`ViewSwitcher`, `PagedList` (hook exists). App-bound: entity-specific save/translation/bulk semantics.
- **PreviewPanel** — generic: `FieldSection`/`FieldRow`, file-upload + progress wizard steps. App-bound: cover/git-adoption mapping.
- **ConvertToBookWizard** — generic: `WizardStep`, `SortableList`. App-bound: payload builder, article→book mapping.
- **ComicBookEditor / PageCanvas / CollageCanvas** — generic: `ImageUploadSlot`, `DraggableCanvasItem`, pure style/geometry utils. App-bound: comic grid-overflow rules, picture-book layout semantics.
- **GitBackupPage** — generic: `StatusBadge`. App-bound: git conflict state machine.
- **ChapterSidebar / Storyboard** — generic: `SortableList`/`SortableGroup`. App-bound: chapter-type groups, storyboard annotations + arc view.
- **LayoutConfigImageRow** — generic: `ImageFitDropdown`, `ImagePositionRadio`, slider rows. App-bound: per-layout field sets.
- **CommentsAdminSection** — generic: bulk-bar (already extracted), trash toggle. App-bound: `CommentRow`, reclassify.

---

## Method notes / limitations

- Cohesion scores are comparative reviewer judgment within this set (1 = god-file, 10 = single responsibility).
- Importer counts include tests; lazy/string route imports may undercount (GitBackupPage = 0).
- Read-only: no code changed, no issue filed, no branch required for the audit. File left **uncommitted** for review.
