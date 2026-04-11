# API reference - high-level overview

Bibliogon exposes two API layers: a core with CRUD endpoints for
books, chapters, assets and system functions, and one router per
active plugin under that plugin's prefix.

> **Source of truth:** the exact, current endpoint list including
> request and response schemas is provided by the FastAPI OpenAPI
> documentation in the running backend:
>
> - Interactive: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)
> - JSON: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)
>
> This file is only a high-level overview. It is intentionally not
> maintained per endpoint (maintenance debt) and is only touched on
> larger structural changes.

---

## Core API

Groups under `backend/app/routers/` (router prefix in parentheses):

| Router              | Prefix                                          | Purpose                                               |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `books`             | `/api/books`                                    | Book CRUD, trash, per-book audio/ms-tools config      |
| `chapters`          | `/api/books/{id}/chapters`                      | Chapter CRUD and reordering                           |
| `assets`            | `/api/books/{id}/assets`                        | Asset upload, serving, cover upload                   |
| `audiobook`         | `/api`                                          | Audiobook persistence, engine config, dry run         |
| `covers`            | `/api`                                          | Cover validation and download                         |
| `backup`            | `/api/backup`                                   | `.bgb` export/restore, smart import, `compare`        |
| `licenses`          | `/api/licenses`                                 | License activation and management                    |
| `settings`          | `/api/settings`                                 | App settings, plugin settings, theme                  |
| `plugin_install`    | `/api/plugins`                                  | Plugin ZIP installation, discovery, health            |

Example endpoints (not exhaustive):

- `GET /api/books` - list all books
- `PATCH /api/books/{id}` - book metadata including TTS settings,
  audiobook overwrite flag, audiobook skip chapter types and
  per-book ms-tools thresholds
- `POST /api/books/{id}/chapters` - create a chapter
- `GET /api/backup/export` - full-data backup as `.bgb`
- `POST /api/backup/compare` - compare two `.bgb` files
- `POST /api/books/{id}/export/async/{fmt}` - start an async export job
- `GET /api/export/jobs/{id}/stream` - Server-Sent Events progress feed
- `POST /api/books/{id}/audiobook/dry-run` - sample preview + cost preview

---

## Plugin routers

Every active plugin can register its own endpoints. The prefix is
always the plugin name:

| Plugin         | Prefix              | Purpose                                          |
| -------------- | ------------------- | ------------------------------------------------ |
| export         | `/api/books/{id}/export` + `/api/export/jobs` | EPUB/PDF/DOCX/HTML/Markdown/project, async jobs with SSE |
| audiobook      | `/api/audiobook`    | Engine config (ElevenLabs, Google), voices       |
| ms-tools       | `/api/ms-tools`     | Style checks, sanitize, readability, metrics     |
| translation    | `/api/translation`  | DeepL + LMStudio, book and chapter translation   |
| grammar        | `/api/grammar`      | LanguageTool check, language list                |
| kdp            | `/api/kdp`          | KDP metadata, cover validation, changelog        |
| kinderbuch     | `/api/kinderbuch`   | One-image-per-page layouts                       |
| help           | `/api/help`         | Shortcuts, FAQ, in-app help content              |
| getstarted     | `/api/get-started`  | Onboarding guide, sample book                    |

Examples:

- `POST /api/export/async/audiobook` - start audiobook generation as
  an async job (respects Book.audiobook_overwrite_existing and
  Book.audiobook_skip_chapter_types)
- `POST /api/ms-tools/check` - style check with per-request thresholds
  or per-book overrides via `book_id`
- `POST /api/audiobook/config/elevenlabs` - save the ElevenLabs key
  and validate it against the API

---

## Error handling

All endpoints use the shared `BibliogonError` hierarchy. The global
exception handler in `backend/app/main.py` maps to HTTP codes:

- `NotFoundError` -> 404
- `ValidationError` -> 400
- `ConflictError` -> 409 (e.g. `audiobook_exists` confirm)
- `ExportError`, `PluginError` -> 500
- `ExternalServiceError` -> 502 (Pandoc, LanguageTool, TTS backends)

In debug mode (`BIBLIOGON_DEBUG=true`) the response additionally
contains a `traceback` entry that the frontend embeds in the
"Report issue" button.
