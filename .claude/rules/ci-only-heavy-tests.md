# Heavy test runs happen on GitHub Actions, not locally

Aster's machine is where Aster works. An agent that starts a full test
suite, a Playwright run or a production build there pins the CPU for
minutes. Directive from Aster (2026-09-22, #898): **no local test runs that
drive the CPU up; everything heavy runs on GitHub Actions.**

## Never run locally

- Full suites: `make test`, `make test-backend`, `make test-plugins`,
  `make test-frontend`, `npx vitest run` without file arguments,
  `pytest tests/` (backend or a whole plugin), `make test-coverage*`.
- Any Playwright run: smoke, full, static-smoke, visual, manual-automation,
  feature screenshots. That includes `make test-e2e*`, `make
  test-static-smoke`, `make capture-screenshots`, `npx playwright test ...`
  in any form.
- Builds: `npm run build` (plain or with `VITE_STORAGE_MODE=dexie`),
  `make release-build`, `make release-test`, the launcher PyInstaller build,
  `poetry build`.
- Mutation testing (mutmut, Stryker), `make audit*` scans.
- Whole-project type checks and linters: `npx tsc --noEmit`, `make
  check-cohesion`, `pre-commit run --all-files`. CI runs all of them.

## Allowed locally (seconds, one core)

- A handful of targeted test files for the code being changed, for the
  red-green cycle: `npx vitest run src/path/file.test.ts` or
  `pytest tests/test_one.py`. If the selection grows past a few files or
  runs longer than about half a minute, stop and use CI.
- Linters and formatters on the touched files only (`ruff check <files>`,
  `ruff format --check <files>`, `npx eslint <files>`), the pre-commit hook
  on `git commit` (staged files), and the small check scripts
  (`check_seed_i18n_drift.py`, `generate_mkdocs_nav.py --check`,
  `check_directory_size.py`, the i18n seed generator).

## Where the heavy runs go instead

| Need | Command (current branch, pushed) | Workflow |
|---|---|---|
| Backend + frontend suites, tsc, build, pre-commit, ruff, mypy | open the PR, or `make ci-remote` before one | `ci.yml` |
| Specific Playwright specs against the real backend | `make e2e-remote SUITE=smoke SPECS="smoke/a.spec.ts smoke/b.spec.ts"` | `e2e-targeted.yml` |
| Static Dexie build (no backend) | `make e2e-remote SUITE=static-smoke SPECS="static-smoke/x.spec.ts"` | `e2e-targeted.yml` |
| Feature screenshots | `make e2e-remote SUITE=feature-screenshots GREP="<test title>"`, then `gh run download <id> -n feature-screenshots` and commit the PNGs | `e2e-targeted.yml` |
| Whole smoke suite | nightly, or `gh workflow run e2e-smoke.yml --ref <branch>` | `e2e-smoke.yml` |
| Plugin suites | nightly, or `gh workflow run nightly.yml --ref <branch>` | `nightly.yml` |

Watch runs in the background (`gh run watch <id>`, `gh pr checks <n>
--watch`), put the run URL in the PR description as the evidence, and treat
a red run exactly like a red local run: read the logs (`gh run view <id>
--log-failed`), download `e2e-test-results` for traces, fix, re-run.

`e2e-targeted.yml` and the `workflow_dispatch` trigger of `ci.yml` only
exist once they are on the default branch (`develop`); a workflow file
that only lives on a feature branch cannot be dispatched.

## How this relates to other rules

- The TDD red-green cycle (`tdd.md`) still applies; run the new test file
  locally, then let CI run the suite.
- `stale-dev-server.md` covers local Playwright runs Aster starts; agents do
  not start them at all.
- The pre-release Aster E2E gate (`release-workflow.md`) stays Aster's
  call; `e2e-smoke.yml` via `workflow_dispatch` on the release branch is the
  CI way to run it.
