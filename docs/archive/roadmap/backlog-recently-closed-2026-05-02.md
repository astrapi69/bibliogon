# Backlog "Recently closed" (Archived)

Archived: 2026-05-02
Source: `docs/backlog.md` "Recently closed" section as of v0.25.0.

The active backlog now lists only forward-looking work. The
prose-bullet entries below documented closure context for each
recently-shipped item; they are preserved here so the commit
hashes and one-line summaries stay searchable.

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
- **TPL-I18N-01**: closed 2026-04-28. Fixed via option (c):
  `slugifyTemplateName` helper in `CreateBookModal.tsx` derives
  a stable i18n key from the builtin's English DB name; renderer
  calls `t("ui.builtin_templates.${slug}.{name|description}",
  fallback)`. User templates fall through to the raw DB string.
  5 builtins × 8 languages = 40 entries each for name + description.
- **UX-FU-02**: shipped via new ``ArticleAsset`` model +
  ``/api/articles/{id}/assets`` router + ``ArticleImageUpload``
  component (drag-drop + click-to-pick + remove). URL field stays
  as fallback alongside the upload widget. 11 backend tests + 12
  i18n keys x 8 langs.
- **UX-FU-01**: closed 2026-05-02. `useTopics` hook now falls
  back to `[]` on API failure (was `null` forever, which kept
  TopicSelect disabled). On failure logs `console.warn` for
  diagnostics; TopicSelect stays interactive — empty hint shows
  and inline-add ("+ Neues Thema hinzufügen") still works. Test
  flipped from "stays null on API failure" to "falls back to
  empty array on API failure". 6/6 useTopics Vitest green; 682
  full Vitest green; tsc clean.
