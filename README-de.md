# Bibliogon

Open-source book authoring platform. Write, organize, and export books as EPUB, PDF, or project structures - offline-first, plugin-based, with Dark Mode.

Built on [PluginForge](https://github.com/astrapi69/pluginforge), a reusable plugin framework based on [pluggy](https://pluggy.readthedocs.io/).

## Features

- WYSIWYG and Markdown editor (TipTap)
- 13 chapter types (Preface, Foreword, Epilogue, Appendix, ...)
- Drag-and-drop chapter ordering
- EPUB, PDF, Word, HTML, Markdown export via [manuscripta](https://github.com/astrapi69/manuscripta)
- Full-data backup and restore (.bgb), project import (.bgp, .zip)
- Book metadata: ISBN, ASIN, Publisher, Keywords, Cover, Custom CSS
- Copy config between books (publisher, author bio, styles)
- Plugin system with ZIP installation for third-party plugins
- 3 themes (Warm Literary, Cool Modern, Nord) x Light/Dark
- i18n: German, English, Spanish, French, Greek
- In-app help with FAQ and keyboard shortcuts
- Get Started guide with sample book

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

### View Logs

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## Development

```bash
make install    # Install all dependencies (Poetry, npm, plugins)
make dev        # Start backend (8000) + frontend (5173) in parallel
make test       # Run all tests (backend + plugins)
```

See [CLAUDE.md](CLAUDE.md) for full development documentation.

## Architecture

```
Browser --> nginx (static files + /api proxy) --> FastAPI (uvicorn)
                                                    |
                                              PluginForge
                                                    |
                              +----------+----------+----------+
                              |          |          |          |
                           Export     Help    GetStarted    ...
```

- **Frontend:** React 18, TypeScript, TipTap, Vite, Radix UI, @dnd-kit
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **Plugins:** PluginForge (PyPI), pluggy-based, YAML-configured
- **Export:** manuscripta (PyPI), Pandoc, [write-book-template](https://github.com/astrapi69/write-book-template) structure

## Plugins

| Plugin | License | Description |
|--------|---------|-------------|
| export | MIT | EPUB, PDF, Word, HTML, Markdown, Project ZIP |
| help | MIT | In-app help, shortcuts, FAQ |
| getstarted | MIT | Onboarding guide, sample book |
| kinderbuch | MIT | Children's book page layout (4 templates) |
| kdp | MIT | Amazon KDP metadata, cover validation |
| grammar | MIT | LanguageTool grammar checking |

Third-party plugins can be installed as ZIP files via Settings > Plugins.

## Configuration

Environment variables (set in `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BIBLIOGON_PORT` | 8080 | Port for the web app |
| `BIBLIOGON_DEBUG` | false | Debug mode (enables test endpoints, API docs) |
| `BIBLIOGON_SECRET_KEY` | (generated) | Secret for license validation |
| `BIBLIOGON_CORS_ORIGINS` | localhost:8080 | Allowed CORS origins |
| `BIBLIOGON_DB_PATH` | /app/data/bibliogon.db | SQLite database path |

## Related Projects

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Book export pipeline (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Target directory structure for export

## License

MIT. Alle Plugins sind kostenlos und Open Source.
