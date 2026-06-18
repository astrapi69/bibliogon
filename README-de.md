# Bibliogon

Open-Source-Toolkit für Self-Publishing-Autorinnen und -Autoren. Bücher, Artikel, Bilderbücher, Comics und Multi-Plattform-Content-Workflows. Schreibe mit einer integrierten **Story-Bibel**, die deine Figuren, Orte und Handlungspunkte konsistent hält, und exportiere nach EPUB / PDF / Hörbuch. Plugin-basiert und local-first — läuft komplett offline im Browser (GitHub-Pages-PWA) oder selbst gehostet via Docker.

Aufgebaut auf [PluginForge](https://github.com/astrapi69/pluginforge), einem wiederverwendbaren Plugin-Framework auf Basis von [pluggy](https://pluggy.readthedocs.io/).

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-yellow.svg)](LICENSE)

**[Web-App](https://astrapi69.github.io/bibliogon/)** | **[Dokumentation](https://astrapi69.github.io/bibliogondocs/)** | **[Issues](https://github.com/astrapi69/bibliogon/issues)** | Aktuelle Version: **v0.56.0**

## Story-Bibel

Bibliogons Alleinstellungsmerkmal: eine **buchspezifische Datenbank der wiederkehrenden Elemente deiner Fiktion** — Figuren, Schauplätze, Handlungspunkte, Gegenstände und Lore — direkt neben dem Manuskript, damit du nie den Überblick verlierst, wer wer ist und was wo passiert ist. Bereitgestellt vom Plugin **plugin-story-bible**.

- **Fünf Entity-Typen**, jeder mit eigenem Icon, Akzentfarbe und typspezifischen Metadaten: **Figuren** (Aliase, Rolle, Eigenschaften, Arc-Notizen, Beziehungen), **Schauplätze** (Typ, Geografie, Bedeutung), **Handlungspunkte** (Timeline-Position, Story-Beat, beteiligte Figuren), **Gegenstände** (Bedeutung, aktueller Besitzer) und **Lore** (Magie / Technik / Kultur / Geschichte / Religion / Sprache). Die Typ-Registry ist die alleinige Quelle der Wahrheit in `backend/config/story-bible-entities.yaml`.
- **Rich-Text-Beschreibungen** pro Entity (TipTap) plus eine Sidebar zum Inline-Erstellen / -Bearbeiten / -Löschen, die neben der Kapitelliste einfährt.
- **Beziehungen** — verbinde zwei beliebige Entities als Verbündeter (ally), Rivale (rival), Familie (family), Mentor (mentor), romantisch (romantic) oder neutral (neutral), mit optionaler Notiz. Bearbeitet in einer eigenen "Beziehungen"-Sektion der Entity-Detailansicht; jeder Typ ist farbcodiert.
- **@-Erwähnungen** — tippe `@` im Kapitel-Editor oder auf einer Bilderbuchseite, um die Entities des Buches per Autocomplete einzufügen (nach Typ gruppiert, Namenssuche beim Tippen). Fügt eine farbcodierte Inline-Erwähnungs-Badge ein; ein Klick öffnet die Entity in der Sidebar.
- **Auto-Erkennung** — durchsucht den Kapitel- / Seitentext nach Entity-Namen (exakt, Groß-/Kleinschreibung egal, Wortgrenzen; kurze Namen übersprungen, bereits verknüpfte Entities ausgeschlossen) und verknüpft sie mit einem Klick ("Automatisch verknüpfen").
- **Auftritts-Tracker** — verknüpfe eine Entity mit einer Seite oder einem Kapitel (zieh sie auf eine Storyboard-Karte oder nutze die Auto-Erkennung), jede Verknüpfung mit optionaler Rolle + Notiz. Die Detailansicht listet jeden Auftritt.
- **Arc-Ansicht** — eine SVG-Swim-Lane-Timeline: jede Entity erhält eine Spur, jeder Auftritt einen stimmungsfarbenen, rollengroßen Punkt, verbunden durch Kontinuitäts-Linien; ein Klick auf einen Punkt springt zur Seite. Ein Schalter zeichnet farbcodierte Bezier-Linien zwischen den Spuren zweier Entities überall dort, wo sie sich eine Seite teilen.
- **Kontinuitäts-Prüfer** — beratende Warnungen, wenn eine Entity verschwindet, eine lange Abwesenheitslücke hat oder eine Seite gar keine Entities enthält.
- **Markdown-Export** — exportiert die gesamte Story-Bibel (nach Typ gruppiert, mit Auftritten) als Markdown-Dokument.

## Funktionen

- WYSIWYG- und Markdown-Editor (TipTap v3) mit Node-basierten Mathe-Formeln (KaTeX, inline `$...$` + Block `$$...$$`) und eingebauter Editor-Suche (prosemirror-search)
- **Story-Bibel** — buchspezifische Datenbank für Figuren / Schauplätze / Handlung / Gegenstände / Lore mit Beziehungen, @-Erwähnungen, Auto-Erkennung, Arc-Timeline und Kontinuitätsprüfung (siehe oben)
- Komplette Buchstruktur mit Kapiteltypen für jeden Abschnitt (Vorwort, Geleitwort, Prolog, Widmung, Teil, Epilog, Nachwort, Index, Auch vom Autor, Leseprobe, Call to Action, ...)
- Genre-Katalog für Roman, Sachbuch, Fachbuch, Biografie, Lyrik, Kinderbuch, Fantasy, Thriller, Liebesroman, Kochbuch, Reise und mehr
- Drag-and-Drop-Kapitelreihenfolge mit klappbaren Abschnitten
- Zwei Export-Engines: client-seitig im Browser (Markdown, HTML, Text, PDF, EPUB, DOCX, LaTeX — funktioniert offline) und Desktop über [manuscripta](https://github.com/astrapi69/manuscripta)/Pandoc
- Hörbuch-Erzeugung mit 5 TTS-Engines (Edge TTS, Google Cloud TTS, Google Translate, pyttsx3, ElevenLabs)
- Content-Hash-Cache: unveränderte Kapitel werden nicht neu erzeugt (spart Geld bei kostenpflichtigen Engines)
- Kostenschätzung und Ersparnis-Tracking für kostenpflichtige TTS-Engines
- Dry-Run-Modus: Probehören vor dem vollständigen Export
- Persistente Hörbuch-Speicherung mit Pro-Kapitel- und Gesamt-Downloads
- Voll-Backup und -Restore (.bgb) inkl. Bilder und optional Hörbuch-Dateien
- Buch-Metadaten: ISBN, ASIN, Verlag, Keywords, Cover, Custom CSS, Repository-URL
- In-App-Hilfe mit Markdown-Rendering, Suche und kontextsensitiven Links
- Multi-Provider-KI-Assistent (Anthropic, OpenAI, Gemini, Mistral, LM Studio) für Kapitel-Review, Marketing-Texte und kontextbewusste Vorschläge
- Plugin-System mit ZIP-Installation für Drittanbieter-Plugins
- Verschlüsselte Anmeldedaten-Ablage (Fernet) für API-Keys und Service-Account-Dateien
- 6 Farbpaletten (Warm Literary, Cool Modern, Nord, Classic, Studio, Notebook) x Hell/Dunkel = 12 Theme-Varianten
- i18n: Deutsch, Englisch, Spanisch, Französisch, Griechisch, Portugiesisch, Türkisch, Japanisch
- Responsives Layout mit Hamburger-Menü auf Mobilgeräten
- Einstellungs-Sidebar mit 5 Gruppen (Darstellung, Inhalt, System, Info, Gefahrenzone) löst das frühere horizontale Tab-Layout ab
- Editor-Anzeige-Einstellungen (Popover) für nutzerspezifische Breite / Schriftart / Schriftgröße / Zeilenhöhe
- Dashboard-Paginierung mit konfigurierbarer Seitengröße für Bücher, Artikel und Papierkorb
- Bulk-Wiederherstellung für Artikel und Bücher aus dem Papierkorb (Parität zwischen beiden Surfaces)
- Alt+Z Zeilenumbruch-Toggle im Editor für Korrektur langer Zeilen Seite-an-Seite
- Autor-Datalist (Pattern A) in allen Editoren mit der Autoren-Datenbank als Autocomplete-Quelle
- Danger-Zone-Komplett-Reset in den Einstellungen für einen sauberen Neustart
- Barrierefreiheit (WCAG 2.1 AA) auditiert: ARIA-Labels, Fokus-Reihenfolge, Tastaturnavigation
- Einstellungen > Backups: Versions-Historie mit Einzel-Löschen, "Alle löschen" und einem Vergleich-Dialog zum Diffen zweier `.bgb`-Stände
- Eingabe-Leeren-Knopf (X) an jedem Suchen/Filtern-Feld in Artikeln, Büchern, Autoren-Datenbank und Hilfe — einzelnes Feld leeren, ohne andere Filter zurückzusetzen
- Persistenz von ein-/ausgeklappten Bereichen im Bilderbuch- und Comic-Editor-Sidebar (Tier 1 Visueller Stil und Tier 2 Typografie merken sich ihren Zustand pro Surface über Navigation und Reload hinweg)
- White-Label-Feature-Flag (`features.white_label` in `app.yaml`) gattet den Einstellungs-Reiter "Erweitert"; standardmäßig aus, damit Power-User-Surfaces über YAML-Bearbeitung zugänglich bleiben ohne die Sidebar zu überladen
- Titel direkt im Editor bearbeiten (Buch, Artikel, Bilderbuch, Comic) über eine gemeinsame Stift-Umschalt-Komponente; bei veröffentlichten oder archivierten Werken erscheint zuerst ein Warnbanner, damit eine Titeländerung bewusst auf der Veröffentlichungsplattform nachgezogen wird
- Veröffentlichungs-Status-Lebenszyklus (Entwurf / Bereit / Veröffentlicht / Archiviert), geteilt von Büchern und Artikeln, mit Status-Badge auf jeder Dashboard-Karte und Listenzeile
- Sprachabhängige Datumsformatierung, die der aktiven UI-Sprache auf allen Surfaces folgt

## Offline-Web-App (PWA)

Bibliogon läuft als vollständig offline-fähige Progressive Web App auf GitHub Pages — ohne Backend, ohne Installation: **[astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/)**. Alle Daten liegen im Browser (IndexedDB, local-first); der Backend-lose Build feuert null `/api`-Requests (per hartem E2E-Gate erzwungen).

- **Komplettes Schreiben offline:** Bücher, Kapitel, Artikel, Bilderbücher, Comics, Story-Bibel, Storyboard, Autoren und Publikationen lesen und schreiben über den Storage-Seam gegen eine geseedete IndexedDB.
- **Import-Wizard offline:** Markdown- / Text- / HTML-Dateien werden zu einem neuen Buch + Kapitel; JSON-Voll-Backups und `.bgb`-Backups werden client-seitig wiederhergestellt; Medium-ZIP-Exporte importieren direkt im Browser.
- **Client-seitige Export-Engine:** Markdown, HTML, Text, PDF, EPUB, DOCX und LaTeX — erzeugt im Browser, kein Pandoc nötig.
- **KI offline:** eigener Provider-Key; Aufrufe gehen direkt vom Browser zum Provider, der Key bleibt lokal gespeichert und wird nirgendwo sonst hingeschickt.
- **Backup & Restore:** ein einzelnes JSON-Bundle exportiert/importiert den gesamten Arbeitsbereich. Die In-App-Hilfe und der Erste-Schritte-Guide funktionieren ebenfalls offline, und unbekannte Routen bekommen eine eigene 404-Seite.
- **Dreistufige Feature-Sichtbarkeit:** jede gegatete Oberfläche löst über eine zentrale Feature-Registry ([@astrapi69/feature-strategy](https://www.npmjs.com/package/@astrapi69/feature-strategy)) zu *aktiv*, *deaktiviert mit Begründung* oder *versteckt* auf. Nichts, was dir gehört, wird versteckt — die im Browser tatsächlich unmöglichen Features (Pandoc-basierter Export, Git-Sync/-Backup, Hörbuch-TTS, LAN-Modus) erscheinen deaktiviert mit dem Hinweis "erfordert die Desktop-App", statt stillschweigend zu verschwinden.

## Bilderbuch-Autorenschaft

Bibliogon unterstützt einen dedizierten Bilderbuch-Workflow mit pro-Seite Bild- und Text-Layouts, einer Storyboard-Rasteransicht und einer direkten WeasyPrint-PDF-Pipeline.

- **13 Seitenlayouts in 5 Kategorien** (über einen kategorisierten LayoutPicker wählbar): Einzelbild-mit-Text (Bild oben / unten / links / rechts, Vollbild-Overlay, Bild-als-Rahmen mit zentriertem Text), Nur-Bild, Mehrere-Bilder (zwei-Bilder-mit-zentriertem-Text, Split-horizontal, Split-vertikal sowie eine frei anordenbare **Collage** aus N per Drag positionierten Bild- und Text-Regionen), Nur-Text und das Spezial-Layout Sprechblase. Jedes Layout hat seinen eigenen `layout_config`-Namensraum, damit Layout-Wechsel die vorherigen Einstellungen erhalten.
- **Collage-Layout** (Phase 3): Bild- und Text-Regionen frei auf der Seite ziehen und in der Größe ändern, mit z-Index-Reihenfolge (`useDragPosition`-Hook + `CollageCanvas`); der WeasyPrint-Walker spiegelt die Editor-Geometrie, sodass das PDF zur Arbeitsfläche passt.
- **Tier 1 + Tier 2 Eigenschaften** pro Layout (Visual-Style- und Typografie-Sektionen im Editor): Textausrichtung, vertikale Zentrierung, Padding, Schriftart, Schriftgröße, Zeilenhöhe, Textfarbe, Schriftgewicht, Container-Breite/-Höhe. Ein gemeinsamer `computeTierTextStyles`-Helfer (TS + Python-Spiegel) hält Editor-Vorschau und PDF-Walker synchron.
- **Storyboard-Ansicht** (Drag-Reorder-Raster): Notizen pro Seite, Story-Beat-Tag (Exposition / Auslösendes Ereignis / Steigende Handlung / Höhepunkt / Fallende Handlung / Auflösung), Stimmungsfarbe (10-Preset-Palette) und Akt-Gruppen-Label für visuelle Kapitelgrenzen. Story-Bibel-Entities lassen sich auf Karten ziehen, um Auftritte zu tracken (als farbcodierte Entity-Badges sichtbar), und ein Entity-Filter schränkt das Raster auf Seiten ein, auf denen ausgewählte Entities auftreten. Das Storyboard ist jetzt für **jeden Buchtyp** verfügbar — Prosa-Bücher erhalten eine Kapitelkarten-Variante (Wortzahl + dieselben vier Annotationen pro `Chapter`) über das gemeinsame `StoryboardAnnotations`-Modul.
- **PDF-Export** via WeasyPrint mit KDP-kompatiblem Format-Dropdown (Quadrat 8.5x8.5, Querformat 8.5x11) plus Bleed- und Schnittmarken-Optionen.
- **Layout-Wechsel-Hygiene:** der pro-Layout `layout_config`-Namensraum (Fix B) sorgt dafür, dass ein Wechsel weg von und zurück zu einem Layout dessen Konfiguration erhält; aktive Text-Konvertierung zwischen TipTap- und Tier-Property-Layouts hält die DB-Form passend zum aktiven Layout.

## Comic-Autorenschaft

Ein dedizierter Comic-Editor (`book_type='comic_book'`) liefert mehrteilige Panel-Layouts mit Multi-Bubble-Unterstützung pro Panel.

- **Comic-Panel-Raster** mit 7 Templates (Einzel-Panel-Splash, 1x2, 2x1, 2x2, 2x3, 3x2, 3x3) pro Seite wählbar; "Panel hinzufügen" deaktiviert bei Erreichen der Zellenkapazität, und der Wechsel zu einem kleineren Template löst einen Overflow-Handler aus (überzählige Panels auf neue Seiten verschieben, löschen oder abbrechen).
- **Panels anordnen:** ein Panel am Griff ziehen, um es innerhalb der Seite umzusortieren (dnd-kit), oder über das Menü "Auf andere Seite verschieben" auf eine andere Seite senden — das Menü zeigt die Kapazität jedes Ziels (`Seite N - Anzahl/Max`) und deaktiviert volle Seiten.
- **Multi-Bubble pro Panel:** Bubbles über Anker-Presets positionieren (Top-Left bis Bottom-Right plus Center) mit Deckkraft- und Größenreglern, oder eine Bubble (samt Schwanzspitze) direkt auf der Arbeitsfläche ziehen.
- **6 Bubble-Typen** (Speech, Thought, Narration, Shout, Whisper, Sound-Effect), jeweils als einzelner durchgehender SVG-Pfad gerendert (Umriss + Schwanz in einer Form, ohne CSS-Form-plus-Polygon-Schwanz-Naht) mit typ-spezifischem Schwanzverhalten — Gedanken-Kreiskette, Schrei-Spitzen-Absorption, Narration ohne Schwanz. Derselbe Pfad-Generator läuft in der Editor-Vorschau und im WeasyPrint-PDF-Walker.
- **PDF-Export** über die gemeinsame WeasyPrint-Pipeline; Comics dispatchen via `export_execute`-Hookspec, damit der Kern vom Plugin-Code entkoppelt bleibt.

## KDP-Veröffentlichungs-Wizard

Ein 5-Schritt-Wizard auf XState-Basis für die Amazon-KDP-Veröffentlichungsvorbereitung mit serverseitiger Persistenz und Konflikt-Erkennung.

- **5 Schritte:** Metadaten → Cover → Preisgestaltung → ARC-Reviewer → Launch-Checkliste.
- **Serverseitiger Zustand** (BookPublishingState-Zeile) speichert den Wizard-Fortschritt automatisch; beim erneuten Öffnen rehydriert der Wizard Preisgestaltung und ARC-Auswahl.
- **Konflikt-Banner**, wenn das Buch außerhalb des Wizards bearbeitet wurde (book.updated_at > state.updated_at), damit der Nutzer die Metadaten erneut validiert.
- **Cover-Validierung** mit KDP-Maß-, DPI- und Bleed-Prüfungen, inline im Cover-Schritt angezeigt.

## Artikel-Autorenschaft (Phase 2 - beta)

Neben Büchern unterstützt Bibliogon Artikel-Autorenschaft mit Multi-Plattform-Publikations-Tracking.

- Dedizierter Artikel-Editor mit TipTap (getrennt vom Buch-Editor, Einzeldokument, ohne Kapitel-Sidebar)
- **8 Textarten** (Blogbeitrag, Tutorial, Rezension, Essay, Newsletter, Interview, Listicle, Kurzgeschichte) aus einer `content-types.yaml`-Registry, über einen Split-Button im Artikel-Dashboard wählbar (Standardklick erstellt einen Blogbeitrag; das Chevron öffnet die anderen 7). Jede Textart hat eigene Zusatz-Metadatenfelder (z. B. Tutorial-Schwierigkeit / Voraussetzungen / Dauer, Rezension Werk + Bewertung, Newsletter Ausgabe + Versanddatum, Interview Partner + Rolle), gespeichert in einer pro-Artikel `article_metadata`-JSON-Spalte und inline in der Metadaten-Sidebar bearbeitet
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

Bibliogon folgt **Gitflow**: `develop` ist der aktive Entwicklungsbranch (der GitHub-Default), `main` trägt ausschließlich Releases. `feature/*`- / `fix/*`-Branches gehen von `develop` ab, Pull Requests laufen gegen `develop`.

Quality-Gates: Backend- + Plugin-pytest und Frontend-Vitest mit Coverage-Tracking (aktuelle Zahlen in [docs/audits/current-coverage.md](docs/audits/current-coverage.md)), `ruff` + `mypy`, ESLint (Flat Config) + Prettier, `bandit`-SAST und `madge`-Zirkular-Abhängigkeits-Erkennung in der CI, Playwright-E2E mit Visual-Regression-Baselines und axe-core-Barrierefreiheits-Checks, Theme-/Kontrast-Gates (`make verify-theme`) sowie ein vollständiges Backup-Akzeptanz-Gate (Export → Reset → Import → Verifikation).

Vollständige Entwicklungsdokumentation siehe [CLAUDE.md](CLAUDE.md).

## Dokumentation

Die Dokumentation liegt in zwei Formen vor:

- **In-App:** Klick auf das Hilfe-Icon in der Navigationsleiste öffnet das Slide-Over-Hilfe-Panel mit Suche, Navigationsbaum und Markdown-Rendering.
- **Online:** [astrapi69.github.io/bibliogondocs](https://astrapi69.github.io/bibliogondocs/) - MkDocs-Material-Site mit Volltextsuche, Hell-/Dunkel-Modus und i18n. (Die Bibliogon-Web-App selbst wird separat unter [astrapi69.github.io/bibliogon](https://astrapi69.github.io/bibliogon/) gehostet.)

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
| comics | MIT | Mehrteilige Comic-Seiten mit Multi-Bubble-Unterstützung pro Panel |
| story-bible | MIT | Buchspezifische Fiktions-Entity-Datenbank (Figur / Schauplatz / Handlungspunkt / Gegenstand / Lore) mit Beziehungen, @-Erwähnungen, Arc-Ansicht, Kontinuitäts-Prüfer, Markdown-Export |
| git-sync | MIT | Buch-als-Git-Repo: Import, Commit, Smart-Merge, Mehrsprachen-Verknüpfung |
| medium-import | MIT | Medium-HTML-Export-Importer für Artikel mit Provenienz-Tracking |

Alle 13 First-Party-Plugins sind kostenlos unter MIT. Drittanbieter-Plugins lassen sich als ZIP-Dateien über Einstellungen > Plugins installieren.

## Konfiguration

Drei-Schichten-Konfiguration: Projekt-`app.yaml` (Standardwerte) ← Benutzer-Override-Datei
(`~/.config/bibliogon/secrets.yaml`, gitignored) ← Umgebungsvariablen (CI/Docker).
Override gewinnt, Umgebungsvariablen haben immer höchste Priorität. Ausführlicher Leitfaden:
[docs/configuration.md](docs/configuration.md).

Geheimnisse wie `ai.api_key` gehören aus der Projekt-`app.yaml` heraus in die
Override-Datei oder die `BIBLIOGON_AI_API_KEY`-Umgebungsvariable. Die Einstellungs-UI
blendet das API-Key-Eingabefeld automatisch aus, sobald ein Override aktiv ist.

Umgebungsvariablen (in `.env` oder Shell setzen):

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `BIBLIOGON_PORT` | 7880 | Port der Web-App |
| `BIBLIOGON_DEBUG` | false | Debug-Modus (aktiviert Test-Endpoints, API-Docs) |
| `BIBLIOGON_AI_API_KEY` | (nicht gesetzt) | Überschreibt `ai.api_key` aus jeder yaml-Schicht |
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

Bibliogon wird unter der [MIT-Lizenz](LICENSE) veröffentlicht.
Alle Plugins sind kostenlos und Open Source.

## Sicherheitsrichtlinie

Siehe [SECURITY.md](SECURITY.md) für den verantwortungsvollen
Meldeprozess bei Sicherheitsproblemen.

## Verhaltenskodex

Dieses Projekt folgt dem [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
Meldungen gehen an asterios.raptis@web.de.

## Mitwirken

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Einrichtung, Workflow und Erwartungen.

## Issue-Vorlagen

Verwenden Sie die passende Vorlage beim Erstellen eines neuen Issues:
- [Fehlerbericht](.github/ISSUE_TEMPLATE/bug_report.yml)
- [Funktionswunsch](.github/ISSUE_TEMPLATE/feature_request.yml)
- [Frage](.github/ISSUE_TEMPLATE/question.yml)
