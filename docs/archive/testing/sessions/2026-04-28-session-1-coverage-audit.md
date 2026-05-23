# Test Session: 2026-04-28 — Session 1: coverage audit + onboarding

**Tester:** Claude (CC) under Aster's direction
**Bibliogon version:** v0.24.0 (commit `5611706`)
**Environment:** Linux 6.8.0-110-lowlatency, Node 24.15.0, Python 3.12, Poetry 2.x
**Date:** 2026-04-28
**Duration:** ~2h
**Session number:** 1/3

## Pre-flight

- [x] App starts cleanly (verified mid-session via `make dev`)
- [x] Backend health endpoint returns 200
- [x] DB state confirmed (current dev DB; no fixtures required for audit-only session)
- [x] Inotify limits OK on Linux (raised earlier today via `make fix-watchers` per #14)
- [x] Pre-commit hooks installed

## Scope

In scope this session:
- Audit existing test counts across backend / frontend / plugins / E2E.
- Build feature-by-feature coverage gap matrix.
- Author test-plan, tester-onboarding, test-result-template,
  coverage-matrix documents.

Explicitly out of scope:
- Running the actual smoke catalog (Session 2).
- Adding new E2E specs (Session 2).
- Closing any of the identified gaps (Sessions 2 + 3).

## Test runs

This is a meta-session — no application tests were executed beyond
the count-collection runs themselves. The "tests" of this session
are the audit checks.

### A-1: Backend test count baseline

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** `cd backend && poetry run pytest --collect-only -q | tail -3`
- **Actual outcome:** 1198 tests collected.
- **Evidence:** terminal output captured in coverage-matrix.md.

### A-2: Plugin test count baseline (per plugin)

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** Loop over `plugins/bibliogon-plugin-*/` running
  `pytest --collect-only -q`.
- **Actual outcome:** 432 tests across 10 plugins (audiobook 98,
  export 92, ms-tools 97, translation 35, kdp 33, help 30,
  git-sync 23, grammar 10, kinderbuch 8, getstarted 6).
- **Evidence:** terminal output captured.

### A-3: Frontend Vitest count baseline

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** `cd frontend && npx vitest --run`
- **Actual outcome:** 664 tests across 63 test files.
- **Evidence:** terminal output captured.

### A-4: E2E spec inventory

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** `ls e2e/smoke/*.spec.ts e2e/full/*.spec.ts`
- **Actual outcome:** 20 smoke specs, 0 full specs. Smoke spec
  list captured in coverage-matrix.md.
- **Evidence:** terminal output captured.

### A-5: Manual smoke catalog inventory

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** `grep -E "^\*\*Severity:" docs/smoke-tests-catalog.md | sort | uniq -c`
- **Actual outcome:** ~60 severity-tagged entries; rough breakdown
  6 Critical / 13 High / 22 Medium / 9 Low.
- **Evidence:** terminal output captured in coverage-matrix.md.

### A-6: Coverage gap identification

- **Severity:** N/A (audit)
- **Result:** PASS
- **Steps:** Cross-reference each shipped feature against backend
  test files, frontend test files, and `e2e/smoke/` specs. Mark
  rows in `coverage-matrix.md`.
- **Actual outcome:** 15 distinct gaps identified, ranked into
  Tier A (5 high-ROI for Session 2), Tier B (5 medium-ROI for
  Session 3), Tier C (defer indefinitely).
- **Evidence:** `docs/testing/coverage-matrix.md` "Top gaps by ROI".

## Findings summary

No application bugs found in this session — audit-only.

Documentation gaps surfaced and addressed in the same session:

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| F-DOC-1 | Medium | No `make seed-test-data` or `make reset-test-db` target despite the original test plan referencing them. | Documented honest workaround in onboarding doc; no Make target added (would need fixture system first). |
| F-DOC-2 | Low | `e2e/full/` directory empty; full regression suite not yet populated. | Noted in coverage-matrix.md; not a release blocker — smoke catalog covers regression intent. |
| F-DOC-3 | Low | Original draft referenced port 3000 for the frontend; actual port is 5173. | Corrected in onboarding doc. |
| F-DOC-4 | Medium | No top-level `docs/testing/` directory existed. | Created with four documents. |

## Outcome

| Metric | Value |
|--------|-------|
| Tests in scope | 6 audit checks |
| Tests run | 6 |
| Pass | 6 |
| Fail | 0 |
| Blocked | 0 |
| Skipped | 0 |

**Issues created:** none (no application findings).
**Backlog entries added:** none (doc gaps fixed in session).
**Coverage matrix updated:** yes — initial population at
`docs/testing/coverage-matrix.md`.

## Time tracking

| Phase | Budget | Actual |
|-------|--------|--------|
| Pre-flight + audit setup | 0:15 | 0:10 |
| Coverage audit (counts + matrix) | 1:30 | 1:00 |
| Document authoring (4 files) | 3:00 | 0:50 |
| Report writing | 0:30 | 0:10 |
| **Total** | **5:15** | **~2:10** |

Session well under budget — pure doc work plus pre-existing repo
familiarity made it fast. Remaining budget rolls into Session 2.

## Stop conditions hit

None.

## Recommendations for Session 2

Focus on **Tier A gaps** from coverage-matrix.md, ranked:

1. **Article translation E2E.** Highest-leverage missing spec —
   AR-02 value prop, paid provider integration, currently only
   covered by backend tests.
2. **Publications + drift detection E2E.** Drift is the AR-02
   differentiator named in every competitive analysis; no E2E
   pins it today.
3. **plugin-git-sync commit + diff E2E.** Highest-complexity flow
   without smoke coverage.

For the manual smoke portion of Session 2, work top-down from
`docs/smoke-tests-catalog.md` Critical → High, stopping at the
budget. Goal: every Critical re-verified at least once for the
v0.24.0 ship.

Avoid Tier C work entirely — paid TTS, mobile, visual regression
stay deferred per test-plan.md "Test types out of scope".

## Appendix: artefacts produced

```
docs/testing/
├── test-plan.md                                         (new)
├── tester-onboarding.md                                 (new)
├── test-result-template.md                              (new)
├── coverage-matrix.md                                   (new)
└── sessions/
    └── 2026-04-28-session-1-coverage-audit.md           (this file)
```
