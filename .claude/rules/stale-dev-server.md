# Stale Dev Server Check

Applies to Playwright runs Aster starts locally. Agents do not run
Playwright locally at all; they use `make e2e-remote`
(`ci-only-heavy-tests.md`).

Before every `npx playwright test` run:

1. Check for stale processes: `ss -ltnp | grep -E ':5173|:8000'`
2. Kill any found (`kill <pid>`) before starting the test
3. Between consecutive runs: repeat the check

Why: Playwright's `reuseExistingServer: true` reuses a running
dev server. A stale `npm run dev` from an earlier session serves
an outdated bundle, masking frontend fixes. This cost debugging
time in PR #121.
