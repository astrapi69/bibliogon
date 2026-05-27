# Contributing to Bibliogon

Thank you for considering a contribution. Bibliogon is a
local-first self-publishing platform for book and article
authoring, built on PluginForge. Most non-trivial features land
as plugins, not core changes.

## Project Layout

- `backend/` - FastAPI app, SQLAlchemy models, Alembic migrations
- `frontend/` - React + TypeScript + Vite, TipTap editor
- `plugins/` - 12 first-party plugins, each a standalone Poetry package
- `launcher/` - Cross-platform launcher (PyInstaller)
- `docs/` - User docs (MkDocs), API reference, journals, audits
- `.claude/rules/` - Project rules read on demand
- `e2e/` - Playwright smoke + full suites

## Getting Started

### Prerequisites

- Python 3.11 or newer
- Node.js 24 (Active LTS; 20.19+ also works for tests but the
  full Vite 8 build requires 24)
- Poetry (Python dependency management)
- Docker + Docker Compose v2+ (for the prod-shape integration
  flow; not required for `make dev`)

### Bootstrap

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
make install      # Poetry + npm + plugin path-deps
make test         # baseline; should be green before you start
make dev          # backend on :8000, frontend on :5173
```

`make help` lists every available target. The
[Makefile](Makefile) is the canonical source of truth for build
commands - this file references targets that exist there; do
not invent new ones in PRs without adding them to the Makefile
in the same change.

### Running tests

```bash
make test                     # all tests (backend + plugins + frontend)
make test-backend             # backend only
make test-frontend            # Vitest only
make test-plugin-{name}       # single plugin (export, kdp, audiobook, ...)
make check-types              # mypy + tsc --noEmit
```

## Plugin Development

Bibliogon plugins are standalone Poetry packages that register
through PluginForge ^0.10.0 entry points. New format-specific or
workflow-specific features generally belong in a plugin, not in
core.

### Quickstart

The smallest existing plugin to copy is
[`plugins/bibliogon-plugin-getstarted/`](plugins/bibliogon-plugin-getstarted/).
Mirror its shape:

```
plugins/bibliogon-plugin-yourname/
  pyproject.toml                # name, version, pluginforge dep, entry point
  bibliogon_yourname/
    __init__.py
    plugin.py                   # YourPlugin(BasePlugin)
    routes.py                   # FastAPI APIRouter (optional)
  tests/                        # pytest tests
  README.md
```

Steps:

1. Copy the directory; rename `bibliogon-plugin-getstarted` and
   `bibliogon_getstarted` to your plugin name.
2. Edit `pyproject.toml`: package name, description, the
   `[tool.poetry.plugins."bibliogon.plugins"]` entry point.
3. Implement `plugin.py` extending `BasePlugin` with `name`,
   `version`, `api_version = "1"`, `license_tier = "core"`.
   Override `activate()`, `get_routes()`,
   `get_frontend_manifest()` as needed.
4. Add a path-dep in `backend/pyproject.toml` mirroring the
   existing entries.
5. Add the plugin slug to `backend/config/app.yaml.example`
   under `plugins.enabled`.
6. If your plugin has runtime settings, drop them at
   `backend/config/plugins/{slug}.yaml` (PluginForge reads from
   there, not from inside the plugin's own dir).
7. `cd backend && poetry lock && poetry install`, then
   `make test-plugin-{yourname}`.

The plugin development guide at
[docs/help/en/developers/plugins.md](docs/help/en/developers/plugins.md)
covers the hook spec catalogue, frontend manifest slots, and
ZIP-distribution layout in more depth.

### Plugin licensing

All plugins currently ship under MIT with
`license_tier = "core"`. A licensing layer in
`backend/app/licensing.py` exists but is dormant
(`LICENSING_ENABLED = False`); no plugin is gated at runtime
today. If a future plugin adopts a paid tier, source remains
public and licensing affects only runtime activation.

## Coding Standards

Project rules live in [`.claude/rules/`](.claude/rules/) and are
read on demand:

- [architecture.md](.claude/rules/architecture.md) - layered
  architecture, plugin structure, UI strategy
- [coding-standards.md](.claude/rules/coding-standards.md) -
  naming, function design, dependency policy
- [code-hygiene.md](.claude/rules/code-hygiene.md) - linting,
  pre-commit, error-handling architecture, API conventions
- [quality-checks.md](.claude/rules/quality-checks.md) - test
  pyramid, coverage targets, mutation testing
- [lessons-learned.md](.claude/rules/lessons-learned.md) - known
  pitfalls (TipTap, import, export, Alembic logging)
- [ai-workflow.md](.claude/rules/ai-workflow.md) - session
  workflow, documentation protocol
- [release-workflow.md](.claude/rules/release-workflow.md) -
  release process

The pre-commit hooks (ruff, ruff-format, trailing-whitespace,
end-of-file, YAML/JSON validation) run automatically on
`git commit`. Install them once with
`cd backend && poetry run pre-commit install`.

### Internationalization

Bibliogon ships in 8 languages: DE, EN, ES, FR, EL, PT, TR, JA.
Every user-facing change must add or update keys in all 8
catalogs under `backend/config/i18n/{lang}.yaml`. Parity tests
fail the build if a key is missing in any language.

German content (i18n catalogs, help docs, README-de) uses real
UTF-8 umlauts. ASCII transliterations like `fuer`, `ueber`,
`oeffentlich` are forbidden. The
`scripts/find_umlaut_candidates.py` and
`scripts/replace_umlauts.py` tooling enforces this with a
whitelist.

## Commit Conventions

Bibliogon uses [Conventional Commits](https://www.conventionalcommits.org/).
There is no commit-msg-time tool enforcing this; the convention
is documentation-only and reinforced through code review.

Common types: `feat`, `fix`, `refactor`, `docs`, `test`,
`chore`. Provide a scope when one is obvious:
`feat(export): ...`, `fix(editor): ...`.

Atomic commits. Each commit must leave the tree green
(`make test` passes); intermediate commits with broken tests
break bisect. Combine source + test changes in the same commit
when splitting them would create a red intermediate state.

## Pull Requests

1. Fork the repository and clone your fork.
2. Branch: `git checkout -b feat/short-name` or
   `fix/short-name`.
3. Make changes; keep commits atomic.
4. Run `make test` and `make check-types` locally; both must be
   green.
5. Push and open a PR. The PR template asks for type, testing
   evidence, doc updates, and plugin impact.

For larger changes, open an issue first to discuss design. Use
the
[Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml)
template.

## Code of Conduct

Bibliogon follows
[Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Reports go to
asterios.raptis@web.de.

## Security

For security vulnerabilities, do not open a public issue. Use
GitHub Private Vulnerability Reporting per
[SECURITY.md](SECURITY.md).
