# Session journal - 2026-05-12 - Test infrastructure audit + Phase 1+2

## Context

User requested a structured audit of Bibliogon's test
infrastructure (~2509 tests across backend / plugins /
frontend / E2E) to find real gaps, NOT a generic
best-practices makeover. Tool adoption defaulted to NO
unless audit proved YES. Test count is not a metric to
maximize; test quality matters more.

## Audit findings (committed as docs/test-infrastructure-audit.md)

Headline: **existing infrastructure is mature and reliable.**

- 3 backend runs × 1601 tests + 3 frontend runs × 926 tests
  = **zero flakes across 6 full runs**.
- CI is already parallelised (5 top-level jobs in ci.yml).
- mutmut workflow is already wired (nightly, gated by
  ``ENABLE_NIGHTLY_MUTATION`` variable, scoped to
  import-orchestrator).
- The audit's pre-inspection predictions about parallelism +
  flakes were both WRONG. Real gaps were CI caching +
  fail-fast asymmetry + missing timeouts.

## Surprises encountered

1. **CI was red on push.** Discovered before any Phase 1
   work could land. Two compounding bugs:
   - ``.claude/scheduled_tasks.lock`` was tracked in
     ``a7df723``. The file is a Claude Code per-session
     runtime artifact whose content includes a PID and
     timestamp with no trailing newline. The pre-commit
     ``end-of-file-fixer`` rewrites it every CI run.
   - 3 Python files had ruff-format drift accumulated
     across recent feature commits. My
     staging-set-discipline (each feature commit added only
     the file it touched) masked drift on files that
     pre-commit's ``--all-files`` mode caught.
   - Fixed in ``ba94f65`` (untrack + gitignore +
     reformat). After that push, mypy surfaced a separate
     break in ``bulk_delete.py:94``; fixed in ``15ad11f``.

2. **mutmut workflow has NEVER produced a successful run.**
   Wired 2026-05-02, dispatched today for the first time.
   The job completed in 1m12s (vs. 20-40min expected)
   because mutmut errored during its initial
   ``run_stats_collection`` phase with
   ``BadTestExecutionCommandsException``. The exact pytest
   args mutmut uses succeed when run manually
   (``--rootdir=. --tb=native -x -q tests/`` → 1601 passed
   in 2:26), so the failure is inside mutmut's pytest
   plugin, not pytest itself. Filed as
   ``MUTMUT-STATS-COLLECTION-BUG-01`` (P3).

3. **Node 20 deprecation warning** from
   ``actions/checkout@v4`` + ``actions/setup-python@v5``
   internal runtimes (NOT our YAML pins). User flagged
   mid-session; fixed via
   ``FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`` at
   top-level ``env:`` block on all 8 workflows.

## What landed

| # | SHA | Change |
|---|---|---|
| 1 | ba94f65 | fix(ci): unblock CI from pre-commit drift (.claude/scheduled_tasks.lock untrack + 3 ruff-format files) |
| 2 | d50f24e | fix(ci): cache Poetry virtualenv on backend test job |
| 3 | 1c7bd9f | fix(ci): cache Poetry virtualenv on plugin matrix |
| 4 | 6bc7d1e | fix(ci): fail-fast: false on plugin matrix (parity with coverage.yml) |
| 5 | fc25c7b | fix(ci): timeout-minutes per job |
| 6 | 15ad11f | fix(types): mypy on bulk_delete.py shared core |
| 7 | 779815d | chore(ci): pytest -v -> -q on backend test job |
| 8 | 2af1ce6 | fix(ci): Poetry cache on lint-and-type-check job |
| 9 | 29c939c | chore(ci): opt all 8 workflows into Node 24 runtime |

Plus this close-out commit with the audit report + journal +
4 new backlog entries + lessons-learned note.

## Phase 2 result

Triggered the existing ``Mutation Testing (Import
Orchestrator)`` workflow via ``workflow_dispatch``. Run
25735467415 completed in 1m12s but produced no triage data
(the ``mutmut-import-25735467415`` artifact's ``.meta`` files
have ``null`` exit codes across the board — mutmut never
executed any mutants). Stats-collection phase errored.
Reproduced locally to confirm the failure isn't CI-specific.

Updated ``docs/audits/mutmut-2026-05-02-import.md`` Status
section: BLOCKED on
``MUTMUT-STATS-COLLECTION-BUG-01``. Original instructions
preserved for the day the bug is fixed.

## CI wall-time measurements

Pre-Phase-1 baseline run wasn't measurable because CI was red.
Post-Phase-1 (commit 29c939c):

- CI: 5:09 (first run after cache push — cache key MISS,
  populates the cache)
- Coverage: 6:39

The cache will warm on the NEXT push. Expected steady-state
savings: 30-60s per CI run + per-matrix-job in plugin-tests.
Real measurement deferred to the next session's first push.

## Backlog filings (4 new)

P3 (1):

- **MUTMUT-STATS-COLLECTION-BUG-01**: fix the mutmut
  pytest-stats-collection failure. Documented above.

P5 (3):

- **TESTCLIENT-HARMONIZE-01**: 89 backend TestClient sites
  on 3 heterogeneous patterns (23 module-level lifespan-
  less, 34 fixture-with-lifespan, 3 inline). Trigger: a
  real "plugin route 404 in test" surprise.
- **WALKER-HYPOTHESIS-01**: introduce Hypothesis property-
  based tests for the Medium-import walker. Trigger: a
  third walker bug class slips through example-based
  tests.
- **TESTCONTAINERS-EVAL-01**: evaluate Postgres-via-
  Testcontainers. Trigger: production-DB migration to
  Postgres, OR documented SQLite-vs-Postgres divergence
  bug.

## Lessons-learned candidate (added)

"Operational gaps masquerade as wired infrastructure.
mutmut had been WIRED in the repo for 10 days but had
NEVER run successfully — the gap wasn't 'we need mutation
testing,' it was 'the existing mutation-testing
infrastructure has an unrun bug.' Audits should validate
that wired infrastructure actually works end-to-end, not
just that the YAML / config exists. The
``BadTestExecutionCommandsException`` would have surfaced
the day after wiring if the workflow had ever been
manually triggered."

## Questions and assumptions

- **Assumption**: deferring the mutmut stats-collection
  bug fix to a dedicated session is correct. Basis: the
  fix likely requires understanding mutmut's internal
  pytest plugin (run_stats() call path) and probably
  interacts with our autouse session-scope fixtures
  (``_verify_test_isolation``, ``setup_db``). That's a
  focused debugging session, not a tail of an audit
  session.
- **Assumption**: the Phase 1 CI hardening payoff (30-60s
  saved per push on cache hits) is worth shipping even
  before mutmut is unblocked. Basis: the cache wins are
  independent of mutmut; mutmut's path stays gated nightly.
- **Parked**: native-translation review for the 6
  auto-translated locales remains an open backlog item from
  earlier sessions, unaffected by this audit.

## Next sensible step

User decides. Open paths:
- Fix MUTMUT-STATS-COLLECTION-BUG-01 (P3, would unblock
  mutmut at long last)
- Pick from P2 (3 Medium-import V2 items, all
  trigger-gated, no user reports yet)
- Take a pause; the feature waves have been substantial
  and CI is now in a hardened state to support whatever
  comes next.
