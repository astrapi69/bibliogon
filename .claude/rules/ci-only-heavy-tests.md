# Heavy test runs happen on GitHub Actions, not locally

## Why this rule exists

Aster's machine is where Aster works. An agent that starts a full test suite, a
Playwright run or a production build there pins the CPU for minutes, and for
those minutes the machine is unusable for the person who owns it. Directive
from Aster (2026-09-22, #898): **no local test runs that drive the CPU up;
everything heavy runs on GitHub Actions.**

The reason is **load on Aster's workstation**, not distrust of local results.
Two further reasons apply regardless of whose machine it is, and they are named
per entry below so nobody has to reconstruct them:

- **Evidence.** A claim in a PR body, a commit message or a report needs a run
  with a URL. A local green run can inform a decision; it cannot be linked, so
  it cannot stand as the evidence (`coding-standards.md` "A red-pin claim needs
  the red run linked").
- **Environment fidelity.** Local and CI environments drift — a stale venv, a
  per-plugin lock that was never regenerated, a browser the project does not
  pin (`lessons-learned.md` "CI vs local environment drift", "Two installation
  paths diverge", "`poetry install` plus a prefix cache key is a growing
  environment"). A local pass on a drifted environment is not a pass.

## Which machine am I on?

The three reasons above do not all apply everywhere, so read the entry's reason,
not just its heading.

**On Aster's workstation** (an interactive session on the local machine): all
three apply. Run nothing from the "never" list.

**In a cloud container** (a `claude.ai/code` session or any other ephemeral
container that does not share a CPU with Aster): the **load** reason does not
apply. A command listed below *only* for load is allowed there, and running it
before pushing is better than pushing and waiting. What still holds in a cloud
container:

- **Evidence stays CI.** Never write "green", "red before the fix" or "the gate
  passes" on the strength of a container run. Get the CI run and link it. A
  container run is a working step, not a result.
- **Playwright stays CI.** Not for load: the suite needs a dev server plus a
  browser install, its failures are only readable from the trace artefact, and
  `e2e-targeted.yml` is how a spec selection gets both. A container run
  produces neither a trace a reviewer can open nor a URL.
- **Environment fidelity still bites.** A container's venv or `node_modules`
  can drift exactly like a workstation's. `make verify-venv-lock` answers that
  in a second; a surprising local result is a reason to check the environment
  before believing it.

When unsure which machine this is: assume Aster's workstation.

## Never run locally

Each entry names the reason that puts it here, so the cloud-container ruling
above can be applied to it.

- **Full suites** — `make test`, `make test-backend`, `make test-plugins`,
  `make test-frontend`, `npx vitest run` without file arguments,
  `pytest tests/` (backend or a whole plugin), `make test-coverage*`.
  *Reason: load (minutes, many cores), and the suite's result is evidence.*
- **Any Playwright run** — smoke, full, static-smoke, visual,
  manual-automation, feature screenshots. That includes `make test-e2e*`,
  `make test-static-smoke`, `make capture-screenshots`, `npx playwright test
  ...` in any form.
  *Reason: load, plus evidence, plus the trace artefact and the dev-server +
  browser install a reviewer needs — CI even in a cloud container.*
- **Builds** — the prod compose images (`make prod`,
  `make test-prod-container`, `docker compose -f docker-compose.prod.yml
  build`), `npm run build` (plain or with `VITE_STORAGE_MODE=dexie`),
  `make release-build`, `make release-test`, the launcher PyInstaller build,
  `poetry build`.
  *Reason: load (image builds and PyInstaller are minutes), and release
  artefacts must come from the release workflow, not a laptop.*
  Exception, cloud container only: `npm run build` when the finding is
  **build-only** — a browser
  bundle can fail where every test passes, so the build is sometimes the only
  thing that observes the bug (`lessons-learned.md` "A Node builtin in a
  browser bundle…", "always build too"). Run it to find the fault; still link
  CI for the claim.
- **Mutation testing** (mutmut, Stryker), **`make audit*`** scans.
  *Reason: load — mutation runs are tens of minutes by design.*
- **Whole-project type checks and linters** — `npx tsc --noEmit`,
  `make check-cohesion`, `pre-commit run --all-files`.
  *Reason: load only. These are seconds on one core, so in a **cloud
  container** they are allowed and useful — a type error found before the push
  saves a CI cycle. On Aster's machine, leave them to CI, which runs all of
  them anyway.*

## Allowed locally (seconds, one core)

Allowed on either machine:

- A handful of targeted test files for the code being changed, for the
  red-green cycle: `npx vitest run src/path/file.test.ts` or
  `pytest tests/test_one.py`. On Aster's machine, if the selection grows past a
  few files or runs longer than about half a minute, stop and use CI. In a
  cloud container the selection may be wider, bounded by the evidence rule: a
  wide local pass still is not the green claim.
- Linters and formatters on the touched files only (`ruff check <files>`,
  `ruff format --check <files>`, `npx eslint <files>`), the pre-commit hook on
  `git commit` (staged files), and the small check scripts
  (`check_seed_i18n_drift.py`, `generate_mkdocs_nav.py --check`,
  `check_directory_size.py`, the i18n seed generator).
- `make verify-docs-discipline` — a nav check plus a `mkdocs build --strict`.
  Measured 2026-10-10 on a cloud container: 21s wall, 23s user, so roughly one
  core. Also a PR job (#1097), which is the linkable version.

## Where the heavy runs go instead

| Need | Command (current branch, pushed) | Workflow |
|---|---|---|
| Backend + frontend suites, tsc, build, pre-commit, ruff, mypy | open the PR, or `make ci-remote` before one | `ci.yml` |
| Specific Playwright specs against the real backend | `make e2e-remote SUITE=smoke SPECS="smoke/a.spec.ts smoke/b.spec.ts"` | `e2e-targeted.yml` |
| Static Dexie build (no backend) | `make e2e-remote SUITE=static-smoke SPECS="static-smoke/x.spec.ts"` | `e2e-targeted.yml` |
| Feature screenshots | `make e2e-remote SUITE=feature-screenshots GREP="<test title>"`, then merge the `chore/feature-screenshots-<run-id>` branch the run pushes (#1006) — an artifact download is served from blob storage an agent session cannot reach | `e2e-targeted.yml` |
| Whole smoke suite | nightly, or `gh workflow run e2e-smoke.yml --ref <branch>` | `e2e-smoke.yml` |
| Plugin suites | nightly, or `gh workflow run nightly.yml --ref <branch>` | `nightly.yml` |
| The production compose stack in a browser | `make prod-container-remote` | `prod-container-smoke.yml` |

Watch runs in the background (`gh run watch <id>`, `gh pr checks <n>
--watch`), put the run URL in the PR description as the evidence, and treat
a red run exactly like a red local run: read the logs (`gh run view <id>
--log-failed`), download `e2e-test-results` for traces, fix, re-run.

`e2e-targeted.yml` and the `workflow_dispatch` trigger of `ci.yml` only
exist once they are on the default branch (`develop`); a workflow file
that only lives on a feature branch cannot be dispatched.

## How this relates to other rules

- The TDD red-green cycle (`tdd.md`) still applies; run the new test file
  locally, then let CI run the suite. The red run you *cite* comes from CI
  (`coding-standards.md` "A red-pin claim needs the red run linked").
- `stale-dev-server.md` covers local Playwright runs Aster starts; agents do
  not start them at all, on either machine.
- The pre-release Aster E2E gate (`release-workflow.md`) stays Aster's
  call; `e2e-smoke.yml` via `workflow_dispatch` on the release branch is the
  CI way to run it.
