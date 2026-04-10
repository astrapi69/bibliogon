# Release Workflow

Permanenter Workflow fuer Bibliogon Releases. Diese Datei wird von
Claude Code automatisch gelesen wenn ein Release ansteht.

Prompt-Trigger: "Release neue Version", "Neuer Release", "Deploy neue Version"

---

## Grundprinzipien

- Keine manuellen Schritte vergessen: die Checkliste am Ende ist Pflicht
- Jeder Release ist ein logischer Abschnitt: nicht mitten in einem Feature releasen
- Tests muessen gruen sein: rote Tests blockieren den Release, keine Ausnahmen
- CHANGELOG ist fuer Menschen: keine rohen Commit-Messages kopieren, sinnvoll zusammenfassen
- Version-Bump folgt SemVer: auch in der 0.x Phase

---

## Schritt 1: Aktuellen Stand erfassen

Vor jeder Aktion zeige den aktuellen Stand:

```bash
# Letztes Release-Tag
git tag --sort=-creatordate | head -5

# Commits seit letztem Tag (Tag dynamisch ermitteln)
LAST_TAG=$(git describe --tags --abbrev=0)
git log ${LAST_TAG}..HEAD --oneline --no-merges

# Statistik
git diff ${LAST_TAG}..HEAD --stat | tail -1

# Aktuelle Versionen
grep -H "version" backend/pyproject.toml frontend/package.json 2>/dev/null | head -5
```

Zeig dem User die Zusammenfassung und warte auf Bestaetigung bevor
der Release weitergeht.

---

## Schritt 2: Version-Bump nach SemVer

Analyse der Commits zur Entscheidung:

| Commit-Typ | Bump |
|------------|------|
| `BREAKING CHANGE` im Body oder `!` nach Typ | Major (v1.0.0) |
| `feat:` | Minor (v0.X.0) |
| `fix:`, `perf:`, `refactor:` ohne Breaking | Patch (v0.X.Y) |
| Nur `docs:`, `chore:`, `test:` | Patch (v0.X.Y) |

In der 0.x Phase ist ein Major-Bump selten. Breaking Changes fuehren
meist zu einem Minor-Bump mit Breaking-Changes-Abschnitt im CHANGELOG.

Schlage die neue Version vor mit Begruendung. Warte auf User-OK oder
Korrektur.

---

## Schritt 3: CHANGELOG.md generieren

Aus den Commits einen sauberen CHANGELOG-Eintrag bauen. Nicht roh
kopieren, sondern gruppieren und zusammenfassen.

Gruppen in dieser Reihenfolge:
- **Breaking Changes** (nur bei Bedarf, oben)
- **Added** (feat:)
- **Changed** (refactor:, perf:)
- **Deprecated**
- **Removed**
- **Fixed** (fix:)
- **Security**

Format-Regeln:
- Vergangenheit oder Praesens, einheitlich im Eintrag
- Scope aus Commit uebernehmen wenn sinnvoll (z.B. "Audiobook-Plugin: ...")
- Mehrere Commits zum gleichen Feature zusammenfassen
- Interne Refactorings ohne User-Impact weglassen oder knapp erwaehnen

Beispiel-Struktur:

```markdown
## [0.10.0] - 2026-04-XX

### Added
- Feature-Beschreibung fuer User relevant

### Fixed
- Bug-Beschreibung so dass der User erkennt was besser ist

### Changed
- Wichtige Aenderungen an bestehenden Features
```

Zusaetzlich eine extrahierte Datei `CHANGELOG-v0.X.0.md` mit nur
dem neuen Eintrag fuer die GitHub Release Notes.

Commit:
```
docs: changelog for v0.X.0
```

---

## Schritt 4: Versionen bumpen

Alle Stellen wo die Version steht aktualisieren. Typische Orte:

- `backend/pyproject.toml`
- `frontend/package.json`
- `plugins/*/pyproject.toml`
- `backend/app/__init__.py` (`__version__`)
- `docs/CONCEPT.md` (falls Version erwaehnt)
- `README.md` (falls Version erwaehnt)

Pruefen via grep:
```bash
grep -rn "0\.9\.0" --include="*.toml" --include="*.json" --include="*.py" --include="*.md"
```

(Alte Versionsnummer anpassen an den tatsaechlichen Vorgaenger.)

Wichtig: Dependency-Versionen von manuscripta, pluginforge und 
anderen Bibliogon-eigenen Libraries pruefen. Wenn eine neue 
manuscripta-Version rausgekommen ist, gleichzeitig updaten.

Commit:
```
chore(release): bump version to v0.X.0
```

---

## Schritt 5: Tests

Vollstaendige Test-Suite:

```bash
make test              # Backend + alle Plugins
cd frontend && npx tsc --noEmit && npm run test
cd backend && ruff check . && mypy .
```

ALLE muessen gruen sein. Bei rotem Test:
1. Release abbrechen
2. Problem analysieren und fixen
3. Erst danach Release neu starten ab Schritt 1

---

## Schritt 6: Build verifizieren

```bash
# Backend
cd backend && poetry build

# Frontend
cd frontend && npm run build

# Docker (falls aktiv)
docker build -t bibliogon:test .
```

Bei Build-Fehler: Stoppen, melden, beheben, neu starten.

---

## Schritt 7: Git-Tag und Push

```bash
git tag -a v0.X.0 -m "Release v0.X.0"
git push origin main
git push origin v0.X.0
```

---

## Schritt 8: GitHub Release erstellen

Mit gh CLI (bevorzugt):
```bash
gh release create v0.X.0 \
  --title "Bibliogon v0.X.0" \
  --notes-file CHANGELOG-v0.X.0.md
```

Falls gh CLI nicht verfuegbar: Anleitung fuer manuelle Erstellung
auf GitHub ausgeben:
- URL: https://github.com/astrapi69/bibliogon/releases/new
- Tag: v0.X.0 auswaehlen
- Title: Bibliogon v0.X.0
- Notes: Inhalt aus CHANGELOG-v0.X.0.md einfuegen
- "Publish release" klicken

---

## Schritt 9: Docker Image taggen und pushen

Falls Docker-Images publiziert werden:

```bash
docker build -t bibliogon:v0.X.0 -t bibliogon:latest .
docker push bibliogon:v0.X.0
docker push bibliogon:latest
```

Falls nicht aktiv: diesen Schritt ueberspringen und im Release-Log 
vermerken.

---

## Schritt 10: Dokumentations-Site deployen

Wenn das Help-System mit MkDocs eingerichtet ist:

- GitHub Action triggert sich automatisch auf Push auf main
- Kein manueller Schritt
- Verifizieren: https://astrapi69.github.io/bibliogon/ zeigt neue Inhalte
- Action-Status pruefen: `gh run list --workflow=docs.yml --limit=1`

Bei fehlgeschlagenem Deploy: Fehler aus den Action-Logs holen und
fixen, aber Release ist trotzdem raus.

---

## Schritt 11: Post-Release Dokumentation

- `docs/chat-journal-session-{heute}.md`: 
  Release-Eintrag mit Version, Datum, wichtigsten Aenderungen, 
  Deploy-Zeitpunkt
- `ROADMAP.md`: 
  Alle Items die im Release enthalten sind als `[x]` markieren
- `CLAUDE.md`: 
  Bei neuen Endpoints oder Architektur-Aenderungen aktualisieren
- `.claude/rules/lessons-learned.md`: 
  Falls im Release-Prozess etwas auffaelliges war (neuer Fallstrick, 
  Workflow-Verbesserung), dokumentieren

Commit:
```
docs: post-release documentation v0.X.0
```

```bash
git push origin main
```

---

## Abschluss-Checkliste

Diese Checkliste MUSS vollstaendig abgehakt sein bevor der Release
als "fertig" gilt. Fehlende Punkte blockieren den Release.

- [ ] Commits seit letztem Tag reviewed
- [ ] Versionsnummer nach SemVer bestimmt und vom User bestaetigt
- [ ] CHANGELOG.md mit neuem Eintrag committet
- [ ] CHANGELOG-v0.X.0.md fuer GitHub Release erstellt
- [ ] Version in allen pyproject.toml und package.json aktualisiert
- [ ] Version in __version__ und sonstigen Python-Modulen aktualisiert
- [ ] manuscripta und andere Bibliogon-Deps auf aktueller Version
- [ ] `make test` gruen
- [ ] Frontend `tsc --noEmit` sauber
- [ ] `ruff check` sauber
- [ ] `mypy` sauber (falls aktiv)
- [ ] Backend `poetry build` erfolgreich
- [ ] Frontend `npm run build` erfolgreich
- [ ] Docker Build erfolgreich (falls aktiv)
- [ ] Git-Tag erstellt und gepusht
- [ ] GitHub Release veroeffentlicht
- [ ] Docker-Image gepusht (falls aktiv)
- [ ] MkDocs-Site deployed und verifiziert
- [ ] Chat-Journal Release-Eintrag
- [ ] ROADMAP erledigte Items markiert
- [ ] CLAUDE.md aktualisiert (falls noetig)
- [ ] Post-Release Commit gepusht

---

## Troubleshooting

### Tests schlagen fehl unmittelbar vor Release

Nicht aus dem Workflow ausbrechen. Release abbrechen, Test fixen, 
neuer Commit, ab Schritt 1 neu starten. Kein Workaround wie 
"Test deaktivieren fuer den Release".

### Build fehlerhaft wegen Dependencies

`poetry lock --no-update` und `npm install` in beiden Projekten, 
dann neu bauen. Bei anhaltenden Fehlern: Release abbrechen, Problem 
in eigenem Commit loesen.

### GitHub Action fuer Docs fehlgeschlagen

Release-Tag bleibt gueltig. Docs-Deploy ist ein separates Problem 
das nach dem Release gefixt werden kann. Im Chat-Journal vermerken.

### Docker-Push scheitert

Login pruefen: `docker login`. Tag pruefen: `docker images | grep bibliogon`.
Bei Registry-Problem: Release ist trotzdem gueltig, Push nachholen 
wenn Registry wieder verfuegbar.

### Falsche Versionsnummer nach Tag-Push

```bash
git tag -d v0.X.0
git push origin :refs/tags/v0.X.0
```

Dann neuen Tag mit korrekter Nummer. ACHTUNG: Nur wenn der Tag 
noch nicht als GitHub Release veroeffentlicht ist und niemand 
ihn schon gezogen hat.

---

## Versions-Konvention

Bibliogon folgt Semantic Versioning 2.0.0:

- **Major (X.0.0)**: Breaking Changes in der API oder grundlegende 
  Architektur-Aenderungen. In der 0.x Phase selten.
- **Minor (0.X.0)**: Neue Features, rueckwaertskompatibel. Auch kleine 
  Breaking Changes sind in 0.x akzeptabel, muessen aber im CHANGELOG 
  prominent markiert werden.
- **Patch (0.X.Y)**: Bug-Fixes, rueckwaertskompatibel.

Pre-Release-Tags (`-alpha`, `-beta`, `-rc`) werden aktuell nicht 
verwendet. Releases sind immer stabil.

---

## Hinweis fuer Claude Code

Dieser Workflow ist ein Leitfaden, kein starres Skript. Wenn der User
explizit eine Abweichung wuenscht (z.B. "ueberspringe Docker diesmal"),
das akzeptieren und im Chat-Journal dokumentieren WARUM abgewichen wurde.

Aber: Checkliste-Items die Sicherheit betreffen (Tests gruen, Build 
erfolgreich, korrekte Version) duerfen NIE uebersprungen werden, auch 
nicht auf Anweisung. Lieber den Release verschieben als kaputte Software 
releasen.
