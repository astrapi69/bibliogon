# Test Infrastructure Audit — 2026-05-12

Audit date: 2026-05-12
Scope: full test infrastructure (backend + frontend + plugins +
       E2E + CI pipeline + manual-test inventory).
Trigger: user-requested audit. Pre-inspection report;
         implementation gated on confirmation.

## Headline

**The existing test infrastructure is mature and reliable.**
Three full-suite runs surfaced zero flakes (1601 backend tests
+ 926 frontend tests + 15 medium-import plugin tests, identical
results each run). The CI pipeline is correctly parallelised,
isolation tripwires are in place, and `mutmut` is already wired
(scoped to the import orchestrator, nightly cron, gated by a
repo variable).

**Recommended Phase 1: GitHub Actions cache hardening + fail-fast
fix.** A small, low-risk PR (~1-2 hours) that removes wasted CI
minutes on every push and makes plugin-matrix failures
diagnostically clean.

**Recommended Phase 2 (or defer): expand mutmut scope to walker
+ comments + ai-template.** Existing infrastructure; pure scope
expansion. Higher confidence move once Phase 1 lands.

## Audit findings

### 0.1 Test inventory

| Suite | Files | Test count | Reliable per 3x run? |
|-------|-------|------------|----------------------|
| Backend | 115 | 1601 (+1 skipped) | yes |
| Plugins (`make test` matrix) | 27 | (covered by plugin runs) | yes |
| Frontend Vitest | 91 | 926 | yes |
| E2E Playwright (smoke) | 29 | (not run in this audit) | n/a |
| Medium-import plugin specifically | 4 | 52 | yes |

**Wall-time:**
- Backend full run: 128-133s (3 samples, ~131s ±2s)
- Frontend Vitest: ~5s
- Plugin tests in `make test` matrix: small (~5s each)

### 0.2 Flaky test detection

Three full backend runs + three full frontend runs:

```
Backend:   1601 passed / 1 skipped  (132.95s, 131.22s, 128.41s)
Frontend:   926 passed / 0 failed   (~5s each)
```

**Zero flakes across 6 total runs.** Plus a code-pattern scan
for known flake-prone patterns:

- `time.sleep` / `asyncio.sleep`: 9 sites. All ≤ 500ms.
  Bounded deadlines with proper poll-until-terminal logic
  (see `test_ai_template_bulk_fill.py:316`: 40 × 50ms poll
  checking job-completion status, not a fixed wait).
- `_wait_for_job` in `test_ai_template_bulk_fill.py:158` is
  **dead code** (defined but zero call sites). Hygiene
  cleanup, not a flake.
- No `@pytest.mark.flaky`, no `@pytest.mark.xfail` retries.
  Skip markers are environment-gated (pandoc, WAL on
  `:memory:`), not flake mitigation.
- 2 async tests (`async def test_`); 9 `asyncio.sleep`
  sites for SSE-style polling, all under deadline gates.

**Verdict:** no flake risk to fix.

### 0.3 Coverage gap analysis (recent waves)

Recent waves (since 2026-04-20 baseline audit) and their test
files:

| Wave | Module(s) | Test file(s) | Test count |
|------|-----------|--------------|------------|
| AI-template backend | `ai/article_template_prompts.py`, `ai/book_template_prompts.py`, `ai/template_schema.py`, `routers/article_ai_{fill,template}.py`, `routers/book_ai_{fill,template}.py`, `routers/ai_template_bulk{,_fill}.py` | `test_ai_template_bulk{,_fill}.py`, `test_article_ai_{fill,template,meta}.py`, `test_book_ai_{fill,template}.py` | 132 |
| AI-template frontend | `AITemplatePanel.tsx`, `FieldClassDialog.tsx`, `TemplateImportDropZone.tsx`, `BulkAiFillJobContext.tsx`, `BulkAiFillDock.tsx`, `BulkAiFillConfirmDialog.tsx` | matching `*.test.tsx` siblings | ~150 frontend tests in the AI-template area |
| Medium-import comments | `routers/comments.py`, `models/ArticleComment` | `test_article_comment_model.py`, `test_comments_admin.py`, `test_medium_import_comments.py` | 26 |
| Medium-import walker bugs | `walker.py` `find` -> `find_all`, `imageFigure` regression | `test_walker.py` (8 new heuristic tests + image-type regression pin) | 41 walker tests total |
| Bulk-delete | `routers/bulk_delete.py` | `test_bulk_delete.py` | 9 |
| BULK-AI-FILL-LIVE-COST-01 | `BulkAiFillJobContext` (cost projection) | extended `BulkAiFillJobContext.test.tsx` | 5 new context + 2 dock tests |
| AI-FILL-CAP-CONFIG-01 | `ai/routes.py` `_get_bulk_ai_caps` + router caps | new `test_bulk_ai_caps.py` (12 unit) + extended router tests | +18 |
| Comments UI | `ArticleCommentsPanel`, `ArticleCard` count badge, `CommentsAdminSection` | new `*.test.tsx` files | +37 |

**No untested critical paths surfaced.** Specifically:

- **Walker heuristic**: regression-pin tests in
  `tests/test_walker.py` exist for both the `find` vs
  `find_all` bug AND the `imageFigure` vs `image` node-type
  regression. The audit-driven dropped-empty-subtitle
  criterion is also pinned.
- **Comment routing modes**: end-to-end coverage for all 3
  `import_comments_mode` values + both
  `orphan_comment_handling` modes via
  `test_medium_import_comments.py` (12 tests).
- **Admin endpoints**: list (with each filter combination),
  soft-delete, idempotent re-delete, 404 path all covered by
  `test_comments_admin.py` (8 tests).
- **AI bulk caps**: invalid-value fallback, env-default,
  runtime override all unit-tested in `test_bulk_ai_caps.py`
  (12 tests).

**Gap NOT closed by recent waves** (pre-existing from prior
audits, still open):

- `pandoc_runner.py` in export plugin — still zero direct unit
  tests; exercised only indirectly.
- Audiobook generation E2E — no dedicated Playwright spec.
- Image/asset upload in editor E2E — no spec.
- Chapter-sidebar dropdown layout at 125% / 150% zoom —
  3 skipped tests, blocked on Radix Popper rework.

None of these gaps reflect the recent waves. They're inherited
from earlier audits. Recommendation: leave them in their
existing backlog status, no new action.

### 0.4 Redundancy / boilerplate

**TestClient fixture patterns are heterogeneous:**

| Pattern | File count |
|---------|------------|
| Module-level `client = TestClient(app)` (no `with`) | 23 |
| Fixture-with-lifespan `with TestClient(app) as c:` | 34 |
| Inline `with TestClient(app) as c:` per test | 3 |
| Total backend files instantiating TestClient | 89 |

The module-level form skips the lifespan, which means plugin
routes are not mounted for those tests. Lessons-learned has
this rule documented; the heterogeneity is a real risk because
adding a test to a "no-lifespan" file silently routes around
plugin-mounted endpoints.

**Pre-existing conftest already raises** `sys.setrecursionlimit`
to 5000 because of the 41+ TestClient lifespans concurrent in
the suite. That comment is now understated — 34 fixture-with-
lifespan files exceed 41 quickly under pytest's collection
ordering.

**Boilerplate scale:**
- 71 `@pytest.fixture` declarations
- 22 `@pytest.fixture(scope="module")`
- 17 `@pytest.fixture(autouse=True)`
- ~30 instances of `def client(): with TestClient(app) as c: yield c`
  (essentially identical code)

**Verdict:** refactoring to a shared session-scope `client`
fixture in `conftest.py` would DRY ~30 sites. Trade-off:
introduces shared mutable state (job_store, license cache,
etc.) across tests. Existing per-test fixture pattern provides
isolation by construction. The refactor is the lessons-learned
"don't introduce abstractions beyond what the task requires"
shape — high blast radius, low concrete payoff. **Skip.**

### 0.5 GitHub Actions pipeline audit

8 workflows present:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push + PR | 5 parallel jobs: backend / plugin matrix / frontend / pre-commit / lint+mypy |
| `coverage.yml` | push + PR + dispatch | backend + plugin matrix + frontend coverage |
| `docs.yml` | push (docs paths) | mkdocs build + GitHub Pages deploy |
| `launcher-{linux,macos,windows}.yml` | push (launcher paths) + release | PyInstaller binaries |
| `mutation-import.yml` | nightly cron (gated) + dispatch | mutmut on import-orchestrator scope |
| `release-gate.yml` | release tag | version-pin verification |

**Parallelization is correct** — `ci.yml` has 5 independent
top-level jobs running concurrently. Backend doesn't wait for
frontend; lint doesn't wait for tests. The pre-inspection's
"are backend + frontend sequential?" prediction is wrong.

**Real CI hardening gaps:**

1. **No Poetry cache in `ci.yml` or `coverage.yml`.** Backend +
   plugin matrix (9 matrix jobs) + lint + pre-commit all run
   `pip install poetry` from scratch (~5-10s each) and
   `poetry install` from scratch (~15-30s each). On a typical
   push that's **4 jobs × ~25s wasted = ~100s of CI time per
   run.** Multiplied across the plugin matrix (9 jobs each
   running poetry install), much more. Frontend already uses
   `cache: "npm"`.
2. **`plugin-tests` matrix in `ci.yml` has no `fail-fast: false`.**
   Default is `fail-fast: true`. A flake in plugin A masks
   plugin B's real failure. `coverage.yml` explicitly sets
   `fail-fast: false` — the asymmetry is a bug.
3. **No `timeout-minutes` on most jobs.** A hung test could
   waste up to 6h of CI budget. Mutmut workflow has it (90m);
   ci.yml jobs don't.
4. **Backend test job runs `pytest -v`** (verbose). Generates
   a lot of log output for 1601 tests; on a green run that's
   noise. `-q` would be cleaner. Minor.

**Net Phase 1 candidate (low-risk, immediate value):**
- Add Poetry cache via `actions/setup-python` cache parameter
  OR explicit `actions/cache@v4` step keyed on
  `poetry.lock` hash.
- Add `fail-fast: false` to `ci.yml`'s plugin matrix.
- Add `timeout-minutes` per job (15 for tests, 30 for
  coverage, 5 for lint).
- Switch backend test job from `-v` to `-q`.

Estimated payoff: 30-60s per push, cleaner matrix failures,
guard against runaway hung jobs.

### 0.6 Manual-test inventory

Items currently exercised manually (no automation):

- **Visual editor smoke after walker changes.** When a walker
  bug like the `find` vs `find_all` truncation slips through,
  Aster catches it by importing a real Medium archive and
  opening articles in the editor. No automated check that the
  editor renders the body correctly post-import.
- **AI provider integration.** Real API calls to Anthropic /
  LM Studio etc. cost money or require local servers. The
  test suite mocks `LLMClient`; the only "did we wire it up
  correctly?" check is a manual one-shot via the Settings AI
  tab's "Test connection" button.
- **Audiobook generation flow.** No E2E spec (per the
  pre-existing gap above); only manual click-through.
- **Cross-browser checks** for any new UI: not part of the CI
  loop. Vitest runs under happy-dom; Playwright smoke runs in
  Chromium only.

**Worth automating now?**
- Editor-renders-imported-article visual check: would catch
  walker truncation regressions but needs Playwright +
  fixture archive. Effort: M, payoff dependent on future
  walker-bug rate. **File as backlog, don't promote.**
- AI integration smoke: would require either a paid CI key or
  a local mock server in CI. Effort: M, value low because
  mocks already cover the request shape. **Defer.**
- Audiobook E2E: pre-existing gap from 2026-04-20 audit, no
  new evidence. **Leave as-is.**
- Cross-browser smoke: would add ~3min to CI per browser. The
  app is desktop-focused so cost > value. **No.**

### 0.7 Real-cost evaluation of upgrade options

#### Testcontainers for backend tests

- **Current:** in-memory SQLite + TestClient. ~131s for the
  full suite.
- **With Testcontainers:** real Postgres per test session.
  Startup overhead: 5-30s. Test execution: similar or slower
  (network hop vs in-process).
- **Bibliogon-specific evidence:** the project ships with
  SQLite as the default and intended production DB
  (CLAUDE.md: "SQLite as the default (no external DB
  required)"). There is no Postgres backend in production.
  No bug history points to SQLite-vs-Postgres divergence.
- **Recommendation:** **NO.** The "best practice" of using
  containerised real DBs is for projects that ship Postgres
  in production. Bibliogon doesn't, and adopting
  Testcontainers would add 5-30s startup per CI run with
  zero documented payoff.

#### Mutmut (mutation testing)

- **Current:** already wired for import-orchestrator scope in
  `.github/workflows/mutation-import.yml` (commit `28fe59c`).
  Nightly cron gated by `ENABLE_NIGHTLY_MUTATION`. Audit
  doc at `docs/audits/mutmut-2026-05-02-import.md` is
  "TBD — pending first CI run" — i.e. **the workflow has
  never been run** even though it's wired.
- **What's missing:** running the workflow at least once and
  filling out the survivor triage table. THEN expanding
  scope to walker / comments / ai-template if the first run
  shows the pattern is useful.
- **Recommendation:** **YES, but in two stages.**
  - **Stage A** (could be Phase 2 of this session OR a
    separate session): trigger the existing
    `mutation-import.yml` via `workflow_dispatch` and fill
    out the survivor triage table. Zero code change, just
    operational. Gates everything else.
  - **Stage B** (later session): expand `paths_to_mutate` in
    `backend/pyproject.toml` to include
    `app/routers/comments.py`,
    `app/routers/ai_template_bulk{,_fill}.py`, and the
    medium-import walker. Add a separate per-scope workflow
    OR parameterise the existing one. Only do this after
    Stage A confirms the existing run is useful.

#### Hypothesis (property-based testing)

- **Current:** zero `@given` usages across the codebase.
- **Bibliogon-specific evidence:** the walker has had two
  classes of bugs in production that property-based tests
  COULD have caught — the `find` vs `find_all` body
  truncation (a specific input shape that example-based tests
  missed) and the `imageFigure` node-type regression. Both
  are now regression-pinned with example-based tests.
- **Trade-off:** the walker's heuristic is well-tested
  example-by-example. Adding property-based tests would mean
  defining invariants like "body_text length never changes
  more than 1% across re-parses" or "imageFigure count
  matches source `<img>` count" — useful but not as cheap as
  it looks.
- **Recommendation:** **NO immediately.** File as backlog
  with the specific Walker invariants to property-test if
  walker keeps producing new bug classes. Today's
  example-based + regression-pin coverage is adequate.

#### GitHub Actions hardening

- **Current:** parallel job graph already in place. Frontend
  has npm cache. Plugin matrix has fail-fast=default(true)
  in ci.yml (asymmetric with coverage.yml).
- **Gaps:** Poetry cache missing, plugin matrix fail-fast
  asymmetry, no timeout-minutes guard, `-v` instead of `-q`.
- **Cost to fix:** 1-2 hours, small PR, ~30 lines across 2
  workflow files.
- **Payoff:** 30-60s saved per CI run + cleaner matrix
  failures + guard against hung jobs.
- **Recommendation:** **YES, this is Phase 1.**

### 0.8 Cold-test prediction

**Phase 1 (recommended):** GitHub Actions cache hardening +
plugin-matrix fail-fast fix + timeout-minutes + `-v` -> `-q`.
Concrete, low-risk, immediate per-PR payoff. ~30 lines
across 2 workflow files. Validates whether the audit
pipeline is the right lens for further work.

**Phase 2 (recommended IF Phase 1 confirms appetite):**
Operationally trigger the existing `mutation-import.yml`
workflow via `workflow_dispatch`, download the artifact,
fill out the survivor triage table at
`docs/audits/mutmut-2026-05-02-import.md`. Zero code change;
gates any future scope expansion. If survivors look
trivially fixable, file the fixes as backlog. If they look
sprawling, surface that and decide on cost.

**Not Phase 1 or 2:** Testcontainers (no Bibliogon-specific
evidence), Hypothesis (example-based coverage adequate),
session-scope client fixture refactor (high blast radius),
heterogeneous TestClient harmonisation (same).

### 0.9 Open questions for confirmation

1. **Phase 1 scope = CI hardening?** (Poetry cache, plugin
   matrix `fail-fast: false`, timeout-minutes, `-q`.) Or
   substitute a different finding.
2. **Phase 2 scope = trigger existing mutmut workflow + fill
   triage table?** Or defer to a separate session entirely.
3. **Mutmut nightly schedule constraint:** confirmed
   per-PR latency is sacred; mutmut stays out of the
   ci.yml flow. Existing workflow already follows this.
4. **Hypothesis scope:** if you'd rather promote
   property-based testing for walker NOW, name the
   invariants to target (e.g. body-text length invariance,
   imageFigure count invariance).
5. **Wall-time budget:** current backend CI ~135s (incl.
   `-v` overhead); frontend ~5s. Phase 1 should REDUCE
   total CI time, not increase. Confirm slowdown is
   unacceptable.
6. **Backlog items for non-implemented findings:**
   - `TESTCLIENT-HARMONIZE-01` (P5): unify the 89 backend
     TestClient sites onto the lifespan-aware fixture
     pattern. Trigger: a real "plugin route returns 404 in
     test" surprise.
   - `WALKER-HYPOTHESIS-01` (P5): introduce Hypothesis
     property-based tests for walker invariants. Trigger:
     a third walker bug class slips through example-based
     tests.
   - `TESTCONTAINERS-EVAL-01` (P5, low priority): evaluate
     Postgres-via-Testcontainers IF Bibliogon ever ships
     a Postgres production path. Trigger: production-DB
     change.

## STOP gate

This is the pre-inspection report. No code changes pending.
User confirms Phase 1 + Phase 2 scope before any
implementation. Per the prompt's stop-conditions: if
implementation surfaces complexity, surface and split.

If user picks "ship NONE of the upgrades" the audit still
produced value: it confirmed the existing infrastructure is
solid and freed time to spend on actual user-facing work.
