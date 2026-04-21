# Git-Sicherung: Grundlagen

Git ist ein verteiltes Versionskontrollsystem. Bibliogon nutzt es, um jede Version deines Buchs zu sichern: jeder Commit ist ein Schnappschuss, den du später ansehen, vergleichen oder wiederherstellen kannst.

Dieses Dokument deckt die lokale Nutzung ab. Synchronisation mit einem Remote (GitHub, GitLab, Gitea) wird in **Git-Sicherung > Remote** beschrieben, SSH-Authentifizierung in **Git-Sicherung > SSH-Schlüssel**.

## Was wird versioniert

Pro Buch legt Bibliogon ein eigenes Git-Repository an (`.git` innerhalb des Buchverzeichnisses). Bei jedem Commit schreibt Bibliogon den aktuellen Zustand auf die Platte:

- `manuscript/chapters/NN-<slug>.json` — jedes Kapitel als TipTap-JSON
- `manuscript/front-matter/` und `back-matter/` — Vor- und Nachspann (TOC, Widmung, Impressum, etc.)
- `config/metadata.yaml` — Buchmetadaten (Titel, Autor, ISBN, Sprache)
- `NN-<slug>.md` neben jeder JSON — Markdown-Version (advisorisch, für lesbare Git-Diffs)
- `.gitignore` — blockiert Audiobook-Dateien, Exporte und temporäre Dateien

Die JSON ist die kanonische Quelle. Das Markdown wird bei jedem Commit neu generiert und dient nur dem Vergleich im Git-Log.

## Repository initialisieren

1. Öffne das Buch im Editor.
2. Klicke in der Sidebar **Git-Sicherung**.
3. Im Dialog: **Repository initialisieren**.

Der erste Commit `Initial commit: <Buchtitel>` wird automatisch erzeugt. Danach stehen Commit-Knopf und Verlauf zur Verfügung.

Die Initialisierung ist idempotent: ein weiterer Klick auf **Initialisieren** ändert nichts.

## Commit erstellen

1. **Git-Sicherung** öffnen.
2. Eine **Commit-Nachricht** eingeben (z. B. „Kapitel 3 überarbeitet").
3. **Commit** klicken.

Bibliogon schreibt den aktuellen Buchzustand auf die Platte und legt einen Git-Commit an. Nach dem Commit:

- Die HEAD-Anzeige zeigt den neuen Hash.
- Der Eintrag erscheint oben im Verlauf.
- Die Sidebar-Anzeige (Punkt neben dem Git-Button) aktualisiert sich nach Dialog-Schließung.

Wenn sich seit dem letzten Commit nichts geändert hat, lehnt Bibliogon den Commit mit der Meldung **Keine Änderungen zu committen** ab.

## Wann committen

Git bietet mehr Flexibilität als der klassische Autosave. Empfehlungen, keine Regeln:

- **Nach einer abgeschlossenen Arbeitssitzung.** Zum Beispiel, wenn ein Kapitel fertig ist oder du für heute aufhörst.
- **Vor einer riskanten Änderung.** Eine große Umstrukturierung, ein gelöschter Absatz, ein Experiment — ein Commit davor ermöglicht einen klaren Rückweg.
- **Wenn ein Meilenstein erreicht ist.** Erster Entwurf, nach Lektorat, vor Export.
- **Nicht zu häufig.** Autosave + lokale Entwürfe fangen Tastendruck-Verluste bereits auf. Git-Commits sind für Meilensteine, nicht für jede Sitzung.

Faustregel: „Kann ich diesen Stand in einem halben Satz beschreiben?" Dann ist es ein Commit wert.

## Verlauf lesen

Der **Verlauf** im Dialog zeigt die letzten Commits, neueste zuerst:

- **Kurz-Hash** (z. B. `a1b2c3d`) — eindeutiger Identifier jedes Commits.
- **Nachricht** — was du eingegeben hast.
- **Autor** — aus dem Buchmetadaten-Feld `author`.
- **Datum** — lokale Zeit des Commits.

Für detaillierte Diffs nutze ein externes Git-Tool (Git-CLI, GitKraken, Sourcetree, VS Code Source Control) im Buchverzeichnis `uploads/<Buch-ID>/`.

## Fehlerbehebung

**„Für dieses Buch ist noch kein Repository vorhanden."**
Die Initialisierung wurde noch nicht gemacht. Klicke **Repository initialisieren** im Dialog.

**„Keine Änderungen zu committen."**
Der aktuelle Buchzustand ist identisch mit dem letzten Commit. Entweder ist alles schon gesichert oder die Änderung wurde noch nicht automatisch gespeichert — warte kurz und versuche es nochmal.

**Beschädigtes Repository.**
Bibliogon versucht, Git-Operationen gracefully zu behandeln. Bei unerwarteten Fehlern: das Repository unter `uploads/<Buch-ID>/.git` manuell reparieren oder löschen und neu initialisieren. Die TipTap-JSON-Quelle liegt in der Bibliogon-Datenbank, nicht im Repository — sie geht nicht verloren.
