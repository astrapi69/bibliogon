# Bibliogon

Open-source book authoring platform. Built on PluginForge (PyPI), a reusable plugin framework based on pluggy. Offline-capable, i18n-ready, local-first. All plugins are free during the current development phase (see docs/explorations/monetization.md).

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.60.0 - what each release changed: docs/CHANGELOG.md and changelog/releases/. No release summaries here; this file is loaded into every prompt and has a budget (`backend/tests/test_claude_md_budget.py`).
- **Concept:** docs/CONCEPT.md - **Open items:** docs/ROADMAP.md, docs/backlog.md
- **API:** FastAPI OpenAPI under `/docs` (source of truth); docs/API.md is an overview.
- **Architecture & policy:** docs/MODULE-ARCHITECTURE.md, docs/VIBE-CODING-POLICY.md, docs/EXPORT-IMPORT-FORMATS.md, docs/SETTINGS-MENU-ARCHITECTURE.md, docs/manual-tests/MANUAL-TESTPLAN.md

## Development guidelines

Detailed rules live in `.claude/rules/`; on a conflict with this file, the rules win.

- Always: `architecture.md`, `coding-standards.md`, `ci-only-heavy-tests.md` (full suites, Playwright and builds run on GitHub Actions)
- Task-specific (every file here is still loaded each session, so keep them short): `code-hygiene.md`, `lessons-learned.md` (index of known pitfalls; entries in docs/development/lessons-learned/), `quality-checks.md`, `ai-workflow.md`, `release-workflow.md` ("release new version"), `dev-db-isolation.md` (agents use their own DB copy), `tdd.md`, `i18n-removal.md`, `library-first.md`

Hooks (`.claude/settings.json`): cloud sessions get dependencies and a human git identity at start; `git add -A`/`.` and `git commit -a` are refused.

## Tech stack

- **Backend:** Python 3.12+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2, Poetry
- **Frontend:** React 18, TypeScript (strict), TipTap, Vite, Radix UI, Tailwind v4 (token-mapped) + shadcn/ui, @dnd-kit, Lucide, react-toastify
- **Plugins:** pluginforge ^0.10.0; **Export:** manuscripta ^0.9.0, Pandoc; **Launcher:** docker-app-launcher (docs/LAUNCHER-SPEC.md)
- **Testing:** pytest, Vitest, Playwright, mutmut, Stryker; **Tooling:** Make, ruff, ESLint, Prettier, pre-commit

4 layers: Frontend -> Backend -> PluginForge -> Plugins. Lean core (UI, editor, CRUD, backup); everything else is a plugin. Licensing exists but is dormant (`LICENSING_ENABLED = False`).

## Commands

```bash
make install / dev / dev-bg / dev-down   # deps; backend 8000 + frontend 5173
make ci-remote                           # CI on GitHub for the pushed branch
make e2e-remote SUITE=smoke SPECS="smoke/x.spec.ts"  # Playwright on GitHub
make test-plugin-<name>                  # one plugin (every plugin needs a target)
make install-hooks                       # git hooks incl. the commit-msg stage
make verify-theme / verify-seed-i18n / verify-seed-drift / verify-docs-discipline
make generate-seed-data                  # regen offline seed JSON after i18n/help/registry changes
make prod / prod-down                    # Docker Compose (port 7880)
make help                                # everything else
```

`make test` and `make test-coverage` are for CI and Aster, not for agents.

## Session start

1. `git log --oneline -10`
2. Read `docs/ROADMAP.md`
3. `gh run list --branch develop --limit 3` - CI baseline (no local full suite)

## Data model (short)

- **Book:** metadata, publishing (ISBN/ASIN per format), marketing, design, `book_type` (BookTypeRegistry YAML), `status` (draft/ready/published/archived)
- **Chapter:** TipTap JSON `content`, `position`, `chapter_type` (enum in `backend/app/models/__init__.py`) - prose books
- **Page:** `layout`, `text_content`, `image_asset_id`, per-layout `layout_config`, storyboard columns - picture books and comics; **ComicPanel / ComicBubble** (plugin-comics)
- **StoryEntity / StoryEntityPageLink:** per-book fiction entities and their page/chapter links (plugin-story-bible)
- **Article:** `content_type` (ContentTypeRegistry YAML), `article_metadata`, `content_json`, status, SEO, publications
- Also: Asset, BookTemplate, ChapterTemplate, BookPublishingState, BookFormatState, Author, A+ tables, `finance_*` (plugin-kdp)

## Plugins

| Plugin             | Tier    | Depends on | Description |
| ------------------ | ------- | ---------- | ----------- |
| plugin-export      | core    | -          | EPUB, PDF, write-book-template ZIP, async jobs with SSE |
| plugin-help        | core    | -          | In-app help, shortcuts, FAQ |
| plugin-getstarted  | core    | -          | Onboarding, example book |
| plugin-ms-tools    | core    | -          | Style checks, sanitization, metrics |
| plugin-audiobook   | core    | -          | TTS via manuscripta. Documented exception: plugin-export imports `bibliogon_audiobook.generator` (async + SSE does not fit the sync `export_execute` hook) |
| plugin-translation | core    | -          | DeepL/LMStudio translation |
| plugin-grammar     | core    | -          | LanguageTool |
| plugin-kinderbuch  | core    | export     | Picture-book pages |
| plugin-kdp         | core    | export     | KDP metadata, cover check, publishing wizard, report import + per-title margin (`/api/kdp/finance`) |
| plugin-comics      | core    | export     | Comic pages; imports `bibliogon_export.picture_book_pdf` directly (legitimate forward dep) |
| plugin-git-sync    | core    | -          | Git import + sync for write-book-template repos |
| plugin-medium-import | core  | -          | Medium HTML-export importer |
| plugin-learnset    | core    | export     | Book as adaptive-learner learn set (desktop-only) |
| plugin-promotion   | core    | -          | Per-format retail portfolio board (`/api/promotion`) |
| plugin-story-bible | core    | -          | Fiction-entity database + storyboard integration |
| plugin-aplus       | core    | -          | Amazon A+ Content; editing offline, AI fill desktop-only |

Plugin versions move with `make sync-versions`; do not hand-edit them.

## Core conventions

- TipTap JSON is the storage format (not HTML, not Markdown)
- i18n: every UI string in `backend/config/i18n/{lang}.yaml`, all catalogs in parity
- Python: type hints, Pydantic v2, SQLAlchemy 2.0; TypeScript: strict, no `any`
- Commits: English, conventional, issue first (`Closes #N`), no AI co-author, human git identity
- Gitflow (#79): branch from `develop`, PR to `develop`; only releases reach `main`
- E2E: `data-testid` selectors only
- Secrets never in committed config: `app.yaml` < `~/.config/bibliogon/secrets.yaml` < env vars (docs/configuration.md)

## Tests

- CI must stay green; heavy runs only on GitHub Actions. Counts: docs/audits/current-coverage.md
- `backend/tests/conftest.py` sets `BIBLIOGON_TEST=1`, an in-memory DB and a tmp `BIBLIOGON_DATA_DIR` before any `app.*` import; a `.bibliogon-production` marker aborts the run with exit 2. Never delete the marker; find out why a test saw real data.
- Paths only via `app.paths` helpers, never `Path("uploads")` or a frozen module-level import. Module-level caches need a `yield` fixture that clears them on both sides. Details: lessons-learned "Filesystem isolation" and "Module-level caches survive test boundaries".

## Related projects

- [pluginforge](https://github.com/astrapi69/pluginforge), [manuscripta](https://github.com/astrapi69/manuscripta), [write-book-template](https://github.com/astrapi69/write-book-template)

# Reviews

OpenAI Codex will review your output once you are done
