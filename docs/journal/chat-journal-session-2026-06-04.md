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
