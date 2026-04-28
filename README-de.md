# Bibliogon

Open-Source-Toolkit fuer Self-Publishing-Autorinnen und -Autoren. Buecher, Artikel und Multi-Plattform-Content-Workflows. Offline-zuerst, Plugin-basiert, EPUB- / PDF- / Hoerbuch-Export.

Aufgebaut auf [PluginForge](https://github.com/astrapi69/pluginforge), einem wiederverwendbaren Plugin-Framework auf Basis von [pluggy](https://pluggy.readthedocs.io/).

**[Dokumentation](https://astrapi69.github.io/bibliogon/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)** | Aktuelle Version: **v0.24.0**

## Funktionen

- WYSIWYG- und Markdown-Editor (TipTap mit 15 offiziellen + 1 Community-Erweiterung, 24 Toolbar-Buttons)
- Komplette Buchstruktur mit Kapiteltypen fuer jeden Abschnitt (Vorwort, Geleitwort, Prolog, Widmung, Teil, Epilog, Nachwort, Index, Auch vom Autor, Leseprobe, Call to Action, ...)
- Genre-Katalog fuer Roman, Sachbuch, Fachbuch, Biografie, Lyrik, Kinderbuch, Fantasy, Thriller, Liebesroman, Kochbuch, Reise und mehr
- Drag-and-Drop-Kapitelreihenfolge mit klappbaren Abschnitten
- EPUB-, PDF-, Word-, HTML-, Markdown-Export ueber [manuscripta](https://github.com/astrapi69/manuscripta)
- Hoerbuch-Erzeugung mit 5 TTS-Engines (Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, ElevenLabs)
- Content-Hash-Cache: unveraenderte Kapitel werden nicht neu erzeugt (spart Geld bei kostenpflichtigen Engines)
- Kostenschaetzung und Ersparnis-Tracking fuer kostenpflichtige TTS-Engines
- Dry-Run-Modus: Probehoeren vor dem vollstaendigen Export
- Persistente Hoerbuch-Speicherung mit Pro-Kapitel- und Gesamt-Downloads
- Voll-Backup und -Restore (.bgb) inkl. Bilder und optional Hoerbuch-Dateien
- Buch-Metadaten: ISBN, ASIN, Verlag, Keywords, Cover, Custom CSS
- In-App-Hilfe mit Markdown-Rendering, Suche und kontextsensitiven Links
- Multi-Provider-KI-Assistent (Anthropic, OpenAI, Gemini, Mistral, LM Studio) fuer Kapitel-Review, Marketing-Texte und kontextbewusste Vorschlaege
- Plugin-System mit ZIP-Installation fuer Drittanbieter-Plugins
- Verschluesselte Anmeldedaten-Ablage (Fernet) fuer API-Keys und Service-Account-Dateien
- 6 Themes (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) x Hell/Dunkel
- i18n: Deutsch, Englisch, Spanisch, Franzoesisch, Griechisch, Portugiesisch, Tuerkisch, Japanisch
- Responsives Layout mit Hamburger-Menue auf Mobilgeraeten

## Artikel-Autorenschaft (Phase 2 - beta)

Neben Buechern unterstuetzt Bibliogon Artikel-Autorenschaft mit Multi-Plattform-Publikations-Tracking.

- Dedizierter Artikel-Editor mit TipTap (getrennt vom Buch-Editor, Einzeldokument, ohne Kapitel-Sidebar)
- Artikel-Metadaten: Thema (einstellungsverwaltet), SEO-Titel / -Beschreibung, Tags, Auszug, kanonische URL, Featured Image
- Pro-Plattform-Publikations-Tracking (Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, custom)
- Drift-Erkennung: der Editor markiert nicht-synchronisierte Publikationen, wenn der Artikel-Inhalt nach der Veroeffentlichung geaendert wurde; eine "Live bestaetigen"-Aktion setzt den Vergleich zurueck
- Promo-Posts als Publications mit `is_promo`-Flag (kurze Begleitbeitraege, die auf eine Hauptpublikation verlinken)
- Manueller Publikations-Workflow - noch keine Plattform-API-Integration (Phase-3-Scope)

## Git-Sync fuer Buecher

Buecher koennen mit externen Git-Repositories synchronisiert werden - fuer Kollaboration, Backup und Versionskontrolle.

- **Import:** Klonen eines oeffentlichen Git-Repos mit einem Buch im WBT-Layout
- **Commit + Push:** Buchaenderungen via SSH-Agent, System-Credential-Helper oder pro-Buch-PAT zurueck ins Repo schreiben
- **Smart-Merge:** Drei-Wege-Diff mit Konfliktloesungs-UI pro Kapitel, wenn Kapitel sowohl lokal als auch remote bearbeitet wurden
- **Mehrsprachig:** Repos mit `main-XX`-Branches (z.B. `main-de`, `main-fr`) werden ueber `Book.translation_group_id` als verknuepfte Uebersetzungen importiert
- **Core-Git-Bruecke:** Ein Commit fliesst sowohl in die Core-Git-Historie als auch in das plugin-git-sync-Subsystem (unter einem Pro-Buch-Lock)

PAT-via-UI ist teilweise verschoben. SSH und der System-Credential-Helper funktionieren heute; PAT-Eingabe ueber die UI kommt in v0.24.x.

## Multi-Buch-Backup-Import

`.bgb`-Backup-Dateien mit mehreren Buechern lassen sich mit Pro-Buch-Auswahl (Standard: alle ausgewaehlt) und Pro-Buch-Duplikatserkennung importieren. Der Import-Wizard verwendet eine XState-v5-State-Machine fuer den Mehrschritt-Flow mit Einzel- und Mehrbuch-Zweigen sowie einer gemeinsamen Error-Boundary, die im Fehlerfall Details meldet und ein GitHub-Issue oeffnet.

## Installation und Start

### Voraussetzungen

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop oder Docker Engine mit Compose)

### One-Liner

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

Das laedt Bibliogon nach `~/bibliogon`, baut die Docker-Images und startet die App auf **http://localhost:7880**.

### Manuelle Installation

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
./start.sh
```

### Stop / Start / Deinstallation

```bash
cd ~/bibliogon && ./stop.sh                                  # Stop
cd ~/bibliogon && ./start.sh                                  # Erneut starten
cd ~/bibliogon && ./stop.sh && cd ~ && rm -rf ~/bibliogon    # Deinstallation
```

### Logs ansehen

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## Entwicklung

```bash
make install    # Alle Abhaengigkeiten installieren (Poetry, npm, Plugins)
make dev        # Backend (8000) + Frontend (5173) parallel starten
make test       # Alle Tests ausfuehren (Backend + Plugins + Frontend)
```

Vollstaendige Entwicklungsdokumentation siehe [CLAUDE.md](CLAUDE.md).

## Dokumentation

Die Dokumentation liegt in zwei Formen vor:

- **In-App:** Klick auf das Hilfe-Icon in der Navigationsleiste oeffnet das Slide-Over-Hilfe-Panel mit Suche, Navigationsbaum und Markdown-Rendering.
- **Online:** [astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/) - MkDocs-Material-Site mit Volltextsuche, Hell-/Dunkel-Modus und i18n.

Beide lesen aus denselben Markdown-Dateien in `docs/help/`. Die Doku lokal bauen:

```bash
make docs-install   # MkDocs-Abhaengigkeiten installieren (eigenes venv)
make docs-serve     # Servieren auf http://localhost:8000 mit Hot-Reload
```

## Architektur

```
Browser --> nginx (statische Dateien + /api-Proxy) --> FastAPI (uvicorn)
                                                          |
                                                    PluginForge
                                                          |
                                +----------+----------+----------+
                                |          |          |          |
                             Export     Help    Audiobook      ...
```

- **Frontend:** React 18, TypeScript, TipTap, Vite, Radix UI, @dnd-kit, react-markdown
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **Plugins:** PluginForge (PyPI), pluggy-basiert, YAML-konfiguriert
- **Export:** manuscripta ^0.9.0 (PyPI), Pandoc, [write-book-template](https://github.com/astrapi69/write-book-template)
- **TTS:** manuscripta-Adapterschicht mit 5 Engines (Edge TTS, Google Cloud, gTTS, pyttsx3, ElevenLabs)

## Plugins

| Plugin | Lizenz | Beschreibung |
|--------|--------|--------------|
| export | MIT | EPUB, PDF, Word, HTML, Markdown, Project-ZIP |
| help | MIT | In-App-Hilfe-Panel mit Doku, Suche, Tastenkuerzeln |
| getstarted | MIT | Onboarding-Guide, Beispielbuch |
| ms-tools | MIT | Stilpruefungen, Sanitization, Textmetriken |
| audiobook | MIT | TTS-Hoerbuch-Erzeugung (5 Engines) |
| translation | MIT | DeepL- / LMStudio-Uebersetzung |
| grammar | MIT | LanguageTool-Grammatikpruefung |
| kinderbuch | MIT | Kinderbuch-Seitenlayout |
| kdp | MIT | Amazon-KDP-Metadaten, Cover-Validierung |
| git-sync | MIT | Buch-als-Git-Repo: Import, Commit, Smart-Merge, Mehrsprachen-Verknuepfung |

Drittanbieter-Plugins lassen sich als ZIP-Dateien ueber Einstellungen > Plugins installieren.

## Konfiguration

Umgebungsvariablen (in `.env` setzen):

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `BIBLIOGON_PORT` | 7880 | Port der Web-App |
| `BIBLIOGON_DEBUG` | false | Debug-Modus (aktiviert Test-Endpoints, API-Docs) |
| `BIBLIOGON_SECRET_KEY` | (generiert) | Geheimnis fuer Lizenz-Validierung |
| `BIBLIOGON_CREDENTIALS_SECRET` | (generiert) | Geheimnis zur Verschluesselung von API-Keys und Service-Account-Dateien |
| `BIBLIOGON_CORS_ORIGINS` | localhost:7880 | Erlaubte CORS-Origins |
| `BIBLIOGON_DB_PATH` | /app/data/bibliogon.db | Pfad zur SQLite-Datenbank |

## Verwandte Projekte

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin-Framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Buch-Export-Pipeline mit TTS-Adapterschicht (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Zielverzeichnisstruktur fuer den Export

## Lizenz

MIT. Alle Plugins sind kostenlos und Open Source.
