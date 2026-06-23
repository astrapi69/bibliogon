# Vibe Coding Policy

> AI-assisted development accelerates delivery but risks technical debt and
> architectural decay when human oversight lapses. The AI operates as a
> high-speed junior developer without systemic understanding of the project.
> The human's role shifts from writing code to architecting and reviewing it.

This document codifies the rules that govern all AI agent work (CC, CCW) on
Bibliogon. Every principle listed here is either enforced by CI or enforced
by human review. Aspirational items are explicitly marked.

## 1. Prompt Precision and Context Steering

AI models have limited context windows and hallucinate on vague instructions.

**Rules:**

- Never issue commands like "optimize this file." Specify: which file, which
  function, which input/output behaviour, which pattern to follow.
- Always reference existing project patterns by name. Examples:
  `guardedFetch`, `IStorageService`, the Repository Pattern, the
  `feature-strategy` gate registry, `settingsSeamGuard`.
- When a prompt references architecture, point the agent at the relevant
  `.claude/rules/` file or `docs/` document rather than restating it.

**Enforcement:**

- Human review (Sparring Partner writes or reviews all CC/CCW prompts).
- `.claude/rules/` files provide agent-readable architectural context.

**Open gap:** No automated check forces agents to reference existing patterns
instead of inventing new ones. This remains a human review responsibility.

## 2. Architectural Discipline

AI solves local problems with global workarounds. Every generated code block
must be verified against the layer architecture.

**Rules:**

- No business logic in React components. Components render UI from props.
- No direct database queries in backend routers. Routers delegate to
  services via the Repository Pattern (abc.ABC repositories).
- No direct `fetch` calls. Use `guardedFetch` and the `IStorageService` seam.
- No cross-layer imports. The dependency direction is:
  Router -> Service -> Repository -> Models.
- Every feature gate uses `feature-strategy` (dreistufige Sichtbarkeit:
  active/disabled/hidden). No ad-hoc gating logic.

**Enforcement:**

- `.claude/rules/` files define architecture constraints for agents.
- `guardedFetch()` in `client.ts` rejects any `/api` call in Dexie mode.
- `settingsSeamGuard.test.ts` source-scan catches direct `api.settings.*`
  calls outside the audited allowlist.
- Zero-`/api` E2E-Gate (`page.route('**/api/**', route => route.abort())`).
- Cohesion Watcher (`scripts/check-file-sizes.sh`) blocks merges for new
  files >1000 lines (WARN >500).
- Read-modify-write protection: all RMW methods on the storage seam route
  through a single generic per-`(table, id)` `serializedUpdate` write-queue
  (`storage/dexie-storage.ts`), closing the settings-clobber data-loss path.
- `.filesize-baseline` tracks the remaining god-files as grandfathered debt
  (5 after the burn-down: `Editor.tsx`, `dexie-storage.ts`, and three plugin
  PDF files; down from 16).

**Open gap:** `settingsSeamGuard` covers only `api.settings.*`. No equivalent
guard exists for `api.books.*`, `api.chapters.*`, or other seam paths.
Currently caught by human review and the zero-`/api` E2E gate.

## 3. Verification Through Tests

Generated code is not correct by default. Every change must pass the full
test suite before merge.

**Rules:**

- Every PR must pass: `tsc --noEmit` (strict), Vitest (3087+ tests), and
  the Aster-E2E-Gate (Playwright smoke suite, 0 retries, 0 flaky).
- Behaviour-changing code requires accompanying tests. Code without test
  coverage is not merged.
- New tests must be red on pre-fix code. If the test passes without the
  fix, it does not test the bug.
- Coverage Illusion awareness: Playwright-visible is not User-visible.
  Assert non-zero height for CSS-collapse bugs. Passing unit tests do not
  guarantee working features.

**Enforcement:**

- Aster-E2E-Gate: CC cannot push release tags. Aster runs the smoke suite
  locally and confirms 0 failed, 0 flaky before any tag.
- Pre-commit hooks: formatting and linting.
- CI tiers (#289, #332) - three tiers, fast to thorough:
  - **PR pipeline** (`ci.yml`, target ~2-3 min via TIA): `tsc`, **selective**
    backend + frontend tests, `ruff` + `mypy`, pre-commit, `madge`, the
    frontend build. Test Impact Analysis (#332) runs only the tests affected
    by the diff - `vitest run --changed origin/<base>` (frontend) and
    `pytest --testmon` (backend) - each with a **full-suite fallback**: an
    unscopable diff (no base ref) or any selector error re-runs the whole
    suite, so a failure can never pass falsely. A backend-only PR skips the
    frontend tests cleanly (`--passWithNoTests`) and vice-versa.
  - **Nightly** (`nightly.yml`, 03:00 UTC + `workflow_dispatch`) - the
    **full-suite safety net**: the 10-plugin test matrix, backend / plugin /
    frontend coverage, the complexity + cohesion file-size watchers, and an
    unconditional full re-run of every test (no TIA selection).
  - **Release gate**: the full suite, via the on-demand Nightly (or
    `make test-nightly`) plus the Aster-E2E smoke gate, before any tag.
  Locally: `make test-changed` (selective, mirrors the PR path), `make test`
  (full, no coverage), `make test-nightly` (full + coverage + plugins).

## 4. Security and Dependency Hygiene

AI sometimes suggests outdated, insecure, or nonexistent libraries.

**Rules:**

- Every new dependency must be manually verified for maintenance status,
  license compatibility, and known vulnerabilities before adding.
- No secrets, API keys, or hardcoded credentials in generated code.
  User-provided API keys are stored in Dexie, never committed.
- Prefer existing project dependencies over new ones.
- **Dependency hierarchy (search before you build).** Walk top to bottom; drop
  a stage only when it genuinely cannot do the job:
  1. **Language** — native platform APIs (`Intl`, `crypto.subtle`, `URL`,
     `fetch`, `structuredClone`, `Array`/`Set`/`Map`; Python `pathlib`,
     `dataclasses`, `json`, `hashlib`, `functools`).
  2. **Framework** — what is already wired in (React hooks/Context, Vite
     `define`/`import.meta.env`, FastAPI `Depends`/`BackgroundTasks`).
  3. **Library** — npm/PyPI, only when 1+2 fall short; prefer a library
     already in the project. A *new* dep must clear **>1000 weekly downloads**,
     **last update <6 months**, **bundle <100 kB** for anything writable in
     <50 LOC, and must not change behaviour we deliberately want.
  4. **Build it yourself** — only when 1–3 don't fit, under **Library-Grade**
     (no app imports, own types, TSDoc, single-use viable), cohesion (<500
     lines, one concern), complexity (cc <20), its own test file, and a PR that
     documents WHY in-house.
  The paired **Library-Grade** rule and the full hierarchy live in
  `docs/MODULE-ARCHITECTURE.md` and `.claude/rules/library-first.md`. First
  audit: `docs/audits/library-first-audit-2026-06-17.md`.

**Enforcement:**

- **Weekly blocking watcher** (`security-scan.yml`, Sunday 07:00 UTC +
  `workflow_dispatch`, #278): `pip-audit --skip-editable`, `bandit` (High
  blocks, Low/Medium warn), and `npm audit --audit-level=high` - blocking
  on Critical/High. This is the single security instance (#289 removed the
  duplicate per-PR scan from `ci.yml`, since it almost never caught a PR
  failure and slowed every PR). It surfaces new CVEs published against
  already-merged dependencies, which a push/PR-only gate would never re-run.
  Matching local target: `make check-security`.
- Accepted/deferred advisories live in `.security-ignore.yml` (the SSoT,
  parsed by `scripts/security_ignore_args.py`); each entry carries a reason,
  a tracking issue, and a review date. Currently: #47 (weasyprint
  CVE-2025-68616), a render-risky major bump, deferred but kept visible.
- Human review catches dependency additions in PR diffs.

## 5. Regular Refactoring

Fast iteration leads to code duplication, bloated functions, and inconsistent
naming. Refactoring is not optional, it is scheduled.

**Rules:**

- Plan fixed intervals for cleanup. Do not let AI-generated code calcify
  in the main branch without review.
- Touch old code when you change it anyway, not prophylactically. No sweeps
  across historical code without clear scope.
- God-files with mixed concerns are split, not whitelisted.
- Whitelisting requires justification: only files with a single concern
  (data models, schemas, static data) qualify.

**Enforcement:**

- Clean-Code Audit (`docs/audits/clean-code-audit.md`).
- Cohesion Watcher (#113) prevents new god-files from forming.
- `.filesize-baseline` tracks the remaining god-files as visible debt — **5**
  after the 2026-06 burn-down (PRs #166–#229), down from 16. Each entry is a
  split-TODO: `frontend/src/components/Editor.tsx`,
  `frontend/src/storage/dexie-storage.ts` (re-grandfathered via #210), and the
  three plugin PDF files (`picture_book_pdf.py`, `routes.py`,
  `comic_book_pdf.py`). The backend `app/` ERROR-blocker `main.py` (1046) and
  `client.ts` (5212) were both resolved.
- Complexity Watcher (#139, threshold lowered to 15 in #279) surfaces
  over-complex functions: radon cyclomatic complexity + ruff `C901`
  (Python) and ESLint `complexity` (TypeScript). Runs warn-only, **nightly**
  in `.github/workflows/nightly.yml` (#289 moved it off the PR path; also
  `make check-complexity`) with the same defense-in-depth logic as the
  cohesion watcher - visibility first, harden later. `ruff` `C901` is
  deliberately not in the
  blocking `select` yet (two functions already exceed the threshold);
  promoting it is a Phase-2 follow-up after those are split.

## 6. Git Hygiene and Code Review

Do not blindly commit AI-generated blocks.

**Rules:**

- Review `git diff` line by line before committing.
- Every bug and issue must have a GitHub Issue BEFORE the fix begins
  (GITHUB-ISSUE-PFLICHT). Search existing issues first.
- Every commit message references its issue (`Closes #XX`).
- No inline comments in code. Use docstrings (Google Style for Python,
  TSDoc for TypeScript). Exception: `TODO`/`FIXME` with issue reference.
- One concern per PR. Small PRs, feature branches from `develop`.
- Explicit `git add [paths]` only. `git add -A`, `git add .`, and
  `git add --all` are forbidden.
- `git status` before every commit (prevents cross-session staging
  absorption).
- No `Co-Authored-By` trailers.

**Enforcement:**

- Pre-commit hooks (formatting, linting).
- `.claude/rules/` contains the GITHUB-ISSUE-PFLICHT rule.
- Docstring rule (TSDoc for TypeScript, Google Style for Python).
- Human review (Sparring Partner reviews all agent output).

## 7. Feature Screenshots

Every UI feature is documented visually. Screenshots are generated
automatically via Playwright and tracked in `docs/screenshots/`. On a UI
change, update the screenshot spec and regenerate the PNGs.

**Rules:**

- A new or visually-changed UI feature ships a screenshot under
  `docs/screenshots/{feature}/`: add a test block to
  `e2e/feature-screenshots/capture-features.spec.ts`, run
  `make capture-screenshots`, commit the PNGs, and update the
  `docs/screenshots/README.md` index.
- Capture settings: 1280x720, default theme, locale de-DE, PNG, with
  realistic data (no "Test 1" titles).
- Pure backend / test / docs PRs are exempt.

**Enforcement:**

- Human review on UI PRs. On-demand generation, no CI gate (the
  `feature-screenshots` Playwright project is out of the smoke gate and
  CI). See `.claude/rules/quality-checks.md` "Feature-Screenshots" and
  `docs/MODULE-ARCHITECTURE.md` "Feature-screenshot catalog".

## Priority Hierarchy

When multiple tasks compete, this ordering applies:

1. **Merge open PRs** - no new code on a dirty base.
2. **P0/P1 Bugs** - blockers first.
3. **Infrastructure** - security, CI, architecture guards.
4. **UI Fixes** - user-visible improvements.
5. **Cleanup/Refactoring** - tech debt reduction.
6. **Features** - new functionality.
7. **Release** - tag when everything above is done.

Cross-cutting principle: **Foundation before features.** Audit before guard.
Measure before enforce. Design document before implementation. No feature on
shaky ground.

## Agent Roles

| Agent | Scope | Lane |
|-------|-------|------|
| CC (lCC) | Backend, infrastructure, CI, releases | Python, bash, workflows |
| CCW | Frontend components, hooks, storage | TypeScript, React, Dexie |
| Sparring Partner | Architecture, review, coordination | Prompts, decisions, strategy |

Agents do not cross lanes without explicit instruction. The Sparring Partner
coordinates handoffs and resolves conflicts with reality.

## Enforcement Summary

| Principle | Automated | Human |
|-----------|-----------|-------|
| Prompt precision | `.claude/rules/` | Sparring Partner writes/reviews prompts |
| Layer architecture | `guardedFetch`, `settingsSeamGuard`, cohesion watcher | Code review for boundary violations |
| Test coverage | Vitest, tsc strict, pre-commit hooks | Aster-E2E-Gate (smoke suite), Coverage Illusion review |
| Security/deps | pip-audit + bandit + npm audit (blocking in `ci.yml`), weekly `security-scan.yml` watcher | Manual dependency review |
| Refactoring | Cohesion watcher, complexity watcher, `.filesize-baseline` | Refactoring intervals, scope decisions |
| Git hygiene | Pre-commit hooks, linting | Diff review, issue discipline |

## See Also

- `docs/MODULE-ARCHITECTURE.md` - folder structure + reusability principles (DI, barrel exports, no side effects, props-driven `lib/`), the Session-9 patterns (storage write-queue + offline assets, lazyWithReload + SW update + event recording, backend service-extraction/facades, the `lib/` catalogue, feature-strategy buckets, CI tiers), and goldstandards (git_sync.py, IStorageService, feature-strategy)
- `docs/EXPORT-IMPORT-FORMATS.md` - every export/import format, where each is triggered, offline/desktop/PWA support, and the JSON-vs-`.bgb` backup distinction
- `docs/SETTINGS-MENU-ARCHITECTURE.md` - the Settings surface map (sections, plugin settings, feature-gated controls)
- `docs/manual-tests/MANUAL-TESTPLAN.md` - the manual / E2E acceptance test plan (the Aster-E2E-Gate's checklist)
- `.claude/rules/` - agent-readable architectural constraints
- `docs/audits/clean-code-audit.md` - Principle 5
- `docs/audits/backend-god-files-audit-2026-06-14.md` - Principle 5, backend split status
- `docs/audits/frontend-god-files-audit-2026-06-14.md` - Principle 5, frontend split status
- `.filesize-baseline` - Principle 5, god-file tracking
- `.github/workflows/ci.yml` - Principle 3 (fast PR pipeline + Test Impact Analysis: vitest --changed + pytest --testmon)
- `.github/workflows/nightly.yml` - Principle 3 + 5 (full-suite safety net: plugin matrix, coverage, complexity + cohesion file-size watchers)
- `.github/workflows/security-scan.yml` - Principle 4, weekly CVE watcher (`.security-ignore.yml` SSoT)
- `.claude/rules/library-first.md` - Principle 4, Library-First + Library-Grade rule
- `docs/audits/library-first-audit-2026-06-17.md` - Principle 4, first Library-First audit
- `scripts/check-file-sizes.sh` - Principle 2 and 5 (cohesion file-size gate, runs nightly)
