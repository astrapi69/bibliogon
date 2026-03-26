# Bibliogon

Open-source book authoring platform. Aufgebaut auf PluginForge, einem wiederverwendbaren Plugin-Framework basierend auf pluggy. Der gesamte Export ist selbst ein Plugin. Offline-faehig, i18n-ready, local-first.

**Repository:** https://github.com/astrapi69/bibliogon
**Konzept:** docs/CONCEPT.md

## Architektur (Zwei-Schichten)

1. **PluginForge** (eigenes Paket, basiert auf pluggy)
   - PluginManager: wraps pluggy + YAML-Config + Lifecycle + Dependency Resolution
   - FastAPI-Router-Integration, Alembic-Migration-Support
   - i18n ueber YAML (config/i18n/{lang}.yaml)
   - Anwendungsunabhaengig, jeder kann es nutzen

2. **Bibliogon App** (dieses Repo)
   - Schlanker Kern: UI, Editor, Book/Chapter CRUD, Backup
   - Alles Weitere via Plugins: Export, Kinderbuch, Audiobook, KDP

## Tech Stack

- **PluginForge:** Python 3.11+, pluggy, PyYAML
- **Backend:** FastAPI, SQLAlchemy, SQLite
- **Frontend:** React 18, TypeScript, TipTap (JSON-Format), Vite
- **Export-Plugin:** Pandoc, write-book-template Struktur
- **Tooling:** Poetry, npm, Docker, Make

## Projekt starten

```bash
make install   # Poetry install + npm install
make dev       # Backend (8000) + Frontend (5173) parallel
make test      # pytest
```

## Verzeichnisstruktur

```
bibliogon/
├── backend/
│   ├── app/
│   │   ├── main.py, database.py
│   │   ├── models/, schemas/, routers/, services/
│   ├── config/
│   │   ├── app.yaml             # App-Konfiguration
│   │   ├── plugins/             # Plugin-YAML-Dateien
│   │   └── i18n/                # Sprachdateien (de.yaml, en.yaml)
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── components/, pages/, styles/
│   ├── package.json, vite.config.ts
├── docs/CONCEPT.md
├── Makefile
├── docker-compose.yml, docker-compose.prod.yml
└── README.md
```

## Konventionen

- Python mit Typehints, TypeScript ohne `any`
- Keine Em-Dashes (--), stattdessen Bindestriche (-) oder Kommata
- Commit Messages: Englisch, konventionell (feat/fix/refactor/docs)
- Konfigurierbare Werte in YAML, nicht hartcodiert
- i18n: Alle UI-Strings in config/i18n/{lang}.yaml
- Internes Speicherformat: TipTap JSON (nicht HTML)
- SQLAlchemy 2.0 Mapped Columns, Pydantic v2

## Datenmodell

Book: id, title, subtitle, author, language, series, series_index, description, created_at, updated_at
Chapter: id, book_id (FK), title, content (TipTap JSON), position, created_at, updated_at

## Naechste Schritte

Phase 2 - PluginForge:
- Eigenes Repo, basiert auf pluggy
- PluginManager, YAML-Config, Lifecycle, FastAPI-Integration
- PyPI veroeffentlichen

Phase 3 - Export als Plugin:
- bibliogon-plugin-export
- TipTap-JSON als Speicherformat
- TipTap-JSON -> Markdown Konvertierung
- write-book-template Verzeichnisstruktur
- i18n (DE, EN)

Details: docs/CONCEPT.md
