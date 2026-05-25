# Mitwirken

Wie man Bibliogon für die Entwicklung einrichtet, Tests laufen lässt und eine Änderung ausliefert.

Diese Seite ist die öffentliche Version der internen Mitwirkenden-Regeln. Der vollständige Satz `.claude/rules/*.md` dokumentiert feinere Konventionen für KI-unterstützte Arbeit; externe Mitwirkende müssen sie nicht lesen, aber die wichtigsten Punkte aus `coding-standards.md` und `code-hygiene.md` sind hier zusammengefasst.

## Entwickler-Setup

Benötigte Werkzeuge:

| Werkzeug | Version | Wofür |
|----------|---------|-------|
| Python | 3.11+ | Backend |
| Poetry | 1.8+ | Backend-Abhängigkeiten |
| Node.js | **24+** | Gepinnt in `frontend/package.json` `engines.node >=24.0.0` |
| npm | 10+ | Frontend |
| Docker | 24+ | Produktiv-Deploy via `make prod`; nicht nötig für `make dev` |
| git | beliebig | Quelltext |

8 GB RAM minimum, 16 GB empfohlen für Tests + Dev parallel.

```bash
git clone https://github.com/astrapi69/bibliogon.git
cd bibliogon
make install        # Poetry + npm + Plugins (einmalig)
make dev            # Backend (8000) + Frontend (5173) parallel
```

<http://localhost:5173> öffnen. Das Backend läuft auf 8000, Vite proxyt `/api/*`.

## Pre-Commit-Hooks

Das Repo nutzt pre-commit. Einmalig installieren:

```bash
cd backend && poetry run pre-commit install
```

Jeder `git commit` führt aus: ruff (Lint + Format), check-yaml/json, end-of-file-Fixer, Trailing-Whitespace-Trim, Merge-Conflict-Check und einen nicht-blockierenden ROADMAP-Archive-Reminder. Frontend hat seinen eigenen ESLint-+-Prettier-Pfad.

Manuell auf alle Dateien:

```bash
cd backend && poetry run pre-commit run --all-files
```

Der Pre-Push-Hook führt die volle pre-commit-Suite zusätzlich beim Tag-Push aus, sodass ein Tag-Push keinen ungetesteten Code mehr durchlässt.

## Tests laufen lassen

```bash
make test                # Backend + Plugins + Vitest, ohne Coverage (schnell — muss grün bleiben)
make test-coverage       # Opt-in Coverage-Lauf, schwer
make test-backend        # nur Backend
make test-plugins        # alle Plugins
make test-frontend       # nur Vitest
make test-plugin-export  # ein bestimmtes Plugin
```

E2E (braucht den Dev-Server):

```bash
make dev                          # in einem Terminal
npx playwright test               # alle E2E-Tests
npx playwright test --project=smoke   # schnelle Smoke-Suite (191 Specs in v0.29.0)
```

Coverage läuft in CI bei jedem Push und lädt HTML-Reports als GitHub-Actions-Artefakte hoch (14 Tage Retention). Pull mit `gh run download --name backend-coverage` etc.

## Programmier-Standards (Auszug)

Diese Regeln gelten für jede Änderung. Vollständige Fassungen liegen in `.claude/rules/coding-standards.md` und `.claude/rules/code-hygiene.md`.

### Python

- Type Hints **immer**. Kein `Any` ohne Inline-Kommentar `# any: <Grund>`.
- Docstrings für öffentliche Funktionen (Google-Stil).
- Pydantic v2 für Schemas. Field-Validatoren statt manueller Prüfungen.
- snake_case für Dateien / Funktionen / Variablen; PascalCase für Klassen.
- Services werfen `BibliogonError`-Unterklassen — **niemals** `HTTPException`. Der globale Exception-Handler mappt. (Siehe [Architektur](architecture.md#fehlerbehandlung).)
- Kein nacktes `except Exception`. Spezifische Exceptions fangen und mit `exc_info=True` loggen.

### TypeScript

- Strict Mode. Kein `any` ohne Inline-Kommentar.
- Funktions-Komponenten + Hooks. Keine Klassen-Komponenten.
- Radix UI für Dialoge / Dropdowns / Tooltips / Tabs / Select.
- @dnd-kit für Drag-and-Drop. Kein manuelles DnD.
- Lucide React für Icons. Keine andere Icon-Bibliothek.
- react-toastify für Benutzer-Feedback. Kein `window.alert()`. Kein `console.log` für Benutzer-Info.
- API-Aufrufe **ausschließlich** über `frontend/src/api/client.ts`. Kein nacktes `fetch("/api/...")` in Komponenten.
- Kein natives `confirm()` / `alert()`. Den `useDialog`-Hook aus `AppDialog` benutzen.

### Naming

- Plugin-Verzeichnisse: `bibliogon-plugin-{name}` (kebab-case).
- Inneres Python-Paket: `bibliogon_{name}` (snake_case).
- Events / Hooks: snake_case (`chapter_pre_save`, `export_execute`).
- Kein I-Präfix für Interfaces. `Book`, nicht `IBook`.
- Keine generischen Namen: `data`, `info`, `result`, `temp`, `item`, `obj`, `val`, `tmp`, `x` sind verboten. Stattdessen: `book_data`, `plugin_info`, `export_result`, `chapter_item`. Loop-Variablen (`i`, `j`) und Lambdas ausgenommen.

### Funktions-Design

- Eine Verantwortung pro Funktion.
- Maximal 40 Zeilen pro Funktion. Über 50 = Refactoring-Signal.
- Kommentare wie `# Schritt 1` / `# Schritt 2` in einer Funktion bedeuten, sie sollte aufgeteilt werden.
- Abstraktionsebenen nicht mischen — High-Level-Code ruft Helper auf, Helper macht die Low-Level-Arbeit.

### Formatierung

- 4 Leerzeichen (Python), 2 Leerzeichen (TypeScript / CSS).
- ruff (Python) und Prettier (TypeScript) formatieren automatisch.
- Kein Em-Dash (`--` oder U+2014). Bindestriche oder Kommas.
- Keine Emojis in Code oder Kommentaren.

### Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Scope angeben, wenn klar: `feat(export): ...`, `fix(editor): ...`.
- Eine logische Änderung pro Commit.
- Branch-Namen: `feature/{name}`, `fix/{name}`, `chore/{name}`.

### i18n

- Alle UI-Strings leben in `backend/config/i18n/{lang}.yaml` quer durch alle 8 Sprachen (DE, EN, ES, FR, EL, PT, TR, JA).
- DE / EN / EL / FR / ES sind benutzer-validiert. PT / TR / JA sind auto-übersetzt und warten auf Muttersprachler-Review.
- DE-Produktivinhalt (i18n-YAML, Hilfeseiten, Plugin-DE-Prosa) verwendet **echte Umlaute**, keine ASCII-Transliterationen. Die lessons-learned-Regel listet den Geltungsbereich; `scripts/replace_umlauts.py` ist das Wartungs-Werkzeug.

## Eine Funktion hinzufügen

Dokumentierte Reihenfolge für neue Funktionen:

1. Entscheiden, ob sie in ein Plugin oder in den Core gehört. Default: Plugin.
2. Bestehende Muster ansehen (`plugin-export` ist die ausgereifteste Referenz).
3. Schema/Modell zuerst (Pydantic-Schema oder TypeScript-Interface).
4. Backend-Logik (Service-Modul, dann Route).
5. Frontend (`api/client.ts` erweitern, dann UI).
6. Unit- + Integrationstests (pytest, Vitest).
7. Playwright-Smoke-Test für jede UI-Änderung. Mindestens ein Happy-Path-Spec unter `e2e/smoke/`. Ohne den gilt nichts als „fertig".
8. i18n: Strings in **allen 8 Sprachen** ergänzen (das bestehende Muster spiegeln; DE/EN sind die Quelle der Wahrheit, die anderen 6 folgen).
9. Conventional Commit.

## Ein Plugin hinzufügen

Den vollen Ablauf siehe [Plugin-Entwickler-Leitfaden](plugins.md). Kurz:

1. `plugins/bibliogon-plugin-{name}/`.
2. `pyproject.toml` mit Entry Point: `[project.entry-points."bibliogon.plugins"]`.
3. Plugin-Klasse erbt von `pluginforge.BasePlugin`, mit `name`, `version`, `depends_on`.
4. YAML-Config: `backend/config/plugins/{name}.yaml`.
5. Routen in `routes.py` (FastAPI) + Geschäftslogik in separaten Modulen.
6. Frontend-Manifest via `get_frontend_manifest()` für UI-Slot-Erweiterungen.
7. Tests in `plugins/{name}/tests/`.
8. Path-Dependency in `backend/pyproject.toml` deklarieren (Pflicht; `importlib.metadata.entry_points()` sieht nur, was tatsächlich installiert ist).
9. In `config/app.yaml` unter `plugins.enabled` aktivieren.

## Releases ausliefern

Der Release-Workflow lebt in `release-workflow.md` — intern, aber öffentlich lesbar. Die Kurzfassung:

1. Eine Datei zur Release-Zeit von Hand bearbeiten: `backend/pyproject.toml`. Bump nach SemVer.
2. `make sync-versions` propagiert in alle Subsysteme (Frontend `package.json`, Launcher pyproject + Spec-Plist + `__init__.py`, alle 10 Plugin-pyprojects, `install.sh` und `install.ps1` aus Templates regeneriert).
3. `make sync-versions-check` und `bash scripts/verify_version_pins.sh <version>` — beide müssen sauber sein.
4. Pflicht-Pre-Tag-Kette: `make test`, `tsc --noEmit`, `vitest`, `playwright --project=smoke`, `ruff check`, `mypy app/`, `pre-commit run --all-files`, `pyinstaller bibliogon-launcher.spec --clean --noconfirm`. Alle grün.
5. `git tag -a vX.Y.Z -m "Release vX.Y.Z"` und Tag + main pushen.
6. `gh release create vX.Y.Z --notes-file changelog/releases/vX.Y.Z.md`.
7. Post-Release: ausgelieferte Items in `docs/archive/roadmap/YYYY-MM.md` archivieren, `docs/ROADMAP.md` `Latest release`-Zeile aktualisieren, `CLAUDE.md` `Version`-Zeile aktualisieren, Chat-Journal-Eintrag schreiben.

CI prüft dieselben Gates in `release-gate.yml` beim Tag-Push. Eine Drift in irgendeinem Subsystem blockiert das Anhängen der Artefakte.

## Audit-Rhythmus

Quartalsweise systematische Audits laufen über den dokumentierten Prompt in [`.claude/prompts/audit.md`](https://github.com/astrapi69/bibliogon/blob/main/.claude/prompts/audit.md). Der Prompt führt eine Read-Only-Triage in vier Bereichen durch (Test-Validität, Code-Qualität, Infrastruktur, Dokumentation) und gibt eine priorisierte Findings-Liste aus. Findings landen als Backlog-Einträge mit Prioritäts-Stufen (P0..P5).

Die Release-Zyklus-Abhängigkeitsprüfung ist ein separater Rhythmus: bei jedem Release `poetry show --outdated` (Backend + jedes Plugin + Launcher) und `npm outdated` (Frontend) ausführen. Patch + Minor + risiko-armer Minor als Teil der Release-Vorbereitung anwenden. Major-Bumps bekommen ihre eigene Session.

## Bugs melden

Issue auf GitHub: <https://github.com/astrapi69/bibliogon/issues>. Der 5xx-Fehler-Toast in der App hat einen „Issue melden"-Button, der den Issue-Body mit Stacktrace, Browser-Info und App-Version vorbefüllt — nutze ihn, wenn du kannst.

## Sicherheits-Probleme melden

Bei sicherheitsrelevanten Problemen **kein** öffentliches GitHub-Issue öffnen. Maintainer per E-Mail kontaktieren (Adresse steht in den Paket-Metadaten in `backend/pyproject.toml`).

> Zuletzt geprüft für v0.29.0 (2026-05-07).
