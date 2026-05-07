# Contributing

How to set up Bibliogon for development, run tests, and ship a change.

This page is the public version of the internal contributor rules. The full set of `.claude/rules/*.md` files documents finer-grained conventions for AI-assisted work; external contributors do not need to read them, but the highlights of `coding-standards.md` and `code-hygiene.md` are summarized here.

## Dev setup

Required tools:

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.11+ | Backend |
| Poetry | 1.8+ | Backend dependency manager |
| Node.js | **24+** | Pinned in `frontend/package.json` `engines.node >=24.0.0` |
| npm | 10+ | Frontend |
| Docker | 24+ | Production deploy via `make prod`; not required for `make dev` |
| git | any | Source |

8 GB RAM minimum, 16 GB recommended for tests + dev concurrently.

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
make install        # Poetry + npm + plugins (one-time)
make dev            # backend (8000) + frontend (5173) in parallel
```

Open <http://localhost:5173>. The backend runs on 8000 with Vite proxying `/api/*` calls.

## Pre-commit hooks

The repo uses pre-commit. Install once:

```bash
cd backend && poetry run pre-commit install
```

Every `git commit` runs ruff (lint + format), check-yaml/json, end-of-file fixer, trailing-whitespace, check-merge-conflicts, and a non-blocking ROADMAP-archive reminder. Frontend has its own ESLint + Prettier path.

To run on all files manually:

```bash
cd backend && poetry run pre-commit run --all-files
```

The pre-push hook also re-runs the full pre-commit suite when you push a tag, so a tag push cannot land untested code.

## Running tests

```bash
make test                # backend + plugins + Vitest, no coverage (fast — should stay green)
make test-coverage       # opt-in coverage run, heavy
make test-backend        # backend only
make test-plugins        # all plugins
make test-frontend       # Vitest only
make test-plugin-export  # one specific plugin
```

E2E (needs the dev server running):

```bash
make dev                          # in one terminal
npx playwright test               # all e2e tests
npx playwright test --project=smoke   # fast smoke suite (191 specs at v0.29.0)
```

Coverage runs in CI on every push and uploads HTML reports as GitHub Actions artifacts (14-day retention). Pull them with `gh run download --name backend-coverage` etc.

## Coding standards (highlights)

These are the rules every change is expected to follow. The full versions live in `.claude/rules/coding-standards.md` and `.claude/rules/code-hygiene.md`.

### Python

- Type hints **always**. No `Any` without an inline `# any: <reason>` comment.
- Docstrings for public functions (Google style).
- Pydantic v2 for schemas. Field validators instead of manual checks.
- snake_case files / functions / variables; PascalCase classes.
- Services throw `BibliogonError` subclasses — **never** `HTTPException`. The global exception handler maps. (See [Architecture](architecture.md#error-handling).)
- No bare `except Exception`. Catch specific exceptions and log with `exc_info=True`.

### TypeScript

- Strict mode. No `any` without an inline comment.
- Functional components + hooks. No class components.
- Radix UI for dialogs / dropdowns / tooltips / tabs / select.
- @dnd-kit for drag-and-drop. No manual DnD.
- Lucide React for icons. No other icon libraries.
- react-toastify for user feedback. No `window.alert()`. No `console.log` for user info.
- API calls **only** through `frontend/src/api/client.ts`. No bare `fetch("/api/...")` in components.
- No native `confirm()` / `alert()`. Use the `useDialog` hook from `AppDialog`.

### Naming

- Plugin folders: `bibliogon-plugin-{name}` (kebab-case).
- Python package inside a plugin: `bibliogon_{name}` (snake_case).
- Events / hooks: snake_case (`chapter_pre_save`, `export_execute`).
- No I-prefix for interfaces. `Book`, not `IBook`.
- No generic names: `data`, `info`, `result`, `temp`, `item`, `obj`, `val`, `tmp`, `x` are forbidden. Use `book_data`, `plugin_info`, `export_result`, `chapter_item`. Loop variables (`i`, `j`) and lambdas excepted.

### Function design

- One responsibility per function.
- Max 40 lines per function. Anything over 50 is a refactoring signal.
- Comments like `# Step 1` / `# Step 2` inside one function mean it should be split.
- Don't mix abstraction levels — high-level code calls helper functions; helpers do the low-level work.

### Formatting

- 4 spaces (Python), 2 spaces (TypeScript / CSS).
- ruff (Python) and Prettier (TypeScript) auto-format.
- No em-dash (`--` or U+2014). Hyphens or commas instead.
- No emojis in code or comments.

### Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Provide a scope when clear: `feat(export): ...`, `fix(editor): ...`.
- One logical change per commit.
- Branch naming: `feature/{name}`, `fix/{name}`, `chore/{name}`.

### i18n

- All UI strings live in `backend/config/i18n/{lang}.yaml` across all 8 languages (DE, EN, ES, FR, EL, PT, TR, JA).
- DE / EN / EL / FR / ES are user-validated. PT / TR / JA are auto-translated and pending native-speaker review.
- DE production content (i18n YAML, help pages, plugin DE prose) uses **real umlauts**, not ASCII transliterations. The lessons-learned rule lists scope; `scripts/replace_umlauts.py` is the maintenance tool.

## Adding a feature

The order documented for new features:

1. Decide whether it belongs in a plugin or in the core. New features default to plugin.
2. Look at existing patterns (`plugin-export` is the most-evolved reference).
3. Schema/model first (Pydantic schema or TypeScript interface).
4. Backend logic (service module, then route).
5. Frontend (extend `api/client.ts`, then UI).
6. Unit + integration tests (pytest, Vitest).
7. Playwright smoke test for any UI change. At least one happy-path spec under `e2e/smoke/`. No feature counts as done without one.
8. i18n: extend strings in **all 8 languages** (mirror the existing pattern; DE/EN are the source of truth, the other 6 follow).
9. Conventional commit.

## Adding a plugin

See the [Plugin Developer Guide](plugins.md) for the full flow. In short:

1. `plugins/bibliogon-plugin-{name}/`.
2. `pyproject.toml` with the entry point: `[project.entry-points."bibliogon.plugins"]`.
3. Plugin class subclassing `pluginforge.BasePlugin` with `name`, `version`, `depends_on`.
4. YAML config: `backend/config/plugins/{name}.yaml`.
5. Routes in `routes.py` (FastAPI) + business logic in separate modules.
6. Frontend manifest via `get_frontend_manifest()` declaring UI slot extensions.
7. Tests in `plugins/{name}/tests/`.
8. Add the path-dependency declaration in `backend/pyproject.toml` (mandatory; `importlib.metadata.entry_points()` only sees what is actually installed).
9. Enable in `config/app.yaml` under `plugins.enabled`.

## Releasing

The release workflow is `release-workflow.md` — internal but public-readable. The summary:

1. Hand-edit one file at release time: `backend/pyproject.toml`. Bump per SemVer.
2. `make sync-versions` propagates to all subsystems (frontend `package.json`, launcher pyproject + spec plist + `__init__.py`, all 10 plugin pyprojects, `install.sh` and `install.ps1` regenerated from templates).
3. `make sync-versions-check` and `bash scripts/verify_version_pins.sh <version>` — both must be clean.
4. Mandatory pre-tag chain: `make test`, `tsc --noEmit`, `vitest`, `playwright --project=smoke`, `ruff check`, `mypy app/`, `pre-commit run --all-files`, `pyinstaller bibliogon-launcher.spec --clean --noconfirm`. All green.
5. `git tag -a vX.Y.Z -m "Release vX.Y.Z"` and push tag + main.
6. `gh release create vX.Y.Z --notes-file changelog/releases/vX.Y.Z.md`.
7. Post-release: archive shipped items in `docs/roadmap-archive/YYYY-MM.md`, update `docs/ROADMAP.md` `Latest release` line, update `CLAUDE.md` `Version` line, write the chat journal entry.

CI gates the same checks at `release-gate.yml` on tag push. A drift in any subsystem blocks the artifact attachment.

## Audit cadence

Quarterly systematic audits run via the documented prompt at [`.claude/prompts/audit.md`](https://github.com/astrapi69/bibliogon/blob/main/.claude/prompts/audit.md). The prompt does a read-only triage in four sections (test validity, code quality, infrastructure, documentation) and outputs a prioritized findings list. Findings get filed as backlog items with priority tiers (P0..P5).

The release-cycle dependency check is a separate cadence: at every release, run `poetry show --outdated` (backend + each plugin + launcher) and `npm outdated` (frontend). Apply patch + minor + low-risk minor as part of release prep. Major bumps get their own dedicated session.

## Reporting bugs

Open a GitHub issue at <https://github.com/astrapi69/bibliogon/issues>. The 5xx error toast in the app has a "Report issue" button that pre-fills the issue body with the stacktrace, browser info, and app version — use it when you can.

## Reporting security issues

For security-sensitive issues, do **not** open a public GitHub issue. Email the maintainer (the address is in the package metadata in `backend/pyproject.toml`).

> Last verified for v0.29.0 (2026-05-07).
