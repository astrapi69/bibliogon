# Bibliogon

Open-source book authoring platform. Aufgebaut auf PluginForge, einem wiederverwendbaren Plugin-Framework. Der gesamte Export (EPUB, PDF, write-book-template) ist selbst ein Plugin.

**Repository:** https://github.com/astrapi69/bibliogon
**Konzept:** docs/CONCEPT.md

## Zwei-Schichten-Architektur

1. **PluginForge** - Anwendungsunabhaengiges Plugin-Framework (eigenes Paket/Repo)
   - BasePlugin, HookRegistry, PluginLoader
   - YAML-Konfiguration (alles anpassbar: Titel, Labels, Einstellungen)
   - Entry Point Discovery, Plugin-Lifecycle
   - Kann von beliebigen Python-Anwendungen genutzt werden

2. **Bibliogon App** - Buch-Autoren-Plattform (dieses Repo)
   - Schlanker Kern: UI, Editor, Book/Chapter CRUD
   - Alles Weitere ueber Plugins: Export, Kinderbuch, Audiobook, KDP

## Tech Stack

- **PluginForge:** Python 3.11+, YAML, Entry Points
- **Backend:** FastAPI, SQLAlchemy, SQLite
- **Frontend:** React 18, TypeScript, TipTap, Vite
- **Export-Plugin:** Pandoc, write-book-template Struktur
- **Tooling:** Poetry, npm, Docker, Make

## Projekt starten

```bash
make install   # Poetry install + npm install
make dev       # Backend (Port 8000) + Frontend (Port 5173) parallel
make test      # pytest im Backend
```

## Verzeichnisstruktur

```
bibliogon/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI Entry
│   │   ├── database.py          # SQLAlchemy + SQLite
│   │   ├── models/              # Book, Chapter
│   │   ├── schemas/             # Pydantic Request/Response
│   │   ├── routers/             # books.py, chapters.py, export.py
│   │   └── services/            # export_service.py (wird Plugin in Phase 3)
│   ├── config/
│   │   ├── app.yaml             # App-Konfiguration (geplant)
│   │   └── plugins/             # Plugin-YAML-Dateien (geplant)
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # REST-Client + TypeScript-Typen
│   │   ├── components/          # BookCard, ChapterSidebar, Editor, Toolbar, CreateBookModal
│   │   ├── pages/               # Dashboard.tsx, BookEditor.tsx
│   │   └── styles/global.css
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   └── CONCEPT.md               # Gesamtkonzept und Roadmap
├── Makefile
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

## Konventionen

- Backend-Code in Python, Typehints ueberall
- Frontend in TypeScript, keine `any`-Typen
- Keine Em-Dashes (--) in Texten, stattdessen Bindestriche (-) oder Kommata
- Commit Messages auf Englisch, konventionelle Commits (feat/fix/refactor/docs)
- API-Prefix: /api/
- SQLAlchemy 2.0 Mapped Columns
- Pydantic v2 mit ConfigDict(from_attributes=True)
- Alle konfigurierbaren Werte in YAML, nicht hartcodiert

## API-Endpunkte

- GET/POST /api/books
- GET/PATCH/DELETE /api/books/{id}
- GET/POST /api/books/{id}/chapters
- GET/PATCH/DELETE /api/books/{id}/chapters/{cid}
- PUT /api/books/{id}/chapters/reorder
- GET /api/books/{id}/export/{epub|pdf|project}

## Datenmodell

Book: id, title, subtitle, author, language, series, series_index, description, created_at, updated_at
Chapter: id, book_id (FK), title, content (HTML), position, created_at, updated_at

## Naechste Schritte

Phase 2 - PluginForge Framework:
- Eigenes Repo/Paket: BasePlugin, HookRegistry, PluginLoader
- YAML-Konfigurationssystem
- Entry Point Discovery
- Bibliogon-Backend auf PluginForge umstellen

Phase 3 - Export als Plugin:
- bibliogon-plugin-export als erstes Plugin implementieren
- write-book-template Verzeichnisstruktur
- HTML-zu-Markdown Konvertierung
- Alten fest verdrahteten Export-Code entfernen

Details: docs/CONCEPT.md

## Verwandtes Projekt

write-book-template (github.com/astrapi69/write-book-template) definiert die
Ziel-Verzeichnisstruktur fuer den Export. Das Export-Plugin generiert diese
Struktur aus den Datenbank-Inhalten.
