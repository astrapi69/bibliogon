# Bibliogon

Open-source book authoring platform. Web-UI zum Schreiben und Exportieren von Buechern, basierend auf der write-book-template Verzeichnisstruktur.

**Repository:** https://github.com/astrapi69/bibliogon
**Konzept:** docs/CONCEPT.md

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy, SQLite (backend/)
- **Frontend:** React 18, TypeScript, TipTap Editor, Vite (frontend/)
- **Export:** Pandoc (EPUB, PDF), write-book-template Projektstruktur
- **Tooling:** Poetry (Backend), npm (Frontend), Docker, Make

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
│   │   ├── models/              # Book, Chapter (SQLAlchemy)
│   │   ├── schemas/             # Pydantic Request/Response
│   │   ├── routers/             # books.py, chapters.py, export.py
│   │   └── services/            # export_service.py (Pandoc)
│   ├── tests/
│   └── pyproject.toml           # Poetry, package-mode = false
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # REST-Client + TypeScript-Typen
│   │   ├── components/          # BookCard, ChapterSidebar, Editor, Toolbar, CreateBookModal
│   │   ├── pages/               # Dashboard.tsx, BookEditor.tsx
│   │   └── styles/global.css    # Design-System (Crimson Pro, DM Sans, JetBrains Mono)
│   ├── package.json
│   └── vite.config.ts           # Proxy /api -> localhost:8000
├── docs/
│   └── CONCEPT.md               # Gesamtkonzept und Roadmap
├── Makefile
├── docker-compose.yml           # Dev
├── docker-compose.prod.yml      # Produktion
└── README.md
```

## Konventionen

- Backend-Code in Python, Typehints ueberall
- Frontend in TypeScript, keine `any`-Typen
- Keine Em-Dashes (--) in Texten, stattdessen Bindestriche (-) oder Kommata
- Commit Messages auf Englisch, konventionelle Commits (feat/fix/refactor/docs)
- API-Prefix: /api/
- Datenbank-Modelle nutzen SQLAlchemy 2.0 Mapped Columns
- Pydantic v2 Schemas mit model_config = ConfigDict(from_attributes=True)

## API-Endpunkte

- GET/POST /api/books - Liste/Erstellen
- GET/PATCH/DELETE /api/books/{id} - Einzelnes Buch
- GET/POST /api/books/{id}/chapters - Kapitel Liste/Erstellen
- GET/PATCH/DELETE /api/books/{id}/chapters/{cid} - Einzelnes Kapitel
- PUT /api/books/{id}/chapters/reorder - Reihenfolge aendern
- GET /api/books/{id}/export/{epub|pdf} - Export

## Datenmodell

Book: id, title, subtitle, author, language, series, series_index, description, created_at, updated_at
Chapter: id, book_id (FK), title, content (HTML), position, created_at, updated_at

## Naechste Schritte (Phase 2)

Siehe docs/CONCEPT.md Abschnitt 5, Phase 2: write-book-template Integration
- Export-Service umbauen auf Verzeichnisstruktur-Scaffolding
- ZIP-Export der kompletten Projektstruktur
- metadata.yaml Generierung
- HTML-zu-Markdown Konvertierung beim Export
- Neuer Endpoint: GET /api/books/{id}/export/project

## Verwandtes Projekt

Das write-book-template (github.com/astrapi69/write-book-template) definiert die Ziel-Verzeichnisstruktur fuer den Export. Bibliogon generiert diese Struktur aus den Datenbank-Inhalten.
