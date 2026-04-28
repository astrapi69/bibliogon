# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md for future strategy).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.24.0 (Article authoring as first-class feature: AR-01 Article entity + CRUD + ArticleEditor, AR-02 Publications + drift detection across 8 platforms, AR-02 Phase 2.1 Topics + SEO + sidebar-left, Editor-Parity Phases 1-3 with shared RichTextEditor + contentKind plugin gating + per-article ms-tools + translate-article + export to Markdown/HTML/PDF/DOCX. Plus PS-13 "Save as new chapter" in conflict dialog, UX-FU-02 article featured image upload, plugin-git-sync follow-ups (PGS-02-FU-01 per-book PAT, PGS-03-FU-01 mark_conflict + rename detection, PGS-04-FU-01 skipped-branches surfacing), CIO-08-FU-01 multi-book wizard finishing, README rewrite + UX conventions doc + plugin author patterns. Migrations f9a0b1c2d3e4 (articles), a0b1c2d3e4f5 (publications + article SEO), b1c2d3e4f5a6 (topic + article SEO columns), c2d3e4f5a6b7 (article_assets) idempotent.)
- **Concept:** docs/CONCEPT.md
- **API reference:** FastAPI OpenAPI under `/docs` and `/openapi.json` (source of truth). docs/API.md is a high-level overview.
- **History:** docs/CHANGELOG.md (completed phases), docs/ROADMAP.md (open items)

## Development guidelines

Detailed rules live in `.claude/rules/`. Claude Code reads them on demand.

**Always relevant** (read on every feature/fix):
- `architecture.md` - layered architecture, plugin structure, UI strategy, data flow
- `coding-standards.md` - naming, function design, tests, dependencies

**On demand** (read for specific tasks):
- `code-hygiene.md` - linting, pre-commit, error handling architecture, API conventions
- `lessons-learned.md` - known pitfalls (TipTap, import, export, deployment)
- `quality-checks.md` - test strategy, mutmut/Stryker, pre-commit checklists
- `ai-workflow.md` - order for features/plugins, prohibitions, docs protocol
- `release-workflow.md` - release process (triggered by "release new version")

On a conflict between CLAUDE.md and the rules, the rules win.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2, Poetry
- **Frontend:** React 18, TypeScript (strict), TipTap (15+1 extensions), Vite, Radix UI, @dnd-kit, Lucide, react-toastify
- **Plugins:** pluginforge ^0.5.0 (PyPI), entry points, YAML config
- **Export:** manuscripta ^0.7.0 (PyPI), Pandoc, write-book-template structure. All TTS engines delegate to the manuscripta adapter.
- **Testing:** pytest, Vitest, Playwright, mutmut, Stryker
- **Tooling:** Poetry, npm, Docker, Make, ruff, ESLint, Prettier, pre-commit

## Architecture (short)

4 layers: Frontend -> Backend -> PluginForge -> Plugins. Details in `.claude/rules/architecture.md`.

Lean core (UI, editor, CRUD, backup). Everything else via plugins. All plugins are currently free (`license_tier = "core"`). License infrastructure exists but is dormant (`LICENSING_ENABLED = False` in `backend/app/licensing.py`).

## Commands

```bash
make install              # Poetry + npm + plugins
make dev                  # backend (8000) + frontend (5173) in parallel
make dev-bg / dev-down    # background mode
make test                 # all tests (backend + plugins + frontend), no coverage
make test-coverage        # opt-in coverage run (heavy; CI runs this on every push)
make test-backend         # backend only
make test-plugins         # all plugin tests
make test-frontend        # Vitest
make prod                 # Docker Compose (port 7880)
make prod-down            # stop Docker
make generate-trial-key   # 30-day trial key (dormant, licensing disabled)
make clean                # remove build artifacts
make help                 # all targets
```

Plugin-specific: `make test-plugin-{export,grammar,kdp,kinderbuch,ms-tools,audiobook,translation}`

E2E tests: `npx playwright test --project=smoke` (fast, per feature) or `--project=full` (complete regression).

## Session start (Claude Code)

1. `git log --oneline -10` - recent changes
2. Read `docs/ROADMAP.md` - current state
3. `make test` - green baseline

## Data model (short)

- **Book:** id, title, subtitle, author, language, series, series_index, description, publishing (ISBN/ASIN/publisher/edition), marketing (keywords, html_description, backpage), design (cover_image, custom_css)
- **Chapter:** id, book_id, title, content (TipTap JSON), position, chapter_type
- **Asset:** id, book_id, filename, asset_type (cover/figure/diagram/table), path
- **BookTemplate / BookTemplateChapter:** reusable book structures; 5 builtins seeded at startup. `/api/templates/`, `POST /api/books/from-template`.
- **ChapterTemplate:** reusable single-chapter structures with TipTap JSON content; 4 builtins (Interview, FAQ, Recipe, Photo Report). `/api/chapter-templates/`.

**ChapterType (31):** chapter, preface, foreword, acknowledgments, about_author, appendix, bibliography, glossary, epilogue, imprint, next_in_series, part, part_intro, interlude, toc, dedication, prologue, introduction, afterword, final_thoughts, index, epigraph, endnotes, also_by_author, excerpt, call_to_action, half_title, title_page, copyright, section, conclusion. Marketing types (also_by_author, excerpt, call_to_action) are in the audiobook-export skip list by default. Per-book override via Book.audiobook_skip_chapter_types.

## Plugins

| Plugin             | Tier    | Depends on | Description                                                     |
| ------------------ | ------- | ---------- | --------------------------------------------------------------- |
| plugin-export      | core    | -          | EPUB, PDF, write-book-template ZIP, async jobs with SSE         |
| plugin-help        | core    | -          | In-app help, shortcuts, FAQ                                     |
| plugin-getstarted  | core    | -          | Onboarding, example book                                        |
| plugin-ms-tools    | core    | -          | Style checks, sanitization, metrics, per-book thresholds        |
| plugin-audiobook   | core    | export     | TTS via manuscripta (Edge/Google/ElevenLabs/pyttsx3), per-book config |
| plugin-translation | core    | -          | DeepL/LMStudio translation, custom settings panel               |
| plugin-grammar     | core    | -          | LanguageTool (self-hosted + premium auth support)               |
| plugin-kinderbuch  | core    | export     | One-image-per-page layout with 4 templates                      |
| plugin-kdp         | core    | export     | KDP metadata, cover validation, completeness check              |

Plugin versions are independent of the app version. A plugin is only bumped when the plugin itself changed, not on every app release.

## Directory structure (short)

```
bibliogon/
├── backend/app/           # FastAPI core (main, database, hookspecs, licensing, models, routers, services)
├── backend/config/        # app.yaml, plugins/, i18n/ (8 languages)
├── backend/tests/         # backend tests
├── plugins/               # plugin packages (bibliogon-plugin-{name})
│   └── installed/         # plugins installed dynamically via ZIP
├── frontend/src/
│   ├── api/client.ts      # typed API client
│   ├── components/        # Editor, Toolbar, ChapterSidebar, dialogs
│   ├── pages/             # Dashboard, BookEditor, Settings, Help, GetStarted
│   └── styles/global.css  # CSS variables, 3 themes x light/dark
├── e2e/
│   ├── smoke/             # fast smoke tests (per feature)
│   └── full/              # full regression suite
├── docs/                  # CONCEPT.md, ROADMAP.md, CHANGELOG.md
└── Makefile, docker-compose.yml, docker-compose.prod.yml
```

## Core conventions

- TipTap JSON as the internal storage format (NOT HTML, NOT Markdown)
- i18n: 8 languages (DE, EN, ES, FR, EL, PT, TR, JA), all UI strings in config/i18n/{lang}.yaml
- Python: type hints, snake_case, Pydantic v2, SQLAlchemy 2.0 mapped columns
- TypeScript: strict mode, no `any`, Radix UI for primitives
- CSS: custom properties, dark mode via [data-theme="dark"]
- Plugins: standalone packages under plugins/, depends_on as a class attribute, all free (licensing dormant)
- Export: manuscripta (PyPI), plugin config in export.yaml is 1:1 the manuscripta format
- Commits: English, conventional (feat/fix/refactor/docs)
- E2E: data-testid selectors only, no brittle CSS or XPath. Claude Code writes specs, Aster runs them.

## Tests

- `make test` must stay green after every change
- E2E tests under `e2e/`, not on the `make test` default path
- Current counts and coverage: see [docs/audits/current-coverage.md](docs/audits/current-coverage.md)

## Pre-commit hooks

The repo uses pre-commit for formatting and linting. Contributors install once:

```bash
cd backend && poetry run pre-commit install
```

Hooks run automatically on `git commit`. To run manually on all files:

```bash
cd backend && poetry run pre-commit run --all-files
```

Config in `.pre-commit-config.yaml` at repo root. Current hooks: trailing-whitespace, end-of-file-fixer, check-yaml, check-json, check-added-large-files, check-merge-conflict, ruff (with `--fix`), ruff-format. Backend-only; frontend has its own Prettier/ESLint path.

## Related projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - book export pipeline (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - target directory structure for export
