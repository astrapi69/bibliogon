# Bibliogon

Open-source book authoring platform with WYSIWYG and Markdown editing, EPUB/PDF export via Pandoc.

## Status

**v0.1.0** - Backend MVP + Frontend MVP

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy, SQLite
- **Frontend:** React 18, TypeScript, TipTap, Vite
- **Export:** Pandoc (EPUB, PDF)
- **Tooling:** Poetry, npm, Docker

## Quickstart

### Backend

```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload
```

API-Docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

### Mit Docker

```bash
docker compose up --build
```

## API-Endpunkte

### Books

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | /api/books | Alle Buecher auflisten |
| POST | /api/books | Neues Buch anlegen |
| GET | /api/books/{id} | Buch mit Kapiteln laden |
| PATCH | /api/books/{id} | Buch-Metadaten aktualisieren |
| DELETE | /api/books/{id} | Buch loeschen |

### Chapters

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | /api/books/{id}/chapters | Kapitel auflisten |
| POST | /api/books/{id}/chapters | Neues Kapitel anlegen |
| GET | /api/books/{id}/chapters/{cid} | Kapitel laden |
| PATCH | /api/books/{id}/chapters/{cid} | Kapitel aktualisieren |
| DELETE | /api/books/{id}/chapters/{cid} | Kapitel loeschen |
| PUT | /api/books/{id}/chapters/reorder | Kapitelreihenfolge aendern |

### Export

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | /api/books/{id}/export/epub | EPUB exportieren |
| GET | /api/books/{id}/export/pdf | PDF exportieren |

## Lizenz

MIT
