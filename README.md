# Bibliogon

Open-source book authoring platform. Write, organize, and export books as EPUB, PDF, or audiobook - offline-first, plugin-based, with Dark Mode.

Built on [PluginForge](https://github.com/astrapi69/pluginforge), a reusable plugin framework based on [pluggy](https://pluggy.readthedocs.io/).

**[Documentation](https://astrapi69.github.io/bibliogon/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)**

## Features

- WYSIWYG and Markdown editor (TipTap with 15 extensions, 24 toolbar buttons)
- 26 chapter types (Preface, Foreword, Prologue, Dedication, Part, Epilogue, Afterword, Final Thoughts, Also by the Author, Excerpt, Call to Action, ...)
- 16 book genres (Novel, Non-Fiction, Technical, Biography, Poetry, ...)
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
- Plugin system with ZIP installation for third-party plugins
- Offline license validation for premium plugins (HMAC-SHA256)
- Encrypted credential storage (Fernet) for API keys and service accounts
- 3 themes (Warm Literary, Cool Modern, Nord) x Light/Dark
- i18n: German, English, Spanish, French, Greek, Portuguese, Turkish, Japanese
- Responsive layout with hamburger menu on mobile

## Install and Run

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop or Docker Engine with Compose)

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

This downloads Bibliogon to `~/bibliogon`, builds the Docker images, and starts the app at **http://localhost:7880**.

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
- **Export:** manuscripta ^0.7.0 (PyPI), Pandoc, [write-book-template](https://github.com/astrapi69/write-book-template)
- **TTS:** manuscripta adapter layer with 5 engines (Edge TTS, Google Cloud, gTTS, pyttsx3, ElevenLabs)

## Plugins

| Plugin | License | Description |
|--------|---------|-------------|
| export | MIT | EPUB, PDF, Word, HTML, Markdown, Project ZIP |
| help | MIT | In-app help panel with docs, search, shortcuts |
| getstarted | MIT | Onboarding guide, sample book |
| ms-tools | MIT | Style checks, sanitization, text metrics |
| audiobook | Proprietary | TTS audiobook generation (5 engines) |
| translation | Proprietary | DeepL / LMStudio translation |
| grammar | Proprietary | LanguageTool grammar checking |
| kinderbuch | Proprietary | Children's book page layout |
| kdp | Proprietary | Amazon KDP metadata, cover validation |

Third-party plugins can be installed as ZIP files via Settings > Plugins.

## Configuration

Environment variables (set in `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BIBLIOGON_PORT` | 7880 | Port for the web app |
| `BIBLIOGON_DEBUG` | false | Debug mode (enables test endpoints, API docs) |
| `BIBLIOGON_SECRET_KEY` | (generated) | Secret for license validation |
| `BIBLIOGON_CREDENTIALS_SECRET` | (generated) | Secret for encrypting API keys and service account files |
| `BIBLIOGON_CORS_ORIGINS` | localhost:7880 | Allowed CORS origins |
| `BIBLIOGON_DB_PATH` | /app/data/bibliogon.db | SQLite database path |

## Related Projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Book export pipeline with TTS adapter layer (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Target directory structure for export

## License

MIT (Core + free plugins). Premium plugins are proprietary.
