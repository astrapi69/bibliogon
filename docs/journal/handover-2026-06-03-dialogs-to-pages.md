# Handover — Dialog → Pages migration (C1 done, C2 next)

**Date:** 2026-06-03
**Branch:** `feature/dialogs-to-pages` (HEAD `1d446064`)
**PR:** #22 (draft) — base `main`
**Baselines:** backend pytest 2535/2538-ish (unchanged this branch), **Vitest 2646**, tsc clean, verify-theme green.

Read this fully before touching anything — §4 (C2 contract) and §6 (gotchas) save the most time.

---

## 1. Where we are

Two foundations already merged into `main`:

- **PR #20** — Tailwind v4 + shadcn/ui adoption (token-mapped `@theme` bridge, Preflight omitted). `frontend/src/styles/tailwind.css` maps every color utility onto the existing `var(--*)` tokens; default palette cleared so `bg-red-500` can't be generated; `make verify-theme` stays authoritative.
- **PR #21** — shadcn Dialog primitive (`frontend/src/components/ui/dialog.tsx`) + AppDialog + 8 dialog migrations. **This is NOT throwaway** — the Dialog primitive + AppDialog are the foundation for the **confirmation dialogs that stay** (see §2). The 8 consumer migrations were intermediate cleanup; the page conversion replaces the ones that become pages.

This branch (`feature/dialogs-to-pages`) starts the architecture overhaul: **all dialogs become deep-linkable routes, except confirmation dialogs.** Full plan + per-dialog classification table is in the C2-C12 session prompt (the "Dialogs → Pages Migration" prompt). Memory: `dialogs-to-pages-migration.md`.

**Rationale:** dialogs cause z-index/size-jump bugs (the reported CreateBookModal template-tab resize), non-deep-linkable state, broken mobile UX. Pages are deep-linkable, Back works, no overlay management, mobile-friendly.

---

## 2. Classification (what becomes a page vs stays a dialog)

**→ Pages** (24 dialogs): CreateBookModal→`/books/new`, CreateArticle(SplitButton)→`/articles/new?type=`, ExportDialog→`/books/:id/export`, ImportWizardModal→`/import`, WritingHistoryModal→`/books/:id/history`, ChapterVersionsModal→`/books/:id/chapters/:chapterId/snapshots`, CommentPreviewModal→`/articles/:id/comments/:commentId`, GitBackup/GitSync/GitSyncDiff→`/settings/backup/git*`, ConvertToBookWizard→`/articles/:id/convert`, RelationshipGraphView (verify it's a real `?view=` route), DonationOnboardingDialog→`/onboarding`, AiSetupWizard→`/settings/ai-setup`, ShortcutCheatsheet→`/help/shortcuts`, ErrorReportDialog→inline, ConflictResolutionDialog→`/books/:id/conflicts`, FieldClassDialog→inline (ArticleEditor), BulkTemplateImportDialog→`/import/templates`, TranslationLinks→inline (ArticleEditor), DashboardFilterSheet→inline, plus LabelManager / WritingGoalSettings → inline.

**→ Stay as confirmation dialogs** (small shadcn Dialog, max-w 440, fixed): all delete confirms, DangerZone `TypeToConfirmDialog`, Discard-Changes, Panel-Overflow (Move/Delete/Cancel), Snapshot-Restore, Entity-Delete, Clear-Backup-History, Logout/Reset. **AppDialog stays** (it's the confirm/prompt/alert/choose provider) and already uses the shadcn Dialog primitive.

---

## 3. What C1 delivered (the infra — already pushed)

- **`frontend/src/components/PageLayout.tsx`** — shared full-page layout. Props: `{title, maxWidth?: "sm"|"md"|"lg"|"xl" (default "lg"), onBack?, backLabel?, actions?, testId?, children}`. Renders a header (back button + `<h1>` + `actions` slot) over a max-width content column. Tailwind-only, all colors via the token bridge (`bg-background`/`text-foreground`/`border-border`), responsive. Back button testid = `${testId}-back`.
- **`frontend/src/hooks/useGoBack.ts`** — `useGoBack(fallback = "/")` → returns a callback. Follows the established convention: `location.key === "default"` (direct/deep-link entry, no in-app history) → `navigate(fallback)`; else `navigate(-1)`. This is what makes pages deep-linkable with a working Back. (Mirrors the Bug-1 fix pinned in `pages/back-button-navigation.test.tsx`.)
- Tests: `PageLayout.test.tsx` (5) + `useGoBack.test.ts` (3), green.

**Use these for every new page.** Don't re-implement headers/back per page.

---

## 4. C2 contract — the create-book/article flow (CRITICAL PATH, map carefully)

C2 = CreateBookPage (`/books/new`) + CreateArticlePage (`/articles/new?type=`), delete CreateBookModal, E2E. This is the riskiest migration (book creation). The create logic currently lives in the **page that opens the dialog**, not the dialog — moving it is the core work.

### Book creation (today)
- `CreateBookModal` props: `{open, onClose, onCreate(BookCreate), onCreateFromTemplate(BookFromTemplateCreate), bookType = "prose"}` — pure form, no API calls inside.
- **`pages/Dashboard.tsx`** owns:
  - `handleCreate(data)` (≈L352): `const book = await api.books.create(data)` → navigate to the editor.
  - `handleCreateFromTemplate(data)` (≈L379): `await api.books.createFromTemplate(data)` → navigate.
  - `openCreate(bookType)` (≈L374): `setCreateBookType(bookType)` + open modal.
  - Trigger: the `SplitButton` (≈L486-540) `onPrimaryClick={() => openCreate("prose")}`, dropdown items `openCreate(bt.id)`.
  - Modal mounted at ≈L947-952.

### Conversion
1. New `pages/CreateBookPage.tsx`: read `?type=` (default `prose`) via `useSearchParams`; render the modal's body (book-type-aware title + blank/template `Tabs` + form) inside `PageLayout`; **move `handleCreate`/`handleCreateFromTemplate` into the page** (call `api.books.create` / `createFromTemplate`, then `navigate('/books/${id}')`); back via `useGoBack("/")`.
2. Route `/books/new` in `App.tsx` (lazy). Wrap in `ErrorBoundary surface="create-book"` to match the existing pattern.
3. Dashboard SplitButton: `openCreate(bt)` → `navigate('/books/new?type=' + bt)`. Remove the modal mount + `handleCreate*` + `createBookType` state.
4. Delete `CreateBookModal.tsx`; convert/retire `CreateBookModal.test.tsx` → `CreateBookPage.test.tsx`.
5. E2E: navigate to `/books/new?type=...`, fill, create, assert redirect to `/books/{id}`; tab-switch no longer relevant (page scrolls — the resize bug is gone by construction).

### Article creation — NUANCE, verify before building
Article creation today is a **direct SplitButton action, NOT a modal**: `pages/ArticleList.tsx` ≈L639 `api.articles.create({...content_type})` → `navigate('/articles/${fresh.id}')` (one click, no form). So `/articles/new?type=` would ADD a form page where there's currently none. **Decide:** does an article need a create-form page, or keep the one-click create and skip CreateArticlePage? The directive lists it, but the current UX is dataless. Surface this to the user if it looks like adding friction for no gain.

---

## 5. Per-page migration recipe (every C-item)

1. New lazy route in `App.tsx` (`const X = lazy(() => import("./pages/X"))`, wrap in `<Suspense>` + `ErrorBoundary surface="...">`). Existing routes are eager — add `Suspense` once around the new lazy ones.
2. `pages/X.tsx` using `PageLayout` + `useGoBack`. Move any create/save/fetch logic the dialog relied on from its parent into the page (deep-link = the page fetches its own data on mount).
3. Trigger: the button that opened the dialog now `navigate("/route")`.
4. Delete the old dialog component + reconcile its test (no dead code — discipline).
5. E2E spec: deep-link (direct URL loads data), back-button (returns to origin), mobile viewport (responsive). data-testid namespaced per the testid discipline.
6. i18n: dialog close strings → back/page context across all 8 catalogs; dialog titles become page titles (same text, new context).

---

## 6. Gotchas

1. **Token names for new pages:** use the Phase-A shadcn-mapped names — `bg-background`(→`--bg-primary`), `text-foreground`(→`--text`), `text-muted-foreground`(→`--text-muted`), `border-border`, `bg-card`, `bg-primary`(→`--accent`!), `text-primary-foreground`. NOTE `text-primary` = ACCENT, not the body text — for body text use `text-foreground`. The C2 prompt's `text-text-primary` example is illustrative, not a real utility. Non-color tokens via arbitrary values: `rounded-[var(--radius-md)]`, `font-[family-name:var(--font-display)]`.
2. **verify-theme must pass after every commit.** New pages use Tailwind utilities → already audited. Don't introduce hardcoded hex; `var(--token)` bare is the rule.
3. **Article-create nuance** (§4) — verify before building a redundant form page.
4. **Lazy-loading:** confirm `npm run build` stays green; the manualChunks config in `vite.config.ts` is a function (Vite 8/Rolldown). Lazy pages create their own chunks — fine.
5. **Wizards with multi-step state** (ImportWizardModal, ConvertToBookWizard) → put step in URL search param (`/import?step=2`) so Back works mid-wizard (stop-condition in the prompt).
6. **`RelationshipGraphView` / `HelpPanel`** already use `?view=` / sidebar — verify they're real routes before "migrating" (may be no-ops / already done).
7. **Confirmation dialogs stay** — don't convert AppDialog or the §2 exception list. They use the shadcn Dialog primitive from PR #21.
8. **Don't add NEW dialogs** anywhere — the direction is pages.
9. The earlier **CreateBookModal resize-fix directive is dropped** (the page eliminates that dialog) — don't implement a dialog-size fix.

---

## 7. Disciplines + stop conditions

- Plain `git status` before every commit; explicit-paths staging (no `-A`) — Aster runs parallel sessions, don't absorb their files.
- Atomic-green-per-commit; conventional commits; **no `Co-Authored-By` AI trailer** (project rule).
- Push autonomously to `feature/dialogs-to-pages`; Aster reviews PR #22 at the end (don't ping per batch).
- Every new page: E2E (deep-link + back + mobile), deep-linkable, back-nav, responsive. Delete old dialog immediately (no dead code).
- Never probe the app via bare `python -c "import app.main"` (hits real dev DB) — use pytest or `BIBLIOGON_TEST=1`.
- Stop conditions: hard-to-serialize wizard state → URL params; bundle overhead from lazy → check `npm run build`; >15 commits → split into sub-phases.

---

## 8. Run / verify

```bash
cd frontend && npx tsc --noEmit          # type-check
cd frontend && npx vitest run            # 2646 baseline + new
make verify-theme                        # token/contrast/hex gates (must pass)
cd frontend && npm run build             # lazy chunks + Tailwind compile
cd e2e && npx playwright test --project=smoke   # Aster runs; flaky tail OK (exit 0 = green)
```

Next action: **C2** — read `CreateBookModal.tsx` (full) + `Dashboard.tsx` create handlers, build `CreateBookPage`, wire `/books/new`, move create logic, delete the modal, E2E. Then C3 ExportPage onward.
