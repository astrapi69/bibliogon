# Dialog → Pages migration: route map + classification

Status reference for the Dialog → Pages architecture overhaul. The
direction: every non-confirmation dialog becomes a deep-linkable
full-page route rendered through the shared
[`PageLayout`](../../frontend/src/components/PageLayout.tsx) (app-chrome
header + centered content + working Back via
[`useGoBack`](../../frontend/src/hooks/useGoBack.ts)). Two classes stay
dialogs — see "Stays a dialog" below.

Bibliogon is a PWA/SPA with **no shared app-shell / `Outlet`**: every
route is a self-contained full-viewport page with its own header.
`PageLayout` carries the *same* header as Dashboard/Settings so a
deep-linked page reads as "still inside Bibliogon" — there is no global
shell to render "inside".

## Migrated → pages

| Route | Was (dialog) | Notes |
|---|---|---|
| `/books/new?type=<book_type>` | CreateBookModal | Form body extracted to `CreateBookForm`. Prose returns to the dashboard (preserves first-book donation onboarding); page-based types go to their editor. |
| `/articles/new?type=<content_type>` | (split-button one-click create) | New `CreateArticlePage`; pre-fills per-type title + profile author to keep one-keystroke ergonomics. |
| `/books/:bookId/export` | ExportDialog | Body → `ExportForm`; page self-loads the book. The audiobook regeneration-mode picker stays a nested confirmation Dialog. |
| `/writing-history` | WritingHistoryModal | **Global** (all books) — not per-book. Body → `WritingHistoryView`. Moved recharts out of the eager dashboard bundle. |
| `/books/:bookId/chapters/:chapterId/snapshots` | ChapterVersionsModal | Body → `ChapterVersionsView`. Restore navigates to `/book/:bookId?chapter=:id`. |
| `/books/:bookId/git-backup` | GitBackupDialog | **Per-book** (not `/settings/*`). In-place chrome swap. |
| `/books/:bookId/git-sync` | GitSyncDialog | Per-book. The diff sub-dialog (`GitSyncDiffDialog`) stays a nested Dialog. |
| `/help/shortcuts` | ShortcutCheatsheet | Pure-static reference. `Ctrl+/` now navigates here. |

### Editor chapter selection in the URL

C6 prep lifted BookEditor's active chapter into the `?chapter=` search
param (joining the existing `?view=` params). This makes a chapter
selection deep-linkable and lets the snapshots page restore-and-return
to the right chapter. Prose-only; page-based editors are unaffected.

## Stays a dialog (by design)

**Confirmation dialogs** — small blocking yes/no, destructive-action
confirms, `TypeToConfirmDialog`, and the `AppDialog`
confirm/prompt/alert/choose provider. (Restore/delete confirms, the
audiobook regen picker, the git-sync diff sub-dialog, etc.)

**Wizards holding transient non-serialisable state** — deep-linking to a
mid-wizard step is meaningless without the transient context, and the
wizard owns its own cancel/back flow:

- `ImportWizardModal` — XState machine with `File[]` + detection results
  in context; dual-surface (Dashboard + ArticleList) with different
  post-import refresh.
- `ConvertToBookWizard` — 6-step, transient article-selection + per-step
  metadata.
- `AiSetupWizard` — 3-step onboarding, transient API-key/test-result.

**Auto-triggered onboarding nudges** — app-driven, not user-navigated
deep-link targets (same class as `AiSetupWizard`):

- `DonationOnboardingDialog`.

**Detail modals with no single-fetch endpoint + parent-owned actions** —
can't self-load on a deep-link without a backend change:

- `CommentPreviewModal` — no `GET /api/comments/{id}`; pure-presentational
  + tightly coupled to the global Comments-Admin table (reclassify /
  delete + refresh owned by the parent). **Final: stays a dialog** — no
  backend endpoint for a purely-presentational preview.

**Small, context-bound dialogs holding transient state** — adjudicated
2026-06-04; a separate route or an inline-into-parent refactor would be
invasive with no deep-link payoff:

- `FieldClassDialog` — small context-bound field picker (bulk-AI-fill).
- `TranslationLinksDialog` — small context-bound link editor (ArticleEditor).
- `WritingGoalSettingsDialog` — quick goal-setting.
- `DashboardFilterSheet` — stays as-is (expandable section / sheet).
- `ConflictResolutionDialog` — transient state (which conflict, which
  resolution), context-bound in BookEditor.

## Migration scope: complete

The Dialog → Pages migration is **done**. It covered the large,
deep-linkable surfaces (book/article create, export, writing history,
chapter snapshots, git backup/sync, shortcuts) plus the editor's
`?chapter=` URL state. Everything not migrated is a deliberate dialog —
confirmations, transient-state wizards, auto-trigger onboarding nudges,
or the small context-bound dialogs above. There is no remaining
inline-refactor work; the original "C10 inline-remaining" plan was
adjudicated to "all stay dialogs".

## Convention for the next migration

1. Pre-Coding-Reality-Check the real component first — props, trigger,
   and (critically) whether a single-fetch endpoint exists. The original
   handover routes were systematically wrong (global vs per-book, missing
   endpoints), so verify each.
2. Extract the body into a callback-based `…View`/`…Form` when the dialog
   has a comprehensive test (so the test survives), or convert in place
   for large self-contained dialogs.
3. Thin `…Page` wraps it in `PageLayout`, reads route params, self-loads,
   and wires Back via `useGoBack`.
4. Trigger navigates instead of opening the dialog; delete the dialog;
   convert its test; lazy-load the route; add an E2E (deep-link + back +
   mobile).
5. Don't add NEW dialogs — the direction is pages.
