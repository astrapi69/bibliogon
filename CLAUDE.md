# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md for future strategy).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.39.0 (Picture-Book authoring depth release; 49 commits since v0.38.0 across two coordinated multi-session arcs (Storyboard View + Picture-Book Text-Stack) plus one closure-by-discovery (Settings-Allgemein already-shipped under SETT-PHASE-2 in v0.38.0) and the LAYOUT-SWITCH-TEXT-CONVERSION data-hygiene win. (1) **PICTURE-BOOK-STORYBOARD-VIEW-01** — 16 commits across 2 sessions; drag-reorder grid for picture-book pages with per-page annotations (inline notes, 6-value story-beat tag, 10-preset mood-color palette, free-text act-group label). New ``?view=storyboard`` mount + Storyboard button in the picture-book editor. 4 new nullable columns on Page (notes/story_beat/mood_color/act_group). (2) **PICTURE-BOOK-TEXT-STACK** — 18 commits across 2 sessions; Fix B per-layout namespace for ``Page.layout_config`` (supersedes Fix A purge-on-switch) + Tier 1+2 sections (8 Visual-Style + 6 Typography fields × 3 image layouts) + overlay-specific width/height sliders + shared ``computeTierTextStyles`` helper (TS + Python mirror). Closes PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 + PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 + PICTURE-BOOK-TEXT-CONFIGURATION-01. (3) **PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01** — single-commit data-hygiene win; PATCH carries extracted plain text on TipTap → Tier-Property layout-switch. (4) Comprehensive doc-sweep — README + README-de feature expansion (8 new bullets + 3 new top-level sections + plugin-table gap fix), CONTRIBUTING.md PluginForge bump, CLAUDE.md data-model expansion, help-doc cross-link layer across 5 page pairs. (5) HELP-DOCS-V0.37.0-GAPS-01 closeout — 6 new help-doc topic pairs (DE + EN = 12 Markdown pages), 5 Playwright-generated screenshots, new manual-only screenshots project. (6) Backlog hygiene — 2 P3 closures (1 retroactive), 3 P5-tier-misplaced items moved to P5 section, 1 CI red-fix. Backend pytest 2269 → 2294 (+25, 1 skipped); Vitest 2080 → 2190 (+110); i18n parity 75/75; tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke all green; npm audit 0 high/critical (2 moderate pre-existing).)

Previous release — **v0.38.0** (Settings-UX overhaul release; 30 commits since v0.37.0 in one day across five coordinated streams + one bug fix. (1) **SETT-PHASE-1-QUICK-WINS-01** — 7 quick wins (dashboard-view grouping sub-card, SSH-Key card, Editor tab extraction, sectionTitle CSS standardization, HelpText extraction, White-Label collapsible, SectionHeader + per-section descriptions). (2) **SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01** — Allgemein decomposed into Erscheinungsbild + Verhalten + Erweitert; obsolete AppSettings.tsx removed. (3) **SETT-PHASE-3-TOGGLE-COMPONENT-01** — new Toggle composition component + 5-site migration of the canonical-shape pattern (VerhaltenSettings 3 + AI 1 + AudiobookSettingsPanel readChapterNumber 1). The other 6 checkbox sites in Settings sub-components (2 inline label-after-checkbox + 3 white-label-core list-row + 1 generic ScalarSettingField) are intentional design-intent exemptions documented in Toggle.tsx's docstring per the design-intent-axis lessons-learned rule — NOT deferred work. (4) **SETT-AUTHORS-TAB-CONSOLIDATION-01** — Autor + Autoren-Datenbank merged into single Autoren tab with LEGACY_TAB_REDIRECTS for backward-compat. (5) **SETT-L-1-SIDEBAR-REDESIGN-01** — 13 tabs after Authors-consolidation produced a horizontal scrollbar at 900px max-width; user-pull trigger fired same-day. 5-commit chain: replaced Radix.Tabs with custom SettingsSidebar component (5 groups: Darstellung / Inhalt / System / Info / Gefahrenzone), extracted SettingsMobileMenu, added group headers + Danger Zone red accent (--danger color + --border divider), 5 new i18n keys × 8 catalogs, new e2e/smoke/settings-sidebar.spec.ts (7 cases). All 13 settings-tab-{value} testids preserved — 3 existing E2E specs keep working without modification. (6) Article Dashboard top-nav alignment fix — standalone Medium-Import button collapsed into a chevron disclosure on Importieren (split-button pattern mirroring newBookGroup) + second headerSeparator added; Article width ~1014px → ~908px matches Book Dashboard, eliminates layout jump when switching dashboards. (7) Pre-existing test flake fixed (test_tampered_token_rejected used `X` to "tamper" a base64 signature; `X` is a valid base64 char so ~1.5% of runs produced an identical "tampered" signature → flipped to `!`). Backend pytest 2269 (no change; refactoring + bug-fixes only); Vitest 2063 → 2080 (+17); i18n parity 51/51 (75/75 keys, +6 new this release); tsc + ruff + mypy + pre-commit + verify-docs-discipline + verify-plugin-locks + launcher PyInstaller build smoke all green; npm audit 0 high/critical (2 moderate pre-existing).)

Previous release — **v0.37.0** (Safety + parity + polish release; 53 commits since v0.36.0 across two coordinated batches: accessibility WCAG 2.1 AA audit + Danger Zone full-system reset + bulk-restore parity + Medium-import polish; Dashboard pagination + Book.repository_url metadata + editor display settings + docs/archive restructure + ROADMAP refresh + stale-doc hygiene. Backend pytest 2214 → 2269; Vitest 1986 → 2037.)

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

- **Book:** id, title, subtitle, author, language, series, series_index, description, publishing (ISBN/ASIN/publisher/edition), marketing (keywords, html_description, backpage), design (cover_image, custom_css), book_type (from BookTypeRegistry YAML SSoT)
- **Chapter:** id, book_id, title, content (TipTap JSON), position, chapter_type. Used by prose books (`content_model="chapters"`).
- **Page:** id, book_id, position, layout (5 picture-book layouts + `comic_panel_grid`), text_content (string), image_asset_id, layout_config (per-layout namespaced JSON via Fix B), plus 4 Storyboard columns (notes, story_beat, mood_color, act_group). Used by picture-books + comic-books (`content_model="pages"`).
- **ComicPanel / ComicBubble:** plugin-comics tables for comic_book pages (panel grid templates + multi-bubble per-panel speech bubbles).
- **Asset:** id, book_id, filename, asset_type (cover/figure/diagram/table), path
- **BookTemplate / BookTemplateChapter:** reusable book structures; 5 builtins seeded at startup. `/api/templates/`, `POST /api/books/from-template`.
- **ChapterTemplate:** reusable single-chapter structures with TipTap JSON content; 4 builtins (Interview, FAQ, Recipe, Photo Report). `/api/chapter-templates/`.
- **BookPublishingState:** server-side persistence for the KDP Publishing Wizard (pricing + ARC choices + last visited step).
- **Article:** id, title, subtitle, author, language, content_type (article-type discriminator from ArticleTypeRegistry YAML SSoT — 8 types: blogpost/tutorial/review/essay/newsletter/interview/listicle/short_story), article_metadata (per-type extra fields JSON), content_json, status, SEO fields, topic, tags, series, plus AI + publication relations.

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
