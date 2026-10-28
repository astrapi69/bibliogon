# Quality checks and test strategy (summary)

Binding rules only. Full text with examples and the mutmut/Stryker setup:
`docs/development/rules/quality-checks.md`. This summary must not contradict
it (#1143).

## Quick check after every change
Run only the touched test files locally; CI runs the suites (ci-only-heavy-tests.md). Before committing: no `any`, no `fetch` outside the API client, no browser dialogs, no hardcoded UI strings, theme tokens only, no em-dash, conventional commit.

## Feature-Screenshots
A new or visually changed feature gets a capture block in `e2e/feature-screenshots/capture-features.spec.ts`, run via `make e2e-remote SUITE=feature-screenshots`, PNGs plus the `docs/screenshots/README.md` index.

## Test strategy
Pyramid: unit (pytest, Vitest) for logic, integration (`TestClient`, real DB) per endpoint with happy path and error case, Playwright for critical user flows with `data-testid` selectors, mutation testing (mutmut, Stryker) to check test quality. Bug fix: failing test first. Import/export: test round trips.

## Automation (still to build)
Historical plan; CI now runs the suites (`ci.yml`, `nightly.yml`, `coverage.yml`).

## Priority for the next improvements
See the full text; tracked in ROADMAP/backlog.

## Coverage Targets per Module Type
Services and business logic 95%, API endpoints 90%, hooks and utilities 95%, frontend logic components 85%, presentational components 65%, models and schemas 80%, plugin routes 90%. Meaningful assertions over line count; regression pins count most.

## TDD (Test-Driven Development)
Red - green - refactor, see `tdd.md`.
