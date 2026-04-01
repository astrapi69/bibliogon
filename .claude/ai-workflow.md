# KI-Arbeitsweise

## Reihenfolge bei neuen Features

1. CLAUDE.md und docs/CONCEPT.md lesen (Projektkontext verstehen).
2. Pruefen ob Feature in ein Plugin gehoert oder zum Kern.
3. Bestehende Patterns anschauen (z.B. wie plugin-export aufgebaut ist).
4. Schema/Model zuerst (Pydantic Schema oder TypeScript Interface).
5. Backend-Logik (Service-Modul, dann Route).
6. Frontend (API Client erweitern, dann UI).
7. Tests schreiben.
8. i18n-Strings in allen 5 Sprachen ergaenzen (DE, EN, ES, FR, EL).
9. Conventional Commit.

## Reihenfolge bei neuen Plugins

1. Plugin-Ordner anlegen: plugins/bibliogon-plugin-{name}/
2. pyproject.toml mit Entry Point: [project.entry-points."bibliogon.plugins"]
3. Plugin-Klasse: {Name}Plugin(BasePlugin) mit name, version, depends_on.
4. YAML-Config: backend/config/plugins/{name}.yaml
5. Hook-Implementierungen (wenn noetig, neue Hook-Specs in hookspecs.py).
6. routes.py fuer API-Endpunkte.
7. Frontend-Manifest via get_frontend_manifest() (UI-Slots).
8. Tests in plugins/{name}/tests/.
9. Plugin in config/app.yaml unter enabled eintragen.

## Reihenfolge bei Aenderungen

1. Bestehende Tests lesen und verstehen.
2. Aenderung implementieren.
3. Tests anpassen oder erweitern.
4. Sicherstellen dass `make test` gruen bleibt.

## Nicht erlaubt

- Neue Dependencies einfuehren ohne Rueckfrage.
- Architektur-Entscheidungen aendern (z.B. SQLAlchemy ersetzen, TipTap ersetzen).
- PluginForge-Code in Bibliogon aendern (separates Repo!).
- Plugin-Struktur aendern (BasePlugin, Hook-Specs) ohne Rueckfrage.
- Code generieren der "fuer spaeter" ist. Nur was jetzt gebraucht wird.
- console.log im Production-Code. Toast-Notifications fuer User-Feedback.
- Direkte DB-Queries in Routern. Immer ueber Service/Model-Layer.
- fetch() direkt in React-Komponenten. Immer ueber api/client.ts.
- Browser-native Dialoge (alert, confirm, prompt). AppDialog (Radix) nutzen.
- CSS ohne Variables. Alles muss mit den 3 Themes (6 Varianten) funktionieren.
- HTML als Speicherformat. TipTap JSON ist das interne Format.
- Tailwind, styled-components, emotion oder andere CSS-Frameworks.
- Andere Icon-Libraries als Lucide React.

## Implizite Annahmen (die Claude Code kennen muss)

### Architektur
- Jeder Export ist ein Plugin. Kein Export-Code im Kern.
- PluginForge ist ein EXTERNES PyPI-Paket. Aenderungen dort = separates Repo.
- manuscripta ist ein EXTERNES PyPI-Paket. Export-Plugin nutzt es, aendert es nicht.
- write-book-template ist die Ziel-Verzeichnisstruktur fuer Exports.

### Plugins
- Proprietary Plugins (kinderbuch, kdp, grammar) brauchen Lizenzpruefung via pre_activate.
- MIT Plugins (export, help, getstarted) sind frei, keine Lizenzpruefung.
- Plugin-UI wird ueber Manifest-driven UI-Slots realisiert, nicht durch direkte Imports.
- Plugins kommunizieren ueber Hook-Specs, nicht ueber direkte Imports zwischen Plugins.
- Plugin-Abhaengigkeiten: deklarativ (depends_on), topologisch sortiert von PluginForge.

### Frontend
- Dark Mode existiert (3 Themes x Light/Dark = 6 Varianten).
- Neue UI-Elemente MUESSEN mit CSS Variables arbeiten.
- TipTap speichert als JSON. Markdown ist nur ein Anzeige-/Eingabemodus.
- Radix UI fuer accessible Primitives. Kein eigenes Dialog/Dropdown/Tooltip bauen.
- @dnd-kit fuer alle Drag-and-Drop Interaktionen.

### Daten
- ChapterType ist ein Enum mit 13 Werten (chapter, preface, foreword, ..., interlude).
- Eigene Dateiformate: .bgb (Backup), .bgp (Projekt).
- Assets (Cover, Bilder) werden ueber /api/assets/ verwaltet, nicht inline in TipTap-JSON.

### i18n
- 5 Sprachen: DE, EN, ES, FR, EL.
- Alle User-sichtbaren Strings in YAML (backend/config/i18n/), nicht hardcoded.
- Plugin-spezifische Strings in der Plugin-YAML (display_name, description).

### Aktueller Stand
- Version: 0.7.0 (Phase 7 abgeschlossen).
- Naechste Phase: 8 (Audiobook-Plugin).
- 130 Tests (23 export, 8 kinderbuch, 10 kdp, 7 grammar, 30 backend, 52 e2e).
- Offene Fragen: Frontend-Plugin-Loading (Module Federation vs. importmaps), Plugin-DB-Migrationen (Alembic-Strategie).

## Kommunikation

- Direkt, sachlich, keine Beschoenigungen.
- Bei Unklarheiten: Nachfragen, nicht raten.
- Wenn etwas gegen die Architektur verstoesst: Sagen, nicht stillschweigend umgehen.
- Vorschlaege willkommen, aber als Vorschlag kennzeichnen.
