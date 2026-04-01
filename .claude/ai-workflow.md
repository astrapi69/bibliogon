# KI-Arbeitsweise

## Reihenfolge bei neuen Features

1. CLAUDE.md lesen (Projektkontext verstehen).
2. Pruefen ob Feature in ein Plugin gehoert oder zum Kern.
3. Bestehende Patterns anschauen (z.B. wie plugin-export aufgebaut ist).
4. Schema/Model zuerst (Pydantic Schema oder TypeScript Interface).
5. Backend-Logik (Service-Modul, dann Route).
6. Frontend (API Client erweitern, dann UI).
7. Tests schreiben.
8. Conventional Commit.

## Reihenfolge bei Aenderungen

1. Bestehende Tests lesen und verstehen.
2. Aenderung implementieren.
3. Tests anpassen oder erweitern.
4. Sicherstellen dass `make test` gruen bleibt.

## Nicht erlaubt

- Neue Dependencies einfuehren ohne Rueckfrage.
- Architektur-Entscheidungen aendern (z.B. SQLAlchemy durch etwas anderes ersetzen).
- Plugin-Struktur aendern (BasePlugin, Hook-Specs) ohne Rueckfrage.
- Code generieren der "fuer spaeter" ist. Nur was jetzt gebraucht wird.
- console.log im Production-Code. Toast-Notifications (react-toastify) fuer User-Feedback.
- Direkte DB-Queries in Routern. Immer ueber Service/Model-Layer.

## Implizite Annahmen (die Claude Code kennen muss)

- Jeder Export ist ein Plugin. Kein Export-Code im Kern.
- PluginForge ist ein EXTERNES Paket (PyPI). Aenderungen dort sind ein separates Repo.
- manuscripta ist ein EXTERNES Paket (PyPI). Export-Plugin nutzt es, aendert es nicht.
- write-book-template ist die Ziel-Verzeichnisstruktur fuer Exports.
- Proprietary Plugins (kinderbuch, kdp, grammar) brauchen Lizenzpruefung via pre_activate.
- MIT Plugins (export, help, getstarted) sind frei, keine Lizenzpruefung.
- i18n: Alle User-sichtbaren Strings in YAML, nicht hardcoded. 5 Sprachen: DE, EN, ES, FR, EL.
- Dark Mode existiert (3 Themes). Neue UI-Elemente MUESSEN mit CSS Variables arbeiten.
- TipTap speichert als JSON. Markdown ist nur ein Anzeige-/Eingabemodus, nicht das Speicherformat.

## Kommunikation

- Direkt, sachlich, keine Beschoenigungen.
- Bei Unklarheiten: Nachfragen, nicht raten.
- Wenn etwas gegen die Architektur verstoesst: Sagen, nicht stillschweigend umgehen.
- Vorschlaege willkommen, aber als Vorschlag kennzeichnen.
