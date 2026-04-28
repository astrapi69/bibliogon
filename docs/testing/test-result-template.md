# Test Session Result Template

Copy this file to `docs/testing/sessions/YYYY-MM-DD-session-N-{topic}.md`
and fill in. Replace `{...}` placeholders. Delete sections that
don't apply rather than leaving them blank.

---

# Test Session: {YYYY-MM-DD} — {Session topic}

**Tester:** {name}
**Bibliogon version:** v{X.Y.Z} (commit `{hash}`)
**Environment:** {OS} / {browser version} / Node {version} / Python {version}
**Date:** {YYYY-MM-DD}
**Duration:** {HH:MM}-{HH:MM} ({hours} h)
**Session number:** {N}/3 (or "ad hoc")

## Pre-flight

- [ ] App starts cleanly (`make dev` exit code 0; both ports listening)
- [ ] No console errors on initial dashboard load
- [ ] Backend health endpoint returns 200 (`curl http://localhost:8000/api/health`)
- [ ] DB state confirmed (fresh DB / specific fixtures / continuation from session N-1)
- [ ] Inotify limits OK on Linux (`make dev` shows no warning)
- [ ] Pre-commit hooks installed (if running tests against a working tree)

If any pre-flight fails, fix before continuing. Document the fix in the
findings table — pre-flight failures count.

## Scope

In scope this session:
- {feature area 1}
- {feature area 2}

Explicitly out of scope:
- {what was deferred + why}

## Test runs

For each test ID from `docs/smoke-tests-catalog.md` (or new test
defined this session):

### {ID}: {Name}

- **Severity:** {Critical/High/Medium/Low}
- **Result:** {PASS / FAIL / BLOCKED / SKIPPED}
- **Steps performed:** {Reference catalog ID, or inline steps if new}
- **Actual outcome:** {one-line summary}
- **Evidence:** {screenshot path, log snippet, stack trace, commit ref}
- **Notes:** {context, environment quirks, follow-up}

(Repeat per test. Group by feature area for readability.)

## Findings summary

| ID | Severity | Test | Status | Action | Tracking |
|----|----------|------|--------|--------|----------|
| F-1 | Critical | {test ID} | FAIL | Fixed in `{commit}` / Issue opened | {GH#... or backlog#} |
| F-2 | High | {test ID} | FAIL | Issue opened | GH#... |
| F-3 | Medium | {test ID} | FAIL | Backlog entry | docs/backlog.md#... |

If no findings: write "No findings."

## Outcome

| Metric | Value |
|--------|-------|
| Tests in scope | X |
| Tests run | Y |
| Pass | A |
| Fail | B |
| Blocked | C |
| Skipped | D |

**Issues created:** {GH#1, GH#2, ...} or "none"
**Backlog entries added:** {count} or "none"
**Coverage matrix updated:** {yes/no, link to commit}

## Time tracking

| Phase | Budget | Actual |
|-------|--------|--------|
| Pre-flight | 0:15 | {actual} |
| Test runs | 4:00 | {actual} |
| Findings logging | 1:00 | {actual} |
| Report writing | 0:45 | {actual} |
| **Total** | **6:00** | {actual} |

If the session blew the budget, note where it stopped + what is
still in scope for the next session.

## Stop conditions hit

Did any of the test-plan stop conditions trigger?

- [ ] Critical finding mid-session (handled how?)
- [ ] Pre-flight fail (which check?)
- [ ] Findings exceeded 30 (batch-fix outcome?)
- [ ] Test infrastructure broken (workaround?)

If yes, link to the triage commit / issue.

## Recommendations for next session

What should the next session focus on, given what this session
revealed?

- {item 1, with rationale}
- {item 2, with rationale}

If the test phase is complete, move outstanding items to
`docs/backlog.md` and link them here.

## Appendix: raw evidence

(Optional. Long log snippets, full stack traces, screenshot
inventory. Keep the body of the report scannable; long detail goes
here.)
