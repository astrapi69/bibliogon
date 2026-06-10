# Session handoff — 2026-06-04 (Dialog → Pages + v0.46.0 release prep)

## State

- **Branch:** `main`. PRs #20–#24 all merged. HEAD is the merge of PR #24
  (`8daee554`) plus this session's release-prep + smoke-fix + handover
  commits (see `git log --oneline -6`).
- **Baselines:**
  - Backend pytest: ~2534 (frontend-only release; unchanged from v0.45.0).
  - Vitest: **2661** green.
  - Playwright smoke: **449 passed, 0 failed, 1 flaky** (exit 0) — full
    `--project=smoke` run on the merged main.
- **`make release-test`:** green (after the v0.46.0 version-header sync;
  see below).

## What shipped (this release, v0.46.0)

- **Tailwind v4 + shadcn/ui foundation** (Phase A + B): token-mapped
  `@theme` bridge (Preflight omitted; theme tokens stay the SSoT for
  colour) + a shadcn Dialog primitive backing `AppDialog` and the
  confirmation dialogs.
- **Dialog → Pages migration (C1–C12).** Eight large dialogs became
  deep-linkable full-page routes through a shared `PageLayout`
  (app-chrome header + centered content + working Back via `useGoBack`):
  - `/books/new?type=` (CreateBookModal), `/articles/new?type=`
    (article create), `/books/:bookId/export` (ExportDialog),
    `/writing-history` (WritingHistoryModal — GLOBAL, not per-book),
    `/books/:bookId/chapters/:chapterId/snapshots` (ChapterVersionsModal),
    `/books/:bookId/git-backup` + `/git-sync` (Git dialogs, per-book),
    `/help/shortcuts` (ShortcutCheatsheet).
  - **Editor `?chapter=` URL state** — active chapter lifted from
    component state into the URL (deep-linkable; snapshot restore returns
    to the right chapter).
  - **recharts lazy-loaded** with the writing-history page (~330 kB out
    of the eager dashboard bundle).
- **Classification (final; full table in
  `docs/architecture/dialog-to-pages-routes.md`):** stays-a-dialog =
  confirmations · transient-state wizards (Import / ConvertToBook /
  AiSetup) · auto-trigger onboarding (Donation) · detail-modals-without-
  a-single-fetch-endpoint (CommentPreview) · 5 small context-bound
  dialogs (FieldClass / TranslationLinks / WritingGoalSettings /
  DashboardFilterSheet / ConflictResolution). C7 + C10 adjudicated to
  "stay dialogs" — the migration is complete.

## Smoke-fix (this session)

The Dialog → Pages navigation changes broke 8 smoke specs (same class as
v0.45.0: code change → E2E breakage). All fixed by updating the specs to
the new route/page pattern (no skips, no deferral):

- `writing-history.spec.ts` — widget button now navigates to
  `/writing-history`; dropped the obsolete modal-positioning regression
  pin.
- `content-types.spec.ts` (×4) — article create now navigates to the
  `/articles/new` form; added a `submitCreateForm()` helper.
- `chapter-snapshots.spec.ts` + `content-safety.spec.ts` — version
  history is now a page; restore navigates back to the editor with
  `?chapter=`.
- `create-book-from-template.spec.ts` — hardened the post-submit poll
  (wait for navigation off `/books/new`).
- `getstarted-multi-book-types.spec.ts` — hardened the sample-button
  click (networkidle + stable wait).

## What's open

- **v0.46.0 release is PREPARED but NOT tagged.** Version bumped to
  0.46.0 (backend/pyproject.toml + `make sync-versions` across 19 files +
  the 4 prose version headers); CHANGELOG + `changelog/releases/v0.46.0.md`
  + CLAUDE.md written. **The tag is the STOP-gate** — see below.
- **1 flaky smoke spec** (`getstarted-multi-book-types.spec.ts:138`,
  comic_book sample) — passes on retry. GetStarted is NOT a Dialog →
  Pages surface (unchanged by the migration), so this is a pre-existing /
  Tailwind-foundation render instability, not a migration regression.
  Hardened (networkidle + stable wait) but not fully eliminated. Candidate
  for a follow-up GetStarted step-transition stability fix.

## E2E STOP-gate (mandatory before tagging v0.46.0)

Per `release-workflow.md` "Pre-Release Gate: Aster E2E Confirmation":
**Aster must run `cd e2e && npx playwright test --project=smoke` locally
and confirm 0 failures in chat before CC runs `make release-tag`.** CC
must NOT push the tag autonomously — Aster's confirmation is a hard STOP.

## Resume direction

- **If Aster confirms smoke green:** proceed to tag + publish v0.46.0
  (`make release-tag VERSION=0.46.0`, then `make release-publish`,
  build/push artefacts, post-release docs per `release-workflow.md`).
- **If smoke is red on Aster's machine:** fix the remaining failure(s)
  (update the spec to the new route/page pattern, or fix the app), re-run,
  repeat until green. Do not tag until green + confirmed.
