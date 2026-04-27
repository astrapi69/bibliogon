# Bibliogon Backlog

Last updated: 2026-04-25 (TD-01 + PGS-02-FU-01 + PS-09-FU-01 + CIO-08-FU-01 closed)
Current version: v0.23.0

Living backlog. Supplements `docs/ROADMAP.md` with deferred items
spawned during sessions and re-ranks open work by today's
priorities. ROADMAP stays the canonical theme tracker; this file
is the daily-planning view.

---

## ROADMAP / shipped-state conflicts

`docs/ROADMAP.md` header (line 4-5) is stale:

- Says `Last updated: 2026-04-22` and `Latest release: v0.21.0`.
- Actual latest tag: `v0.23.0` (PGS-02..05 shipped after the header
  was last touched).
- "Next active theme: TBD - likely Git-based backup (SI-01 onward)"
  is also stale; the Git-based backup theme finished v0.21.0 and
  plugin-git-sync finished v0.23.0.

Flag only; no auto-edit per session scope. Refresh on the next
release pass.

---

## Where we stand

**Recently shipped (v0.21.0 → v0.23.0):**
- v0.21.0: full Git-based backup (5 phases, SI-01..04), AI fix_issue
  mode, quality-tab navigate-to-first-issue, Settings KI tab
  refactor, CSS zoom fixes (#10/#11), Node 22 → 24 LTS, backend
  CVE sweep (aiohttp/pygments/starlette).
- v0.22.0/v0.22.1: multi-book BGB import on XState v5, sticky-footer
  pattern across 13 dialog modals, EnhancedTextarea preview,
  WizardErrorBoundary; v0.22.1 backfilled the missing
  `books.tts_speed` Alembic migration from v0.22.0.
- v0.23.0: plugin-git-sync PGS-02..05 - bi-directional commit-to-repo
  with ambient-cred push, three-way smart-merge with per-chapter
  conflict UI, multi-language branch linking via `main-XX` +
  `Book.translation_group_id`, core-git bridge with unified-commit
  fan-out under per-book lock.

**Major feature areas - state:**
- **Distribution**: D-01/02/03/04 shipped; manual hardware smoke
  tests open as GH issues #2/#3/#4. AppImage + full installer
  deferred indefinitely.
- **Templates**: book + chapter templates complete. TM-04b sub-items
  (update endpoint UI, JSON export/import, multi-chapter templates)
  deferred.
- **Core import orchestrator**: CIO-01..08 shipped, including
  `.git/` adoption, multi-cover, author assets, field selection.
- **Git-based backup (core)**: phases 1-5 shipped.
- **plugin-git-sync**: PGS-01..05 shipped, MVP scope.
- **AI**: AI-01..09 shipped in v0.14.0 baseline.
- **Donations**: S-01/02/03 + help page shipped.

---

## Recently closed

- **CIO-08-FU-01** (multi-book wizard finishing): closed
  2026-04-25 in `7c97d4f`. ImportWizardModal now uses
  `useMachine(wizardMachine)` instead of parallel
  `useState<WizardState>`. New `SuccessMultiStep` terminal lists
  every imported book with per-book "Open" link (no
  auto-redirect). ExecutingStep onSuccess signature gains
  `bookIds`. 4 i18n keys × 8 languages. +5 Vitest tests.
- **PS-09-FU-01** (audiobook + translation plugin CI coverage):
  closed 2026-04-25 as already-resolved. Audit found both
  plugins already in `ci.yml` plugin-tests matrix (lines 37,
  45) AND `coverage.yml` plugin-coverage matrix (lines 53-54,
  69-70), shipped in `99dd15e ci(plugins): add audiobook and
  translation to CI + coverage matrix (PS-09)`. Local
  verification: audiobook 98 tests pass, translation 35 tests
  pass. Backlog item was based on a stale ROADMAP note (also
  refreshed in this commit). Note: `99dd15e` was tagged "(PS-09)"
  in the original commit message but actually closes the
  follow-up gap that PS-09-FU-01 was tracking.
- **PGS-02-FU-01** (per-book PAT credential integration):
  closed 2026-04-25 in `32137bb`. New shared helper
  `app/services/git_credentials.py` owns per-book PAT and SSH
  env. Plugin-git-sync push uses the one-shot pushurl pattern;
  PAT never lands in `.git/config`. New
  `PUT/GET/DELETE /api/git-sync/{book_id}/credentials` endpoints
  + GitSyncDialog `CredentialsSection`. 12 i18n keys × 8
  languages. +29 tests (20 helper + 5 endpoint + 4 dialog).
- **TD-01** (order-dependent test fix): closed 2026-04-25 as
  already resolved. Investigation showed the
  `test_detect_surfaces_git_repo_when_zip_has_dot_git` failure
  was the `_MockRepo` leak from `test_import_git_endpoint`,
  fixed in `c40cbb2` ("fix(tests): unblock full-suite backend
  tests for v0.22.0 release") on 2026-04-24 by routing the
  monkeypatch through `monkeypatch.setattr`. Verified: 5/5
  consecutive full-suite runs green (1069 passed, 1 skipped,
  ~40-65s).

---

## Top priorities (ranked)

Ranked by user-value, deadline pressure, follow-up scope from
recently-shipped work. PGS-02-FU-01 closed in `32137bb`,
CIO-08-FU-01 closed in `7c97d4f`, TD-01 + PS-09-FU-01 closed
(already-resolved); top 7 below renumbered.

### 1. DEP-02 - TipTap 2 → 3 migration (deadline pressure)

- **ID**: DEP-02
- **Effort**: 4-8h code + 1-2h regression
- **Why rank 1**: hard fallback deadline 2026-05-05 (10 days
  out). Blocks DEP-09 / SEC-01 chain. If
  `@sereneinserenade/tiptap-search-and-replace` v0.2.0 not
  published to npm by 2026-05-05, fall back to
  `prosemirror-search` adapter (~50-80 LOC).
- **Status**: pre-audit complete in
  `docs/explorations/tiptap-3-migration.md`.

### 2. PS-13 - "Save as new chapter" in ConflictResolutionDialog

- **ID**: PS-13
- **Effort**: 2-3h
- **Why rank 2**: real UX gap in the 409 conflict flow. Needs
  new endpoint (`POST /api/books/{id}/chapters/fork`), 8-language
  i18n, E2E coverage. Position-ordering scope discussion before
  implementation. (Promoted after CIO-08-FU-01 shipped.)

### 3. PGS-03 follow-up: mark_conflict + rename detection

- **ID**: PGS-03-FU-01 (new)
- **Effort**: M (~6-8h split)
- **Why rank 3**: out-of-MVP-scope items from PGS-03. Useful
  once a real translation workflow exercises the smart-merge
  path. `mark_conflict` writes both versions as a visible
  conflict block in the chapter content; rename detection
  collapses delete+add pairs.
- **Status**: deferred at MVP cut.

### 4. PGS-04 follow-up: cross-language conflict UI

- **ID**: PGS-04-FU-01 (new)
- **Effort**: M
- **Why rank 4**: deferred from PGS-04. Two diverging language
  branches with incompatible chapter structure currently surface
  as silent skip + log. UI needed when first user hits this.
- **Status**: deferred at MVP cut. Triggered by user report.

### 5. Monitor v0.22.0 → v0.22.1 upgrade feedback

- **ID**: MAINT-01
- **Effort**: 0 code (review only)
- **Why rank 5**: scheduled review on 2026-05-09 (14 days out).
  No telemetry; drift would surface as bug reports. If silent,
  close. If reports, audit other `Mapped` columns added without
  Alembic revisions.
- **Status**: open, time-bound.

### 6. AR-01 - article authoring validation log

- **ID**: AR-01
- **Effort**: 0 new code; observation only
- **Why rank 6**: validates whether article-publication workflow
  warrants a Bibliogon feature at all. 3-5 cross-posting workflows
  logged in `docs/journal/article-workflow-observations.md`. Drives
  AR-02 architecture decision.
- **Status**: open log file; fill as part of normal release-article
  publication.

### 7. DOC-03 - plugin author docs refresh

- **ID**: DOC-03
- **Effort**: M (~3h)
- **Why rank 7**: `docs/help/{de,en}/developers/plugins.md` covers
  the PGS-01 patterns (source adapter, two registries) but not
  PGS-02..05 (per-book locks, unified-commit fan-out, Markdown
  side-files via lazy import). Update before next plugin author
  arrives.
- **Status**: open.

---

## All open items by category

### Plugin work

- **PGS-03-FU-01**: mark_conflict + rename detection. See top #3.
- **PGS-04-FU-01**: cross-language conflict UI. See top #4.
- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

### Core features

- **PS-13**: "Save as new chapter" in ConflictResolutionDialog.
  See top #2.
- **PS-14+**: future polish items, surface as found.
- **CIO-08-FU-01**: closed; see Recently closed.
- **TM-04b sub-items** (chapter-template followups): update
  endpoint exposed in UI, JSON export/import, multi-chapter
  templates. Effort: 4-6h spread across three independent items.
  Status: deferred.
- **D-05**: full Windows installer (Docker Desktop bundling).
  Effort: L. Deferred until user feedback says install (not
  start) is the friction.
- **D-03a**: AppImage for Linux. Effort: M. Deferred indefinitely;
  re-evaluate only on missing-tkinter user report.
- **D-02 follow-ups**: macOS Intel universal2 build + code
  signing. Effort: M each. Deferred until user demand.
- **Launcher localization**: launcher UI is English-only.
  Effort: S per language; defer until user demand.

### Quality / Polish

- **PS-09-FU-01**: closed; see Recently closed.
- **Modal sticky-footer audit beyond wizard**: v0.22.0 covered
  13 dialog modals. Confirm whether any non-wizard modal still
  scrolls without sticky footer. Effort: S audit + per-modal fix.
  Status: confirm-or-close.
- **ImportWizardModal full useMachine migration**: covered
  under CIO-08-FU-01 above.

### Dependencies (DEP / SEC)

- **DEP-02**: TipTap 2 → 3. See top #1.
- **DEP-05**: elevenlabs SDK 0.2 → 2.x. Effort: M-L. Needs paid
  API key for verification. Schedule with a real audiobook test
  run.
- **DEP-09**: Vite 7 → 8. Blocked on `vite-plugin-pwa` upstream
  (peer deps top out at Vite 7). Re-check
  `npm view vite-plugin-pwa peerDependencies` every ~2 weeks.
  Last check: 2026-04-18. Tracker: GH #6.
- **SEC-01**: vite-plugin-pwa CVE chain (4 high-severity, all
  dev-only, production bundle clean). Same upstream blocker as
  DEP-09. Re-audit monthly via `npm audit --audit-level=high`.

### Documentation

- **DOC-01**: DE translation of `docs/help/en/import/git-adoption.md`
  (CIO-07 follow-up). Effort: S.
- **DOC-02**: ROADMAP header refresh on next release (latest
  release line, last-updated date, "next active theme" line).
  Effort: trivial.
- **DOC-03**: plugin author docs (`docs/help/{de,en}/developers/plugins.md`)
  - update with PGS-02..05 patterns (per-book locks,
  unified-commit fan-out, two-registry source adapters). Effort:
  M.

### Validation tracks

- **AR-01**: article authoring validation log. See top #6.
- **AR-02**: article authoring architecture decision. Blocked on
  AR-01 data.
- **AR-03+**: article authoring implementation phases. Blocked
  on AR-02.

### Maintenance

- **MAINT-01**: monitor v0.22.0 → v0.22.1 upgrade. See top #5.

---

## Blocked or waiting

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | 2026-05-05 hard deadline → fallback to `prosemirror-search` adapter |
| DEP-09 (Vite 8) | `vite-plugin-pwa` peer-dep update | Upstream releases Vite 8 compat |
| SEC-01 | Same as DEP-09 | Same as DEP-09 |
| AR-02 | Validation data from AR-01 | 3-5 article workflows logged |
| AR-03+ | AR-02 decision | Architecture pick (A/B/C or archive) |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| Manual launcher smoke tests | Real hardware (Windows / macOS / Linux) availability | Hardware access |

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-05-18).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped
  outside its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.

---

## How to use this file

- Pick from the top list when starting a session and there's
  no user-driven priority override.
- When a session defers a sub-item, add it under the matching
  category with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, delete the row (CHANGELOG / ROADMAP record
  the history; this file is forward-looking only).
- When the top changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
