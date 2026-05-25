# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md for future strategy).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.37.0 (Safety + parity + polish release; 53 commits since v0.36.0 in two coordinated batches. **Batch 1 — Accessibility + Safety + Parity Foundation**: (1) Accessibility WCAG 2.1 AA audit — 7 commits closing all zero-coverage gaps: SkipToContentLink + landmarks across 8 routed pages, universal *:focus-visible safety-net + KDP wizard step-change focus management, WizardShell aria-current="step" + Toolbar aria-pressed on 20+ formatting toggles, TipTap editor aria-label + role="textbox" + aria-multiline on Editor.tsx + RichTextEditor.tsx, WCAG AA color-contrast fixes across all 10 theme variants (30 axe-core violations resolved via darkened --text-muted + --accent), @axe-core/react devDep-only via import.meta.env.DEV, universal prefers-reduced-motion rule covering ~42 transition sites. (2) Danger Zone full-system reset — Settings → Gefahrenzone tab with HMAC-token-gated 3-step wipe; backend reset_service.run_reset cancels SSE jobs, truncates 21 tables via reversed(Base.metadata.sorted_tables), re-seeds builtin templates, wipes uploads/config/secrets while preserving production-marker tripwire + platformdirs breadcrumb + launcher metadata + licenses.json. 25 backend pytest + 9 Vitest + 2 Playwright smoke. (3) Bulk-restore parity — single-round-trip POST /api/{articles,books}/trash/bulk-restore replacing the previous loop-per-id pattern. (4) Medium-import progress polish — progress panel above preview table + action buttons at top + retro-fix script. **Batch 2 — v0.36.0 housekeeping + feature stream**: (5) DASHBOARD-PAGINATION-LOAD-MORE-01 — 8 commits, usePagedList hook + PageSizeSelector component, "Mehr laden" button + 10/25/50/100 dropdown, backend limit query (ge=1, le=1000) + ui.dashboard.{books,articles}_page_size enum validation. Selection semantics preserved (select-all = full filtered set). (6) BOOK-REPOSITORY-URL-FIELD-01 — 5 commits, optional Book.repository_url String(2000) nullable + Alembic migration + RepositoryUrlField with git-sync read-precedence (mapping wins when present; free input otherwise). (7) EDITOR-DISPLAY-SETTINGS-01 — 6 commits, per-device localStorage preferences (width/font/size/line-height), toolbar popover in shared Editor.tsx covering both BookEditor + ArticleEditor, CSS variables on documentElement with var() fallbacks matching pre-feature literals. (8) docs/archive/ restructure — docs/roadmap-archive/ → docs/archive/roadmap/ with 15 live-file cross-ref updates. (9) ROADMAP refresh post-v0.36.0 — thematic overview defers detail to backlog. (10) Stale documentation hygiene sweep — CLAUDE.md + README + CONTRIBUTING + CONCEPT version refs corrected. (11) Stale-backlog closure — COMMENTS-ADMIN-PAGINATION-01 closed as already-shipped (fix predates the audit-filing by 3 days). (12) Trigger-audit annotations — BOOK-TYPE-CARD-COMPONENT-EXTRACT-01 + KDP-WIZARD-RESUME-AT-STEP-01 marked NOT MET. External Bibliogon-owned deps current at PyPI latest: manuscripta ^0.9.0, pluginforge ^0.10.0. Backend pytest 2214 → 2269 (+55, 1 skipped); Vitest 1986 → 2037 (+51, 160 files); i18n parity 75/75; tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke all green; npm audit 0 high/critical.)

Previous release — **v0.36.0** (Largest release since v0.30.0 by commit count: 230 commits since v0.35.1, +59765 / -2909 lines, 331 files. Three strategic streams matured together: (1) plugin-comics v1.0.0 → v1.1.0 — multi-panel + multi-bubble comic-book editor for `book_type='comic_book'`. (2) KDP Publishing Wizard Phase 1 + Phase 2 — 5-step XState v5 wizard with BookPublishingState server-side persistence + ArcReviewer schema + conflict-resolution banner; WizardShell + WizardNav primitives extracted (RCU 3-site). (3) PluginForge v0.7.0 → v0.10.0 adoption arc — 3-source plugin-metadata pattern codified, target_application/app_id declaration, min_app_version class attribute with version-gating, DiscoveryResult severity filtering, /api/admin/rediscover endpoint, plugin-status i18n mapping, single-router-per-plugin convention. Plus 17 other coherent surfaces: Book-Types SSoT, picture-book PDF format dropdown + bleed/crop marks, speech-bubble Tier 1+2 properties, multi-book-type GetStarted, Author input Pattern A across 4 surfaces, browser-native fullscreen, Alt+Z word-wrap, About-Dialog Settings tab + /api/system/info, Backups consolidation, page-delete UI, Medium-import excerpt auto-fill, BulkActionBar 3-site RCU, Story-tab metadata, KDP categories autocomplete, user-overlay plugin-enable lifespan migration, convert-to-book wizard stability, I18N-articles namespace cleanup. 10 new lessons-learned rules filed.)

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
- **Plugins:** pluginforge ^0.10.0 (PyPI), entry points, YAML config
- **Export:** manuscripta ^0.9.0 (PyPI), Pandoc, write-book-template structure. All TTS engines delegate to the manuscripta adapter.
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
| plugin-audiobook   | core    | -          | TTS via manuscripta (Edge/Google/ElevenLabs/pyttsx3), per-book config. Documented reverse-coupling exception: plugin-export imports `bibliogon_audiobook.generator` to dispatch the `audiobook` format. The sync `export_execute` hookspec cannot carry the async + SSE-streaming shape; re-evaluate when a 2nd async-streaming export plugin proposes a separate hookspec. |
| plugin-translation | core    | -          | DeepL/LMStudio translation, custom settings panel               |
| plugin-grammar     | core    | -          | LanguageTool (self-hosted + premium auth support)               |
| plugin-kinderbuch  | core    | export     | One-image-per-page layout with 4 templates                      |
| plugin-kdp         | core    | export     | KDP metadata, cover validation, completeness check              |
| plugin-comics      | core    | export     | Multi-panel comic-book pages; imports `bibliogon_export.picture_book_pdf` + `picture_book_fonts` directly for PDF rendering (legitimate forward dep). Dispatches comic-book PDF generation via the `export_execute` hook (HOOKSPEC-EXPORT-EXECUTE-WIRE-01 γ, 2026-05-23). |
| plugin-git-sync    | core    | -          | Git-backed import + sync for write-book-template repositories   |
| plugin-medium-import | core  | -          | Medium HTML-export importer: Article + Publication + provenance |

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
│   └── styles/global.css  # CSS variables, 5 themes x light/dark (10 variants)
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
- Secrets NEVER in committed config files. Three-layer chain: project `backend/config/app.yaml` (defaults) < `~/.config/bibliogon/secrets.yaml` (user override, gitignored) < env-vars (`BIBLIOGON_AI_API_KEY`). Details in [docs/configuration.md](docs/configuration.md). When editing AI-assisted, do NOT set `ai.api_key` in `app.yaml` — leave it `""` and route the value via override or env-var.

## Tests

- `make test` must stay green after every change
- E2E tests under `e2e/`, not on the `make test` default path
- Current counts and coverage: see [docs/audits/current-coverage.md](docs/audits/current-coverage.md)

## Test isolation

Tests run in a temporary data directory, never against production
data. Two layers of protection in `backend/tests/conftest.py`:

1. `BIBLIOGON_TEST=1` + `TEST_DATABASE_URL=sqlite:///:memory:` are
   set BEFORE any `app.*` import. `BIBLIOGON_DATA_DIR` is set to a
   process-scoped tmp dir. All `app.paths.get_data_dir()` and
   `get_upload_dir()` calls resolve into this tmp path.
2. Production data directories carry a `.bibliogon-production`
   marker file (written by the FastAPI lifespan in non-test mode
   via `app.paths.mark_data_dir_as_production`). If any test ever
   sees this marker, the entire test run aborts with
   `pytest.exit(returncode=2)`.

Exit code 2 means a test path was pointed at real data. Investigate;
never delete the marker just to "make the test pass". Origin: the
April 2026 data-loss incident — the DB tripwire landed in `a4cf7cf`,
the filesystem tripwire in this commit.

Path conventions:
- `Path("uploads")` is forbidden (CWD-relative). Use
  `app.paths.get_upload_dir()` everywhere — it resolves fresh on
  every call so test env-var overrides take effect.
- `from app.routers.assets import UPLOAD_DIR` is forbidden (frozen
  at import time). Use `from app.paths import get_upload_dir`
  instead.

### In-memory caches (third isolation layer)

The two layers above cover filesystem and DB state. The third layer
— module-level mutable state in service modules — is NOT covered by
env-vars or marker files. Production keeps these caches; tests must
reset them explicitly.

Any service module using `functools.lru_cache`, `cached_property`,
or module-level mutable state (singletons, registries, dicts
assigned at import time) needs its own teardown hook in the
fixtures that exercise it. The bidirectional `yield`-based autouse
pattern is the simplest shape:

```python
@pytest.fixture(autouse=True)
def _clear_module_cache():
    module.cached_function.cache_clear()
    yield
    module.cached_function.cache_clear()
```

Setup-only clears (the `return None` variant) look correct in
isolation — single-file pytest runs pass — but cross-file ordering
poisons the cache for any later test file that hits the same
service. Today's `platform_schema` regression broke 5
`test_publications.py` tests via this exact path: the fake-schema
result from the last test in `test_platform_schema.py` stayed in
`load_platform_schemas`'s LRU cache; the publications endpoint
served the stale fake dict to the next test file.

Detection grep:
```
grep -E '@(lru_|.*_)cache|_cache *=|^[A-Z_]+ *= *' \
  backend/app/services/<module>.py
```

Any match in a module that tests fake out is a candidate for
state-survival-across-tests. See
`.claude/rules/lessons-learned.md` "Module-level caches survive
test boundaries" for the full pattern + anti-pattern. Audit
backlog item: `TEST-ISOLATION-MODULE-STATE-01` (P3).

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

# Reviews

OpenAI Codex will review your output once you are done
