# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md for future strategy).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.35.1 (Fast-follow patch for v0.35.0 donation-visibility gap. S-03 reminder banner shipped in v0.19.0 but functionally invisible to new users due to 90-day grace gate. Three changes: (1) Grace period 90 → 7 days — new users see the reminder after a one-week settling-in window. Single `DAYS_90` constant split into 3 explicit constants (`GRACE_PERIOD_DAYS`, `COOLDOWN_DISMISSED_DAYS`, `COOLDOWN_DONATED_DAYS`). (2) App-level mount — banner lifted from Dashboard-only to App.tsx above `<Routes>`, persists across navigation (Dashboard, BookEditor, ArticleEditor, Settings, Help) until explicit dismiss. Dashboard keeps S-02 OnboardingDialog mount. (3) Accessibility — Escape keyboard dismiss (behaves like Not-now → 90-day cooldown) + `aria-live="polite"` on banner root for screen-reader announcement without focus-steal. Industry-research synthesis confirmed cooldowns at 90/180 sit in median band (Wikipedia/Mozilla/Mastodon/Signal/Blender references). i18n strings untouched per user-direction. 5 new Playwright pins (grace gate + App-level persistence across 4 pages + Escape dismiss + a11y attrs). 1 P3 backlog filing: REMINDER-PANEL-GENERIC-EXTRACTION-01 for future generic ReminderPanel when a 2nd reminder-shaped affordance lands. 3 commits since v0.35.0, +547 / -48 lines, 27 files.)

Previous release — **v0.35.0** (Second Picture-Book release. Five major feature streams: (1) Picture-Book TipTap rich-text editing — RichTextEditor wrapper for the 3 unbounded layouts (image_top_text_bottom, image_left_text_right, text_only) with D1 MVP extension set (StarterKit + TextAlign + Underline + TextStyle + Color + FontFamily); 11-button RichTextToolbar in D6-C properties-pane placement; Tier-Property layouts (speech_bubble, image_full_text_overlay) keep textareas. Defensive plain-text extraction (`extractPlainText` frontend + `_extract_plain_text` backend) prevents JSON leakage on layout switch. (2) Picture-Book PDF Export (Session 6) — WeasyPrint 8.5×8.5 KDP-ready with full PDF metadata embedding; TipTap walker preserves bold/italic/underline/fontFamily + alignment + headings 1-3 + lists in the printed PDF; 5 OFL fonts bundled (Atkinson Hyperlegible default, Andika, Comic Neue, Lexend, OpenDyslexic) via @font-face url(file://) for KDP-grade embedding; Export-PDF button in PageEditor header + Metadata Design tab. (3) Speech-bubble polish — full 9-position anchor grid (4 corner + 4 edge-midpoint + center) with per-cell i18n + aria-labels; bubble_width (20-80%) + bubble_height (15-60%) replace single `size` knob with backward-compat legacy-size fallback; backend `_speech_bubble_style` positions dict mirrors the 9 anchors (closed silent half-wired gap). (4) Font Selection — 5-font catalog dropdown in RichTextToolbar; auto-select-all in onChange handler enforces "one page one consistent font" picture-book convention; D11 default = Atkinson Hyperlegible for pre-Finding-G pages. (5) Medium-import async path — SSE-driven progress UI replaces synchronous spinner; Run-in-background dock + go-to-comments link + F5-recovery via context-backed state; surfaces v0.31.0 comment-routing fields. Plus visible region separator on image_top_text_bottom + image_left_text_right via `var(--border-strong)` 2px (was opacity-mix; near-invisible on light themes). Plus PageEditor ThemeToggle (9th confirmed Articles-vs-Books asymmetry closed). Plus CreateBookModal Authors-DB integration. Plus release-automation pipeline shipped Scopes 1-4: 6 aggregate Makefile targets + package-lock.json sync + open-set version-literal discovery + CI release-gate extension. v0.35.0 is the first release cut entirely through the new automation. 3 new lessons-learned rules (Recurring-Component Unification Rule, SSoT cross-cutting concerns, Half-wired pattern 4th instance) + 1 feedback memory (smoke findings = direct-action default). 47 commits since v0.34.1, +13718 / -453 lines across 83 files.)

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
