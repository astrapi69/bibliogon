# Bibliogon — systematic audit prompt

Drop-in for any future audit pass. Copy-paste verbatim into a fresh
Claude Code session at the repo root.

---

Analyze the Bibliogon codebase at the working directory. Perform a systematic audit
against the project's documented standards. Bibliogon is a Python 3.11+ / FastAPI
/ SQLAlchemy 2.0 / Pydantic v2 backend; React 18 / TypeScript strict / TipTap /
Vite frontend; PluginForge-based plugin architecture; manuscripta export pipeline;
local-first with three-layer secrets config.

## Authoritative sources

Before flagging anything, consult:

- `CLAUDE.md` (project overview, plugin table, conventions)
- `.claude/rules/architecture.md` (4-layer architecture, plugin shape, UI strategy)
- `.claude/rules/coding-standards.md` (naming, function design, tests, dependencies)
- `.claude/rules/code-hygiene.md` (error handling architecture, API conventions)
- `.claude/rules/lessons-learned.md` (known pitfalls — TipTap, import, export)
- `.claude/rules/quality-checks.md` (test pyramid, coverage targets, mutation testing)
- `docs/ROADMAP.md` (current phase, open items, BLOCKED markers)
- `docs/backlog.md` (top priorities, "Blocked or waiting" table, recently closed)
- `docs/audits/current-coverage.md` (canonical test counts — do NOT recompute
  unless the audit is producing fresh numbers)

If a flagged finding contradicts a documented convention, cite the rule file.
If the convention itself is stale, flag it as Outdated under section 4.

## Audit scope

### 1. Test Validity

- Cross-reference unit, integration, and E2E tests with the current implementation.
  Backend: `backend/tests/` + `plugins/*/tests/` (pytest). Frontend:
  `frontend/src/**/*.test.*` (Vitest, happy-dom). E2E: `e2e/smoke/` + `e2e/full/`
  (Playwright, data-testid only).
- Identify outdated, redundant, or unreachable tests. Distinguish
  `pytest.mark.skipif` (intentional environment gates — e.g. PANDOC_AVAILABLE,
  `_is_memory`) from `test.skip` (real bugs).
- Verify coverage of critical execution paths against the targets in
  `quality-checks.md` ("Coverage targets per module type"): services HIGH (>= 80%),
  routers MEDIUM-HIGH (>= 70%), `api/client.ts` HIGH (>= 90%), data-critical E2E
  flows MUST HAVE.
- Numeric claims: per `ai-workflow.md` "Numeric claims verification", every test
  count or coverage % must be verified by running the authoritative command in the
  same session, NOT recalled from `current-coverage.md` if the audit is producing
  fresh numbers.

### 2. Code Quality and Technical Debt

- Detect deprecated patterns, orphaned imports, unused variables, dead functions.
- Verify error-handling architecture per `code-hygiene.md`: services raise typed
  `BibliogonError` subclasses (`NotFoundError` / `ValidationError` / `ConflictError`
  / `PayloadTooLargeError` / `ExternalServiceError`), NEVER `HTTPException`.
  Routers catch nothing; the global handler in `main.py` maps. Frontend catches
  throw `ApiError`, surface `.detail` to `notify.error`.
- Verify architectural compliance:
  - No `fetch()` outside `frontend/src/api/`. All API calls go through
    `api/client.ts` (or its `import.ts` neighbour for multipart cases).
  - No `console.log` user-feedback. Toasts via `react-toastify`.
  - No browser dialogs (`alert`, `confirm`, `prompt`). Use `AppDialog`.
  - No raw HTML render of user content. `react-markdown` + remark/rehype only.
  - No hardcoded user-facing strings. All UI text via i18n YAML
    (8 languages: DE, EN, ES, FR, EL, PT, TR, JA).
  - No CSS hardcoded colors. Use `var(--*)` tokens; CSS Modules per file
    (post-T-01 sweep, see CHANGELOG v0.25.0).
  - No `any` in TypeScript without an inline justification comment.
  - No em-dash (literal or U+2014). Hyphens or commas only.
- Plugin compliance per `architecture.md`: `BasePlugin` subclass, `depends_on` as
  class attribute, hook specs in `backend/app/hookspecs.py`,
  `license_tier = "core"` (licensing dormant). Plugin settings either UI-visible
  or marked `# INTERNAL`; no dead YAML fields.
- TipTap storage: TipTap JSON is the canonical chapter format; HTML/Markdown only
  via export plugin. Custom TipTap extensions are forbidden when an official one
  exists.
- Function design: max 40 lines, single responsibility, abstraction-level
  consistent. Route handlers thin (validate, call service, return). Anti-pattern:
  `# Step 1` / `# Step 2` comments inside one function.

### 3. Infrastructure and Dependencies

- Poetry: `backend/pyproject.toml` + each `plugins/*/pyproject.toml`. Run
  `poetry show --outdated` in each. Distinguish patch/minor (release-prep
  candidates per `release-workflow.md` Step 4b) from major bumps (own session).
- Frontend: `frontend/package.json`. Run `npm outdated`. Stability filter:
  no beta/RC/alpha; minimum 2 weeks since release for major bumps; LTS over
  Current for Node.js.
- BLOCKED items: cross-check against `docs/backlog.md` "Blocked or waiting"
  table. Run `make check-blockers` if available — surfaces upstream-resolved
  blockers automatically (DEP-02 npm publish, DEP-09 vite-plugin-pwa peer-dep,
  DEP-05 paid-API gate, AR-* validation thresholds).
- Docker: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`,
  `docker-compose.prod.yml`. Verify base-image consistency (Python 3.12-slim,
  Node 24-slim per v0.21.0 LTS upgrade), build-context paths (root-relative for
  plugin glob), no version drift between dev compose and prod compose.
- Git: branch model is solo-dev on `main`; verify Conventional Commits prefixes
  (feat/fix/refactor/docs/test/chore), no force-pushes, pre-commit hooks active
  (`.pre-commit-config.yaml`: ruff lint + format, eslint, prettier, pytest
  smoke).
- `.gitignore` consistency: `.env`, `*.db`, `backend/uploads/`, `__pycache__/`,
  `mutants/`, `coverage.xml`, `htmlcov/`, encrypted credential blobs.
- Secrets: three-layer chain per `docs/configuration.md`. Project YAML
  (`backend/config/app.yaml`, defaults) < user override
  (`~/.config/bibliogon/secrets.yaml`, gitignored) < env vars
  (`BIBLIOGON_*`). Verify no committed YAML carries a non-empty `api_key:`.
- Environment vars: `BIBLIOGON_PORT=7880` (NOT 8080), `BIBLIOGON_DEBUG`,
  `BIBLIOGON_DB_PATH`, `BIBLIOGON_CORS_ORIGINS`, `BIBLIOGON_SECRET_KEY`,
  `BIBLIOGON_CREDENTIALS_SECRET`, `BIBLIOGON_LICENSE_SECRET`, `BIBLIOGON_TEST=1`
  for in-memory test DB. `.env.example` is the discovery surface.

### 4. Documentation and Structure

- README: version line (current: `pyproject.toml` and `package.json`), install
  one-liner, port `7880`, manuscripta + pluginforge pin pointers, plugin table.
- ROADMAP: header `Last updated:` + `Latest release:`; `Current focus` paragraph
  reflects shipped state; BLOCKED items tagged inline.
- backlog: "Blocked or waiting" table accuracy via `make check-blockers`;
  "Recently closed" entries cite landing commit hash.
- API docs: FastAPI `/docs` + `/openapi.json` are the source of truth.
  `docs/API.md` is high-level overview only.
- Help system single-source-of-truth: `docs/help/_meta.yaml` drives MkDocs nav
  AND in-app help panel. Pages in `docs/help/{de,en}/` must be listed in
  `_meta.yaml` to be discoverable (post-2026-04 incident with `ai.md` and
  `developers/plugins.md`).
- Single source of truth: numbers (test counts, ChapterTypes, languages, plugin
  count) live in ONE canonical location. Documentation references that location
  instead of inlining the number. Flag any duplication.
- Project structure: 4-layer architecture under `backend/app/`,
  `plugins/bibliogon-plugin-{name}/`,
  `frontend/src/{pages,components,hooks,api,styles}/`, `e2e/{smoke,full}/`,
  `docs/{audits,explorations,help,journal}/`. Flag deviation.

## Output format

- Markdown, strictly grouped by the 4 sections above.
- Each finding as a markdown table row:
  `| [File:Line] | [Type] | [Reason] | [Recommended action] | [Priority] |`
- **Type** values: `Blocker` (P0/P1, hard rule violation), `Outdated`
  (drift / EOL / superseded), `Improvement` (cleanup or alignment), `Info`
  (intentional / dormant / blocked-on-upstream).
- **Priority** values:
  - **P0** — deadline pressure or production bug, this session.
  - **P1** — rule violation in active code, this session if mechanical.
  - **P2** — drift / cleanup, queue for release-prep or next focused session.
  - **P3** — nice-to-have, intentional, or blocked-on-upstream.
- Reference rule files when citing a violation:
  `[code-hygiene.md "Error handling architecture"]`.
- Use `[TBD]` for context that cannot be verified in the current session
  (e.g. paid-API behaviour, hardware-only smoke tests, real-user metrics).
- For BLOCKED upstream items, copy the unblock condition from
  `docs/backlog.md` "Blocked or waiting" verbatim — do not paraphrase.

## After the audit

End the report with:

1. **Summary counts** by priority (P0 / P1 / P2 / P3).
2. **Automation-ready batch**: list findings safe for a single mechanical commit
   (clear scope, no judgment calls). Distinguish from findings that need a
   dedicated session.
3. **Halt list**: findings the audit explicitly will not act on without user
   approval (multi-site refactors, dependency major bumps, dormant code,
   security-sensitive changes). Quote the reason in one sentence per item.
4. **Verification commands** the audit ran, so the report is reproducible.

Do not modify code as part of the audit unless explicitly asked. The audit
output is a triage document, not a patch.
