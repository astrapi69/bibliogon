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
- `.filesize-baseline` tracks 18 existing god-files as grandfathered debt.

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
- CI workflows for PRs.

## 4. Security and Dependency Hygiene

AI sometimes suggests outdated, insecure, or nonexistent libraries.

**Rules:**

- Every new dependency must be manually verified for maintenance status,
  license compatibility, and known vulnerabilities before adding.
- No secrets, API keys, or hardcoded credentials in generated code.
  User-provided API keys are stored in Dexie, never committed.
- Prefer existing project dependencies over new ones.

**Enforcement:**

- **Open gap.** No `pip-audit` or `npm audit` in CI. Planned as next
  infrastructure step (warn-only Phase 1, same Defense-in-Depth approach
  as the Cohesion Watcher).
- #47 (weasyprint CVE) is tracked but deferred.
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
- `.filesize-baseline` tracks the 18 remaining god-files as visible debt.
  Each entry is a split-TODO.

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
| Security/deps | **Gap: no CI scan yet** | Manual dependency review |
| Refactoring | Cohesion watcher, `.filesize-baseline` | Refactoring intervals, scope decisions |
| Git hygiene | Pre-commit hooks, linting | Diff review, issue discipline |

## See Also

- `.claude/rules/` - agent-readable architectural constraints
- `docs/audits/clean-code-audit.md` - Principle 5
- `.filesize-baseline` - Principle 5, god-file tracking
- `.github/workflows/cohesion-check.yml` - Principle 5
- `scripts/check-file-sizes.sh` - Principle 2 and 5
