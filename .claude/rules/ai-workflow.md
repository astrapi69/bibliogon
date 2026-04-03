# KI-Arbeitsweise

## Session-Start

Bei der ersten Nachricht einer Session:
1. docs/ROADMAP.md lesen (aktueller Stand, offene Punkte).
2. Letzte Aenderungen pruefen: git log --oneline -10
3. make test laufen lassen (Baseline sicherstellen).
Erst danach mit der Aufgabe beginnen.

## Interpretation von "weiter" / "naechster Punkt"

Wenn der Nutzer "weiter", "naechster Punkt", "mach weiter" oder aehnliches sagt:
1. docs/ROADMAP.md lesen, Sektion "Naechste Schritte".
2. Ersten offenen Punkt (unchecked Checkbox) nennen.
3. Auf Bestaetigung warten, NICHT sofort umsetzen.

## Reihenfolge bei neuen Features

1. Pruefen ob Feature in ein Plugin gehoert oder zum Kern.
2. Bestehende Patterns anschauen (z.B. wie plugin-export aufgebaut ist).
3. Schema/Model zuerst (Pydantic Schema oder TypeScript Interface).
4. Backend-Logik (Service-Modul, dann Route).
5. Frontend (API Client erweitern, dann UI).
6. Tests schreiben.
7. i18n-Strings in allen 5 Sprachen ergaenzen (DE, EN, ES, FR, EL).
8. Conventional Commit.

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

## Nicht erlaubt (KI-spezifisch)

Fuer Code-Verbote (fetch, console.log, Tailwind, etc.) siehe coding-standards.md und architecture.md.

Zusaetzlich fuer die KI:
- Neue Dependencies einfuehren ohne Rueckfrage.
- Architektur-Entscheidungen aendern (z.B. SQLAlchemy ersetzen, TipTap ersetzen).
- PluginForge-Code in Bibliogon aendern (separates Repo!).
- Plugin-Struktur aendern (BasePlugin, Hook-Specs) ohne Rueckfrage.
- Code generieren der "fuer spaeter" ist. Nur was jetzt gebraucht wird.
- Bestehende Tests loeschen, auskommentieren oder abschwaechen um `make test` gruen zu bekommen.
- Custom TipTap-Extensions bauen ohne vorher zu pruefen ob eine offizielle existiert.
- Im autonomen Modus bei Unklarheiten weiterraten. Lieber abbrechen und Unsicherheit dokumentieren.

## Aktueller Stand

Siehe architecture.md fuer Architektur-Details. Zusaetzlich beachten:
- Version: 0.7.0 (Phase 7 abgeschlossen, GitHub Release v0.7.0 existiert).
- Naechste Phase: 8 (Audiobook-Plugin).
- 159 Tests (38 backend, 48 plugin, 21 vitest, 52 e2e).
- 15 offizielle TipTap-Extensions + 1 Community (@pentestpad/tiptap-extension-figure).
- 24 Toolbar-Buttons im Editor.
- Deployment: Docker Compose, Port 7880, install.sh One-Liner.
- WICHTIG: Vor Custom-Code IMMER pruefen ob eine TipTap-Extension oder Library existiert.
- WICHTIG: Siehe lessons-learned.md fuer bekannte Fallstricke (TipTap, Import, Export).

## Kommunikation

- Direkt, sachlich, keine Beschoenigungen.
- Bei Unklarheiten: Nachfragen, nicht raten.
- Wenn etwas gegen die Architektur verstoesst: Sagen, nicht stillschweigend umgehen.
- Vorschlaege willkommen, aber als Vorschlag kennzeichnen.

## Dokumentations-Protokoll

Jede Session wird dokumentiert. Das ist Pflicht, nicht optional. Die Dokumentation dient als Retrospektive und als Wissensbasis fuer zukuenftige Sessions.

### Chat-Journal (docs/chat-journal-session-{YYYY-MM-DD}.md)

Jeder relevante Arbeitsschritt wird protokolliert. Format pro Eintrag:

```markdown
## {Nr}. {Kurztitel} ({HH:MM})

- Original-Prompt: Was wurde gesagt/gefragt
- Optimierter Prompt: Wie haette man es praeziser formulieren koennen
- Ziel: Was sollte erreicht werden
- Ergebnis: Was wurde tatsaechlich gemacht
- Commit: {Hash} (wenn Code geaendert wurde)
```

Am Ende jeder Session: Zusammenfassung mit Statistiken (Commits, Tests, neue/geaenderte Dateien, Hauptergebnisse).

**Was ins Journal gehoert:**
- Jede implementierte Aenderung (Feature, Fix, Refactoring)
- Architektur-Entscheidungen und deren Begruendung
- Probleme die aufgetreten sind und wie sie geloest wurden
- Prompt-Optimierungen (Original vs. besser formuliert)

**Was NICHT ins Journal gehoert:**
- Smalltalk, Wiederholungen, Tippfehler-Korrekturen

### Wann CLAUDE.md aktualisieren

- Neues Plugin hinzugefuegt, entfernt oder aktiviert/deaktiviert in app.yaml
- Neue Dependency im Tech-Stack
- Test-Zahlen haben sich wesentlich geaendert
- Neue Befehle im Makefile
- Verzeichnisstruktur hat sich geaendert
- Neue API-Endpunkte
- Phase abgeschlossen oder neue Phase begonnen
- Version hochgezaehlt

### Wann CONCEPT.md aktualisieren

- Architektur-Entscheidung getroffen oder geaendert
- Neues Plugin im Katalog (geplant oder implementiert)
- Offene Frage beantwortet oder neue aufgetaucht
- Geschaeftsmodell oder Lizenzierung geaendert
- Tech-Stack-Aenderung (neue Library, Framework-Wechsel)
- UI-Strategie geaendert (neue Slots, neue Bibliotheken)

### Wann lessons-learned.md aktualisieren

- Neuer Fallstrick entdeckt (Bug der durch falsches Pattern entstand)
- Workaround fuer Library-Limitation gefunden
- Import/Export-Edge-Case geloest
- CSS/TipTap-Spezifitaetsproblem geloest

### Ablauf am Session-Ende

1. Chat-Journal-Eintrag fuer alle Aenderungen der Session schreiben.
2. Pruefen ob CLAUDE.md, CONCEPT.md oder lessons-learned.md Updates brauchen.
3. Alles committen: `docs: update chat journal and documentation`
4. Bei groesseren Meilensteinen: Zusammenfassung mit Statistiken ins Journal.
