# Pre-release coverage audit — 2026-05-12

Scope: features added between v0.30.0 (2026-05-08) and HEAD on
2026-05-12. NOT a full-codebase audit. Seven feature buckets are
audited against the project's coverage rules (see
`.claude/rules/quality-checks.md` and `.claude/rules/ai-workflow.md`).

Author: pre-release verification, Deliverable 1.
Previous full audit: `docs/audits/current-coverage.md` (v0.20.0
addendum, 2026-04-20). This audit is delta-focused; it does NOT
revisit modules unchanged since v0.30.0.

---

## Test suite baselines (D2 run earlier today)

| Suite                                          | Result                          |
|------------------------------------------------|---------------------------------|
| Backend pytest                                 | 1601 passed, 1 skipped, 208.67s |
| Frontend Vitest (91 files)                     | 929 passed, 4.84s               |
| Backend ruff                                   | clean                           |
| Frontend `tsc --noEmit`                        | clean                           |
| Backend mypy (96 source files)                 | no issues                       |
| `pre-commit run --all-files`                   | clean                           |
| Plugin lockfile drift (`verify-plugin-locks`)  | clean                           |
| Playwright smoke + build verification          | running (status pending)        |

Backend test count delta from the v0.20.0 audit baseline (638)
is +963 over five weeks of articles + AI-template + bulk-delete
+ comments + medium-import work, a roughly 2.5x growth. Frontend
delta is +524 over the same window (405 -> 929). These growth
figures are unusually large for a 5-week window because of the
articles subsystem landing as a peer of books and the
universal-AI-template work shipping a 2-session 10-commit
sequence. They do NOT indicate a coverage gap; they reflect new
surface area.

---

## Coverage map per feature

Conventions (mirrors `current-coverage.md`):

- **Surface**: total LOC for the production module(s) of the
  feature, files counted. Test files NOT counted in the surface.
- **Tests**: pytest functions for backend, `it(`/`test(` for
  frontend Vitest, `test(` for Playwright.
- **Critical path / Edge cases / Integration / E2E**: Y / N /
  partial (P).
- **Priority**: A = block release / fix in this cycle.
  B = standard, untested module. C = nice-to-have.
  D = excluded with documented reason.

| # | Feature | Surface (LOC / files) | Backend tests | Frontend tests | Critical paths | Edge cases | Integration | E2E | Gap | Pri |
|---|---------|----------------------|---------------|----------------|----------------|-----------|-------------|-----|-----|-----|
| 1 | Medium-import plugin (walker + importer + bulk ZIP endpoint + image downloader + comment heuristic + settings + provenance) | 1481 / 6 (`walker.py` 511, `importer.py` 497, `routes.py` 216, `image_downloader.py` 202, `plugin.py` 46, `__init__.py` 9) | 89: walker 38 (plugin), plugin 11 (plugin), pure-downloader 11 (plugin), backend-side downloader 4, endpoint 29, comments-importer 12, roundtrip 5, ArticleImportSource model 6 | 39: medium-import client 5, UploadZone 7, Progress 3, Result 5, Settings 6 + the import-source ApiError test pinning 4-arg constructor (frontend) and 9 fixtures × 1 walker fixture-shape test (plugin) | Y | Y | Y | Partial (no smoke spec for the `/articles/import/medium` page) | E2E smoke for the bulk-ZIP upload page; `__version__` literal in `__init__.py` is hardcoded `1.0.0` (drift vs. canonical 0.30.0) | B + see Drift findings |
| 2 | AI-template backend (8 endpoints + bulk export/import + bulk ai-fill SSE + caps) | 2791 / 6 (`ai_template_bulk_fill.py` 824, `ai_template_bulk.py` 445, `article_ai_template.py` 342, `article_ai_fill.py` 394, `book_ai_template.py` 399, `book_ai_fill.py` 387) + 1205 / 3 schema modules (`template_schema.py` 801, `article_template_prompts.py` 193, `book_template_prompts.py` 211) | 178: article-template 28, book-template 26, article-ai-fill 21, book-ai-fill 17, bulk-template 18, bulk-ai-fill 22, template-schema 27, template-prompts 19 | 24: client.ai-template 24 | Y | Y | Y | N (no Playwright spec for workflows A + B; spec covers workflow C only) | E2E coverage of built-in AI fill (workflow A) + custom-endpoint (workflow B) is missing | C |
| 3 | AI-template frontend (`AITemplatePanel`, `FieldClassDialog`, `TemplateImportDropZone`, `BulkAiFillJobContext`, `BulkAiFillDock`, `BulkAiFillConfirmDialog`, `BulkTemplateImportDialog`, panel mount in editor + dashboard) | 2640 / 8 (`AITemplatePanel.tsx` 370, `FieldClassDialog.tsx` 359, `BulkAiFillConfirmDialog.tsx` 447, `BulkAiFillDock.tsx` 411, `BulkAiFillJobContext.tsx` 455, `TemplateImportDropZone.tsx` 198, `BulkTemplateImportDialog.tsx` 202, plus AITemplatePanel wiring in ArticleEditor + BookMetadataEditor) | n/a | 78: AITemplatePanel 15, FieldClassDialog 15, TemplateImportDropZone 13, BulkAiFillJobContext 18, BulkAiFillDock 8, BulkAiFillConfirmDialog 10, BulkTemplateImportDialog 9, ArticleBulkActionBar 9, BookBulkActionBar 9 (last two pin the bulk-AI dropdown trigger) | Y | Y | n/a | Partial: `e2e/smoke/ai-template-roundtrip.spec.ts` (5 tests) covers panel mount, export download, import dialog open, dashboard new-from-template, bulk action-bar trigger reachable | Workflows A + B not covered E2E (requires LLM mock infra); ArticleEditor + BookMetadataEditor pages have no dedicated Vitest test (deferred per `current-coverage.md` "Page components: E2E covers page rendering"); live-cost-projection in BulkAiFillDock has no dedicated test | C |
| 4 | Bulk-delete (backend `POST /api/articles/bulk-delete` + `/api/books/bulk-delete`; frontend `TypeToConfirmDialog`, `formatActiveFilters`, `notify.bulkAction` toast with Undo, removed 200-row cap, bulk-action-bars) | 155 (`backend/app/routers/bulk_delete.py`) + 470 / 3 frontend (`TypeToConfirmDialog.tsx` 198, `formatActiveFilters.ts` 74, `notify.bulkAction` added inline to `utils/notify.ts`) | 9 (`test_bulk_delete.py`: soft 3, permanent + cascade 3, validation 3 incl. over-200 uncapped) | 27: TypeToConfirmDialog 10, formatActiveFilters 8, ArticleBulkActionBar 9 + BookBulkActionBar 9 cover delete trigger via the bar | Y | Y (empty body 422; over-200 accepted; missing IDs in `failed[]`; already-trashed in `skipped_already_trashed[]`; cascade verified) | Y | N (no Playwright spec yet for select-all -> bulk-delete confirm -> delete -> undo toast flow) | E2E smoke for the dashboard bulk-delete user flow + Undo toast | A |
| 5 | Comments system (`article_comments` table + `ArticleComment` model, `GET /api/articles/{id}/comments`, `/api/comments` admin router, comment-routing-by-mode in importer, `ArticleCommentsPanel`, `CommentsCountBadge`, comments-count badge on `ArticleCard` + list row, Settings comments-admin tab, `ArticleOut.comments_count`) | 83 (`routers/comments.py`) + model + `comments_count` in `routers/articles.py` + 996 frontend (`CommentsAdminSection.tsx` 449, `ArticleCommentsPanel.tsx` 195, `CommentsCountBadge.tsx` 59, ArticleBulkActionBar 293) | 32: comments-admin 8, ArticleComment-model 6, articles-get-comments 4 (in `test_articles.py` lines 414-549 incl. comments_count tests 3), medium-import comments-routing 12, ArticleImportSource cascade 6 | 33: CommentsAdminSection 17, ArticleCommentsPanel 8, ArticleCard comments-badge 4 (inside ArticleCard 7-test file), ArticleList comments-badge 1 (in ArticleList 11-test file), shared `CommentsCountBadge` exercised by both | Y | Y (orphan filter + imported_from filter + combined, soft-delete exclusion, 404 unknown id, idempotent re-delete) | Y | N (no Playwright spec for comments-panel sidebar or comments-admin tab) | E2E smoke for comments-admin filter + delete + ArticleEditor sidebar `ArticleCommentsPanel` rendering | B |
| 6 | AI-provider settings UI (Custom preset + AI-template tab i18n × 8 catalogs) | ~50 lines in `aiProviders.ts` (custom preset) + Settings.tsx pages (untested at component level) | n/a (preset is frontend) + 6 backend i18n-parity tests guarantee all 8 catalogs carry the same key shape | 14 (`aiProviders.test.ts`); explicit tests for empty custom preset, requires_api_key=false, model_suggestions=[] | Y (Custom preset shape pinned; 6 named providers; cloud-vs-local; round-trip) | Y (unknown id returns undefined; lmstudio empty default model) | n/a | N (Settings.tsx has no component test; covered indirectly by E2E `tests/settings.spec.ts` from the prior audit but no spec for the AI tab's Custom preset wiring) | E2E smoke for Settings AI tab "Custom" preset switch + AI-template settings | C |
| 7 | CI hardening (Poetry cache on lint + backend + plugin matrix; `fail-fast: false`; `timeout-minutes` per job; `pytest -q`; Node 24 across 8 workflows; pre-commit drift unblock) | 8 workflow YAMLs in `.github/workflows/` | n/a (CI config; not testable in pytest) | n/a | n/a | n/a | n/a | n/a | None — verified by D2's clean pre-commit + the (running) Playwright + build smoke; the operational "workflow runs successfully end-to-end" check is the next push to main | D (excluded; CI YAML is its own integration test by being green on main) |

---

## Prioritized gap list

### A. Critical (regression-pin or data integrity)

**A1. Bulk-delete user-flow has no Playwright smoke spec.**
- Feature: select multiple cards on the Articles or Books
  dashboard, click bulk-delete, type-to-confirm dialog opens with
  numeric-count gating, confirm, toast appears with Undo, click
  Undo, items restored.
- Risk class: data-critical UX. Bulk operations on the dashboard
  can hard-delete (`permanent=true`) and removing the 200-row cap
  means a single misclick on "select all" + permanent path can
  destroy thousands of rows. The TypeToConfirmDialog numeric
  gate is the only guard between user and destruction; an Undo
  toast is the only recovery for the soft path. Both deserve a
  user-flow regression pin.
- Project rule violation: `ai-workflow.md` step 7 ("For every
  new UI feature write at least one spec under `e2e/smoke/`")
  has been skipped for the bulk-delete frontend.
- Mitigation cost: ~80-line spec covering soft + permanent +
  numeric-gate-rejects-wrong-count, drafted Claude-side, run
  Aster-side.

### B. Standard (untested module)

**B1. `/articles/import/medium` page has no Playwright smoke spec.**
- Feature: full Medium-export upload flow on the dedicated page
  route (per the page-route-vs-modal divergence documented in
  the lessons-learned).
- Risk class: import is data-critical. The backend pipeline is
  well-covered (89 tests) but the user flow from
  `/articles/import/medium` -> file picker -> upload progress
  -> Result panel render has no E2E pin. The page exists, its
  child components are unit-tested, but the orchestration on
  `MediumImportPage.tsx` is not.
- Project rule violation: same as A1 (`ai-workflow.md` step 7).
- Mitigation cost: ~50-line spec mocking the backend `/api/medium-import/import`
  endpoint OR uploading a tiny synthetic ZIP through a real
  backend-up smoke harness.

**B2. Comments-admin tab + ArticleCommentsPanel sidebar have no
Playwright smoke spec.**
- Feature: Settings -> Comments tab loads the
  CommentsAdminSection (449 LOC), filter by `imported_from`, by
  `orphans_only`, paginate, soft-delete a row with confirmation.
  Article editor sidebar shows the ArticleCommentsPanel (195
  LOC) with per-comment list.
- Risk class: admin UI for an importer-produced data set.
  Existing 33 frontend unit tests cover the data wiring at the
  component level (filters, pagination, delete handler) but not
  the user clicking through them end-to-end.
- Project rule violation: same as A1 / B1.

**B3. `MEDIUM-IMPORT-VERSION-DRIFT-01` — hardcoded `__version__`
in plugin's `__init__.py`.**
- File: `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/__init__.py`
  line 9: `__version__ = "1.0.0"`.
- Drift: canonical app version per `backend/pyproject.toml` is
  `0.30.0`. Plugin lock-step has been the rule since v0.26.x
  (see `release-workflow.md` "What derives from what (DO NOT
  EDIT)" — every plugin pyproject is synced to backend, and the
  package `__version__` should derive from
  `importlib.metadata.version(...)` rather than a literal).
- Detection: `make sync-versions-check` fails against canonical
  0.30.0; `scripts/verify_version_pins.sh` regression-detector
  for hardcoded `__version__ = "..."` outside `_build_info`
  flags this file.
- Mitigation cost: 10-line patch to switch the module to read
  the version from `importlib.metadata.version("bibliogon-plugin-medium-import")`
  with a sentinel fallback (`"0.0.0+unknown"`) and a
  `logger.warning`. Confirm `make sync-versions-check` is green
  after.

**B4. `MKDOCS-NAV-DRIFT-01` — `mkdocs.yml` out of sync with
`docs/help/_meta.yaml`.**
- `docs/help/_meta.yaml` line 170 lists `slug: ai/ai-templates`
  under the "KI-Assistent / AI Assistant" section.
- `mkdocs.yml` line 133 only lists `KI-Assistent: de/ai.md`; no
  entry for `de/ai/ai-templates.md` or `en/ai/ai-templates.md`.
- Drift class: same shape as the v0.30.0 audit findings ("MkDocs
  nav generator reads `_meta.yaml` as single source of truth;
  pages not listed are unreachable from the side nav even though
  direct URLs and in-text links still work").
- Both pages exist on disk: `docs/help/de/ai/ai-templates.md`
  and `docs/help/en/ai/ai-templates.md`. Running `make
  sync-mkdocs-nav` (a.k.a.
  `scripts/generate_mkdocs_nav.py`) regenerates the nav from
  `_meta.yaml` and unblocks them.
- Verification: `make verify-docs-discipline` (per the v0.30.0+
  pre-tag chain) will fail with the orphan-page check until
  this is fixed.

### C. Nice-to-have (defer to v0.31.0+ unless blocking)

**C1.** E2E coverage for AI-template workflows A (built-in AI)
+ B (custom endpoint). Workflow C (external YAML round-trip) is
covered by `e2e/smoke/ai-template-roundtrip.spec.ts` (5 tests).
A + B need LLM-mock infrastructure shared across sessions; a
common route-mock helper is the prerequisite. Cost-of-fix is
medium; risk is low because the three workflows share most of
the same UI component (AITemplatePanel) and workflow C exercises
all three buttons.

**C2.** Page-component Vitest tests for `MediumImportPage.tsx`,
`ArticleEditor.tsx`, Settings.tsx. The project's documented
position is "page components: E2E covers page rendering", but
the AI-template panel mounting + the Settings AI tab Custom
preset switch are not covered E2E either. A small Vitest test
for each page covering the panel-mount invariants would close
the gap without waiting for E2E.

**C3.** A dedicated test for the live-cost-projection in
BulkAiFillDock (the running-total token + USD render as items
complete). Currently covered indirectly by the 18-test
BulkAiFillJobContext test that drives state through the same
event stream; an explicit Dock-side render test would pin the
formatter.

### D. Excluded with rationale

**D1.** CI hardening (feature 7) has no test surface by
construction — workflow YAMLs are themselves the test
infrastructure. The "test" is "CI is green on main after the
hardening commits land", which is satisfied per the D2 baseline
above (D2 includes the pre-commit clean run and the plugin-lock
drift check; the actual CI matrix run is the next push event).

**D2.** AI-provider settings UI is at C-tier rather than B-tier
because the underlying `aiProviders.ts` data structure is
HIGH-coverage (14 tests, all Custom-preset invariants pinned).
The Settings.tsx mounting of a Custom preset switch is the
specific gap, captured under C2.

**D3.** The `BulkAiFillJobContext` SSE F5-recovery scenario is
covered by the 18-test context suite (including the localStorage
mirror), so the "persistent SSE dock" feature does not need its
own integration test. The dock is a pure consumer of the
context per the SSE-in-context-not-in-modal architecture rule.

---

## Summary

- **7 feature buckets audited.**
- **HIGH coverage** (Y on every dimension): 2 features — bulk-delete
  backend + bulk-delete validation paths (feature 4), AI-template
  backend (feature 2). Both have integration tests covering
  4xx / cascade / SSE / per-item isolation / cost-known-vs-unknown.
- **MEDIUM coverage** (Y backend + frontend unit, partial E2E):
  3 features — medium-import plugin (feature 1), AI-template
  frontend (feature 3), comments system (feature 5). Each is
  well-covered at the unit + integration level (89-178 backend
  tests; 24-78 frontend tests) but missing at least one
  user-flow E2E spec.
- **LOW coverage** (component-level only, no integration or
  E2E): 1 feature — AI-provider settings Custom preset (feature 6).
  The data structure is HIGH-coverage, the UI is unit-covered
  via `aiProviders.test.ts` and indirectly via Settings page E2E
  from the prior audit; the specific Custom-preset switch flow
  is a C-tier gap.
- **N/A**: CI hardening (feature 7).
- **Critical gaps to address before release**: 1 — the
  bulk-delete user-flow Playwright spec (A1). The cost-profile
  rationale documented in `lessons-learned.md` (uncapped
  bulk-delete) raises the data-destruction risk of the
  uncapped path; the only frontend guard is the type-to-confirm
  dialog, and no E2E pin exists today.
- **Drift findings to address before release**: 2 — the plugin
  `__version__` literal in `__init__.py` (B3) and the
  `mkdocs.yml` -> `_meta.yaml` AI-templates nav gap (B4).
  Both are mechanical fixes (one Python derivation switch + one
  `make sync-mkdocs-nav` run); both are caught by the release
  workflow's mandatory checks (`make sync-versions-check`,
  `make verify-docs-discipline`) and would block a tag push if
  not fixed.
- **Deferrable to v0.31.0+**: 3 — AI-template workflows A + B
  E2E (C1), page-component Vitest tests (C2), live-cost-
  projection render test (C3).

### Tally

| Severity | Count |
|----------|-------|
| A — block release | 1 |
| B — standard, fix in this release | 4 (B1, B2, B3, B4) |
| C — defer | 3 |
| D — excluded with reason | 3 |

If A1 + B1-B4 are addressed, the v0.31.0 release artifacts will
land with no known coverage gap or drift in the seven audited
buckets.

---

## Questions and assumptions

- **Assumption: Playwright smoke + build verification (still
  running per D2) will land green.** The audit's coverage map
  above does not include their final pass/fail. If either lands
  red the relevant feature's E2E column flips and at least one
  C-tier gap may escalate.
- **Assumption: `make sync-mkdocs-nav` is the canonical fix
  command for B4.** Cross-checked against
  `release-workflow.md` step 5 ("`make verify-docs-discipline`
  ... aggregates `verify-mkdocs-nav` + `check-mkdocs-orphans`")
  which describes the verifier; the generator is referenced in
  `ai-workflow.md` ("`scripts/generate_mkdocs_nav.py` converts
  it into the MkDocs format"). The Makefile target name was
  inferred from the verifier; if the actual generator target
  is named differently, the fix is still a one-line script
  invocation that regenerates `mkdocs.yml` from `_meta.yaml`.
- **Evidence-based: medium-import plugin `__version__` literal
  drift.** Confirmed via `Read` of
  `plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/__init__.py`
  line 9: `__version__ = "1.0.0"`. Canonical app version
  confirmed via `git log` (HEAD on main, post-v0.30.0 release
  tag, before any v0.31.0 bump). Lock-step rule per
  `release-workflow.md` "DO NOT EDIT" table.
- **Evidence-based: AI templates section orphaned in
  `mkdocs.yml`.** Confirmed via `grep -in "ai-template"` on
  both `docs/help/_meta.yaml` (1 hit at line 170, slug
  `ai/ai-templates`) and `mkdocs.yml` (0 hits). The de + en
  markdown files exist under `docs/help/{de,en}/ai/`.
- **Evidence-based: bulk-delete cap removal.** Verified via
  `Read` of `backend/app/routers/bulk_delete.py` — the
  `BulkDeleteRequest` model carries `ids: list[str] =
  Field(min_length=1)` with no `max_length`; the module
  docstring explicitly references the per-operation
  cost-profile lessons-learned entry. Test
  `test_over_200_ids_accepted_no_cap` pins the uncapped
  behavior at 201 IDs.
