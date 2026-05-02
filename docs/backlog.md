# Bibliogon Backlog

Last updated: 2026-05-02 (GH #13 mutmut wiring + service-error refactor + fetch consolidation closed)
Current version: v0.25.0

Living backlog. Supplements `docs/ROADMAP.md` with deferred items
spawned during sessions and re-ranks open work by today's
priorities. ROADMAP stays the canonical theme tracker; this file
is the daily-planning view.

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

- **AR-03+ Article Phase 3 (platform APIs + automation)**: archived
  2026-05-02 as "investigated and deferred" per the exploration's
  Section 11 escape hatch. Full readiness audit at
  `docs/audits/2026-05-02-ar-03-readiness.md`. Reason: AR-01
  validation log holds 0 real cross-posting entries (template
  fixture + section markers only); without that data the scoping
  decision is a guess about a use case not yet understood.
  Re-open conditions documented in the audit. Same session also
  fixed `make check-blockers`'s entry counter (false-positive
  UNBLOCKED reading on 2026-05-02 from counting template lines)
  and reverted the wrong ROADMAP / backlog flips.

- **GH issue #13 — mutmut nightly on import orchestrator**: closed
  2026-05-02 in `814d870`. Wired `.github/workflows/mutation-import.yml`
  scoped to `backend/app/import_plugins/` +
  `backend/app/routers/import_orchestrator.py`. Repo-variable gate
  `ENABLE_NIGHTLY_MUTATION=true` enables the cron `0 2 * * *` run;
  `workflow_dispatch` always runs regardless. mutmut v3 dropped
  `--paths-to-mutate`, workflow rewrites `[tool.mutmut].paths_to_mutate`
  in `pyproject.toml` in-place before invoking. Artifacts:
  `mutmut-import-<run-id>` (30-day retention). Audit skeleton at
  `docs/audits/mutmut-2026-05-02-import.md`; survivor triage + score
  numbers fill once first CI run lands. Same session also closed:
  service `HTTPException → BibliogonError` migration (`543d9eb`,
  20 sites across `services/covers.py` + `services/backup/*`,
  preserves all status codes, 1253/1253 backend tests green); raw
  `fetch()` consolidation in `Editor.tsx` + `BookMetadataEditor.tsx`
  through `api.ai.*` / `api.grammar.*` / `api.audiobook.preview`
  (`0559d57`); compose Node 20 → 24 (`9e29838`); ROADMAP-conflict
  notice + TipTap word-count lesson refresh (`57ea6fb`); UX-FU-01
  TopicSelect interactive on settings-API failure (`de6d251`).

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

### 1. DEP-02 - TipTap 2 → 3 migration (BLOCKED)

- **ID**: DEP-02
- **Effort**: 4-8h code + 1-2h regression
- **Status**: **BLOCKED** (per user 2026-05-02). Pre-audit complete
  in `docs/explorations/tiptap-3-migration.md`. Hard blocker:
  `@sereneinserenade/tiptap-search-and-replace` v0.2.0 still
  unpublished on npm (latest published v0.1.x for TipTap 2 only).
  See https://www.npmjs.com/package/@sereneinserenade/tiptap-search-and-replace.
- **Unblock**: upstream npm publish of v0.2.0, OR explicit go-ahead
  to ship the `prosemirror-search` adapter (~50-80 LOC) fallback.
- **Knock-on blocks**: DEP-09 (Vite 8) + SEC-01 (vite-plugin-pwa
  CVEs) chain on the same vite-plugin-pwa upstream.

### 2. _slot open_

(AR-03+ archived 2026-05-02 - see Recently closed.)

### Article validation (background, no code)

- **AR-01 validation log**: 0 real entries as of 2026-05-02.
  Long-running passive task — fill
  `docs/journal/article-workflow-observations.md` during normal
  cross-posting work. Reaching 3-5 entries triggers a fresh
  AR-03+ readiness audit (the archived audit lives at
  `docs/audits/2026-05-02-ar-03-readiness.md` and lists the
  re-open conditions).


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
- **TM-04b sub-items** (chapter-template followups):
  - [x] Update endpoint exposed in UI — Pencil button per
    user template in `ChapterTemplatePickerModal` opens
    `SaveAsChapterTemplateModal` in edit mode (renames + redescribes
    via `PUT /api/chapter-templates/{id}`). Builtins remain read-only.
    Closed 2026-05-02.
  - [x] JSON export/import for templates — `GET /api/chapter-templates/{id}/export`
    returns a `bibliogon-chapter-template` JSON with the four
    template fields (no `is_builtin`). `POST /api/chapter-templates/import`
    accepts the same shape, validates the `format` marker +
    required fields + `chapter_type` enum, and inserts as a user
    template. UI: Download icon per card + "JSON importieren" button
    in the picker header. 8 backend tests, 6 i18n keys × 8 langs.
    Closed 2026-05-02.
  - [ ] Multi-chapter templates (data model change). Effort: M.
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
- **UX-FU-01**: closed 2026-05-02. `useTopics` hook now falls
  back to `[]` on API failure (was `null` forever, which kept
  TopicSelect disabled). On failure logs `console.warn` for
  diagnostics; TopicSelect stays interactive — empty hint shows
  and inline-add ("+ Neues Thema hinzufügen") still works. Test
  flipped from "stays null on API failure" to "falls back to
  empty array on API failure". 6/6 useTopics Vitest green; 682
  full Vitest green; tsc clean.
- **TPL-I18N-01**: closed 2026-04-28 in `<commit>`. Fixed via
  option (c): `slugifyTemplateName` helper in
  `frontend/src/components/CreateBookModal.tsx` derives a
  stable i18n key from the builtin's English DB name; renderer
  calls `t(`ui.builtin_templates.${slug}.{name|description}`,
  fallback)`. User templates fall through to the raw DB string.
  5 builtins translated × 8 languages = 40 entries each for
  name + description.
- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs
  (es, pt, tr, possibly fr) ship with inconsistent diacritic
  coverage - some entries use proper Unicode (`géneros`,
  `Décroissant`, `gêneros`) while others ASCII-substitute
  (`Titulo`, `Baslik`). Found in Test Phase Session 3
  (2026-04-28) cross-language audit while fixing DE umlauts.
  Severity: Medium (readable but inconsistent + non-native).
  Effort: M per language. Cause: `AUTO_TRANSLATED.md` banner
  in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current
  DE source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use.
  Defer until DE i18n stable + a native speaker is available
  per language for review.
- **UX-FU-02**: closed. Shipped via new ``ArticleAsset`` model +
  ``/api/articles/{id}/assets`` router + ``ArticleImageUpload``
  component (drag-drop + click-to-pick + remove). URL field stays
  as fallback alongside the upload widget. 11 backend tests + 12
  i18n keys x 8 langs.

### Dependencies (DEP / SEC)

- **DEP-02**: BLOCKED. TipTap 2 → 3. See top #1 + Blocked-or-waiting
  table.
- **DEP-05**: BLOCKED. elevenlabs SDK 0.2 → 2.x. Needs paid API
  key for verification. Schedule with a real audiobook test run.
- **DEP-09**: BLOCKED. Vite 7 → 8. `vite-plugin-pwa` upstream
  peer-deps top out at Vite 7. Re-check
  `npm view vite-plugin-pwa peerDependencies` every ~2 weeks.
  Last check: 2026-04-30. Tracker: GH #6.
- **SEC-01**: BLOCKED. vite-plugin-pwa CVE chain (4 high-severity,
  all dev-only, production bundle clean). Same upstream blocker as
  DEP-09. Re-audit monthly via `npm audit --audit-level=high`.

### Documentation

- **DOC-01**: DE translation of `docs/help/en/import/git-adoption.md`
  (CIO-07 follow-up). Effort: S.
- **DOC-02**: ROADMAP header refresh on next release (latest
  release line, last-updated date, "next active theme" line).
  Effort: trivial.
- **DOC-03**: closed; see Recently closed.

### Validation tracks

- **AR-01**: article authoring validation log. Long-running passive
  task. 0 real entries as of 2026-05-02; threshold 3-5.
- **AR-02**: article authoring architecture decision. Resolved as
  Option B (separate `Article` entity), shipped through Phase 1 +
  Phase 2 (Publications + drift detection).
- **AR-03+**: archived 2026-05-02 as "investigated and deferred".
  See `docs/audits/2026-05-02-ar-03-readiness.md` for findings and
  re-open conditions.

### Maintenance

- **MAINT-01**: closed; see Recently closed.

---

## Blocked or waiting

Run `make check-blockers` (or `bash scripts/check-blockers.sh`) to
poll every upstream source in this table at once. The script prints
`[BLOCKED]` / `[UNBLOCKED]` / `[MANUAL]` per item plus a one-line
summary; flip the corresponding row when something turns green.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish OR explicit go-ahead for `prosemirror-search` adapter fallback |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| DEP-09 (Vite 8) | `vite-plugin-pwa` peer-dep update | Upstream releases Vite 8 compat |
| SEC-01 | Same as DEP-09 | Same as DEP-09 |
| ~~AR-03+~~ | _archived 2026-05-02_ | Investigated and deferred — see `docs/audits/2026-05-02-ar-03-readiness.md`. Re-open when AR-01 log threshold met OR Section 13 cadence trigger fires. |
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
