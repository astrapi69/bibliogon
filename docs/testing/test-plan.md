# Bibliogon Test Plan

Strategy document for the v0.24.0 systematic test phase. Read once
to understand the approach; consult [test-result-template.md](test-result-template.md)
when running a session.

Last updated: 2026-04-28.

---

## Purpose

Bibliogon ships features faster than a solo developer can manually
re-verify every release. This plan defines a repeatable approach
that:

- Catches regressions in the highest-value flows on every release.
- Documents a path that a new tester (or returning developer) can
  pick up cold.
- Routes findings into the right system (GitHub issue vs backlog)
  without losing them.

Companion docs:

- [tester-onboarding.md](tester-onboarding.md) — zero-to-running in 30 minutes.
- [test-result-template.md](test-result-template.md) — per-session report structure.
- [coverage-matrix.md](coverage-matrix.md) — current coverage state per feature.
- [../smoke-tests-catalog.md](../smoke-tests-catalog.md) — per-feature manual smoke catalog with severity.

---

## Test types in scope

1. **Manual smoke tests.** Critical and High severity user paths
   from `docs/smoke-tests-catalog.md`. Run before every release plus
   ad hoc during a test phase. Subjective visuals + paid third-party
   APIs + hardware drag-drop live here permanently — Playwright
   cannot reach them.

2. **Automated E2E (Playwright).** Repeatable user workflows. Specs
   live under `e2e/smoke/` (fast, per-feature) and `e2e/full/`
   (full regression — currently empty; populated as features
   stabilise). Run via `make smoke` or `npx playwright test
   --project=smoke`.

3. **Backend integration tests (pytest + TestClient).** API
   contract + happy-path + error cases per endpoint. Plugin tests
   live under each plugin's `tests/` directory. Run via `make test`.

4. **Frontend unit tests (Vitest).** API client, hooks, complex
   form components, utility functions. Run via `make test-frontend`.

5. **Mutation testing (mutmut).** Test quality verification on
   selected modules: `app/services/`, `plugins/bibliogon-plugin-export/`,
   `plugins/bibliogon-plugin-ms-tools/`. Run nightly or pre-release
   via `make mutmut-backend` / `make mutmut-export` / `make mutmut-ms-tools`.

## Test types out of scope

These are deliberately deferred. Revisit when scaling concerns
surface.

- Visual regression testing (Percy / BackstopJS): no current need;
  smoke specs assert layout via testid not pixel diff.
- Performance / load testing: SQLite single-writer is the
  bottleneck; load is not a concern at current usage.
- Penetration testing: local-first model lowers the surface; revisit
  if a multi-user mode ships.
- Cross-browser matrix beyond Chromium: Playwright defaults to
  Chromium; Firefox / WebKit run only when shipping a release.
- Mobile testing: no mobile feature parity yet; M-3 in the
  optimization report defines the responsive-triage scope.

---

## Test priorities

Severity classification mirrors `docs/smoke-tests-catalog.md`:

| Severity | Meaning |
|----------|---------|
| **Critical** | Blocks core workflow (editor disabled, save broken, data loss vector) |
| **High** | Blocks specific feature (import broken, primary action hidden, export fails) |
| **Medium** | Wrong but workable (status confusing, label missing, tooltip absent) |
| **Low** | Polish (visual inconsistency, hint wording, edge-case message) |

Test-execution order in every session:

1. **Pre-flight.** Setup verification: backend reachable at
   `localhost:8000/api/health`, frontend at `localhost:5173`, no
   console errors on first dashboard load, expected DB state.
2. **Critical-path.** Highest severity tests first. If any fail,
   stop and triage before continuing.
3. **High-severity.** Feature-blocking issues.
4. **Medium.** Quality issues.
5. **Low.** Polish, time permitting.

---

## Findings handling

| Severity | Where | When |
|----------|-------|------|
| **Critical** | GitHub issue | Within the session, before continuing |
| **High** | GitHub issue | Within 24 hours |
| **Medium** | `docs/backlog.md` entry | End of session |
| **Low** | `docs/backlog.md` entry | End of session |

Every finding includes:

- Reproduction steps (matching the original test ID where possible).
- Actual vs expected outcome.
- Evidence: screenshot, log snippet, or commit-hash context.
- Impacted version + commit hash.

The session report (per the template) lists every finding with its
disposition. Findings without a tracking entry violate the "no
finding lost" rule.

---

## Session structure

Each test session follows a fixed shape so reports stay comparable.

1. **Pre-flight.** Environment + tooling check.
2. **Test runs.** Grouped by feature area (articles, books,
   import, etc.). Use `docs/smoke-tests-catalog.md` IDs as the
   stable reference.
3. **Findings log.** Real-time as tests fail.
4. **Summary.** Pass/fail counts, severity breakdown, time spent.
5. **Recommendations.** What the next session should focus on.

A session is **clean** when:

- The pre-flight passes.
- Every test in scope was either run or explicitly skipped with a
  reason.
- Every finding has a tracking entry (issue or backlog).
- The summary is committed to `docs/testing/sessions/`.

---

## Time budgets

Solo developer constraint. Each session has a hard stop at 6 hours
to a clean atomic boundary.

| Session type | Scope | Budget |
|--------------|-------|--------|
| **Pre-release smoke** | Critical + High from catalog | 2 hours |
| **Test phase session 1** | Audit + plan + onboarding | 6 hours |
| **Test phase session 2** | Manual smoke + E2E expansion | 6 hours |
| **Test phase session 3** | Coverage gaps + final report | 6 hours |
| **Ad-hoc regression** | One affected feature area | 1 hour |

If a session blows the budget mid-stream:

- **Stop at clean boundary** (end of feature area, not mid-test).
- Document where it stopped + what is still in scope.
- Next session resumes from that point.

---

## Stop conditions

Halt the current session and triage when any of the following fire:

- **Critical finding mid-session.** Fix or open the issue first;
  the finding may invalidate downstream tests.
- **Pre-flight fails.** Fix the environment before testing.
  Findings against a broken environment are noise.
- **Findings exceed 30 across all severities.** Batch-fix
  Critical / High before continuing. Do not paper over with more
  smoke runs.
- **Test infrastructure broken.** If Playwright won't run or a
  test DB won't reset, fix infrastructure first; manual smoke can
  proceed in parallel.

---

## Outputs

Every session produces:

- `docs/testing/sessions/YYYY-MM-DD-session-N-{topic}.md` — the
  filled-in [test-result-template](test-result-template.md).
- Updates to `docs/testing/coverage-matrix.md` if the session
  closed gaps.
- GitHub issues for Critical / High findings.
- `docs/backlog.md` entries for Medium / Low findings.
- A pointer in the next session's pre-flight to the previous
  session's "Recommendations" section.

The full test phase produces, additionally:

- `docs/testing/sessions/YYYY-MM-DD-final-report.md` summarising
  coverage delta + outstanding work + recommendations.

---

## Maintenance

This plan is a living document. Update it when:

- A new test type ships (e.g., visual regression).
- A test type is retired.
- A severity threshold changes.
- The session budget proves wrong in practice.

Don't update for individual feature additions — those belong in
`coverage-matrix.md` and `smoke-tests-catalog.md`.
