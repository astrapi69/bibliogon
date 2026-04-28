# Bibliogon Backlog

Last updated: 2026-04-27 (AR-01 Phase 1 + AR-02 Phase 2 shipped; TD-01 + PGS-02-FU-01 + PS-09-FU-01 + CIO-08-FU-01 + PGS-03-FU-01 + PS-13 + PGS-04-FU-01 + MAINT-01 + DOC-03 closed)
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

- **AR-02 Phase 2** (Publications + multi-platform tracking +
  SEO + drift detection): shipped 2026-04-27 in `e70f47b`
  (backend) + `e09f51e` (frontend) + this commit (help docs).
  New Publication entity with migration `a0b1c2d3e4f5`, CRUD
  endpoints under `/api/articles/{id}/publications`, mark-
  published / verify-live lifecycle helpers. Drift detection
  compares snapshot against current content on every read.
  Article gains canonical_url / featured_image_url / excerpt
  / tags. Platform schemas (8 platforms) ship as YAML loaded
  by `app.services.platform_schema`. Frontend
  PublicationsPanel + AddPublicationModal in ArticleEditor
  sidebar. 30 i18n keys × 8 languages. +21 backend tests +
  +7 Vitest tests. Backend 1144 → 1165; Frontend 648 → 655.
  Phase 3+ (platform APIs, scheduled publishing, analytics)
  out of scope.
- **AR-01 Phase 1** (Article entity + editor + basic CRUD):
  shipped 2026-04-27 in `3ce27fd` (backend) + `dae36c0`
  (frontend) + this commit (help docs). New Article entity
  with migration `f9a0b1c2d3e4`; CRUD endpoints at
  `/api/articles`; standalone ArticleList + ArticleEditor
  pages; dashboard "Articles" nav button. 32 i18n keys × 8
  languages. +19 backend tests + +6 Vitest tests. Phase 1
  scope confirmed: long-form Article only; no Publications,
  Promo Posts, SEO metadata, drift detection, or platform
  APIs (Phase 2+, tracked as AR-02..AR-NN below).
- **DOC-03** (plugin author docs refresh): closed 2026-04-27 in
  `ef299bc`. `docs/help/{en,de}/developers/plugins.md` gains 3
  new sections (8 patterns) covering PGS-02..05:
  bi-directional sync (per-book lock, soft per-subsystem
  failure aggregation, one-shot pushurl + per-book
  credential helper, failure-tolerant lazy imports), three-way
  diff (read git refs without working-tree checkout, pure
  classification + side-effecting application, post-process
  collapse for rename detection), multi-branch (stable reason
  slugs + payload-driven skip surface). EN 616 → 822 lines;
  DE 499 → 705. Reference table maps each phase to its
  landing commits.
- **MAINT-01** (monitor v0.22.0 → v0.22.1 upgrade): closed
  early 2026-04-27 in `ffb1618`. No GitHub issues touched the
  v0.22.x migration topic since v0.22.1 shipped 2026-04-25.
  Audit in `backend/tests/test_alembic_drift.py` confirms all
  42 `Book.Mapped` columns have paired Alembic migrations;
  +10 regression tests pin the same so the next drift
  surfaces at test time, not at user runtime.
- **PGS-04-FU-01** (cross-language conflict UI / skipped-branch
  surface): closed 2026-04-27 in `06c7c1b` (backend skipped
  payload) + `75046b9` (frontend reusable result panel +
  i18n). `MultiBranchResult.skipped: list[SkippedBranch]`
  with stable reasons (`no_wbt_layout`, `import_failed`).
  HTTP `MultiBranchImportResponse.skipped` defaults to `[]`.
  New `TranslationImportResultPanel` is a pure presentational
  component that any future entry point embeds. 7 i18n keys
  × 8 languages. +4 backend tests + +6 Vitest tests. Wiring
  the actual entry point that calls
  `api.translations.importMultiBranch` is separate PGS-04
  wizard work.
- **PS-13** ("Save as new chapter" in ConflictResolutionDialog):
  closed 2026-04-27 in `39927ae` (backend fork endpoint) +
  `de4638d` (frontend wiring + i18n). New
  `POST /api/books/{id}/chapters/{cid}/fork` clones local
  edits into a chapter inserted at `source.position+1`,
  bumping subsequent positions; source chapter untouched.
  ConflictResolutionDialog gains optional
  `onSaveAsNewChapter` prop + third button. 5 i18n keys × 8
  languages. +6 backend tests + +3 Vitest tests.
- **PGS-03-FU-01** (mark_conflict + rename detection): closed
  2026-04-25 in `819e571` (mark_conflict backend),
  `5bfd76a` (rename detection backend), `e58d9e1` (frontend
  wiring + i18n). New `mark_conflict` action rewrites
  `both_changed` chapters with git-style conflict markers.
  `_collapse_renames` post-process step pairs `*_removed` +
  `*_added` rows with matching bodies into `renamed_remote` /
  `renamed_local` rows carrying `rename_from`. `take_remote` on
  rename rows updates DB title only. Counts payload gains
  `marked` + `renamed`. 6 i18n keys × 8 languages. +9 backend
  tests + +3 Vitest tests.
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
CIO-08-FU-01 closed in `7c97d4f`, PGS-03-FU-01 closed across
`819e571 + 5bfd76a + e58d9e1`, PS-13 closed across
`39927ae + de4638d`, PGS-04-FU-01 closed across
`06c7c1b + 75046b9`, MAINT-01 closed early in `ffb1618`,
DOC-03 closed in `ef299bc`, TD-01 + PS-09-FU-01 closed
(already-resolved); top 2 below remain. DEP-02 deferred per
user note (line below).

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
- is still not implemented and v0.24.0 is available. see: https://www.npmjs.com/package/@sereneinserenade/tiptap-search-and-replace

### 2. AR-03+ - Article Phase 3 (platform APIs + automation)

- **ID**: AR-03
- **Effort**: XL (~20-30h, multi-session)
- **Why rank 2**: Phase 2 (Publications + drift detection +
  manual workflow) shipped; Phase 3 candidates include
  platform API integration (Medium / Substack / X /
  LinkedIn), scheduled publishing background jobs, automated
  cross-posting, analytics fetching, OAuth credential storage.
- **Status**: deferred. Each platform API has its own auth +
  rate-limit + maintenance burden; ship only when validation
  data shows manual workflow is the bottleneck.

### Article validation (background, no code)

- **AR-01 validation log**: still open. Long-running passive
  task — fill `docs/journal/article-workflow-observations.md`
  during normal cross-posting work. Drives AR-02 architecture
  decision.


---

## All open items by category

### Plugin work

- **PGS-03-FU-01**: closed; see Recently closed.
- **PGS-04-FU-01**: closed; see Recently closed.
- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

### Core features

- **PS-13**: closed; see Recently closed.
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
- **UX-FU-01**: TopicSelect silent fallback when settings API
  fails. ArticleEditor's TopicSelect uses
  `disabled={topics === null}`; if `useTopics` rejects
  (network/server error), the dropdown stays disabled forever
  with no hint. Effort: S. Priority: low (minimal real risk on
  localhost-only deploys; anti-pattern for hosted setups). Fix:
  surface the error state with a retry hint, OR fall back to an
  enabled dropdown with the loaded value preserved.
- **UX-FU-02**: Article featured image upload (was Finding 5
  in the 8-defect smoke). ArticleEditor's featured image is
  URL-only today. CoverUpload component is book-coupled
  (`bookId` + `/api/books/{id}/assets/file/`). Needs either a
  generic `/api/uploads/` endpoint or an article-asset route
  + AssetForArticle table. Effort: M (4-12h, mostly backend +
  one new component). Priority: medium - URL paste works as a
  fallback; upload is an ergonomics win, not a blocker.

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
- **DOC-03**: closed; see Recently closed.

### Validation tracks

- **AR-01**: article authoring validation log. See top #2.
- **AR-02**: article authoring architecture decision. Blocked on
  AR-01 data.
- **AR-03+**: article authoring implementation phases. Blocked
  on AR-02.

### Maintenance

- **MAINT-01**: closed; see Recently closed.

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
