# Frontend God-Files Cohesion Audit — 2026-06-14

Read-only audit (no code changed). Frontend pendant to the backend
god-file audit. Every file was read directly (not trusted from the
line-count baseline); line counts verified with `wc -l`.

**Format deviation from the backend audit:** the referenced
`docs/audits/backend-god-files-audit-2026-06-14.md` is not present on
the branch this audit was produced from (`develop`), so the backend
format could not be mirrored field-for-field. This report uses the
output schema from the audit prompt (summary table + prioritized split
order + cross-cutting findings) plus a per-file detail section. Importer
counts are "distinct non-self files referencing the module specifier in
an import" and **include test files** (so a typical UI component shows
~2: its single real consumer + its test).

Scope: 14 ERROR-zone files (>1000 LOC, baselined) + 4 WARN-zone files
(501–1000 LOC, not baselined). Total 18.

---

## Summary table

| # | File | LOC | Cohesion (1-10) | Top concern-mix | Split proposal (headline) | Importers | Risk |
|---|------|-----|-----------------|-----------------|---------------------------|-----------|------|
| 1 | `src/api/client.ts` | 5212 | 2 | HTTP transport + 184 inline DTOs + 48 entity API namespaces in one `api` object | `client/http.ts` + `client/types/*` + `client/<entity>.ts` + barrel `index.ts` | 211 | Medium |
| 2 | `src/components/BookMetadataEditor.tsx` | 2699 | 2 | ~30-field form + 5 fetch effects + AI gen + save side-effects + 10-tab JSX + 13 in-file sub-components (3 feature domains) | form/AI/git/KDP hooks + per-tab components + `metadataHelpers.ts` | 2 | Medium |
| 3 | `src/components/Editor.tsx` | 2043 | 3 | TipTap config + toolbar cmds + autosave SM + draft-recovery + AI review + 2 MD serializers | `useAutosave`/`useDraftRecovery`/`useAiReview`/`useTiptapEditor` + `utils/markdownToHtml.ts` | 2 | Medium-High |
| 4 | `src/storage/dexie-storage.ts` | 1978 | 5 | Dexie schema/9 migrations + seeding + ~22 entity CRUD + blob handling + book-graph ingest | `storage/dexie/{schema,seed,blobs,graph,<entity>}.ts` + barrel | 10 | Low |
| 5 | `src/pages/ArticleEditor.tsx` | 1640 | 3 | load + meta/content save + translation + export + AI-meta — **zero hooks extracted** | `useArticleSave`/`useArticleTranslation`/`useArticleExport`/`useArticleAiMeta` | 2 | Medium |
| 6 | `src/pages/ArticleList.tsx` | 1633 | 5 | list/trash + bulk-action cluster (~11 handlers); list mechanics already in hooks | `useArticleBulkActions` + `useArticleTrash` + `utils/downloadBlob.ts` | 2 | Medium |
| 7 | `src/components/import-wizard/steps/PreviewPanel.tsx` | 1622 | 6 | import-wizard step-3 field-selection form (already 13 sub-components) + big git sub-flow + inline styles | `previewFormState.ts` + `GitAdoptionSection.tsx` + `previewAssets.tsx` | 2 | Low |
| 8 | `src/components/articles/ConvertToBookWizard.tsx` | 1336 | 3 | 6-step state machine + dnd + API + 6 inline `renderStep*` | `useConvertToBookWizard` + `convertWizardPayload.ts` + `steps/*` | 2 | Medium |
| 9 | `src/components/ComicBookEditor.tsx` | 1323 | 3 | page/panel/bubble CRUD + image upload + grid-overflow business logic + 3-col JSX | `gridTemplateOverflow.ts` (pure) + `useComicPages`/`useComicPanelsAndBubbles`/`useComicAssetUrls` | 2 | Medium |
| 10 | `src/components/PageCanvas.tsx` | 1281 | 4 | ~450 LOC pure layout/style math co-located in render + per-layout branching + upload | `pageLayoutStyles.ts` + `pageTextContent.ts` + `usePageImageUpload` | 2 | Low |
| 11 | `src/pages/Dashboard.tsx` | 1276 | 4 | list/trash + bulk cluster + one ~740-LOC `return` (no sub-components) | `useBookBulkActions` + `useBookTrash` + `DashboardHeader`/`BookGridOrList` + `downloadBlob` | 1 | Medium |
| 12 | `src/components/CommentsAdminSection.tsx` | 1141 | 4 | list+filter+pagination + selection/bulk + trash lifecycle + ~200-LOC inline row | `useCommentsAdmin` + `CommentRow.tsx` | 2 | Low-Med |
| 13 | `src/pages/BookEditor.tsx` | 1119 | 4 | URL/view state machine + chapter switch + 135-LOC save (409-lock) + chapter CRUD | `useEditorViewState`/`useChapterSave`/`useChapterCrud`/`useGitSyncStatus` | 2 | High |
| 14 | `src/components/ChapterSidebar.tsx` | 1033 | 6 | presentational: list + dnd + menus + 30-prop "Werkzeuge" footer (clean seam) | sub-components + `chapterGroups.ts` | 2 | Low |
| 15 | `src/components/Storyboard.tsx` | 955 | 6 | grid+dnd + annotations + story-bible integration (already part-decomposed) | `useStoryboardData` + `useStoryBibleIntegration` | 2 | Low |
| 16 | `src/pages/GitBackupPage.tsx` | 922 | 6 | git status/forms + conflict state machine + badge (best gating discipline) | `useGitBackup` + `ConflictResolution`/`SyncBadge`/`GitRemoteConfig` | 0 | Low |
| 17 | `src/components/LayoutConfigImageRow.tsx` | 864 | 6 | 8 per-layout config-form components + shared helpers (family module) | `layoutConfig/` directory + `shared.tsx` | 2 | Low |
| 18 | `src/components/CollageCanvas.tsx` | 859 | 6 | collage dnd + z-index/geometry math + image/text-region CRUD | `collageNamespace.ts` + item components + `useCollageEditor` | 2 | Low |

---

## Prioritized split order (lowest risk × highest benefit first)

Weighting per prompt: **architecture violation > raw size; few importers > many; clear concern boundaries > interwoven logic.**

### Tier 0 — Architecture-violation quick wins (do first; small, targeted, separable from the full split)

These are seam/feature-gate inconsistencies. Each is a small change that does NOT require splitting the whole file, and each removes an architecture violation:

- **BookEditor.tsx** — git-sync gated by raw `mode === "dexie"` instead of `useFeature(FEATURES.GIT_SYNC)`. Route through the registry.
- **BookMetadataEditor.tsx** — audiobook/git/KDP/AI gated by ad-hoc `offline`/`pluginStatus` booleans instead of `useFeature()`. Migrate to the registry (Editor.tsx is the in-repo goldstandard).
- **Storyboard.tsx** — story-bible availability probed via `getStorage().storyBible.getInfo().catch()` instead of `useFeature('story-bible')`. Replace the bespoke probe.

### Tier 1 — Pure-helper extractions (Low risk, high benefit, zero behavior change)

Move co-located pure logic out of the render path into testable modules. Strong existing test coverage backs these.

1. **PageCanvas** → `pageLayoutStyles.ts` + `pageTextContent.ts` (~450 LOC of pure style/geometry math out of the render body).
2. **ComicBookEditor** → `gridTemplateOverflow.ts` (the ~165-LOC overflow-distribution business logic as a pure plan-builder).
3. **Editor** → `utils/markdownToHtml.ts` (`markdownToHtml` + `inlineMarkdown`, already pure).
4. **CollageCanvas** → `collageNamespace.ts` (read/normalize/clamp + `composeCollageUpdate`).
5. **ConvertToBookWizard** → `convertWizardPayload.ts` (`buildPayload`/`sortArticlesPreview`/`topTagsWithCounts`).

### Tier 2 — Family-module directory splits (Low risk; barrel re-export keeps every import path stable)

6. **LayoutConfigImageRow** → `layoutConfig/` directory (8 components by layout family; the 3 multi-image bodies are a further RCU collapse candidate).
7. **dexie-storage.ts** → `storage/dexie/{schema,seed,blobs,graph,<entity>}.ts` + `index.ts` barrel (10 importers; **preserve `version().stores()` migration ordering verbatim**).
8. **client.ts** → `client/http.ts` + `client/types/*` + `client/<entity>.ts` + `index.ts` barrel (211 importers → Medium; type extraction must stay backward-compatible because dexie-storage inline-imports its DTO types).

### Tier 3 — Hook extraction from clean-seam / presentational components (Low–Low-Med)

9. **ChapterSidebar** → sub-components (`SortableChapterItem`/`SortableGroup`/`AddChapterMenu`/`SidebarToolsFooter`) + `chapterGroups.ts` (clean seam; cosmetic).
10. **Storyboard** → `useStoryboardData` + `useStoryBibleIntegration` (+ Tier-0 `useFeature` migration).
11. **GitBackupPage** → `useGitBackup` + `ConflictResolution`/`SyncBadge`/`GitRemoteConfig` (0 non-test importers; also address inline-themable-style debt).
12. **PreviewPanel** → `previewFormState.ts` + `GitAdoptionSection.tsx` + `previewAssets.tsx`.
13. **CommentsAdminSection** → `useCommentsAdmin` + `CommentRow.tsx` (mind the documented `tRef` dep-stability + selection-reconcile-on-delete invariants).

### Tier 4 — Page/editor hook extraction (Medium; share between parallel surfaces — RCU)

14. **ArticleList** → `useArticleBulkActions` + `useArticleTrash` + shared `utils/downloadBlob.ts`.
15. **Dashboard** → `useBookBulkActions` + `useBookTrash` + `DashboardHeader`/`BookGridOrList`/`DashboardTrashSection` + the same `downloadBlob`. **Pair with #14** (Articles↔Books parallel surfaces).
16. **ArticleEditor** → `useArticleSave`/`useArticleTranslation`/`useArticleExport`/`useArticleAiMeta` (worst-decomposed page; no hooks today).
17. **BookMetadataEditor** → form/AI/git/KDP hooks + per-tab components + `metadataHelpers.ts` (+ Tier-0 `useFeature` migration). Largest single file after client.ts.

### Tier 5 — Highest risk (do last, with regression pins in hand)

18. **BookEditor** → `useEditorViewState` (concentrates all `setSearchParams` clobber-sensitive writes) + `useChapterSave` (135-LOC, 409 self-conflict, version refs) + `useChapterCrud` + `useGitSyncStatus`. Regression-pinned in `BookEditor.test.tsx` (chapter-switch `?chapter=` test, autosave-409); extraction risks those pins.

---

## Cross-cutting findings

**X1 — Feature-gating is split between the registry and ad-hoc checks.**
`useFeature()` (@astrapi69/feature-strategy) is used correctly in
`Editor.tsx`, `ArticleList.tsx`, `Dashboard.tsx`, `GitBackupPage.tsx`.
It is **bypassed** in `BookEditor.tsx` (git-sync via raw `mode` check),
`BookMetadataEditor.tsx` (audiobook/git/KDP/AI via `offline`/`pluginStatus`
booleans), and `Storyboard.tsx` (bespoke `getInfo().catch()` probe). This
is the highest-value cross-cutting fix because it is an architecture
violation that is small and separable (Tier 0). `GitBackupPage.tsx` is the
textbook reference: `useFeature` gate → `offline` short-circuits the mount
effect → renders `<FeatureNotice>` instead of the live component (no `/api`
fires offline).

**X2 — Page-body business logic not extracted to hooks.** Pervasive across
the editors/pages. The goldstandard list-mechanics hooks
(`useViewMode`/`useSelection`/`usePagedList`/filter hooks) ARE applied in
`ArticleList`/`Dashboard`, but bulk-action + trash orchestration, save
orchestration, translation/export/AI flows still live in the component
body. `ArticleEditor` is the extreme case (no hooks at all).

**X3 — Duplicated `downloadBlob` plumbing.** The
`URL.createObjectURL → anchor click → revokeObjectURL` block is duplicated
in `ArticleList` (×2) and `Dashboard`. Extract one `utils/downloadBlob.ts`
(RCU 2-surface threshold) and consume from both.

**X4 — Parallel bulk-action + trash orchestration (Articles ↔ Books ↔ Comments).**
`ArticleList`, `Dashboard`, and `CommentsAdminSection` each hand-wire the
same shape (selection → bulk delete/restore/permanent + trash lifecycle).
Extract parallel `use*BulkActions` / `use*Trash` hooks; keep the surfaces
in lock-step (Articles-vs-Books parallel-surface rule).

**X5 — Pure logic co-located in the render path (the biggest, lowest-risk wins).**
`PageCanvas` (~450 LOC style/geometry math), `ComicBookEditor` (~165 LOC
grid-overflow logic), `Editor` (2 MD serializers), `CollageCanvas`
(z-index/namespace math), `ConvertToBookWizard` (payload builder). All are
already pure or near-pure; relocation to helper modules is mechanical and
unit-testable. This is Tier 1.

**X6 — Inline themable styles (Tailwind-first violation).** Static
`var(--token)` values passed as inline `style={{}}` (not dynamic) in
`GitBackupPage`, `PreviewPanel`, `ConvertToBookWizard`, and a mid-migration
`ComicBookEditor` (sidebars already on Tailwind, chrome still inline).
Distinct from legitimate dynamic inline styles (drag transforms, %-widths,
computed geometry) in `PageCanvas`/`CollageCanvas`, which are correct.

**X7 — "Family modules" that outgrew one file.** `client.ts` (48 entity
namespaces), `dexie-storage.ts` (22 entity CRUD blocks), and
`LayoutConfigImageRow.tsx` (8 layout-config components) are not tangled —
they are cohesive collections too large for one file. A barrel-re-exporting
directory split keeps every import path stable and is low-risk.

**X8 — Two hub files dominate the import graph.** `client.ts` (211
importers) and `dexie-storage.ts` (10) are the only files whose split needs
a barrel to avoid a wide blast radius. All other 16 files have ~0–2
importers (mostly self + test), so their splits are low-coordination.

**X9 — No half-wired picker→renderer anti-patterns found** in the
picture-book / collage / layout-config surfaces: every config field written
(`anchor_position`, `split_ratio`, tier fields, collage geometry, z-index)
has a consuming renderer. Positive finding — the lifecycle is closed.

**X10 — `setSearchParams` double-call clobber is currently mitigated but
latent.** `BookEditor` correctly consolidates `?chapter=` + `?view=` into a
single `setSearchParams` call (with a comment citing the clobber class). The
risk re-opens the moment a future handler chains two setters; the proposed
`useEditorViewState` hook would concentrate all clobber-sensitive writes in
one tested unit.

---

## Method notes / limitations

- Cohesion scores are the per-file reviewer judgment (1 = god-file, 10 =
  single clear responsibility); they are comparative within this set, not
  absolute.
- Importer counts include test files and use import-specifier matching; a
  dynamic/lazy route import by string may undercount (e.g. `GitBackupPage`
  = 0 is a lazy route).
- No code was modified, no issue filed, no branch required for the audit
  itself. This file is uncommitted, for review.
