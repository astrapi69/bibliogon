# Architektur-Übersicht

Diese Seite ist eine destillierte Sicht von außen auf die Struktur von Bibliogon. Die interne Quelle der Wahrheit liegt in [`.claude/rules/architecture.md`](https://github.com/astrapi69/bibliogon/blob/main/.claude/rules/architecture.md) und in den README-Dateien pro Komponente; diese Seite hebt heraus, was externe Mitwirkende wissen müssen, um sich im Repo zurechtzufinden, ohne jede interne Regel lesen zu müssen.

## Vier Schichten

```
1. Frontend        React 19 + TypeScript + TipTap + Vite 8 (Rolldown)
2. Backend         FastAPI + SQLAlchemy + SQLite + Pydantic v2
3. PluginForge     Externes PyPI-Paket (pluginforge ^0.5.0), basiert auf pluggy
4. Plugins         Eigenständige Python-Pakete, registriert über Entry Points
```

Neue Funktionen kommen in ein Plugin, außer sie betreffen Book-/Chapter-CRUD, den Editor-Kern, Backup/Restore oder die UI-Hülle — das sind die Kern-Verantwortlichkeiten. Alles andere ist ein Plugin.

## Zwei Repositories

| Repository | Zweck | Lizenz |
|------------|-------|--------|
| [astrapi69/pluginforge](https://github.com/astrapi69/pluginforge) | Anwendungs-agnostisches Plugin-Framework auf Basis von pluggy. Eigener Release-Zyklus. | MIT |
| [astrapi69/bibliogon](https://github.com/astrapi69/bibliogon) | Dieses Repo. Buch- und Artikel-Autorenplattform. Pinnt `pluginforge ^0.5.0`. | MIT |

PluginForge-Änderungen sind eine eigene Codebase und ein eigener Release. PluginForge **nicht** aus Bibliogon heraus editieren — PR gegen das PluginForge-Repo öffnen, nach dem Release den Pin hier hochziehen.

## Backend

### Verzeichnis-Layout

```
backend/app/
  main.py                # FastAPI-App + Lifespan + globaler Exception-Handler
  paths.py               # Einzige Quelle der Wahrheit für Dateisystem-Pfade (data, uploads, db)
  hookspecs.py           # PluginForge-Hook-Spezifikationen
  exceptions.py          # BibliogonError-Hierarchie
  models/                # SQLAlchemy-2.0-mapped-Klassen (Book, Chapter, Asset, ...)
  routers/               # FastAPI-Router (einer pro Ressource)
  config/                # YAML-Configs (app.yaml, plugins/*.yaml, i18n/*.yaml)
```

### Regeln

- **Pydantic v2** für jedes Request-/Response-Schema.
- **SQLAlchemy-2.0-Mapped-Columns** für Modelle.
- **Router bleiben dünn**: Eingabe validieren, Service rufen, Antwort zurückgeben. Keine Geschäftslogik.
- **Services werfen `BibliogonError`-Unterklassen**, niemals `HTTPException`. Der globale Exception-Handler in `main.py` mappt jede Unterklasse auf einen HTTP-Status (`NotFoundError` → 404, `ValidationError` → 400, `ConflictError` → 409, `ExportError`/`PluginError` → 500, `ExternalServiceError` → 502).
- **Frontend umgeht den API-Client nicht.** Jeder `fetch`-Aufruf läuft über `frontend/src/api/client.ts`; nackte `fetch("/api/...")`-Aufrufe in Komponenten sind ein dokumentiertes Anti-Pattern.
- **Konfiguration über YAML**, keine hartcodierten Werte. Plugin-Einstellungen leben in `backend/config/plugins/{name}.yaml`.

## Plugins

### Struktur pro Plugin

```
plugins/bibliogon-plugin-{name}/
  bibliogon_{name}/
    plugin.py          # {Name}Plugin(BasePlugin) — Hook-Implementierungen
    routes.py          # FastAPI-Router (delegiert an Service-Funktionen)
    {modul}.py         # Geschäftslogik (kein FastAPI-Import)
  tests/
    test_{name}.py     # pytest-Tests
  pyproject.toml       # Entry Point: [project.entry-points."bibliogon.plugins"]
```

### Konventionen

- Plugin-Klasse erbt von `pluginforge.BasePlugin`.
- `depends_on` als Klassenattribut (z. B. `depends_on = ["export"]`).
- `license_tier = "core"` für alle Plugins heute (Lizenz-Infrastruktur existiert, ist aber inaktiv; `LICENSING_ENABLED = False` in `backend/app/licensing.py`).
- Hook-Specs sind versioniert (`api_version = 1`) in `backend/app/hookspecs.py`. Version hochziehen, wenn ein Hook-Spec hinzukommt; bestehende Plugins funktionieren weiter, bis sie sich explizit auf den neuen Spec einlassen.
- Plugin-Pakete: `bibliogon-plugin-{name}` (kebab-case). Inneres Paket: `bibliogon_{name}` (snake_case).

### Plugin-Installation als ZIP

Drittanbieter-Plugins werden als ZIP über Einstellungen → Plugins ausgeliefert. Das ZIP muss `plugin.yaml` und ein Python-Paket mit `plugin.py` enthalten. Der Installer entpackt nach `plugins/installed/{name}/` und schreibt die Config nach `config/plugins/{name}.yaml`. Plugin-Namens-Validierung verbietet alles außer Kleinbuchstaben, Ziffern und Bindestrichen; eine Path-Traversal-Prüfung weist bösartige ZIPs zurück.

Den vollständigen Plugin-Autoren-Workflow inklusive Hooks, Lebenszyklus und Verpackung findest du im [Plugin-Entwickler-Leitfaden](plugins.md).

## Frontend

### UI-Strategie

| Bibliothek | Zweck |
|-----------|-------|
| Radix UI | Unstyled-Accessibility-Primitives (Dialog, Tabs, Dropdown, Select, Tooltip) |
| @dnd-kit | Drag-and-Drop (Kapitel-Sortierung, Listen-Umordnung) |
| TipTap | WYSIWYG-/Markdown-Editor (StarterKit + 15 Extensions + 1 Community) |
| Lucide React | Icons |
| react-toastify | Toast-Benachrichtigungen |

Abgelehnt: shadcn/ui (Tailwind-only), MUI (zu meinungsstark), Ant Design (zu schwergewichtig).

### Themes

Drei Themes (Warm Literary, Cool Modern, Nord) × Hell + Dunkel = 6 Varianten. Alles geht über CSS-Variablen in `frontend/src/styles/global.css`. Neue UI-Elemente MÜSSEN CSS-Variablen verwenden; hartcodierte `#fff` etc. sind eine dokumentierte Bug-Klasse.

### Plugin-UI (Manifest-getrieben)

Plugins deklarieren UI-Erweiterungen über `get_frontend_manifest()`. Das Frontend fragt beim Start `/api/plugins/manifests` ab und fügt Plugin-UI in vordefinierte Slots ein:

| Slot | Ort |
|------|-----|
| `sidebar_actions` | BookEditor-Sidebar |
| `toolbar_buttons` | Editor-Toolbar |
| `editor_panels` | Neben dem Editor |
| `settings_section` | Einstellungen → Plugins |
| `export_options` | Export-Dialog |

Für komplexe Plugin-UIs können Plugins ein kompiliertes JS-Bundle als Web Component (Custom Element) im ZIP ausliefern.

### Speicherformat

TipTap-JSON ist das Speicherformat — **nicht** HTML, **nicht** Markdown. Markdown ist nur Editor-Eingabe-/Anzeige-Modus; Konvertierung (JSON ↔ Markdown ↔ HTML) ist Aufgabe des Export-Plugins. DB-Spalte: `Chapter.content`.

### Zustandsverwaltung

React-State + Props heute. Keine globale State-Library (Redux, Zustand, ...). Falls globaler State irgendwann nötig wird, ist Zustand die dokumentierte Wahl, nicht Redux.

## Datenfluss

```
UI (React) -> API-Client -> FastAPI-Router -> Service/Plugin -> SQLAlchemy -> SQLite
```

Unidirektional. Router greifen nie direkt auf die DB zu. Frontend-Code taucht nie im Backend auf. Services kennen HTTP nicht.

## Persistenz

- **Backend**: SQLAlchemy + SQLite. Single-Writer; Schreibvorgänge minimieren, batchen wo möglich.
- **Frontend**: keine lokale Persistenz für Buchdaten. Alles über die API. IndexedDB wird nur für den Autosave-Recovery-Draft verwendet (Kapitelbearbeitungen ohne Verbindung).
- **Assets**: Dateisystem unter dem Datenverzeichnis; ausgeliefert über `/api/assets/`.
- **Backups**: `.bgb`-ZIP-Dateien mit DB + Assets + Hörbuch-MP3s (optional).
- **Projekt-Import**: `.bgp`-ZIP-Dateien nach der write-book-template-Struktur.

### Dateisystem-Layout

Produktivdaten leben **außerhalb** des Projektverzeichnisses. Auflösungs-Reihenfolge:

1. Umgebungsvariable `BIBLIOGON_DATA_DIR` (höchste Priorität — Tests, Docker, Admin-Override)
2. `platformdirs.user_data_dir("bibliogon")`:
   - Linux/macOS: `~/.local/share/bibliogon/`
   - Windows: `%LOCALAPPDATA%\bibliogon\`
3. Tests: ein `tmp_path_factory`-verwaltetes Verzeichnis, gesetzt durch `backend/tests/conftest.py` vor jedem `app.*`-Import.

Zwei Stolperdrähte schützen vor Test-Zugriff auf Produktivdaten:

- Eine `.bibliogon-production`-Marker-Datei, die der FastAPI-Lifespan schreibt. Sieht ein Test diese Datei, bricht der gesamte Testlauf mit `pytest.exit(returncode=2)` ab.
- `BIBLIOGON_TEST=1` + `TEST_DATABASE_URL=sqlite:///:memory:` werden vor dem ersten `app.*`-Import gesetzt.

Wenn `make test` jemals mit Code 2 abbricht, den Marker **nicht** löschen — herausfinden, warum ein Test auf Produktiv zeigt. Der Datenverlust-Vorfall vom April 2026 ist der Ursprung beider Stolperdrähte.

## Fehlerbehandlung

```
Frontend       Fängt ApiError -> Toast + "Issue melden"-Button bei 5xx
API-Client     Konvertiert HTTP-Fehler zu ApiError. Einziger Ort, an dem fetch() lebt.
Router         Dünn. Fängt nichts. Globaler Exception-Handler mappt.
Service        Wirft BibliogonError-Unterklassen. Kennt kein HTTP.
Plugin         Wirft PluginError(plugin_name, message).
Extern         ExternalServiceError(service, message) für Pandoc/TTS/LanguageTool.
```

Jede Schicht behandelt nur, was sie kann; alles andere fließt nach oben. Der globale Exception-Handler in `backend/app/main.py` mappt `BibliogonError`-Unterklassen auf HTTP-Status, fügt im Debug-Modus (`BIBLIOGON_DEBUG=true`) den Stacktrace in die Antwort ein und loggt alles ≥ 500 mit `exc_info=True`.

Die Frontend-`ApiError`-Klasse trägt `status`, `detail` und (im Debug-Modus) `traceback`. Bei 5xx bietet der Toast einen „Issue melden"-Button, der ein vorbefülltes GitHub-Issue mit Stacktrace, Browser-Info und App-Version öffnet. Generische Fehlermeldungen wie „Export fehlgeschlagen" ohne Details sind verboten — sie machen GitHub-Issues wertlos.

## Tests

- **Backend**: pytest. Plugin-Tests in `plugins/{name}/tests/`.
- **Frontend**: Vitest (happy-dom).
- **E2E**: Playwright. Smoke-Specs in `e2e/smoke/`, vollständige Regression in `e2e/full/`.
- **Mutation**: mutmut (Python) + Stryker (TypeScript) — eingerichtet, aber noch nicht in CI verdrahtet.
- **Coverage**: Opt-in (`make test-coverage`). CI führt es bei jedem Push aus und lädt HTML-Reports als GitHub-Actions-Artefakte hoch.

`make test` deckt Backend + Plugins + Vitest ab, ohne Coverage. Muss nach jeder Änderung grün bleiben.

## Versionierung

Das gesamte Monorepo wird bei jedem Release im Lock-Step ausgeliefert. Nur **eine** Datei wird zur Release-Zeit von Hand bearbeitet: `backend/pyproject.toml`. Alles andere wird über `make sync-versions` propagiert (Frontend-`package.json`, Launcher-pyproject + Spec-Plist + `__init__.py`, alle 10 Plugin-pyprojects, `install.sh` + `install.ps1` aus Templates regeneriert). `verify_version_pins.sh` erzwingt Lock-Step in CI; Abweichungen blockieren den Release. Siehe [Mitwirken](contributing.md) für den Release-Workflow.

## Offline / Local-First

- SQLite per Default — keine externe DB nötig.
- Assets lokal im Dateisystem.
- Frontend ist statisches HTML/JS, das nginx im Docker-Produktionssetup ausliefert.
- Lizenz-Validierung offline (signierte Schlüssel; kein Lizenzserver). Aktuell inaktiv.
- Ausnahme: Plugins mit externen APIs (TTS, LanguageTool, KI-Anbieter) brauchen Netzwerkzugang.

## Verwandte Projekte

- [pluginforge](https://github.com/astrapi69/pluginforge) — das Plugin-Framework (PyPI). Bibliogon-agnostisch, MIT.
- [manuscripta](https://github.com/astrapi69/manuscripta) — die Buch-Export-Pipeline (PyPI). Umhüllt Pandoc + den write-book-template-Scaffolder + TTS-Adapter.
- [write-book-template](https://github.com/astrapi69/write-book-template) — die On-Disk-Projekt-Struktur, die manuscripta konsumiert.

> Zuletzt geprüft für v0.29.0 (2026-05-07).
