# Manueller Testplan

Strukturierter Testplan fuer das manuelle Testen vor jedem Release.
Erganzt die automatisierte E2E-Smoke-Suite (`e2e/smoke/`) und die
Unit-Tests (Vitest + pytest) um die Faelle, die nur ein Mensch im
echten Browser zuverlassig pruefen kann (Layout, z-index, echte
Service-Worker-Caches, Drag-Geometrie, visuelle Konsistenz ueber 6
Themen).

## Wie dieser Plan benutzt wird

- Vor jedem Tag wird mindestens die **Release-Checkliste** am Ende
  abgearbeitet. Der **BACKUP-AKZEPTANZTEST** (TC-040) und der
  **Stale-SW-Test** (TC-064) sind dabei Release-Blocker.
- Jeder Testfall ist nummeriert (TC-001 ff.) und traegt:
  - **Vorbedingung** - Ausgangszustand
  - **Schritte** - was der Tester tut
  - **Erwartetes Ergebnis** - was sichtbar sein muss
  - **Offline** - ob der Fall auf dem backendlosen GitHub-Pages-Build
    (Dexie-Mode, `VITE_STORAGE_MODE=dexie`) gilt
  - **Automatisiert** - Ja / Teilweise / Nein, mit Verweis auf den
    Spec in der Abdeckungstabelle weiter unten
- Zwei Deployment-Profile werden getestet:
  - **Desktop / Docker** (Backend vorhanden, `ApiStorage`)
  - **GitHub-Pages-PWA** (kein Backend, `DexieStorage`, Seed-IndexedDB)
- Abkuerzungen: **BD** = Buecher-Dashboard, **AD** = Artikel-Dashboard.

Die Test-IDs sind stabil. Beim Schliessen oder Verschieben eines
Falls wird die ID nicht neu vergeben (gleiche Disziplin wie bei den
ROADMAP-IDs).

---

## 1. Dashboard (BD + AD)

### TC-001: Buch erstellen (Prosa)

**Vorbedingung:** Keine Buecher vorhanden (Clean State oder nach Reset).
**Schritte:**
1. BD -> "Neues Buch" -> Titel + Autor eingeben -> Erstellen.
2. Im Editor ein Kapitel hinzufuegen -> Text schreiben.
3. Zurueck zum BD.
**Erwartetes Ergebnis:** Buch erscheint in der Kachel- UND in der
Listenansicht, Titel und Autor korrekt.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-002: Buch erstellen - alle Buchtypen

**Vorbedingung:** Beliebig.
**Schritte:**
1. BD -> "Neues Buch" -> Buchtyp durchschalten (Prosa, Bilderbuch,
   Comic).
2. Pro Typ erstellen und kurz oeffnen.
**Erwartetes Ergebnis:** Der jeweils passende Editor oeffnet
(Kapitel-Editor fuer Prosa, Seiten-Editor fuer Bilderbuch/Comic).
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-003: Artikel erstellen - alle Content-Typen

**Vorbedingung:** Beliebig.
**Schritte:**
1. AD -> "Neuer Text" -> Content-Typ waehlen (blogpost, tutorial,
   review, essay, newsletter, interview, listicle, short_story).
2. Erstellen, Titel setzen, speichern.
**Erwartetes Ergebnis:** Artikel erscheint im AD mit korrektem
Content-Typ-Badge; die per-Typ sichtbaren Felder stimmen.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-004: Kachel- und Listenansicht wechseln (BD)

**Vorbedingung:** Mindestens 1 Buch vorhanden.
**Schritte:**
1. BD -> View-Switcher auf Liste stellen.
2. Auf Kachel zurueckstellen.
**Erwartetes Ergebnis:** Beide Ansichten zeigen dieselben Buecher;
die gewaehlte Ansicht bleibt nach Reload erhalten.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-005: Kachel- und Listenansicht wechseln (AD)

**Vorbedingung:** Mindestens 1 Artikel vorhanden.
**Schritte:** Wie TC-004, im AD.
**Erwartetes Ergebnis:** Konsistent zwischen beiden Ansichten.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-006: Suche, Filter, Sortierung (BD)

**Vorbedingung:** Mehrere Buecher mit unterschiedlichen Titeln/Status.
**Schritte:**
1. Suchbegriff eingeben -> Trefferliste pruefen.
2. Status-Filter setzen.
3. Sortierung umschalten.
**Erwartetes Ergebnis:** Liste reagiert korrekt; Leerzustand bei
keinem Treffer; Suche zuruecksetzen stellt die volle Liste wieder her.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-007: Suche, Filter, Sortierung (AD)

**Vorbedingung:** Mehrere Artikel.
**Schritte:** Wie TC-006, mit zusatzlichem Content-Typ-Filter.
**Erwartetes Ergebnis:** Filterleiste korrekt; Filterwechsel hebt die
Mehrfachauswahl auf.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-008: Paginierung

**Vorbedingung:** Mehr Eintraege als eine Seite fasst.
**Schritte:** Durch die Seiten blattern, letzte/erste Seite pruefen.
**Erwartetes Ergebnis:** Korrekte Seitenanzahl, kein Doppel- oder
Fehleintrag an den Grenzen.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-009: Bulk - alle auswaehlen + loeschen (AD)

**Vorbedingung:** Mehrere Artikel.
**Schritte:**
1. "Alle auswaehlen".
2. Bulk-Aktionsleiste -> "Loeschen" (in den Papierkorb).
**Erwartetes Ergebnis:** Auswahl funktioniert auch ueber grosse
Mengen (kein kuenstliches DB-Loesch-Limit); die Aktionsleiste
verschwindet bei Auswahl 0; geloeschte Zeilen landen im Papierkorb.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-010: Bulk - endgueltig loeschen

**Vorbedingung:** Eintraege im Papierkorb.
**Schritte:** Papierkorb -> auswaehlen -> "Endgueltig loeschen" ->
Bestaetigungsdialog.
**Erwartetes Ergebnis:** Nach Bestaetigung sind die Eintraege weg; der
Bestaetigungsdialog erscheint ueber sauberem Hintergrund (Menue ist
geschlossen, kein ueberlappendes UI).
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-011: Auswahl-Bereinigung bei Einzel-Loeschung

**Vorbedingung:** Mehrere Eintraege ausgewaehlt.
**Schritte:** Eine ausgewaehlte Zeile per Zeilen-Aktion loeschen.
**Erwartetes Ergebnis:** Der Zaehler der Aktionsleiste sinkt korrekt;
keine "Geisterauswahl" einer nicht mehr existierenden Zeile.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-012: Papierkorb - wiederherstellen

**Vorbedingung:** Eintrag im Papierkorb.
**Schritte:** Papierkorb -> "Wiederherstellen".
**Erwartetes Ergebnis:** Eintrag erscheint wieder in der Live-Liste,
mit allen Inhalten; klare Erfolgs-Rueckmeldung.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-013: Papierkorb - leeren

**Vorbedingung:** Mehrere Eintraege im Papierkorb.
**Schritte:** "Papierkorb leeren" -> Bestaetigung.
**Erwartetes Ergebnis:** Papierkorb leer; Live-Liste unberuehrt.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-014: Default-Content-Type aendern -> Button-Label

**Vorbedingung:** Beliebig.
**Schritte:** Einstellungen -> Verhalten -> Standard-Content-Type
aendern -> zurueck zum AD/BD.
**Erwartetes Ergebnis:** Das Primaerlabel des Erstellen-Buttons
(SplitButton) spiegelt den neuen Standard.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-015: Thumbnail-Anzeige (mit und ohne Bild)

**Vorbedingung:** Ein Eintrag mit Titelbild, einer ohne.
**Schritte:** BD/AD in Kachelansicht betrachten.
**Erwartetes Ergebnis:** Mit Bild -> Thumbnail; ohne Bild ->
Platzhalter, kein gebrochenes Bild-Icon. Offline gilt das auch fuer
in Dexie gecachte Medium-CDN-Thumbnails.
**Offline:** Ja.
**Automatisiert:** Nein.

### TC-016: Kommentar-Zaehler-Badge

**Vorbedingung:** Artikel mit importierten Kommentaren.
**Schritte:** AD in Kachel- UND Listenansicht.
**Erwartetes Ergebnis:** Badge zeigt die korrekte Anzahl in beiden
Ansichten konsistent.
**Offline:** Nein (Kommentare nur im Backend-Profil).
**Automatisiert:** Teilweise.

---

## 2. Editoren

### TC-020: Text schreiben, Autosave, neu laden

**Vorbedingung:** Buch mit einem Kapitel.
**Schritte:**
1. Text schreiben, kurz warten (Autosave-Debounce).
2. Seite neu laden.
**Erwartetes Ergebnis:** Text ist erhalten; kein 409-Konflikt mit sich
selbst; ggf. Draft-Recovery-Banner nur bei echtem ungespeichertem
Stand.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-021: Kapitel hinzufuegen / entfernen / umordnen

**Vorbedingung:** Buch mit mehreren Kapiteln.
**Schritte:** Kapitel anlegen, eines loeschen, per Drag-and-drop
umordnen.
**Erwartetes Ergebnis:** Reihenfolge bleibt nach Reload; Loeschen
entfernt nur das Zielkapitel.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-022: Kapitel anklicken wechselt Editor-Inhalt

**Vorbedingung:** Buch mit mindestens 2 Kapiteln mit Inhalt.
**Schritte:** In der Seitenleiste zwischen Kapiteln wechseln.
**Erwartetes Ergebnis:** Der Editor zeigt den Inhalt des angeklickten
Kapitels; `?chapter=` in der URL aktualisiert (kein Clobbering durch
gleichzeitige `?view=`-Aenderung).
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-023: Formatierung (Fett, Kursiv, Listen, Ueberschriften)

**Vorbedingung:** Editor offen.
**Schritte:** Toolbar-Buttons und Kontextmenue durchprobieren.
**Erwartetes Ergebnis:** Formatierung wird angewendet und ueberlebt
Reload (TipTap-JSON).
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-024: Mathematik-Knoten (KaTeX)

**Vorbedingung:** Editor offen.
**Schritte:** Inline `$...$` und Block `$$...$$` einfuegen, Formel-Button
benutzen.
**Erwartetes Ergebnis:** Gerenderte Formel; ueberlebt Reload.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-025: Titel inline bearbeiten

**Vorbedingung:** Buch/Artikel offen.
**Schritte:** Stift-Toggle -> Titel aendern -> bestaetigen. Bei
veroeffentlichtem Werk: Warnung pruefen.
**Erwartetes Ergebnis:** Titel aktualisiert ueberall (Editor + Dashboard).
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-026: Metadaten editieren (alle Tabs)

**Vorbedingung:** Buch offen.
**Schritte:** Jeden Metadaten-Tab oeffnen (Identitaet, Publishing,
Marketing, Design, Story, Kategorien/BISAC), je ein Feld aendern,
speichern, neu laden.
**Erwartetes Ergebnis:** Werte erhalten; Pseudonym als `<select>`
(kein Freitext-Datalist); Repository-URL, Kategorien, BISAC korrekt.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-027: Composition-Mode / Fullscreen

**Vorbedingung:** Editor offen.
**Schritte:** Composition-Mode (Strg+Shift+D) ein/aus; Fullscreen-Button.
**Erwartetes Ergebnis:** App-Chrome verschwindet/erscheint; Esc beendet;
Scrollen der Seite bleibt korrekt.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-028: Comic-Editor - Panels und Sprechblasen

**Vorbedingung:** Comic-Buch mit mindestens einer Seite.
**Schritte:** Panel-Grid waehlen, Bild pro Panel hochladen, Sprechblase
anlegen, Blase per Drag positionieren, Panels umordnen, Panel auf andere
Seite verschieben.
**Erwartetes Ergebnis:** Alle Panels rendern mit voller Hoehe (keine
0-10px-Kollaps-Streifen); Blasen-Position ueberlebt Reload.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-029: Bilderbuch-Editor - Layouts

**Vorbedingung:** Bilderbuch mit Seiten.
**Schritte:** Verschiedene Layouts durchschalten (image/overlay/split/
two-image/collage/text_only), Bild + Text setzen, Collage-Regionen
ziehen, Tier-1/2-Textstil-Felder aendern.
**Erwartetes Ergebnis:** Layout-Auswahl hat sichtbaren Render-Effekt
(nicht nur gespeichert); `layout_config` pro Layout-Namespace erhalten.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-030: Export - alle Formate (Backend-Profil)

**Vorbedingung:** Buch mit Inhalt + mindestens einem Bild.
**Schritte:** Export-Seite -> je MD, HTML, Text, PDF, EPUB, DOCX, LaTeX
exportieren.
**Erwartetes Ergebnis:** Datei laedt herunter; Bilder im EPUB UND PDF
vorhanden; LaTeX ohne die bekannten 6 Bug-Klassen.
**Offline:** Teilweise (Client-Engine kann MD/HTML/Text/PDF/EPUB/DOCX/
LaTeX; Pandoc-Pfad nur im Backend).
**Automatisiert:** Ja.

### TC-031: Export - Client-Engine offline

**Vorbedingung:** GitHub-Pages-PWA, Buch mit Inhalt.
**Schritte:** Export -> Engine "auto"/"client" -> jedes Client-Format.
**Erwartetes Ergebnis:** Download erfolgt rein clientseitig, kein
`/api`-Request.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-032: Audiobook-Filename + Quality-Report

**Vorbedingung:** Buch, Backend-Profil, TTS konfiguriert.
**Schritte:** Audiobook exportieren; Quality-Report als MD/PDF.
**Erwartetes Ergebnis:** Dateiname aus dem Titel; Report korrekt.
**Offline:** Nein (TTS desktop-only).
**Automatisiert:** Teilweise.

### TC-033: Responsive - Editoren auf Mobile

**Vorbedingung:** Beliebiger Editor.
**Schritte:** Viewport auf 600 / 800 / 1080 stellen.
**Erwartetes Ergebnis:** Header-Toolbars umbrechen sauber; Seitenleisten
kollabieren; Touch-Ziele >= 44px.
**Offline:** Ja.
**Automatisiert:** Ja.

---

## 3. Import

### TC-035: .bgb Import (Full Backup, Desktop)

**Vorbedingung:** Eine `.bgb`-Datei vorhanden; Backend-Profil.
**Schritte:** Import-Wizard -> `.bgb` waehlen -> importieren.
**Erwartetes Ergebnis:** Voller Zustand wiederhergestellt (siehe
BACKUP-AKZEPTANZTEST fuer die Verifikationsliste).
**Offline:** Nein (`.bgb` clientseitig nur lesend, siehe TC-036).
**Automatisiert:** Ja.

### TC-036: .bgb Import offline (GitHub-Pages-PWA)

**Vorbedingung:** GitHub-Pages-PWA, `.bgb`-Datei.
**Schritte:** Import-Wizard offline -> `.bgb` -> Browser-Format-Erkennung
restauriert die Full-Data direkt in Dexie.
**Erwartetes Ergebnis:** Wiederherstellung ohne `/api`-Request.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-037: Markdown/Text/HTML Import

**Vorbedingung:** Eine Quelldatei.
**Schritte:** Import-Wizard -> Datei -> neues Buch + Kapitel.
**Erwartetes Ergebnis:** Inhalt korrekt nach TipTap konvertiert;
Bildknoten als `imageFigure` (nicht `image`).
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-038: Medium-ZIP Import + Thumbnail-Caching

**Vorbedingung:** Medium-Export-ZIP.
**Schritte:** Dedizierte Medium-Import-Seite -> ZIP -> Import mit
Per-Post-Fortschritt.
**Erwartetes Ergebnis:** Artikel + Publication + Provenance angelegt;
erstes Bild als Thumbnail; korrekte Anzahl (Survey vor Annahme der
"einige"-Schaetzung); Hauptkoerper nicht abgeschnitten.
**Offline:** Ja (clientseitiger DOMParser-Pfad).
**Automatisiert:** Teilweise.

### TC-039: Git-URL Import (Desktop)

**Vorbedingung:** write-book-template Repo-URL; Backend-Profil.
**Schritte:** Import-Wizard -> Git-URL.
**Erwartetes Ergebnis:** Repo importiert; offline ist der Eingang
gated mit Hinweis.
**Offline:** Nein (Git desktop-only).
**Automatisiert:** Ja.

---

## 4. Backup (BACKUP-AKZEPTANZTEST)

### TC-040: Voller Backup-Zyklus (Release-Blocker)

**Vorbedingung:** App mit Testdaten gefuellt - mindestens: 1 Buch mit 3
Kapiteln mit Inhalt, 1 Artikel, 3 Autoren, 1 Story-Bible-Entitaet, eine
geaenderte Einstellung (Thema + Sprache).
**Schritte:**
1. Vollbackup exportieren (`exportFullBackup`, `.bgb`).
2. Gefahrenzone -> App zuruecksetzen (alles loeschen).
3. Backup importieren (`importFullBackup`).
4. JEDE Entitaet gegen Schritt 1 verifizieren.
**Erwartetes Ergebnis:** Vollstaendige Gleichheit. Verifikationsliste:
- Buecher + Kapitel + Inhalt + Metadaten
- Artikel + Thumbnails
- Autoren + Pseudonyme
- Kommentare
- Story Bibles / Storyboards (Entitaeten, Page-Links, Beziehungen)
- Einstellungen + KI-Config
- Schreibverlauf (sofern ueber die Seam restaurierbar; Writing-Sessions
  haben kein `create` - dann explizit als nicht-restaurierbar notiert)
- Comic-Panels + Sprechblasen
- Bilderbuch-Seiten + Layouts (`layout_config`)
**Offline:** Ja (clientseitiger JSON-Bundle ueber die `getStorage()`-Seam).
**Automatisiert:** Ja - `e2e/smoke/backup-acceptance.spec.ts` (gegen das
Live-Backend) plus `backend/tests/test_backup_full_roundtrip.py`.

**Wichtig:** Den Akzeptanztest NIE durch Lockern der Assertions gruen
machen. Ein roter Akzeptanztest ist ein echter Datenverlust-Bug in der
Seam oder im Backup-Pfad.

### TC-041: Backup vor Reset (Danger-Zone-Dialog)

**Vorbedingung:** Daten vorhanden.
**Schritte:** Gefahrenzone -> Reset -> der Vor-Reset-Backup-Dialog.
**Erwartetes Ergebnis:** Backup wird vor dem Wipe angeboten/erstellt.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-042: Teil-Backup Artikel-Roundtrip

**Vorbedingung:** Artikel mit Assets.
**Schritte:** Artikel exportieren -> Reset -> importieren.
**Erwartetes Ergebnis:** Artikel + Assets identisch.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-043: Autoren-DB JSON Export/Import

**Vorbedingung:** Mehrere Autoren mit Pseudonymen.
**Schritte:** Einstellungen -> Autoren -> JSON exportieren -> Reset ->
importieren.
**Erwartetes Ergebnis:** Autoren + Pseudonyme + Profil-Flags identisch.
**Offline:** Ja.
**Automatisiert:** Ja.

---

## 5. Settings

### TC-050: Alle Tabs navigierbar (Desktop + Mobile)

**Vorbedingung:** Beliebig.
**Schritte:** Jeden Settings-Tab oeffnen, Desktop und Mobile
(Hamburger-Seitenleiste).
**Erwartetes Ergebnis:** Jeder Tab erreichbar und scrollbar; Hamburger
oeffnet/schliesst korrekt.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-051: Themen aendern (alle 6 Paletten)

**Vorbedingung:** Beliebig.
**Schritte:** Jede der 6 Paletten (Warm Literary, Cool Modern, Nord,
Classic, Studio, Notebook) in Hell UND Dunkel durchschalten.
**Erwartetes Ergebnis:** Alle 12 Varianten lesbar; keine undefinierten
Tokens/Hex-Durchschlaege; WCAG-AA-Kontrast erhalten.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-052: Sprache aendern (8 Sprachen)

**Vorbedingung:** Beliebig.
**Schritte:** Jede Sprache (DE, EN, ES, FR, EL, PT, TR, JA) waehlen.
**Erwartetes Ergebnis:** UI-Strings uebersetzt; keine rohen Schluessel;
deutsche Texte mit echten Umlauten.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-053: Artikel-Themen verwalten (Autosave)

**Vorbedingung:** Beliebig.
**Schritte:** Einstellungen -> Artikel-Themen -> hinzufuegen, umbenennen,
loeschen.
**Erwartetes Ergebnis:** Aenderungen werden auto-gespeichert und gehen
nach Reload NICHT verloren.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-054: Autoren-DB CRUD + Pseudonyme

**Vorbedingung:** Beliebig.
**Schritte:** Autor anlegen, Pseudonym hinzufuegen, bearbeiten, loeschen,
Profil-Autor-Flag setzen.
**Erwartetes Ergebnis:** CRUD korrekt; Profil-Badge erscheint;
Profil-zu-DB-Sync funktioniert.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-055: KI-Settings - Key setzen + Gates

**Vorbedingung:** Beliebig.
**Schritte:** Einstellungen -> KI -> Provider-Key setzen; KI-Funktionen
mit und ohne Key testen.
**Erwartetes Ergebnis:** Ohne Key sind `ai-generate`/`ai-fill` disabled
mit Begruendung `requires_ai_key`; mit Key aktiv (Browser-direkt zum
Provider, Key nie woanders gesendet).
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-056: Plugin-Settings (Backend-Profil)

**Vorbedingung:** Backend-Profil.
**Schritte:** Einstellungen -> Plugins -> ein Plugin-Setting aendern.
**Erwartetes Ergebnis:** Setting persistiert und wirkt beobachtbar.
**Offline:** Nein (Plugins offline gated).
**Automatisiert:** Ja.

---

## 6. Feature-Gates (Offline / Dexie-Mode)

Auf dem backendlosen GitHub-Pages-Build muss jede gated Funktion
"active", "disabled mit Begruendung" oder (nur Dev-Flags) "hidden" sein.
Nichts, was dem Nutzer gehoert, wird versteckt.

### TC-060: Plugins disabled + Reason

**Vorbedingung:** GitHub-Pages-PWA.
**Schritte:** Einstellungen -> Plugins.
**Erwartetes Ergebnis:** Disabled mit `requires_desktop_app`; kein
`/api`-Request.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-061: LAN-Zugriff / Git / TTS / Pandoc disabled + Reason

**Vorbedingung:** GitHub-Pages-PWA.
**Schritte:** Die desktop-only Flaechen oeffnen (LAN, Git-Sync/Backup,
Audiobook, Pandoc/LaTeX-Backend-Export).
**Erwartetes Ergebnis:** Sichtbar, disabled, mit `FeatureNotice`-Karte;
live Control nicht gemountet -> kein `/api`-Request.
**Offline:** Ja.
**Automatisiert:** Ja.

### TC-062: Versionsgeschichte disabled + Reason

**Vorbedingung:** GitHub-Pages-PWA.
**Schritte:** Versionsgeschichte/Snapshots oeffnen.
**Erwartetes Ergebnis:** Disabled mit Begruendung.
**Offline:** Ja.
**Automatisiert:** Teilweise.

### TC-063: KI ohne Key disabled + Reason

**Vorbedingung:** GitHub-Pages-PWA, kein KI-Key.
**Schritte:** KI-Generieren-Button antippen.
**Erwartetes Ergebnis:** Disabled mit `requires_ai_key`; Hinweis fuehrt
zur Key-Konfiguration.
**Offline:** Ja.
**Automatisiert:** Ja.

---

## 7. Service-Worker / Stale-Bundle

### TC-064: Stale-SW-Clear + Live-Test (Release-Blocker)

**Vorbedingung:** Deployte Site (GitHub Pages) nach einem neuen Deploy.
**Schritte:**
1. DevTools -> Application -> Service Workers -> Unregister.
2. DevTools -> Application -> Storage -> "Clear site data".
3. Hard Reload (Strg+Shift+R) mit "Disable cache".
4. Jede Hauptseite oeffnen (Dashboards, Editoren, Settings, Import,
   Hilfe).
**Erwartetes Ergebnis:** Kein altes Bundle; neue Features sichtbar;
Network-Tab zeigt frische Chunks. Verifikation per curl auf den Live-
Chunk auf String-Literale der neuen Aenderung (siehe Memory:
stale-service-worker-root-cause).
**Offline:** N/A (Deploy-Verifikation).
**Automatisiert:** Nein.

### TC-065: SW-Update-Erkennung

**Vorbedingung:** Laufende PWA, neuer Deploy verfuegbar.
**Schritte:** Tab fokussieren / sichtbar machen / 1h warten (oder
Trigger ausloesen).
**Erwartetes Ergebnis:** SW erkennt das Update und aktualisiert
(Focus/Visibility/stuendlich).
**Offline:** N/A.
**Automatisiert:** Nein.

---

## Automatisierungs-Abdeckung

E2E-Specs liegen unter `e2e/smoke/`. Unit-Tests sind Vitest
(`frontend/src/**/*.test.ts(x)`) bzw. pytest (`backend/tests/`,
`plugins/*/tests/`). "Teilweise" in der Unit-Spalte heisst: Logik-
Bausteine sind gedeckt, der End-zu-End-Pfad nicht.

| TC | Beschreibung | E2E | Unit | Automatisierbar | Aufwand |
|----|--------------|-----|------|-----------------|---------|
| TC-001 | Buch erstellen (Prosa) | create-book-page.spec.ts | Teilweise | Ja | - |
| TC-002 | Buch erstellen - alle Typen | create-book-page.spec.ts, getstarted-multi-book-types.spec.ts | Teilweise | Ja | Niedrig |
| TC-003 | Artikel - alle Content-Typen | create-article-page.spec.ts, content-types.spec.ts, article-type-dropdown.spec.ts | Teilweise | Ja | Niedrig |
| TC-004 | Kachel/Liste BD | books-list-view-selection.spec.ts, view-mode-testid-parity.spec.ts | - | Ja | - |
| TC-005 | Kachel/Liste AD | view-mode-testid-parity.spec.ts | - | Ja | - |
| TC-006 | Suche/Filter/Sort BD | dashboard-filters.spec.ts | Teilweise | Ja | - |
| TC-007 | Suche/Filter/Sort AD | dashboard-filters.spec.ts | Teilweise | Ja | - |
| TC-008 | Paginierung | dashboard-pagination.spec.ts | - | Ja | - |
| TC-009 | Bulk loeschen (AD) | bulk-delete.spec.ts | Ja | Ja | - |
| TC-010 | Bulk endgueltig loeschen | bulk-delete.spec.ts, menu-dialog-close.spec.ts | Ja | Ja | - |
| TC-011 | Auswahl-Bereinigung | selection-cleanup-row-delete.spec.ts | Ja | Ja | - |
| TC-012 | Papierkorb wiederherstellen | trash.spec.ts, articles-trash.spec.ts, trash-restore-optimistic.spec.ts | Ja | Ja | - |
| TC-013 | Papierkorb leeren | trash.spec.ts, comments-trash-lifecycle.spec.ts | Teilweise | Ja | Niedrig |
| TC-014 | Default-Content-Type -> Label | default-content-book-type.spec.ts | Teilweise | Ja | - |
| TC-015 | Thumbnail-Anzeige | - | - | Ja | Mittel |
| TC-016 | Kommentar-Zaehler-Badge | comments-admin-bulk-delete.spec.ts | Teilweise | Ja | Mittel |
| TC-020 | Autosave + Reload | book-editor-chapter-switch.spec.ts | Teilweise | Ja | Mittel |
| TC-021 | Kapitel CRUD/Umordnen | chapter-reorder.spec.ts, chapter-sidebar-buttons.spec.ts | Teilweise | Ja | - |
| TC-022 | Kapitel-Wechsel -> Inhalt | book-editor-chapter-switch.spec.ts | Ja | Ja | - |
| TC-023 | Formatierung | editor-formatting.spec.ts, editor-context-menu.spec.ts | Ja | Ja | - |
| TC-024 | Mathematik (KaTeX) | editor-math.spec.ts | Teilweise | Ja | - |
| TC-025 | Titel inline | editable-title.spec.ts | Teilweise | Ja | - |
| TC-026 | Metadaten alle Tabs | book-metadata-roundtrip.spec.ts, book-metadata-story-tab.spec.ts, book-categories-bisac.spec.ts, author-pen-names.spec.ts | Teilweise | Ja | Niedrig |
| TC-027 | Composition/Fullscreen | composition-mode.spec.ts, editor-fullscreen.spec.ts | - | Ja | - |
| TC-028 | Comic Panels/Blasen | comic-book-editor.spec.ts, comic-panel-bubble-crud.spec.ts, comic-bubble-drag-position.spec.ts, comic-book-panel-cross-page-move.spec.ts | Teilweise | Ja | - |
| TC-029 | Bilderbuch Layouts | picture-book-editor.spec.ts, picture-book-phase1-layouts.spec.ts, picture-book-phase3-collage.spec.ts, picture-book-tier-sections.spec.ts | Teilweise | Ja | - |
| TC-030 | Export alle Formate | export-download.spec.ts, article-export.spec.ts, picture-book-pdf-export.spec.ts | Ja | Ja | - |
| TC-031 | Export Client-Engine offline | offline-pwa.spec.ts | Ja (engine.test.ts u.a.) | Ja | - |
| TC-032 | Audiobook + Report | - | Teilweise | Teilweise | Hoch |
| TC-033 | Responsive Editoren | article-editor-responsive.spec.ts, page-editor-header-responsive.spec.ts, mobile-viewport.spec.ts, responsive-mobile.spec.ts | - | Ja | - |
| TC-035 | .bgb Import Desktop | import-wizard-bgb.spec.ts, import-flows.spec.ts | Ja | Ja | - |
| TC-036 | .bgb Import offline | import-wizard-bgb.spec.ts, offline-pwa.spec.ts | Ja (backupImport.test.ts) | Ja | - |
| TC-037 | MD/Text/HTML Import | import-wizard.spec.ts, import-flows.spec.ts | Teilweise | Ja | - |
| TC-038 | Medium-ZIP + Thumbnails | medium-import-preview.spec.ts | Teilweise | Ja | Mittel |
| TC-039 | Git-URL Import | import-wizard-git-url.spec.ts | - | Ja | - |
| TC-040 | BACKUP-AKZEPTANZTEST | backup-acceptance.spec.ts, backup-roundtrip.spec.ts | Ja (backend test_backup_full_roundtrip.py) | Ja | - |
| TC-041 | Backup vor Reset | danger-zone.spec.ts, settings-backups.spec.ts | Teilweise | Ja | - |
| TC-042 | Artikel-Roundtrip | articles-backup-roundtrip.spec.ts | Ja | Ja | - |
| TC-043 | Autoren-DB JSON | authors-db-export-import.spec.ts | Teilweise | Ja | - |
| TC-050 | Settings-Tabs Desktop+Mobile | settings-sidebar.spec.ts | - | Ja | Niedrig |
| TC-051 | Themen (6 Paletten) | themes.spec.ts | Ja (verify-theme Gate) | Ja | - |
| TC-052 | Sprache (8) | - | Teilweise (i18n parity) | Ja | Niedrig |
| TC-053 | Artikel-Themen Autosave | topics-autosave.spec.ts | Teilweise | Ja | - |
| TC-054 | Autoren-DB CRUD | settings-author.spec.ts, author-pen-names.spec.ts | Teilweise | Ja | - |
| TC-055 | KI Key + Gates | offline-ai-fill.spec.ts | Teilweise | Ja | Mittel |
| TC-056 | Plugin-Settings | settings-plugins.spec.ts, plugin-install.spec.ts | Ja | Ja | - |
| TC-060 | Plugins disabled + Reason | offline-pwa.spec.ts, settings-plugins.spec.ts | Teilweise | Ja | - |
| TC-061 | LAN/Git/TTS/Pandoc gated | offline-pwa.spec.ts | Teilweise | Ja | - |
| TC-062 | Versionsgeschichte gated | offline-pwa.spec.ts | Teilweise | Ja | Niedrig |
| TC-063 | KI ohne Key gated | offline-ai-fill.spec.ts, offline-pwa.spec.ts | Teilweise | Ja | - |
| TC-064 | Stale-SW-Clear + Live | - | - | Teilweise | Hoch |
| TC-065 | SW-Update-Erkennung | - | - | Teilweise | Hoch |

### Lesehilfe

- **E2E "-"**: kein dedizierter Spec gefunden.
- **Aufwand "-"**: bereits ausreichend automatisiert, kein neuer Aufwand.
- **Automatisierbar "Teilweise"**: der Kern ist automatisierbar, aber ein
  Teil bleibt manuell (echter Browser-Cache, visuelle Pruefung,
  Bezahl-API).

---

## Empfehlung: als naechstes automatisieren

Hoechster Wert pro Aufwand zuerst:

1. **TC-052 Sprachwechsel (8 Sprachen)** - Aufwand niedrig, hoher Wert.
   Ein parametrisierter Spec, der pro Sprache eine Schluessel-UI-
   Flaeche auf uebersetzte (nicht-rohe) Strings prueft, schliesst eine
   sichtbare Luecke. Erganzt die bestehende i18n-Parity-Pruefung um die
   Render-Ebene.
2. **TC-015 Thumbnail-Anzeige** - Aufwand mittel. Ein Spec fuer Kachel
   mit/ohne Bild fixiert die Platzhalter-Logik und (offline) das
   Dexie-Thumbnail-Caching; eine reine Render-Pruefung, die heute fehlt.
3. **TC-050 Settings-Tabs Mobile** - Aufwand niedrig. Hamburger-
   Navigation ueber alle Tabs bei 600px Viewport; deckt eine Klasse von
   Mobile-Regressionen ab, die Desktop-Tests nicht sehen.
4. **TC-064 Stale-SW-Live-Test (teilautomatisiert)** - Aufwand hoch,
   aber Release-kritisch. Ein CI-Job, der nach Deploy den Live-Chunk per
   curl auf ein erwartetes String-Literal des aktuellen Releases prueft,
   automatisiert die "altes Bundle"-Erkennung teilweise (der echte
   Browser-SW-Pfad bleibt manuell).
5. **TC-016 Kommentar-Zaehler-Badge in beiden Ansichten** - Aufwand
   mittel. Pin gegen die historische Kachel-vs-Liste-Asymmetrie.

Bewusst NICHT priorisiert: TC-032 (Audiobook) und TC-065 (SW-Update-
Timing) - hoher Aufwand, geringer Grenzwert; manuelle Pruefung bleibt
guenstiger.

---

## Release-Checkliste (vor jedem Tag)

- [ ] **BACKUP-AKZEPTANZTEST (TC-040)** bestanden - Export -> Reset ->
      Import -> jede Entitaet verifiziert. Release-Blocker.
- [ ] **E2E Smoke-Suite gruen** (`cd e2e && npx playwright test
      --project=smoke`), 0 Failures von Aster bestaetigt. Release-Blocker
      (siehe release-workflow.md "Pre-Release Gate").
- [ ] **Stale-SW-Clear + Live-Test (TC-064)** - Unregister + Clear Site
      Data + Hard Reload, alle Hauptseiten gegen das neue Bundle. Release-
      Blocker.
- [ ] Themen-Durchlauf (TC-051) ueber alle 12 Varianten; `make verify-theme`
      gruen.
- [ ] Feature-Gates offline (TC-060 bis TC-063) - kein `/api`-Request im
      Dexie-Build.
- [ ] Alle P0/P1 Issues geschlossen.
- [ ] `make test` gruen (Backend + Plugins + Vitest).
- [ ] **Nightly-Suite gruen** (`nightly.yml`: 10-Plugin-Matrix + Backend/
      Plugin/Frontend-Coverage + Complexity-Watcher) - der letzte
      naechtliche Lauf ODER ein frischer manueller `workflow_dispatch` ist
      gruen. Diese Jobs laufen seit #289 nicht mehr auf jedem PR; vor einem
      Tag muss daher der Nightly-Stand bestaetigt sein. Lokal simulierbar
      mit `make test-nightly`.
- [ ] CHANGELOG aktualisiert (siehe release-workflow.md Schritt 3).
- [ ] Version-Pins aktualisiert (`make sync-versions` +
      `make sync-versions-check` + `scripts/verify_version_pins.sh`).
- [ ] `make verify-docs-discipline` + `make verify-docs-completeness`
      gruen.

Die drei Release-Blocker (TC-040, Smoke-Suite, TC-064) sind nicht
verhandelbar. Ein roter Akzeptanztest oder ein altes Live-Bundle blockt
den Tag, egal wie spaet im Zyklus.

## Siehe auch

- [`MODULE-ARCHITECTURE.md`](../MODULE-ARCHITECTURE.md) — Ordnerstruktur + Architektur-Muster (Storage-Seam, lazyWithReload, Service-Extraktion, feature-strategy, CI-Stufen)
- [`VIBE-CODING-POLICY.md`](../VIBE-CODING-POLICY.md) — die 6 Prinzipien; der Aster-E2E-Gate gehört zu Prinzip 3 (PR selektiv, Nightly volle Suite, Release-Gate)
- [`EXPORT-IMPORT-FORMATS.md`](../EXPORT-IMPORT-FORMATS.md) — alle Export-/Import-Formate (inkl. Backup-Akzeptanztest)
- [`SETTINGS-MENU-ARCHITECTURE.md`](../SETTINGS-MENU-ARCHITECTURE.md) — die Settings-Oberfläche (Abschnitte, Plugin-Settings, feature-gegatete Bedienelemente)
