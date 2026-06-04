# Chat journal - 2026-06-04

Dialog -> Pages migration, continuation. PR #22 (C1 + C2) was merged into
main mid-session (regular merge `d8018a94`); this session's work lives on
`feature/dialogs-to-pages-c3` -> **PR #23** (base main).

## 1. C3 - ExportPage at /books/:bookId/export (commit on branch)

- ExportDialog -> deep-linkable page. Body extracted into a shared,
  self-contained `ExportForm` (format/options state + document download /
  audiobook hand-off, `onDone` replaces `onClose`); `ExportPage` wraps it
  in PageLayout, fetches the book itself for the `Export: <title>` heading
  + manual-TOC flag, Back -> editor.
- The nested audiobook regeneration-mode picker stays a small
  confirmation Dialog (confirmation-dialogs-stay rule).
- BookEditor export action navigates instead of opening the dialog;
  `showExport` + the mount removed. ExportDialog deleted; test split into
  `ExportForm.test` + `ExportPage.test`. Lazy route.

## 2. App-chrome header on PageLayout (user directive)

- Directive: pages should render "within the app shell". **Reality
  check: Bibliogon has no shared app-shell / Outlet / RootLayout** -
  every route is a self-contained full-viewport page with its own
  `<header>`. Surfaced this; user chose NOT to build a global shell
  (would touch every page) but to give PageLayout the SAME header as the
  existing pages.
- PageLayout now carries the app-chrome header (Bibliogon brand left ->
  dashboard, ThemeToggle right, `bg-card` + same tokens/height); the
  page-specific back button + title moved into the centered content
  column. All migrated pages inherit it via the shared component - no
  per-page changes. PageLayout now uses `useNavigate` + renders
  ThemeToggle; its test wraps in MemoryRouter.

## 3. C4 - ImportWizardModal: KEPT as a dialog (user decision)

- Pre-inspection found the import wizard is an XState machine whose
  context holds `File[]` + detection results - **non-serialisable**, so
  "wizard step in URL" is impossible (deep-linking mid-wizard is
  meaningless without the uploaded file). It's also dual-surface
  (Dashboard + ArticleList) with different post-import refresh.
- Decision: ImportWizardModal stays a dialog. New exception class added to
  the migration: **wizards holding transient non-serialisable state**.
  Checked the siblings: `ConvertToBookWizard` (6-step, transient
  selection + per-step metadata) and `AiSetupWizard` (3-step, transient
  API-key/test) also qualify -> both stay dialogs. Recorded in the
  `dialogs-to-pages-migration` memory.

## 4. C5 - WritingHistoryPage at /writing-history (commit on branch)

- WritingHistoryModal -> page. **The view is GLOBAL** (summary +
  per-book breakdown across all books, no bookId), so the route is
  top-level `/writing-history`, NOT the `/books/:id/history` the handover
  listed (it had no per-book scope). Body extracted into
  `WritingHistoryView`; `WritingHistoryPage` wraps it in PageLayout.
- Dashboard Writing-Goal widget's Verlauf button navigates there;
  `showHistory` + the modal mount removed. Bonus: recharts (~330 kB)
  moves out of the eager Dashboard path into the lazy /writing-history
  chunk. New E2E smoke (deep-link + back + mobile).

## Verification (whole branch)

- tsc clean; Vitest 2646 (post-#22 baseline) -> **2661**; verify-theme
  green; `npm run build` green (ExportPage + WritingHistoryPage emit their
  own lazy chunks). E2E specs written, Aster runs them.

## Checkpoint / next

- **C6 = ChapterVersionsModal -> /books/:bookId/chapters/:chapterId/snapshots**
  is the next page, but it needs care: BookEditor's `activeChapterId` is
  component state (not URL), and the snapshot **restore** mutates the live
  editor chapter via `onRestored`. Crossing the navigation boundary means
  the restore must reflect on back-nav AND the chapter selection must be
  preserved - this touches BookEditor's chapter-selection model, so it's
  its own focused session, not an end-of-session rush.
- Remaining after C6: CommentPreviewModal -> `/articles/:id/comments/:cid`,
  Git backup/sync dialogs -> `/settings/backup/git*`, etc. - apply the
  transient-state-wizard exception when classifying each.

## Questions and assumptions

- WritingHistory route: chose `/writing-history` (top-level) over the
  handover's `/books/:id/history` because the view is global - evidence:
  the modal had no bookId prop and calls the global writing-stats
  endpoints. Documented.
- App-shell: did NOT build a global shell (architectural change touching
  every page; prohibited without ask). Matched the existing per-page
  header pattern at the shared-component level instead, per the user's
  explicit choice.

---

## C6-C12 (PR #24, branch feature/dialogs-to-pages-c6, base main)

Continued after PR #23 (C3 + app-header + C5) merged. PR #24 holds:

- **C6** — `refactor(editor): lift active chapter into the URL (?chapter=)`
  (BookEditor; derived-from-URL with a thin setter wrapper, ~18 call
  sites unchanged, prose-only) + **ChapterVersionsModal →
  `/books/:bookId/chapters/:chapterId/snapshots`** (ChapterVersionsView
  extracted; restore navigates to `/book/:bookId?chapter=:id` so the
  editor re-mounts + re-fetches with the chapter selected).
- **C7 SKIPPED** — CommentPreviewModal stays a dialog: no
  `GET /api/comments/{id}` (can't self-load on deep-link without backend
  work) + pure-presentational coupled to the global Comments-Admin table.
- **C8** — GitBackupDialog → `/books/:bookId/git-backup` + GitSyncDialog →
  `/books/:bookId/git-sync` (**per-book**, not `/settings/*`; in-place
  chrome→PageLayout; GitSyncDiffDialog stays a nested Dialog).
- **C9** — ShortcutCheatsheet → `/help/shortcuts` (Ctrl+/ navigates
  there). DonationOnboardingDialog + AiSetupWizard stay dialogs
  (auto-trigger onboarding; not navigation targets).
- **C11** — orphaned dialog-chrome CSS cleanup (WritingHistoryView +
  ChapterVersionsView modules; global.css comment).
- **C12** — `docs/architecture/dialog-to-pages-routes.md` route map +
  classification.

Each landed as its own green commit (Vitest 2661, tsc, verify-theme,
build, docs-discipline). New E2E specs per page (deep-link + back +
mobile) for Aster to run.

## Still open — unadjudicated forks (real stop-conditions)

- **C7** CommentPreview: keep dialog, or add `GET /api/comments/{id}` +
  migrate?
- **C10 inline-remaining** (FieldClass/TranslationLinks/WritingGoalSettings/
  DashboardFilterSheet/ConflictResolution): the plan says "inline into
  parent" but the target is ambiguous/contradictory (ConflictResolution
  listed as BOTH page and inline; some hold transient state). Needs
  per-item adjudication before implementing — stopped here per the
  "stop only on real architecture forks" directive.

## Questions and assumptions

- Routes corrected per-item vs the handover (systematically wrong):
  WritingHistory global; Git per-book; CommentPreview no endpoint.
- DonationOnboarding classified with AiSetup (auto-trigger onboarding →
  stays a dialog), consistent with the user's explicit AiSetup decision.
