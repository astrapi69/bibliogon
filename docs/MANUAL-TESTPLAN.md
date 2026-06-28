# Manueller Testplan — Bibliogon

Dieses Dokument listet alle manuellen Tests, die vor einem Release
durchgeführt werden müssen.

Automatisierte Tests (Vitest, pytest, Playwright) sind hier **nicht**
enthalten — sie laufen über `make test` und die E2E-Suites.

> **Verwandte Dokumente:**
> - [`docs/manual-tests/MANUAL-TESTPLAN.md`](manual-tests/MANUAL-TESTPLAN.md)
>   — die 5 Testfälle, die *grundsätzlich nicht automatisierbar* sind
>   (Audiobook-TTS-Akustik, Service-Worker-Update-Timing, visuelle
>   Theme-Bewertung, Comic-Panel-Drag-Geometrie, echte SW-Caches).
> - [`.claude/rules/release-workflow.md`](../.claude/rules/release-workflow.md)
>   — der Release-Ablauf; das Aster-E2E-Smoke-Gate ist Pflicht vor dem Tag.

---

## Release-Gate Tests (PFLICHT vor jedem Release)

### BACKUP-AKZEPTANZTEST

Der sensibelste Test: er fasst die gesamte Storage-Seam an. Ein roter
Akzeptanztest ist ein Release-Blocker (siehe `coding-standards.md`
"BACKUP-AKZEPTANZTEST").

- [ ] Vollbackup (`.bgb`) exportieren
- [ ] App zurücksetzen (Danger-Zone → alle Daten löschen)
- [ ] Backup importieren
- [ ] Verifizieren: alle Bücher vorhanden
- [ ] Verifizieren: alle Artikel vorhanden
- [ ] Verifizieren: alle Kapitel + Inhalte korrekt
- [ ] Verifizieren: Cover-Bilder vorhanden
- [ ] Verifizieren: Einstellungen wiederhergestellt (Theme + Sprache)
- [ ] Verifizieren: Story-Bible-Einträge vorhanden
- [ ] Verifizieren: Chapter Collections erhalten (inkl. Farbe)
- [ ] Verifizieren: Inspector Notes erhalten
- [ ] Verifizieren: Synopsis-Felder erhalten

### CROSS-MODE BACKUP (Dexie ↔ API)

Prüft, dass `.bgb`-Backups zwischen der offline-PWA (IndexedDB/Dexie)
und dem Desktop (Docker/Backend) verlustfrei portierbar sind.

- [ ] PWA (GH Pages): Backup erstellen (`.bgb`)
- [ ] Desktop (Docker): Backup importieren → alles da
- [ ] Desktop: Backup erstellen (`.bgb`)
- [ ] PWA: Backup importieren → alles da

### E2E SMOKE (lokal)

- [ ] `make test-e2e-smoke` → 0 Failures
      (entspricht `npx playwright test --project=smoke`; Pflicht-Gate
      vor dem Tag)

---

## Feature-Tests (bei relevanten Änderungen)

### Editor

- [ ] Buch erstellen + 3 Kapitel hinzufügen
- [ ] Text schreiben + Formatierung (Bold, Italic, H1–H3)
- [ ] Bild einfügen (Upload + Drag&Drop)
- [ ] Kapitel per Drag&Drop umordnen
- [ ] Composition Mode (`Ctrl+Shift+D`) → nur Editor sichtbar
- [ ] Escape → zurück zum normalen Modus
- [ ] Vollbild (`F11` / `Ctrl+Shift+F`) → Editor im Vollbild, Escape zurück
- [ ] Auto-Save funktioniert (Text ändern, Seite neu laden)

### Artikel

- [ ] Artikel erstellen + Text schreiben
- [ ] Content-Type + Tags setzen
- [ ] Artikel exportieren (Markdown, HTML, PDF)

### Bilderbuch

- [ ] Bilderbuch erstellen + Seiten hinzufügen
- [ ] Bilder auf Seiten platzieren
- [ ] Text auf Seiten hinzufügen
- [ ] PDF-Export → **kein** rohes TipTap-JSON auf den Inhaltsseiten
      sichtbar (#616)
- [ ] Titelseite korrekt gerendert

### Comic

- [ ] Comicbuch erstellen + Seiten + Panels
- [ ] Bilder in Panels per Drag&Drop
- [ ] Panel-Größe / Panel-Grid ändern
- [ ] Vollbild-Modus (`Ctrl+Shift+F`)

### KDP-Wizard (7 Steps)

- [ ] Wizard öffnen → alle 7 Steps durchklickbar
      (Metadaten · Cover · Format · Preise · ARC · Paket · Anleitung)
- [ ] Metadaten-Checkliste: fehlende Felder rot markiert
- [ ] Format wählen: eBook / Taschenbuch / Hardcover
- [ ] Trim-Size + Margins konfigurierbar (nur bei Print-Formaten)
- [ ] Preis-Kalkulator: Seitenzahl → Druckkosten/Royalty
- [ ] Export-Package: ZIP mit EPUB + PDF + `metadata.json`
      (eBook → nur EPUB; Print → PDF mit Beschnitt/Trim, #583/#606)
- [ ] `metadata.json`: isbn / format / trim_size / page_count /
      generated_by / generated_at gefüllt (#614)
- [ ] KDP-Guide: Link + Walkthrough sichtbar

### Import/Export

- [ ] Scrivener-Import (`.scriv` / `.scrivx`, #554)
- [ ] Medium-Import (URL)
- [ ] GitHub-Import (Repo-URL)
- [ ] HTML-Export: Meta-Tags im `<head>` (#605/#607)
- [ ] PDF-Export: Document Info (title, author)
- [ ] EPUB-Export: OPF-Metadata vollständig
- [ ] DOCX-Export: Document Properties gesetzt
- [ ] Markdown-Export: YAML-Frontmatter (inkl. Git-Sync-Kapitel, #614)

### Einstellungen

- [ ] Theme wechseln (alle 6 Paletten × Light/Dark = 12 Varianten prüfen)
- [ ] Sprache wechseln (de → en → de), nach Reload korrekt
- [ ] Auto-Save: kein "Speichern"-Button sichtbar (#473)
- [ ] KI-Provider konfigurieren + per-Zeile Test-Button
- [ ] Update-Checker: Banner bei neuer Version (nur Desktop/SW-los)

### Dashboard

- [ ] Grid-/Listen-Ansicht wechseln
- [ ] Bücher suchen + filtern
- [ ] Papierkorb: löschen + wiederherstellen
- [ ] Buch-Cover werden angezeigt

### Quality Report

- [ ] Buch mit Text → Quality Report öffnen
- [ ] Flesch-Index berechnet
- [ ] Komplexe Sätze (Schachtelsätze) markiert
- [ ] Wörterzahl korrekt
- [ ] Kapitel-Tabelle nach logischer Buchreihenfolge nummeriert

### Kapitel-Features

- [ ] Chapter Status setzen (Entwurf → Fertig)
- [ ] Synopsis schreiben → im Outliner sichtbar
- [ ] Inspector Notes schreiben → nach Reload da
- [ ] Collections erstellen + Farbe setzen (#572)
- [ ] Outliner: Tabelle mit allen Spalten

### Data Migration

- [ ] Erste Installation (keine Bücher UND keine Artikel) → Welcome-Dialog
      erscheint (#591)
- [ ] "Ohne Daten starten" → Dialog verschwindet permanent
      (`bibliogon-migration-offered` gesetzt)
- [ ] "Online-Version öffnen" → GH Pages öffnet sich

---

## Launcher-Tests (Windows/Linux/macOS)

Der Launcher baut die Docker-Images aus einer **lokalen Kopie** des
Bibliogon-Repos (kein Release-Download); Docker + die Repo-Quellen
müssen vorab auf der Platte liegen. Konfiguration + Verhalten:
[`docs/LAUNCHER-SPEC.md`](LAUNCHER-SPEC.md). Plattform-Smoke-Tests
brauchen echte Hardware pro OS.

### Erstinstallation

- [ ] Launcher starten → Docker-Check ist erster Schritt
- [ ] Docker nicht gestartet → Meldung + "Erneut prüfen"
- [ ] Docker läuft → Install-Button → `docker compose build` startet
- [ ] Fortschrittsanzeige sichtbar während des Builds (erster Build 3–5 min)
- [ ] App öffnet im Browser nach der Installation (`localhost:7880`)

### Laufende App

- [ ] Launcher erneut öffnen → Management-Zustand (Buttons enabled/disabled)
- [ ] "Im Browser öffnen" → App öffnet
- [ ] "Stoppen" → Container stoppt
- [ ] "Deinstallieren" → Bestätigung → Container/Images entfernt
- [ ] "Copy log" → Log in der Zwischenablage
- [ ] "Cleanup" → scannt + entfernt Leftover-Artefakte

### Port-Konfiguration

- [ ] Port-Feld editierbar (nicht installiert / gestoppt)
- [ ] Port-Feld read-only bzw. Apply-Port (läuft)
- [ ] Port belegt → Warnung + Vorschlag eines freien Ports

---

## Plattform-Matrix

| Test | Chrome | Firefox | Safari | PWA | Desktop |
|------|--------|---------|--------|-----|---------|
| Editor | | | | | |
| Export | | | | | |
| Import | | | | | |
| Dashboard | | | | | |
| Backup (`.bgb`) | | | | | |

---

## Ergebnis-Protokoll

```
Datum:       ___________
Version:     v0.____
Tester:      ___________
Ergebnis:    ____ / ____ bestanden
Anmerkungen:
```
