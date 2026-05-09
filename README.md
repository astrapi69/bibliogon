# Bibliogon

Open-source self-publishing toolkit for authors. Books, articles, and multi-platform content workflows. Offline-first, plugin-based, EPUB / PDF / audiobook export.

Built on [PluginForge](https://github.com/astrapi69/pluginforge), a reusable plugin framework based on [pluggy](https://pluggy.readthedocs.io/).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[Documentation](https://astrapi69.github.io/bibliogon/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)** | Current version: **v0.29.0**

## Features

- WYSIWYG and Markdown editor (TipTap with 15 official + 1 community extension, 24 toolbar buttons)
- Full-book structure with chapter types for every section (Preface, Foreword, Prologue, Dedication, Part, Epilogue, Afterword, Index, Also by the Author, Excerpt, Call to Action, ...)
- Genre catalog for Novel, Non-Fiction, Technical, Biography, Poetry, Children, Fantasy, Thriller, Romance, Cookbook, Travel, and more
- Drag-and-drop chapter ordering with collapsible sections
- EPUB, PDF, Word, HTML, Markdown export via [manuscripta](https://github.com/astrapi69/manuscripta)
- Audiobook generation with 5 TTS engines (Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, ElevenLabs)
- Content-hash cache: unchanged chapters are not re-generated (saves money on paid engines)
- Cost estimation and savings tracking for paid TTS engines
- Dry-run mode: listen to a sample before committing to a full export
- Persistent audiobook storage with per-chapter and merged downloads
- Full-data backup and restore (.bgb) with images and optional audiobook files
- Book metadata: ISBN, ASIN, Publisher, Keywords, Cover, Custom CSS
- In-app help panel with Markdown rendering, search, and context-sensitive links
- Multi-provider AI assistant (Anthropic, OpenAI, Gemini, Mistral, LM Studio) with chapter review, marketing text generation, and context-aware suggestions
- Plugin system with ZIP installation for third-party plugins
- Encrypted credential storage (Fernet) for API keys and service accounts
- 6 themes (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) x Light/Dark
- i18n: German, English, Spanish, French, Greek, Portuguese, Turkish, Japanese
- Responsive layout with hamburger menu on mobile

## Article Authoring (Phase 2 - beta)

Beyond books, Bibliogon supports article authoring with multi-platform publication tracking.

- Dedicated article editor with TipTap (separate from the book editor, single-document, no chapter sidebar)
- Article-level metadata: topic (settings-managed), SEO title / description, tags, excerpt, canonical URL, featured image
- Per-platform publication tracking (Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, custom)
- Drift detection: the editor flags out-of-sync publications when article content changes after publish; a "Verify live" action re-snapshots the baseline
- Promo posts modeled as publications with the `is_promo` flag (short companion piece linking back to a main publication)
- Manual publishing workflow - no platform API integration yet (Phase 3 scope)

## Git Sync for Books

Books can be synchronized with external git repositories for collaboration, backup, and version control.

- **Import:** clone a public git repo containing a book in Bibliogon's WBT layout
- **Commit + Push:** save book changes back to the repo via SSH agent, system credential helper, or per-book PAT
- **Smart-Merge:** three-way diff with per-chapter conflict resolution UI for chapters edited both locally and remotely
- **Multi-Language:** repos with `main-XX` branches (e.g. `main-de`, `main-fr`) import as linked translations via `Book.translation_group_id`
- **Core-Git Bridge:** unified commit fans out to both core git history and the plugin-git-sync subsystem under a per-book lock

All three credential paths are user-configurable from the Git Backup dialog: SSH agent, system credential helper, and per-book PAT input (encrypted, never returned in clear).

## Multi-Book Backup Import

`.bgb` backup files containing multiple books can be imported with per-book selection (default-all-on) and per-book duplicate detection. The import wizard uses an XState v5 state machine to manage the multi-step flow with single-book and multi-book branches and a shared error boundary that reports details + opens a GitHub Issue on failure.

## Install and Run

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop or Docker Engine with Compose)

### One-liner

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
```

Both download Bibliogon to `~/bibliogon` (Linux/macOS) / `%USERPROFILE%\bibliogon` (Windows), build the Docker images, and start the app at **http://localhost:7880**.

### Double-click install (no terminal)

After cloning or downloading the repo, double-click the wrapper for your OS:

| Platform | File | Notes |
|---|---|---|
| macOS | `install.command` | Finder treats `.command` as runnable; on first run, Gatekeeper may prompt — right-click > Open to bypass |
| Windows | `install.cmd` | Wraps `install.ps1` with `-ExecutionPolicy Bypass` so corporate Windows with Group-Policy-locked ExecutionPolicy still runs the installer |
| Linux | `bash install.sh` | No special wrapper needed |

### Manual install

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

### Stop / Start / Uninstall

```bash
cd ~/bibliogon && ./stop.sh                      # Stop
cd ~/bibliogon && ./start.sh                      # Start again
cd ~/bibliogon && ./stop.sh && cd ~ && rm -rf ~/bibliogon  # Uninstall
```

## Development

```bash
make install    # Install all dependencies (Poetry, npm, plugins)
make dev        # Start backend (8000) + frontend (5173) in parallel
make test       # Run all tests (backend + plugins + frontend)
```

See [CLAUDE.md](CLAUDE.md) for full development documentation.

## Documentation

The documentation is available in two forms:

- **In-App:** Click the help icon in the navigation bar to open the slide-over help panel with search, navigation tree, and Markdown rendering.
- **Online:** [astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/) - MkDocs Material site with full-text search, light/dark mode, and i18n.

Both read from the same Markdown files in `docs/help/`. To build the docs locally:

```bash
make docs-install   # Install MkDocs dependencies (separate venv)
make docs-serve     # Serve at http://localhost:8000 with hot-reload
```

## Architecture

```
Browser --> nginx (static files + /api proxy) --> FastAPI (uvicorn)
                                                    |
                                              PluginForge
                                                    |
                              +----------+----------+----------+
                              |          |          |          |
                           Export     Help    Audiobook      ...
```

- **Frontend:** React 18, TypeScript, TipTap, Vite, Radix UI, @dnd-kit, react-markdown
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **Plugins:** PluginForge (PyPI), pluggy-based, YAML-configured
- **Export:** manuscripta ^0.9.0 (PyPI), Pandoc, [write-book-template](https://github.com/astrapi69/write-book-template)
- **TTS:** manuscripta adapter layer with 5 engines (Edge TTS, Google Cloud, gTTS, pyttsx3, ElevenLabs)

## Plugins

| Plugin | License | Description |
|--------|---------|-------------|
| export | MIT | EPUB, PDF, Word, HTML, Markdown, Project ZIP |
| help | MIT | In-app help panel with docs, search, shortcuts |
| getstarted | MIT | Onboarding guide, sample book |
| ms-tools | MIT | Style checks, sanitization, text metrics |
| audiobook | MIT | TTS audiobook generation (5 engines) |
| translation | MIT | DeepL / LMStudio translation |
| grammar | MIT | LanguageTool grammar checking |
| kinderbuch | MIT | Children's book page layout |
| kdp | MIT | Amazon KDP metadata, cover validation |
| git-sync | MIT | Book-as-git-repo: import, commit, smart-merge, multi-language linking |

Third-party plugins can be installed as ZIP files via Settings > Plugins.

## Configuration

Three-layer config: project `app.yaml` (defaults) ← user override file
(`~/.config/bibliogon/secrets.yaml`, gitignored) ← env-vars (CI/Docker).
Override-wins, env-vars always highest priority. Detailed guide:
[docs/configuration.md](docs/configuration.md).

Move secrets like `ai.api_key` out of project `app.yaml` into the
override file or `BIBLIOGON_AI_API_KEY` env-var. The Settings UI
hides the API-key input automatically when an override is active.

Environment variables (set in `.env` or shell):

| Variable | Default | Description |
|----------|---------|-------------|
| `BIBLIOGON_PORT` | 7880 | Port for the web app |
| `BIBLIOGON_DEBUG` | false | Debug mode (enables test endpoints, API docs) |
| `BIBLIOGON_AI_API_KEY` | (unset) | Overrides `ai.api_key` from any yaml layer |
| `BIBLIOGON_SECRET_KEY` | (generated) | Secret for license validation |
| `BIBLIOGON_CREDENTIALS_SECRET` | (generated) | Secret for encrypting API keys and service account files |
| `BIBLIOGON_CORS_ORIGINS` | localhost:7880 | Allowed CORS origins |
| `BIBLIOGON_DATA_DIR` | platformdirs default | Root directory for runtime data (DB, uploads). Linux/macOS: `~/.local/share/bibliogon/`. Windows: `%LOCALAPPDATA%\bibliogon\`. Docker: `/app/data` |
| `BIBLIOGON_DB_PATH` | (no longer honoured) | **Removed in v0.30.0** (DEP-DBPATH-01 step 3). The variable has no effect on path resolution; if still set in the environment, a single warning is logged at startup naming the ignored value. Set `BIBLIOGON_DATA_DIR` instead — the database resolves to `<BIBLIOGON_DATA_DIR>/bibliogon.db`. Deprecation timeline: warning v0.27.0, precedence flip v0.28.0, removal v0.30.0. |

## Related Projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Book export pipeline with TTS adapter layer (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Target directory structure for export

## License

Bibliogon is released under the [MIT License](LICENSE).
All plugins are free and open source.

## Reporting Security Issues

See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Reports go to asterios.raptis@web.de.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, workflow, and expectations.

## Issue Templates

Use the appropriate template when opening a new issue:
- [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml)
- [Question](.github/ISSUE_TEMPLATE/question.yml)