# Chat journal - 2026-06-03

Dialog -> Pages migration, C2 (the create-book / create-article flow).
Continues from the handover in `docs/journal/handover-2026-06-03-dialogs-to-pages.md`
(C1 = PageLayout + useGoBack, already on `feature/dialogs-to-pages`).

## 1. Pre-Inspection + Article-Create decision (C2 contract)

- Goal: build CreateBookPage (`/books/new`) and decide the article-create
  question the handover flagged as a stop-condition.
- Read the real code (not just the handover): CreateBookModal is a true
  form; article creation is a one-click, form-less split-button action
  (`ArticleList.handleCreate` -> `api.articles.create` -> editor). A
  `/articles/new` form page would ADD a step where none exists today.
- Surfaced the trade-off to Aster via AskUserQuestion.
  **Decision: build CreateArticlePage** (follow the full directive), with
  the page pre-filling the per-type default title + profile author so the
  one-keystroke ergonomics are preserved.
- Also verified two behaviors the handover didn't cover: the Dashboard
  re-loads its book list on mount (so returning after a prose create shows
  the new book), and `handleCreate` triggers the first-book donation
  onboarding (a Dashboard modal) - both must be preserved.

## 2. CreateBookPage - book half (commit e08673df)

- Extracted the modal body into a shared, callback-based
  `CreateBookForm` (field logic, template picker, Authors-DB integration
  carried over unchanged). `CreateBookPage` wraps it in `PageLayout` and
  owns the `?type=` param, the per-type title, and the create+navigate
  handlers (moved from Dashboard).
- Navigation preserves prior behavior: page-based types
  (picture_book/comic_book) -> their editor; prose -> back to the
  dashboard with a `bookCreated` nav-state flag. Dashboard reads that flag
  once both the books list and donations config have loaded, then runs the
  first-book onboarding check (one-shot via a ref) - so the donation
  onboarding is NOT silently broken by moving the create out of Dashboard.
- `PageLayout` gained an optional `titleTestId` so the per-type
  `create-book-title-*` testid the E2E specs rely on is preserved on the
  page `<h1>`.
- Dashboard: split-button + empty-state now `navigate("/books/new?type=")`;
  modal mount + handlers + `showModal`/`createBookType` state removed.
  CreateBookModal deleted; its test converted to `CreateBookForm.test.tsx`
  (form body) + a new `CreateBookPage.test.tsx` (title-per-type, create
  navigation, error toast). Route is lazy-loaded (own chunk).
- Added `ui.create_book.create_error` across all 8 catalogs (the modal had
  no error handling; the page does - an improvement).

## 3. CreateArticlePage - article half (commit 4dfea076)

- New page at `/articles/new?type=<content_type>`: resolves `?type=`
  against the content-type registry (falls back to the default), pre-fills
  title (per-type default) + author (profile name), Create ->
  `api.articles.create` -> editor.
- ArticleList split-button (primary + per-type dropdown) and empty-state
  CTA now navigate to `/articles/new[?type=]`; `handleCreate` + the
  `creating` state removed; two inline-create unit tests updated to assert
  the navigation. Reused the create-book i18n field labels (identical
  strings) to avoid duplicate keys. Route lazy-loaded.

## 4. E2E (commit a34abdb8)

- `create-book-page.spec.ts` + `create-article-page.spec.ts`: deep-link,
  create happy-path, `?type=` honoured, PageLayout back button, mobile
  viewport (bounding-box no-overflow). testid selectors only; existence/
  type verified via `/api`. Playwright lists all 10; Aster runs them.

## Verification

- `tsc --noEmit` clean; Vitest 2646 -> **2658** (net +12: removed the
  ~30-case modal test, added CreateBookForm 37 + CreateBookPage 6 +
  CreateArticlePage 6, and converted 2 ArticleList tests).
- `make verify-theme` green (96 contrast + badge contrast + no hardcoded
  hex). `npm run build` green; CreateBookPage + CreateArticlePage emit
  their own lazy chunks.
- Pre-existing create-book E2E specs (`create-book-from-template`,
  `getstarted-multi-book-types`, `picture-book-editor`) preserve all
  testids, so the navigation-based flow keeps the same selectors -
  **flag for Aster to re-run** alongside the two new specs.

## Questions and assumptions

- Article-create page: directive followed per Aster's explicit choice
  (build the form page) despite the prior one-click UX. Documented above.
- Prose create returns to the dashboard (preserved) rather than jumping to
  the editor; the handover's `navigate('/books/${id}')` shorthand used the
  wrong route (`/book/:bookId`) and would have changed prose UX + orphaned
  the donation onboarding. Conservative behavior-preserving choice taken;
  easy follow-up if Aster prefers editor-redirect for prose too.
- i18n: reused generic create-book field labels for the article form
  (identical strings) rather than duplicating keys, per the i18n-drift
  rule. Only one genuinely new key added (`ui.create_book.create_error`).

## Next (C3+)

ExportDialog -> `/books/:id/export` (C3), then ImportWizardModal -> `/import`
(wizard step in URL), WritingHistoryModal, etc. per the C2-C12 prompt /
`docs/journal/handover-2026-06-03-dialogs-to-pages.md` section 2.
