# API-Referenz - High-Level-Ueberblick

Bibliogon exponiert zwei API-Schichten: einen Kern mit CRUD-Endpoints
fuer Buecher, Kapitel, Assets und Systemfunktionen, und pro aktivem
Plugin einen eigenen Router unter dessen Prefix.

> **Quelle der Wahrheit:** Die exakte, aktuelle Endpoint-Liste inklusive
> Request- und Response-Schemas liefert die FastAPI-OpenAPI-Dokumentation
> im laufenden Backend:
>
> - Interaktiv: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)
> - JSON: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)
>
> Diese Datei hier ist nur ein High-Level-Ueberblick. Sie wird
> absichtlich nicht pro Endpoint gepflegt (Maintenance-Schuld) und
> wird nur bei groesseren strukturellen Aenderungen angefasst.

---

## Kern-API

Gruppen unter `backend/app/routers/` (Router-Prefix in Klammern):

| Router              | Prefix            | Aufgabe                                              |
| ------------------- | ----------------- | ---------------------------------------------------- |
| `books`             | `/api/books`      | Buecher CRUD, Trash, per-Buch Audio/ms-tools Config  |
| `chapters`          | `/api/books/{id}/chapters` | Kapitel CRUD und Reordering                 |
| `assets`            | `/api/books/{id}/assets` | Asset-Upload, Serving, Cover-Upload            |
| `audiobook`         | `/api`            | Audiobook-Persistenz, Engine-Config, Dry-Run          |
| `covers`            | `/api`            | Cover-Validierung und -Download                       |
| `backup`            | `/api/backup`     | `.bgb` Export/Restore, Smart-Import, `compare`        |
| `licenses`          | `/api/licenses`   | Lizenz-Aktivierung und -Verwaltung                    |
| `settings`          | `/api/settings`   | App-Settings, Plugin-Settings, Theme                  |
| `plugin_install`    | `/api/plugins`    | Plugin-ZIP Installation, Discovery, Health            |

Beispiele einzelner Endpoints (nicht erschoepfend):

- `GET /api/books` - Liste aller Buecher
- `PATCH /api/books/{id}` - Buch-Metadaten inklusive TTS-Settings,
  Audiobook-Overwrite-Flag, Audiobook-Skip-Chapter-Types und
  ms-tools per-Buch Schwellwerten
- `POST /api/books/{id}/chapters` - Kapitel anlegen
- `GET /api/backup/export` - Full-Data-Backup als `.bgb`
- `POST /api/backup/compare` - Zwei `.bgb`-Dateien vergleichen
- `POST /api/books/{id}/export/async/{fmt}` - Async-Export-Job starten
- `GET /api/export/jobs/{id}/stream` - Server-Sent Events Progress-Feed
- `POST /api/books/{id}/audiobook/dry-run` - Probe-Sample + Kosten-Preview

---

## Plugin-Router

Jedes aktive Plugin kann eigene Endpoints registrieren. Das Prefix ist
immer der Plugin-Name:

| Plugin         | Prefix              | Zweck                                         |
| -------------- | ------------------- | --------------------------------------------- |
| export         | `/api/books/{id}/export` + `/api/export/jobs` | EPUB/PDF/DOCX/HTML/Markdown/Project, Async-Jobs mit SSE |
| audiobook      | `/api/audiobook`    | Engine-Config (ElevenLabs, Google), Voices    |
| ms-tools       | `/api/ms-tools`     | Style-Checks, Sanitize, Readability, Metrics  |
| translation    | `/api/translation`  | DeepL + LMStudio, Buch- und Kapitel-Uebersetzung |
| grammar        | `/api/grammar`      | LanguageTool Check, Sprachen-Liste             |
| kdp            | `/api/kdp`          | KDP-Metadaten, Cover-Validierung, Changelog    |
| kinderbuch     | `/api/kinderbuch`   | Bild-pro-Seite Layouts                         |
| help           | `/api/help`         | Shortcuts, FAQ, In-App-Hilfe-Content           |
| getstarted     | `/api/get-started`  | Onboarding-Guide, Sample-Book                  |

Beispiele:

- `POST /api/export/async/audiobook` - Audiobook-Generierung als
  asynchroner Job starten (respektiert Book.audiobook_overwrite_existing
  und Book.audiobook_skip_chapter_types)
- `POST /api/ms-tools/check` - Style-Check mit per-Request Thresholds
  oder per-Buch Overrides ueber `book_id`
- `POST /api/audiobook/config/elevenlabs` - ElevenLabs-Key speichern
  und gegen die API validieren

---

## Error-Handling

Alle Endpoints nutzen die gemeinsame `BibliogonError`-Hierarchie. Der
globale Exception-Handler in `backend/app/main.py` mappt auf HTTP-Codes:

- `NotFoundError` -> 404
- `ValidationError` -> 400
- `ConflictError` -> 409 (z.B. `audiobook_exists` Confirm)
- `ExportError`, `PluginError` -> 500
- `ExternalServiceError` -> 502 (Pandoc, LanguageTool, TTS-Backends)

Im Debug-Mode (`BIBLIOGON_DEBUG=true`) liefert die Response zusaetzlich
einen `traceback`-Eintrag, den das Frontend in den "Issue melden"-Button
einbaut.
