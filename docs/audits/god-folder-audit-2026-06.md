# God-Folder Audit (frontend + backend)

**Date:** 2026-06-19
**Scope:** Analysis only. No code change. Directories under
`frontend/src/` and `backend/app/` with more than 10 files.
**Method:** file inventory + concern grouping (by filename + import
analysis) + import-blast-radius estimate. Compared against the
sibling project `adaptive-learner`.

A "God-Folder" here means the directory analog of a God-File: a flat
directory accumulating many files of **mixed, unrelated concerns**,
with no internal substructure. A large directory whose files all share
ONE concern (e.g. `components/comics/`) is NOT a God-Folder - it is a
single-concern module that happens to be big. This distinction drives
the whole audit: the file count alone does not decide; the concern
spread does.

---

## Inventory

`src` = non-test source files at directory top level (`maxdepth 1`).
`test` = colocated `*.test.*` files. Backend `test_*` files live in
`backend/tests/`, so every `.py` here is source.

| Directory | total | src | test | Concern spread | God-Folder? |
|---|---:|---:|---:|---|---|
| `frontend/src/components` | 231 | 126 | 105 | **very mixed** (editor, story-bible, picture-book, export, dashboard, primitives, ...) | **YES (severe)** |
| `frontend/src/hooks` | 82 | 49 | 33 | **mixed** (editor, git, sidebar, filters, AI, theme, ...) | **YES** |
| `frontend/src/components/settings` | 53 | 27 | 26 | single (settings sections) | no |
| `frontend/src/pages` | 35 | 20 | 15 | one-page-per-route + dispatch/menu helpers | borderline |
| `frontend/src/utils` | 29 | 17 | 12 | **mixed** (clipboard, dates, AI providers, icons, event-recorder, ...) | **YES (mild)** |
| `frontend/src/export` | 29 | 18 | 11 | single (client export engine) | no |
| `frontend/src/components/comics` | 27 | 15 | 12 | single (comic editor) | no |
| `frontend/src/lib/components` | 26 | 13 | 13 | single (library-grade primitives) | no |
| `frontend/src/components/articles` | 25 | 17 | 8 | single (article list/editor) | no |
| `frontend/src/storage` | 22 | 11 | 11 | single (storage seam) | no |
| `frontend/src/storage/dexie` | 21 | 21 | 0 | single (dexie tables) | no |
| `frontend/src/components/import-wizard/steps` | 21 | 12 | 9 | single (wizard steps) | no |
| `frontend/src/ai` | 21 | 12 | 9 | single (browser AI client) | no |
| `frontend/src/lib/utils` | 20 | 10 | 10 | single (library-grade utils) | no |
| `frontend/src/api` | 16 | 11 | 5 | single (API client split) | no |
| `frontend/src/import` | 15 | 8 | 7 | single (client import) | no |
| `frontend/src/components/kdp-wizard` | 14 | 7 | 7 | single (KDP wizard) | no |
| `backend/app/routers` | 39 | 39 | - | one-router-per-resource (FastAPI convention) | borderline |
| `backend/app/services` | 38 | 38 | - | **mixed** (git cluster, AI, audiobook, registries, reset, ...) | **YES (mild)** |
| `backend/app` | 23 | 23 | - | **mixed** (paths, config, lan, licensing, voice, job-store, ...) | **YES (mild)** |
| `backend/app/ai` | 19 | 19 | - | single (AI/template engine) | no |
| `backend/app/services/backup` | 13 | 13 | - | single (backup serializers) | no |
| `backend/app/repositories` | 13 | 13 | - | single (repository pattern) | no |

**Net:** of 23 directories over the threshold, **5 are true
God-Folders** (`components`, `hooks`, `utils`, `services`, `app`). The
other 18 are single-concern modules - large but coherent, and several
(`comics`, `articles`, `kdp-wizard`, `import-wizard/steps`, `ai`,
`storage/dexie`) are themselves the *result* of prior, correct
concern-extraction out of the `components` God-Folder. The pattern of
splitting exists; it has simply never been applied to the top level.

---

## Top-5 worst God-Folders

1. **`frontend/src/components` - 231 files (126 src).** The single
   worst directory in the repo. A flat dumping ground spanning at
   least a dozen unrelated concerns. No barrel (`index.ts`); every
   import is a direct path.
2. **`frontend/src/hooks` - 82 files (49 src), fully flat.** Zero
   subfolders. The highest import-blast-radius in the codebase: 234
   files import from `hooks/`. The reference project already
   subfolders this (`hooks/ui`, `hooks/lesson`, `hooks/settings`, ...).
3. **`backend/app/routers` - 39 files.** Borderline. FastAPI's
   one-router-per-resource convention legitimises the flatness, but
   tight clusters (7 `git_*`, 6 `*_ai_*`/`*_template*`, 3 `article_*`
   export) are getting hard to scan.
4. **`backend/app/services` - 38 files.** A clear `git_*` cluster (12
   files) plus AI, audiobook, registry, reset/token sub-domains living
   side by side in one flat dir.
5. **`frontend/src/utils` - 29 files (17 src).** Smaller, but a classic
   miscellany bucket (dates, clipboard, AI providers, icons, event
   recorder, storage quota).

---

## Per-God-Folder analysis

### 1. `frontend/src/components` (126 src + 105 test)

Concern groups inferred from filenames + imports:

| Group | Example files (src) | ~count |
|---|---|---:|
| **editor/** | `Editor`, `editorExtensions`, `editorContextMenuActions`, `EditorContextMenu`, `editorHelpers`, `editorMenus`, `editor-gates`, `editorMathPrompt`, `EditorDisplaySettingsPopover`, `EditorAiPanel`, `EditorPanels`, `RichTextEditor`, `RichTextToolbar`, `Toolbar`, `CollapsibleToolbar`, `buildComicEditorMenu`, `buildPictureBookEditorMenu` | ~17 |
| **story-bible/** | `StoryBibleSidebar`, `StoryEntityEditor`, `storyBibleIcons`, `storyBibleMention`, `RelationshipGraph(View)`, `EntityNode`, `relationshipColors`, `StoryboardArcView` | ~9 |
| **picture-book/** | `PageCanvas`, `PageEditor`, `PageThumbnails`, `PageSizeSelector`, `LayoutConfig*`, `LayoutPicker`, `CollageCanvas`, `ComicBookEditor`, `ProseStoryboard`, `Storyboard(Annotations)`, `TileSelectCheckbox` | ~14 |
| **book/dashboard/** | `BookCard`, `BookListView`, `BookMetadataEditor`, `BookBulkActionBar`, `CreateBookForm`, `CoverUpload`, `CoverPlaceholder`, `CategoryInput`, `BisacCodeInput`, `KeywordInput`, `Dashboard*Filter*`, `DashboardTrashView` | ~16 |
| **chapter/** | `ChapterSidebar`, `ChapterOutliner`, `ChapterLabelManager`, `ChapterStatusLabel`, `ChapterVersionsView`, `ChapterTemplatePickerModal` | ~6 |
| **templates/** | `SaveAsTemplateModal`, `SaveAsChapterTemplateModal`, `NewFromTemplateButton`, `BulkTemplateImportDialog`, `TemplateImportDropZone` | ~5 |
| **export/audiobook/** | `ExportForm`, `ExportPreviewModal`, `ClientExportMenu`, `PdfExportControls`, `AudioExportGate`, `AudioExportProgress`, `AudiobookPlayer` | ~7 |
| **ai/** | `AiGenerateButton`, `AiSetupWizard`, `AiStoryExtraction`, `AITemplatePanel`, `BulkAiFill*` | ~7 |
| **quality/** | `qualityReport`, `QualityTab`, `qualityThresholds` | 3 |
| **donation/** | `DonationOnboardingDialog`, `DonationReminderBanner`, `SupportSection` | 3 |
| **sync/offline/** | `SyncStatusWatcher`, `ConflictResolutionDialog`, `OfflineBanner`, `OfflineToggleButton`, `AppUpdateBanner` | ~5 |
| **git/** | `GitSyncDiffDialog`, `SshKeySection` | 2 |
| **bulk/** | `BulkActionBar`, `BulkSelectAllCheckbox`, `useBookSelection` | 3 |
| **ui primitives** (-> belong in `lib/components`) | `AppDialog`, `Badge`, `Tooltip`, `RadixSelect`, `SplitButton`, `EmptyState`, `LoadingIndicator`, `ErrorBoundary`, `ErrorReportDialog`, `FullscreenButton`, `SearchClearButton`, `SidebarToggleButton`, `ViewToggle`, `ThemeToggle`, `OrderedListEditor`, `CollapsibleConfigSection`, `ListPaginationControls`, `SkipToContentLink`, `PageLayout` | ~19 |

Proposed substructure (mirrors the existing `components/comics`,
`components/articles` precedent):

```
components/
  editor/  story-bible/  picture-book/  book/  chapter/
  templates/  export/  ai/  quality/  donation/  sync/  git/
  (existing) comics/ articles/ settings/ import-wizard/ kdp-wizard/
```
Plus: promote the ~19 generic primitives into the already-existing
`lib/components/` (library-grade), removing them from app-component
space entirely.

- **Effort:** HIGH. 126 src + 105 test files to relocate. ~89 external
  importer files reference `components/`; plus internal sibling
  imports. Estimate ~250-400 import-line edits. Mechanical (IDE/tsc
  move-refactor), but high churn.
- **Risk:** MEDIUM. Pure-move refactor -> low *semantic* risk; tests
  are colocated and move with their source. The real risk is **churn
  collision** with parallel in-flight work and the large rename
  diff being hard to review. Best done as many small per-group
  commits, not one mega-move.

### 2. `frontend/src/hooks` (49 src + 33 test) - fully flat

Concern groups:

| Group | Example hooks |
|---|---|
| **editor/** | `useEditorAutosave`, `useEditorDisplaySettings`, `useEditorPluginStatus`, `useEditorTools`, `useEditorWordCount`, `useBookEditorViews`, `useTypewriterScroll`, `useWordWrap`, `useFlushOnUnload` |
| **git/** | `useGitBackup`, `useGitStatus`, `useRemoteDefaultBranch` |
| **sidebar/layout/** | `useSidebarCollapse`, `useDualSidebarCollapse`, `useExclusiveSidebars`, `useCollapsibleState`, `useFullscreenToggle`, `useIsMobile` |
| **list/filter/** | `useArticleFilters`, `useBookFilters`, `useArticleListData`, `useDashboardBookData`, `usePagedList`, `usePagedList`, `useViewMode` |
| **ai/** | `useAiChapterReview`, `useAiModels`, `useBookMetadataAi` |
| **metadata/author/** | `useBookMetadata`, `useAuthorChoices`, `useAuthorProfile`, `useAllowBooksWithoutAuthor`, `useBookTypes`, `useContentTypes`, `useTopics` |
| **storage/asset/** | `useArticleImageUrl`, `useAssetUrl`, `usePageImageUpload`, `useArticlePersistence` |
| **story-bible/** | `useStoryBibleIntegration`, `useStoryboardData` |
| **system/platform/** | `useI18n`, `useTheme`, `useOnlineStatus`, `useWebSocket`, `useKeyboardShortcuts`, `useGoBack`, `useDebouncedCallback`, `useRecentDocuments`, `useDragPosition` |

Proposed: `hooks/{editor,git,layout,list,ai,metadata,storage,story-bible,system}/`
- exactly the adaptive-learner shape (`hooks/ui`, `hooks/lesson`, ...).

- **Effort:** HIGH (highest blast radius). 234 files import from
  `hooks/`. ~250+ import edits.
- **Risk:** MEDIUM. Same profile as components - low semantic, high
  churn. Hooks have *no* colocated component coupling beyond imports,
  so the move itself is safe; the cost is purely the import rewrite
  volume.

### 3. `frontend/src/utils` (17 src + 12 test)

Mixed miscellany. Natural groups: **format/** (`formatDate`,
`formatActiveFilters`, `publicationStatusBadge`), **icons/**
(`bookTypeIcon`, `contentTypeIcon`), **ai/** (`aiProviders`),
**event-recorder/** (`eventRecorder`, `eventRecorderPersist`),
**editor/** (`tiptap-markdown`, `layoutConfig`), **platform/**
(`clipboard`, `notify`, `storageQuota`, `spaRedirect`, `versionCheck`,
`imageUrl`, `computeAuthorSuggestions`).

- **Effort:** MEDIUM. 134 importer files reference `utils/`, but utils
  is small (17) so few *files* move. Better target: per the
  `library-first` rule, several of these are stage-1/3 candidates for
  `lib/utils/` rather than app `utils/`.
- **Risk:** LOW. Small, leaf-level, no component coupling.

### 4. `backend/app/services` (38) + `backend/app` (23)

`services/` has an obvious **`git_*` cluster (12 files)** that wants
`services/git/`, plus **AI** (`ai_bulk_fill_*`), **audiobook**
(`audiobook_*`, `google_tts_setup`), **registries**
(`*_registry`), **reset/token** (`reset_service`, `reset_token`),
**translation** (`translation_*`). `backend/app/` top-level mixes app
bootstrap (`main`, `database`, `paths`, `exception_handlers`) with
feature modules (`lan_*`, `voice_store`, `backup_history`,
`credential_store`, `job_store`).

- **Effort:** MEDIUM. Python imports are absolute (`app.services.git_*`);
  103 files reference `app.services`. A package move
  (`services/git/__init__.py` re-exporting) can keep call sites stable
  via a shim, lowering churn.
- **Risk:** LOW-MEDIUM. Backend has the strongest test net; a re-export
  shim makes the move incremental and bisectable. `routers/` (39) is
  *convention-flat* and should be left alone unless the `git_*` /
  `*_ai_*` clusters are sub-packaged.

---

## Comparison with adaptive-learner

The sibling project is the same author, same stack, and is **clearly
further along the concern-subfolder path** - it is the reference target
state:

| Concern | bibliogon | adaptive-learner |
|---|---|---|
| `components/` top-level | **flat**, 126 src + 8 concern subfolders | 145 top-level **but** 8 concern subfolders (`ui`, `lesson`, `content`, `exercises`, `editor`, `dashboard`, `about`, `learning-path`) |
| `hooks/` | **fully flat**, 49 | **subfoldered**: `hooks/{ui,settings,system,lesson,content}` |
| `lib/` | `lib/components` + `lib/utils` | deep `lib/{content,learning-repo,ai,lesson,export,...}` |
| `shared/` namespace | none (only `lib/components`) | `shared/{data-display,gamification,forms,feedback,media}` |
| `storage/` | `storage` + `storage/dexie` | `storage` + `storage/types` (81 top-level - its own God-Folder) |

Takeaways:
- adaptive-learner **already subfolders `hooks/`** - the single
  cheapest, highest-value move bibliogon is missing.
- adaptive-learner has a **`shared/`** primitives namespace; bibliogon
  approximates it with `lib/components` but still leaves ~19 primitives
  stranded in `components/`.
- Neither project has fully tamed `components/` - both still carry a
  100+-file top level. So this is a **shared, known debt**, not a
  bibliogon-specific regression. adaptive-learner's subfolders show the
  destination; bibliogon should converge on the same shape.

---

## Verdict: is a restructure worth it?

**Yes, but selectively and incrementally - not a big-bang reorg.**

The case FOR:
- `components/` (231) and `hooks/` (82-flat) genuinely hurt
  navigability and amplify the Articles-vs-Books / parallel-surface
  drift the project already fights (a flat folder makes "is there a
  sibling that already does this?" a 126-line scan).
- The concern boundaries are **obvious and clean** (the tables above
  group with near-zero ambiguity), and the precedent already exists in
  the same folder (`comics/`, `articles/`, `kdp-wizard/`).
- The reference project proves the target shape and that the move is
  achievable on this stack.

The case for CAUTION:
- These are **pure-move, high-churn** refactors. Per
  `coding-standards.md`, they have low semantic risk but large diffs
  that collide with in-flight feature work and are tedious to review.
- 18 of 23 "over-threshold" directories are **already correct**
  single-concern modules. Do not touch them. File count is not the
  trigger; concern spread is.
- `routers/` flatness is a **FastAPI convention**, not debt. Leave it.

### Recommended order (cheapest, highest-value first)

1. **`hooks/` -> concern subfolders.** Highest value (worst flat
   offender, matches the reference project, no component coupling).
   Best done as one focused session, group-by-group commits. *Do this
   first.*
2. **Promote ~19 generic primitives from `components/` into
   `lib/components/`** (or a new `shared/`). Small, self-contained,
   immediately shrinks the worst God-Folder and aligns with the
   `library-first` rule.
3. **`components/` -> concern subfolders** (`editor/`, `story-bible/`,
   `picture-book/`, `book/`, `chapter/`, `templates/`, `export/`,
   `ai/`, ...). The big one; do it per-group across several commits,
   never as a single mega-move. Each group ships with its colocated
   tests.
4. **`backend/app/services/git/`** sub-package (12-file `git_*`
   cluster) behind a re-export shim. Low risk, bisectable.
5. **`utils/`** miscellany split + `lib/utils/` promotion. Smallest;
   opportunistic / Boy-Scout.

Leave untouched: `routers/` (convention), and every single-concern
folder in the inventory table marked "no".

### Pre-conditions before starting

- A flat folder with no barrel means **import rewrites at every call
  site**. Land each move as its own commit with `tsc --noEmit`/`make
  test` green, and coordinate timing so the large rename diffs do not
  collide with parallel feature branches (this audit was produced in an
  isolated worktree precisely because another agent is active in the
  main checkout).
- Each move is a candidate for the Recurring-Component-Unification
  discipline: while relocating a group, fold any duplicate siblings
  surfaced by the grouping rather than carrying parallel copies into
  the new subfolder.

---

## Questions and assumptions

- **Concern grouping is filename + import inferred**, not a deep
  semantic read of all 126 files. Group boundaries are high-confidence
  where names are self-describing (`Editor*`, `Chapter*`, `Git*`); a
  handful of cross-cutting files (e.g. `EditorAiPanel` could be
  `editor/` or `ai/`) are judgment calls and noted as such.
- **Effort numbers are import-blast-radius estimates** (`grep -l`
  importer-file counts), not exact edit counts. They rank relative
  effort; they are not a substitute for a real move-refactor dry-run.
- **`routers/` and the 18 single-concern folders are deliberately
  excluded from restructure recommendations.** Assumption: FastAPI
  one-router-per-resource is intended convention, and single-concern
  size is not debt. If the project wants a hard per-directory file cap
  regardless of concern, that is a separate policy decision and would
  change this verdict.
- **No code was changed.** This document is the sole artifact.

---

## 2026-06-20 update — #466 CC lane (utils / services / routers)

Implemented the non-`components/` remainder of #466 (the `components/`
domain split is the parallel CCW lane). Pure moves, zero functional
change; `tsc --noEmit`, Vitest (3727), and backend pytest (2654, +1
pre-existing local-only `git` force-push test that depends on local
git config, untouched by this work) all green.

### `frontend/src/utils/` — split (done)

Grouped into six concern subfolders (no barrel, deep relative imports,
mirroring the `hooks/` split): `format/` (formatDate, formatActiveFilters,
publicationStatusBadge), `icons/` (bookTypeIcon, contentTypeIcon), `ai/`
(aiConfig, aiProviders), `eventRecorder/` (eventRecorder,
eventRecorderPersist), `editor/` (tiptap-markdown, layoutConfig),
`platform/` (clipboard, notify, storageQuota, spaRedirect, versionCheck,
imageUrl). `computeAuthorSuggestions` stays flat (domain logic, no clean
group). Tests colocated with their source.

### `backend/app/services/` — residual clusters (partial)

After the `git/` sub-package (#465), 26 flat files remained (>15).
Extracted the two clusters of 3+ cohesive files:
- `services/audiobook/` — credentials, skip_types, synthesis,
  google_tts_setup (dropped the `audiobook_` prefix).
- `services/registries/` — book_type_registry, content_type_registry,
  story_entity_registry (kept the `_registry` basename so importers
  change only the package path, avoiding monkeypatch-alias churn; the
  `__file__`-relative `_REGISTRY_PATH` gained one parent level).

Remaining flat: 19. The residual clusters are all **2-file pairs**
(`ai_bulk_fill_*`, `translation_*`, `plugin_*`, `reset_*`) — below the
meaningful-extraction threshold (a 2-file sub-package adds a directory
hop for marginal cohesion gain); the rest are single-concern singletons.
Left flat by design.

### `backend/app/routers/` — confirmed convention-flat (no change)

Verified every file in `routers/` defines an `APIRouter` (one or more)
for a single resource — it is a **pure** router folder with no stray
helper-only modules. This confirms the audit's verdict: FastAPI's
one-router-per-resource convention legitimises the flatness; the folder
is left untouched. Several router files do embed helper logic (file-level
mixed-concern, e.g. the bulk AI-template routers), but that is a separate
**god-file** concern, not the god-folder restructure of #466, and is not
addressed here.

---

## Completion status — 2026-06-21 (#466 closed)

The frontend god-folder restructure is complete. Final state per the
directory-size ratchet baseline (`.dirsize-baseline.json`):

| Directory | Audit (src) | Now (src) | Status |
|---|---:|---:|---|
| `frontend/src/components` (root) | 126 | **0** | **Done** — Phase 3 (#492) grouped every flat file into 11 concern subfolders; the 126 re-export shims were removed in #494 (all importers rewritten to the real paths). Root holds only CSS modules + `index.ts` barrels; no longer tracked. |
| `frontend/src/hooks` (root) | 49 | **12** | **Done** — Phase 1 (#481) split 5 domains; the generic editor/ui hooks were regrouped (#466) leaving 12 source files (≤ 15). Residual flat hooks are core/cross-cutting (`useI18n`, git-sync, story-bible, author/asset). |
| `frontend/src/utils` | 17 | ~1 | **Done** — #491 split into `text/`/`date/`/`format/`/`icons/`/`platform/`/`ai/`/`editor/`/`eventRecorder/`. |
| `backend/app/services` | — | 20 | **Documented** — `git/` (#465) + `audiobook/` + `registries/` extracted; remaining 20 are 2-file clusters below the extraction threshold + singletons (allowlisted, target v0.59.0). |
| `backend/app/routers` | — | 39 | **Convention-flat** — one `APIRouter` per resource; left as-is (audit-confirmed). |

### Final balance (#466)
- **hooks/**: ~70 → 12 flat source (5 Phase-1 domains + editor/ui regroup).
- **components/**: 229 → 0 flat source (11 concern subfolders; shims removed).
- **utils/**: 6 concern subfolders.
- **lib/components/**: 3 primitives promoted (Badge, Tooltip, EmptyState).
- **Backend**: `services/git/` + `audiobook/` + `registries/` extracted.
- **Ratchet guard** (`check_directory_size.py`) active in CI, protecting
  every reduction against regression; allowlist trimmed (the resolved
  `components` + `hooks` god-folder entries removed/relaxed).

Outstanding (tracked in the allowlist, not part of #466's core scope):
`components/settings` (67), `export` (29), `pages` (35) on the frontend;
`services` (20) on the backend.
