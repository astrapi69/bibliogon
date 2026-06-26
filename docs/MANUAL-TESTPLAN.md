# Manueller Testplan — Bibliogon

Dieses Dokument listet alle manuellen Tests die vor einem
Release durchgefuehrt werden muessen.

Automatisierte Tests (Vitest, pytest, Playwright) sind hier
NICHT enthalten. Wo ein Punkt teilweise automatisiert ist, wird
das vermerkt.

## Verwandte Dokumente

- [`manual-tests/MANUAL-TESTPLAN.md`](manual-tests/MANUAL-TESTPLAN.md)
  — die 5 echt-nicht-automatisierbaren Faelle (Audio-Qualitaet,
  SW-Timing, subjektive Theme-Bewertung, Comic-Drag-Geometrie,
  echte SW-Caches) mit der jeweiligen Begruendung.
- [`manual-tests/distribution-smoke-test.md`](manual-tests/distribution-smoke-test.md)
  — die ausfuehrliche Launcher- / Distributions-Vorlage
  (install.sh, Windows/Linux/macOS Artefakte, uninstall.sh).
  Die Launcher-Sektion weiter unten ist die Kurzform; die
  vollstaendige Checkliste pro Plattform liegt dort.
- [`smoke-tests-catalog.md`](smoke-tests-catalog.md) — die
  Zuordnung Testfall → automatisierte Abdeckung.

---

## Release-Gate Tests (PFLICHT vor jedem Release)

### BACKUP-AKZEPTANZTEST

> Auch automatisiert in `e2e/smoke/backup-acceptance.spec.ts`
> (Export → Reset → Import → Verify gegen das Live-Backend).
> Der manuelle Durchlauf bleibt Release-Blocker, weil er die
> Cross-Mode-Pfade und neue Entitaeten abdeckt die der
> Smoke-Test nicht garantiert.

- [ ] Vollbackup (.bgb) exportieren
- [ ] App zuruecksetzen (alle Daten loeschen)
- [ ] Backup importieren
- [ ] Verifizieren: alle Buecher vorhanden
- [ ] Verifizieren: alle Artikel vorhanden
- [ ] Verifizieren: alle Kapitel + Inhalte korrekt
- [ ] Verifizieren: Cover-Bilder vorhanden
- [ ] Verifizieren: Einstellungen wiederhergestellt
- [ ] Verifizieren: Story-Bible Eintraege vorhanden
- [ ] Verifizieren: Chapter Collections erhalten
- [ ] Verifizieren: Inspector Notes erhalten
- [ ] Verifizieren: Synopsis-Felder erhalten

### CROSS-MODE BACKUP (Dexie <> API)

> Pruefen ob ein in einem Modus erstelltes `.bgb` im jeweils
> anderen Modus vollstaendig wiederherstellbar ist. Beide
> Richtungen sind Pflicht.

- [ ] PWA (GH Pages): Backup erstellen (.bgb)
- [ ] Desktop (Docker): Backup importieren → alles da
- [ ] Desktop: Backup erstellen (.bgb)
- [ ] PWA: Backup importieren → alles da

### E2E SMOKE (lokal)

> Vor dem Tag-Push laut `release-workflow.md` Pflicht. Lokal
> ueber den Makefile-Target.

- [ ] `make test-e2e-smoke` → 0 Failures
- [ ] Bei Flake: `make test-e2e-smoke-retries` → 0 Failures

---

## Feature-Tests (bei relevanten Aenderungen)

### Editor

- [ ] Buch erstellen + 3 Kapitel hinzufuegen
- [ ] Text schreiben + Formatierung (Bold, Italic, H1-H3)
- [ ] Bild einfuegen (Upload + Drag&Drop)
- [ ] Kapitel per Drag&Drop umordnen
- [ ] Composition Mode → nur Editor sichtbar
- [ ] Escape → zurueck zum normalen Modus
- [ ] Auto-Save funktioniert (Text aendern, Seite neu laden)
- [ ] Kapitelwechsel laedt korrekten Inhalt (kein Stale-Kapitel)

### Artikel

- [ ] Artikel erstellen + Text schreiben
- [ ] Kategorie + Tags setzen
- [ ] Artikel exportieren (Markdown, HTML, PDF)

### Bilderbuch

- [ ] Bilderbuch erstellen + Seiten hinzufuegen
- [ ] Bilder auf Seiten platzieren
- [ ] Text auf Seiten hinzufuegen
- [ ] Layout pro Seite wechseln (Renderer reagiert sichtbar)
- [ ] PDF-Export → KEIN raw TipTap-JSON sichtbar (#616)
- [ ] Titelseite korrekt gerendert
- [ ] Client-seitiger PDF-Export (offline/mobil, #497)

### Comic

- [ ] Comicbuch erstellen + Seiten + Panels
- [ ] Bilder in Panels per Drag&Drop (#439)
- [ ] Panel-Groesse aendern
- [ ] Sprechblase per Drag positionieren (visuell korrekt)
- [ ] Fullscreen-Modus

### KDP-Wizard

- [ ] Wizard oeffnen → alle Steps durchklickbar
- [ ] Metadaten-Checkliste: fehlende Felder rot markiert
- [ ] Format-Step: eBook / Taschenbuch / Hardcover (#580)
- [ ] Trim-Size + Margin-Preset konfigurierbar (#580)
- [ ] Preis-Kalkulator: Seitenzahl → Druckkosten
- [ ] Export-Package: ZIP mit Print-PDF + metadata.json (#583/#606)
- [ ] eBook-Format → EPUB statt Print-PDF (#583)
- [ ] Print-PDF: Crop-/Bleed-Marks bei gewaehlter Trim-Size
- [ ] KDP-Upload-Guide-Step sichtbar (#581)

### Import/Export

- [ ] Datei-/GitHub-/URL-Import (ein Dialog, Tabs)
- [ ] HTML-Import (.html / .htm akzeptiert)
- [ ] Medium-Import (URL bzw. HTML-Export)
- [ ] GitHub-Import (Repo-URL) + Git-Sync Pull
- [ ] HTML-Export: Meta-Tags im Head
- [ ] PDF-Export: Document Info (title, author)
- [ ] EPUB-Export: OPF Metadata vollstaendig
- [ ] DOCX-Export: Document Properties gesetzt
- [ ] Markdown-Export: YAML Frontmatter
- [ ] Export-Metadaten aus einer Quelle (ExportDocument) konsistent

### Einstellungen

- [ ] Theme wechseln (alle 6 Paletten, Hell/Dunkel)
- [ ] Sprache wechseln (de → en → de)
- [ ] Auto-Save: kein "Speichern"-Button sichtbar (#473)
- [ ] KI-Provider konfigurieren + Test-Button (pro Zeile, #459/#462)
- [ ] KI-Key pro Provider gespeichert, kein Clobber beim Wechsel (#460)
- [ ] KI-Modelle laden dynamisch pro Provider (#451)
- [ ] Update-Checker: Banner bei neuer Version (#477/#479)
- [ ] Update-Banner: Release-Notes + "pro Version verwerfen"

### Dashboard

- [ ] Grid-/Listen-Ansicht wechseln
- [ ] Buecher suchen + filtern
- [ ] Papierkorb: loeschen + wiederherstellen
- [ ] Buch-Cover werden angezeigt
- [ ] Bulk-Auswahl + Bulk-Loeschen (>200 Eintraege moeglich, #417)

### Quality Report

- [ ] Buch mit Text → Quality Report oeffnen
- [ ] Flesch-Index berechnet
- [ ] Komplexe Saetze (Schachtelsaetze) markiert
- [ ] Woerterzahl korrekt
- [ ] Kapitel-Tabelle in logischer Buchreihenfolge
- [ ] Report-PDF spiegelt die Bildschirm-Ansicht

### Kapitel-Features

- [ ] Chapter Status setzen (Entwurf → Fertig)
- [ ] Synopsis schreiben → im Outliner sichtbar
- [ ] Inspector Notes schreiben → nach Reload da
- [ ] Collections erstellen + Farbe setzen (#572)
- [ ] Outliner: Tabelle mit allen Spalten

### Story Bible

- [ ] Entitaeten anlegen (Charakter/Setting/Plot/Item/Lore)
- [ ] Story Bible aus Buchtext KI-generieren
- [ ] Relationship-Graph: Knoten + Kanten, Drag-to-create
- [ ] Arc View + Continuity Checker

### Data Migration

- [ ] Erste Installation (keine Daten) → Welcome-Dialog erscheint (#591)
- [ ] "Online-Backup importieren" → .bgb wird eingelesen
- [ ] "Ohne Daten starten" → Dialog verschwindet permanent
- [ ] "Online-Version oeffnen" → GH Pages oeffnet sich

---

## Launcher-Tests (Windows/Linux/macOS)

> Kurzform. Die vollstaendige plattform-spezifische Checkliste
> (install.sh, Artefakt-Verifikation, SHA256, uninstall.sh) liegt
> in [`manual-tests/distribution-smoke-test.md`](manual-tests/distribution-smoke-test.md).
> Der Launcher basiert auf dem `docker-app-launcher`-Paket; nur
> `launcher/launcher.json` + ein duenner Wrapper sind Bibliogon-
> spezifisch (siehe [`LAUNCHER-SPEC.md`](LAUNCHER-SPEC.md)).

### Erstinstallation

- [ ] Launcher starten → Docker-Check ist erster Schritt
- [ ] Docker nicht gestartet → Meldung + "Erneut pruefen"
- [ ] Docker laeuft → Installation startet
- [ ] Fortschrittsanzeige sichtbar waehrend Installation
- [ ] App oeffnet im Browser nach Installation

### Laufende App

- [ ] Launcher erneut oeffnen → Management-Dialog
- [ ] "Im Browser oeffnen" → App oeffnet
- [ ] "Stoppen" → Container stoppt
- [ ] "Deinstallieren" → Bestaetigung → alles entfernt
- [ ] Button-Zustaende (aktiv/deaktiviert) korrekt mit Tooltips
- [ ] "Log kopieren" + Cleanup-Aktion verfuegbar

### Port-Konfiguration

- [ ] Port-Feld editierbar (nicht installiert/gestoppt)
- [ ] Port-Feld read-only (laeuft)
- [ ] Port belegt → Warnung + Vorschlag

---

## Plattform-Matrix

| Test | Chrome | Firefox | Safari | PWA | Desktop |
|------|--------|---------|--------|-----|---------|
| Editor | | | | | |
| Export | | | | | |
| Import | | | | | |
| Dashboard | | | | | |
| Backup (.bgb) | | | | | |
| KI (Provider-Direct) | | | | | |

---

## Ergebnis-Protokoll

- Datum: ___________
- Version: v0.___
- Tester: ___________
- Plattform(en): ___________
- Ergebnis: ___ / ___ bestanden
- Release-Gate (Backup + Cross-Mode + E2E Smoke) gruen: [ ] ja  [ ] nein
- Anmerkungen:
