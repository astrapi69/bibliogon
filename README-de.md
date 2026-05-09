# Bibliogon

Open-Source-Toolkit für Self-Publishing-Autorinnen und -Autoren. Bücher, Artikel und Multi-Plattform-Content-Workflows. Offline-zuerst, Plugin-basiert, EPUB- / PDF- / Hörbuch-Export.

Aufgebaut auf [PluginForge](https://github.com/astrapi69/pluginforge), einem wiederverwendbaren Plugin-Framework auf Basis von [pluggy](https://pluggy.readthedocs.io/).

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-yellow.svg)](LICENSE)

**[Dokumentation](https://astrapi69.github.io/bibliogon/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)** | Aktuelle Version: **v0.29.0**

## Funktionen

- WYSIWYG- und Markdown-Editor (TipTap mit 15 offiziellen + 1 Community-Erweiterung, 24 Toolbar-Buttons)
- Komplette Buchstruktur mit Kapiteltypen für jeden Abschnitt (Vorwort, Geleitwort, Prolog, Widmung, Teil, Epilog, Nachwort, Index, Auch vom Autor, Leseprobe, Call to Action, ...)
- Genre-Katalog für Roman, Sachbuch, Fachbuch, Biografie, Lyrik, Kinderbuch, Fantasy, Thriller, Liebesroman, Kochbuch, Reise und mehr
- Drag-and-Drop-Kapitelreihenfolge mit klappbaren Abschnitten
- EPUB-, PDF-, Word-, HTML-, Markdown-Export über [manuscripta](https://github.com/astrapi69/manuscripta)
- Hörbuch-Erzeugung mit 5 TTS-Engines (Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, ElevenLabs)
- Content-Hash-Cache: unveränderte Kapitel werden nicht neu erzeugt (spart Geld bei kostenpflichtigen Engines)
- Kostenschätzung und Ersparnis-Tracking für kostenpflichtige TTS-Engines
- Dry-Run-Modus: Probehören vor dem vollständigen Export
- Persistente Hörbuch-Speicherung mit Pro-Kapitel- und Gesamt-Downloads
- Voll-Backup und -Restore (.bgb) inkl. Bilder und optional Hörbuch-Dateien
- Buch-Metadaten: ISBN, ASIN, Verlag, Keywords, Cover, Custom CSS
- In-App-Hilfe mit Markdown-Rendering, Suche und kontextsensitiven Links
- Multi-Provider-KI-Assistent (Anthropic, OpenAI, Gemini, Mistral, LM Studio) für Kapitel-Review, Marketing-Texte und kontextbewusste Vorschläge
- Plugin-System mit ZIP-Installation für Drittanbieter-Plugins
- Verschlüsselte Anmeldedaten-Ablage (Fernet) für API-Keys und Service-Account-Dateien
- 6 Themes (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) x Hell/Dunkel
- i18n: Deutsch, Englisch, Spanisch, Französisch, Griechisch, Portugiesisch, Türkisch, Japanisch
- Responsives Layout mit Hamburger-Menü auf Mobilgeräten

## Artikel-Autorenschaft (Phase 2 - beta)

Neben Büchern unterstützt Bibliogon Artikel-Autorenschaft mit Multi-Plattform-Publikations-Tracking.

- Dedizierter Artikel-Editor mit TipTap (getrennt vom Buch-Editor, Einzeldokument, ohne Kapitel-Sidebar)
- Artikel-Metadaten: Thema (einstellungsverwaltet), SEO-Titel / -Beschreibung, Tags, Auszug, kanonische URL, Featured Image
- Pro-Plattform-Publikations-Tracking (Medium, Substack, X, LinkedIn, dev.to, Mastodon, Bluesky, custom)
- Drift-Erkennung: der Editor markiert nicht-synchronisierte Publikationen, wenn der Artikel-Inhalt nach der Veröffentlichung geändert wurde; eine "Live bestätigen"-Aktion setzt den Vergleich zurück
- Promo-Posts als Publications mit `is_promo`-Flag (kurze Begleitbeiträge, die auf eine Hauptpublikation verlinken)
- Manueller Publikations-Workflow - noch keine Plattform-API-Integration (Phase-3-Scope)

## Git-Sync für Bücher

Bücher können mit externen Git-Repositories synchronisiert werden - für Kollaboration, Backup und Versionskontrolle.

- **Import:** Klonen eines öffentlichen Git-Repos mit einem Buch im WBT-Layout
- **Commit + Push:** Buchänderungen via SSH-Agent, System-Credential-Helper oder pro-Buch-PAT zurück ins Repo schreiben
- **Smart-Merge:** Drei-Wege-Diff mit Konfliktlösungs-UI pro Kapitel, wenn Kapitel sowohl lokal als auch remote bearbeitet wurden
- **Mehrsprachig:** Repos mit `main-XX`-Branches (z.B. `main-de`, `main-fr`) werden über `Book.translation_group_id` als verknüpfte Übersetzungen importiert
- **Core-Git-Brücke:** Ein Commit fließt sowohl in die Core-Git-Historie als auch in das plugin-git-sync-Subsystem (unter einem Pro-Buch-Lock)

Alle drei Credential-Pfade lassen sich im Git-Backup-Dialog konfigurieren: SSH-Agent, System-Credential-Helper und Pro-Buch-PAT-Eingabe (verschlüsselt gespeichert, nie im Klartext zurückgegeben).

## Multi-Buch-Backup-Import

`.bgb`-Backup-Dateien mit mehreren Büchern lassen sich mit Pro-Buch-Auswahl (Standard: alle ausgewählt) und Pro-Buch-Duplikatserkennung importieren. Der Import-Wizard verwendet eine XState-v5-State-Machine für den Mehrschritt-Flow mit Einzel- und Mehrbuch-Zweigen sowie einer gemeinsamen Error-Boundary, die im Fehlerfall Details meldet und ein GitHub-Issue öffnet.

## Installation und Start

### Voraussetzungen

- [Docker](https://docs.docker.com/get-docker/) (Docker Desktop oder Docker Engine mit Compose)

### One-Liner

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.ps1 | iex
```

Beides lädt Bibliogon nach `~/bibliogon` (Linux/macOS) bzw. `%USERPROFILE%\bibliogon` (Windows), baut die Docker-Images und startet die App auf **http://localhost:7880**.

### Doppelklick-Installation (ohne Terminal)

Nach dem Klonen oder Herunterladen des Repos den Wrapper für dein Betriebssystem doppelklicken:

| Plattform | Datei | Hinweise |
|---|---|---|
| macOS | `install.command` | Finder behandelt `.command` als ausführbar; beim ersten Start fragt Gatekeeper ggf. nach — Rechtsklick > Öffnen umgeht das |
| Windows | `install.cmd` | Wrapper um `install.ps1` mit `-ExecutionPolicy Bypass`, damit Firmen-Windows mit per Group Policy gesperrter ExecutionPolicy den Installer trotzdem starten kann |
| Linux | `bash install.sh` | Kein extra Wrapper nötig |

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

Vollständige Entwicklungsdokumentation siehe [CLAUDE.md](CLAUDE.md).

## Dokumentation

Die Dokumentation liegt in zwei Formen vor:

- **In-App:** Klick auf das Hilfe-Icon in der Navigationsleiste öffnet das Slide-Over-Hilfe-Panel mit Suche, Navigationsbaum und Markdown-Rendering.
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
| help | MIT | In-App-Hilfe-Panel mit Doku, Suche, Tastenkürzeln |
| getstarted | MIT | Onboarding-Guide, Beispielbuch |
| ms-tools | MIT | Stilprüfungen, Sanitization, Textmetriken |
| audiobook | MIT | TTS-Hörbuch-Erzeugung (5 Engines) |
| translation | MIT | DeepL- / LMStudio-Übersetzung |
| grammar | MIT | LanguageTool-Grammatikprüfung |
| kinderbuch | MIT | Kinderbuch-Seitenlayout |
| kdp | MIT | Amazon-KDP-Metadaten, Cover-Validierung |
| git-sync | MIT | Buch-als-Git-Repo: Import, Commit, Smart-Merge, Mehrsprachen-Verknüpfung |

Drittanbieter-Plugins lassen sich als ZIP-Dateien über Einstellungen > Plugins installieren.

## Konfiguration

Umgebungsvariablen (in `.env` setzen):

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `BIBLIOGON_PORT` | 7880 | Port der Web-App |
| `BIBLIOGON_DEBUG` | false | Debug-Modus (aktiviert Test-Endpoints, API-Docs) |
| `BIBLIOGON_SECRET_KEY` | (generiert) | Geheimnis für Lizenz-Validierung |
| `BIBLIOGON_CREDENTIALS_SECRET` | (generiert) | Geheimnis zur Verschlüsselung von API-Keys und Service-Account-Dateien |
| `BIBLIOGON_CORS_ORIGINS` | localhost:7880 | Erlaubte CORS-Origins |
| `BIBLIOGON_DATA_DIR` | platformdirs-Standard | Wurzelverzeichnis für Laufzeitdaten (DB, Uploads). Linux/macOS: `~/.local/share/bibliogon/`. Windows: `%LOCALAPPDATA%\bibliogon\`. Docker: `/app/data` |
| `BIBLIOGON_DB_PATH` | (wird nicht mehr berücksichtigt) | **Entfernt in v0.30.0** (DEP-DBPATH-01 Schritt 3). Die Variable hat keine Wirkung mehr auf die Pfad-Auflösung; ist sie weiterhin in der Umgebung gesetzt, wird beim Start eine einzelne Warnung mit dem ignorierten Wert geloggt. Stattdessen `BIBLIOGON_DATA_DIR` setzen — die Datenbank liegt dann unter `<BIBLIOGON_DATA_DIR>/bibliogon.db`. Verwerfungszyklus: Warnung v0.27.0, Präzedenz-Flip v0.28.0, Entfernung v0.30.0. |

## Verwandte Projekte

- [pluginforge](https://github.com/astrapi69/pluginforge) - Plugin-Framework (PyPI)
- [manuscripta](https://github.com/astrapi69/manuscripta) - Buch-Export-Pipeline mit TTS-Adapterschicht (PyPI)
- [write-book-template](https://github.com/astrapi69/write-book-template) - Zielverzeichnisstruktur für den Export

## Lizenz

Bibliogon wird unter der [MIT-Lizenz](LICENSE) veroffentlicht.
Alle Plugins sind kostenlos und Open Source.

## Sicherheitsrichtlinie

Siehe [SECURITY.md](SECURITY.md) fur den verantwortungsvollen
Meldeprozess bei Sicherheitsproblemen.

## Verhaltenskodex

Dieses Projekt folgt dem [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Meldungen gehen an asterios.raptis@web.de.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) fur Einrichtung, Workflow und Erwartungen.

## Issue-Vorlagen

Verwenden Sie die passende Vorlage beim Erstellen eines neuen Issues:
- [Fehlerbericht](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Funktionswunsch](.github/ISSUE_TEMPLATE/feature_request.yml)
- [Frage](.github/ISSUE_TEMPLATE/question.yml)