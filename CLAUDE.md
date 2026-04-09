# Bibliogon

Open-source book authoring platform. Aufgebaut auf PluginForge (PyPI), einem wiederverwendbaren Plugin-Framework basierend auf pluggy. Offline-faehig, i18n-ready, local-first, Freemium-Modell.

- **Repository:** https://github.com/astrapi69/bibliogon
- **Version:** 0.10.0 (Phase 9 abgeschlossen, Naechste: Phase 10 Multi-User/SaaS)
- **Konzept:** docs/CONCEPT.md
- **API-Referenz:** docs/API.md (alle Endpunkte)
- **Verlauf:** docs/CHANGELOG.md (erledigte Phasen), docs/ROADMAP.md (offene Punkte)

## Entwicklungsrichtlinien

Detaillierte Regeln liegen in `.claude/rules/`. Claude Code liest sie bei Bedarf selbststaendig.

**Immer relevant** (bei jedem Feature/Fix lesen):
- `architecture.md` - Schichtenmodell, Plugin-Struktur, UI-Strategie, Datenfluss
- `coding-standards.md` - Benennung, Funktionsdesign, Tests, Dependencies

**On-Demand** (bei spezifischen Aufgaben lesen):
- `code-hygiene.md` - Linting, Pre-Commit, Error-Handling Architektur, API-Konventionen
- `lessons-learned.md` - Bekannte Fallstricke (TipTap, Import, Export, Deployment)
- `quality-checks.md` - Teststrategie, mutmut/Stryker, Checklisten vor dem Commit
- `ai-workflow.md` - Reihenfolge bei Features/Plugins, Verbote, Doku-Protokoll

Bei Widerspruch zwischen CLAUDE.md und Rules gelten die Rules.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0, SQLite, Pydantic v2, Poetry
- **Frontend:** React 18, TypeScript (strict), TipTap (15+1 Extensions), Vite, Radix UI, @dnd-kit, Lucide, react-toastify
- **Plugins:** pluginforge ^0.5.0 (PyPI), Entry Points, YAML-Config
- **Export:** manuscripta ^0.6.0 (PyPI), Pandoc, write-book-template Struktur
- **Testing:** pytest, Vitest, Playwright, mutmut, Stryker
- **Tooling:** Poetry, npm, Docker, Make, ruff, ESLint, Prettier, pre-commit

## Architektur (Kurz)

4 Schichten: Frontend -> Backend -> PluginForge -> Plugins. Details in `.claude/rules/architecture.md`.

Schlanker Kern (UI, Editor, CRUD, Backup). Alles weitere via Plugins. Freemium: `license_tier = "core"` (MIT) oder `"premium"` (HMAC-signierte Keys, offline validierbar).

## Befehle

```bash
make install              # Poetry + npm + Plugins
make dev                  # Backend (8000) + Frontend (5173) parallel
make dev-bg / dev-down    # Hintergrund-Modus
make test                 # Alle Tests (Backend + Plugins + Frontend)
make test-backend         # Nur Backend
make test-plugins         # Alle Plugin-Tests
make test-frontend        # Vitest
make prod                 # Docker Compose (Port 7880)
make prod-down            # Docker stoppen
make generate-trial-key   # 30-Tage Trial-Key fuer alle Premium-Plugins
make clean                # Build-Artefakte entfernen
make help                 # Alle Targets
```

Plugin-spezifisch: `make test-plugin-{export,grammar,kdp,kinderbuch,ms-tools,audiobook,translation}`

## Session-Start (Claude Code)

1. `git log --oneline -10` - Letzte Aenderungen
2. `docs/ROADMAP.md` lesen - Aktueller Stand
3. `make test` - Baseline gruen

## Datenmodell (Kurz)

- **Book:** id, title, subtitle, author, language, series, series_index, description, Publishing (ISBN/ASIN/Publisher/Edition), Marketing (keywords, html_description, backpage), Design (cover_image, custom_css)
- **Chapter:** id, book_id, title, content (TipTap JSON), position, chapter_type
- **Asset:** id, book_id, filename, asset_type (cover/figure/diagram/table), path

**ChapterType:** chapter, preface, foreword, acknowledgments, about_author, appendix, bibliography, glossary, epilogue, imprint, next_in_series, part_intro, interlude, toc

## Plugins

| Plugin             | Tier    | Abhaengigkeit | Beschreibung                        |
| ------------------ | ------- | ------------- | ----------------------------------- |
| plugin-export      | core    | -             | EPUB, PDF, write-book-template ZIP  |
| plugin-help        | core    | -             | In-App Hilfe, Shortcuts, FAQ        |
| plugin-getstarted  | core    | -             | Onboarding, Beispielbuch            |
| plugin-ms-tools    | core    | -             | Stil-Checks, Sanitization, Metriken |
| plugin-audiobook   | premium | export        | TTS Audiobook-Generierung           |
| plugin-translation | premium | -             | DeepL/LMStudio Uebersetzung         |
| plugin-grammar     | premium | -             | LanguageTool Grammatikpruefung      |
| plugin-kinderbuch  | premium | export        | Bild-pro-Seite Layout (geplant)     |
| plugin-kdp         | premium | export        | KDP-Metadaten (geplant)             |

## Verzeichnisstruktur (Kurz)

```
bibliogon/
├── backend/app/           # FastAPI Kern (main, database, hookspecs, licensing, models, routers, services)
├── backend/config/        # app.yaml, plugins/, i18n/ (8 Sprachen)
├── backend/tests/         # Backend Tests
├── plugins/               # Plugin-Pakete (bibliogon-plugin-{name})
│   └── installed/         # Dynamisch via ZIP installierte Plugins
├── frontend/src/
│   ├── api/client.ts      # Typed API Client
│   ├── components/        # Editor, Toolbar, ChapterSidebar, Dialoge
│   ├── pages/             # Dashboard, BookEditor, Settings, Help, GetStarted
│   └── styles/global.css  # CSS Variables, 3 Themes x Light/Dark
├── docs/                  # CONCEPT.md, ROADMAP.md, CHANGELOG.md
└── Makefile, docker-compose.yml, docker-compose.prod.yml
```

## Kern-Konventionen

- TipTap JSON als internes Speicherformat (NICHT HTML, NICHT Markdown)
- i18n: 8 Sprachen (DE, EN, ES, FR, EL, PT, TR, JA), alle UI-Strings in config/i18n/{lang}.yaml
- Python: Typehints, snake_case, Pydantic v2, SQLAlchemy 2.0 Mapped Columns
- TypeScript: strict mode, kein `any`, Radix UI fuer Primitives
- CSS: Custom Properties, Dark Mode via [data-theme="dark"]
- Plugins: eigenstaendige Pakete unter plugins/, depends_on als Klassen-Attribut, license_tier (core/premium)
- Export: manuscripta (PyPI), Plugin-Config in export.yaml ist 1:1 manuscripta Format
- Commits: Englisch, konventionell (feat/fix/refactor/docs)

## Tests (303 total)

- Backend: 78 | Plugins: 125 | Vitest: 50 | Playwright E2E: 52
- Plugin-Details: export 30, ms-tools 53, translation 35, audiobook 32, kdp 10, kinderbuch 8, grammar 7

## Verwandte Projekte

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin-Framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Buch-Export-Pipeline (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Ziel-Verzeichnisstruktur fuer Export
