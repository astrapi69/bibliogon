# Manuelle Testfälle (nicht automatisierbar)

Diese 5 Testfälle bleiben manuell, weil sie echte Hardware,
subjektive Bewertung oder Browser-Interna erfordern die
Playwright nicht zuverlaessig simulieren kann.

---

## 1. TC-032: Audiobook Export + Quality-Report

**Warum manuell:** TTS-Synthese laeuft nur auf dem Desktop-Backend
mit konfiguriertem TTS-Provider. Die erzeugte Audiodatei muss
akustisch geprueft werden (Aussprache, Pausen, Kapitelgrenzen).
Playwright kann keine Audio-Qualitaet bewerten.

**Was pruefen:**
- Audiobook exportieren (Backend-Profil, TTS konfiguriert)
- Dateiname aus dem Buchtitel abgeleitet
- Quality-Report als MD/PDF herunterladen
- Report enthaelt alle Kapitel mit Dauer
- Audio abspielen: Aussprache korrekt, keine Artefakte,
  Kapitelgrenzen sauber

**Frequenz:** Vor jedem Release der TTS-Aenderungen beruehrt.

---

## 2. TC-065: Service-Worker Update-Erkennung (Timing)

**Warum manuell:** Der SW-Update-Mechanismus haengt an echtem
Browser-Verhalten (Focus-Event, Visibility-Change, stuendlicher
Timer). Playwright kann Service-Worker registrieren aber nicht
zuverlaessig das Timing des Update-Checks simulieren. Der echte
Test erfordert: alter Deploy im Cache → neuer Deploy auf dem
Server → Tab fokussieren → SW erkennt Update.

**Was pruefen:**
- PWA mit altem Deploy oeffnen (SW cached altes Bundle)
- Neuen Deploy ausrollen
- Tab fokussieren ODER 1h warten (oder Trigger ausloesen)
- SW erkennt Update und aktualisiert
- Neue Features sichtbar nach Reload

**Frequenz:** Nach jedem Deploy auf GitHub Pages.

---

## 3. Visuelle Theme-Bewertung (Teil von TC-051)

**Warum manuell:** Automatische Tests koennen CSS-Token-Werte und
WCAG-Kontrast pruefen (das ist automatisiert via verify-theme Gate).
Aber die subjektive Lesbarkeit, die visuelle Harmonie und das
"Gesamtgefuehl" einer Palette erfordern menschliches Urteil.

**Was pruefen:**
- Alle 12 Varianten (6 Paletten x Hell/Dunkel) durchschalten
- Pro Variante: Dashboard, Editor, Settings oeffnen
- Subjektive Bewertung: lesbar? harmonisch? ablenkungsfrei?
- Besonders pruefen: Code-Bloecke, Tabellen, Sidebar-Kontrast
- Vergleich mit der vorherigen Version: Regression?

**Frequenz:** Bei jeder Aenderung an den Theme-Tokens oder
den Paletten-Definitionen.

---

## 4. Comic-Panel Drag-Geometrie (Teil von TC-028)

**Warum manuell:** Playwright kann Drag-and-Drop simulieren, aber
die pixel-genaue Positionierung von Sprechblasen innerhalb eines
Panels erfordert visuelle Verifikation. Die Blase muss nicht nur
"irgendwo" landen sondern an der richtigen Stelle relativ zum
Panel-Inhalt. Automatisierte Tests koennen pruefen ob die Position
gespeichert wird (das ist automatisiert), aber nicht ob sie
visuell korrekt aussieht.

**Was pruefen:**
- Sprechblase per Drag innerhalb eines Panels positionieren
- Blase landet visuell am richtigen Ort (nicht ausserhalb,
  nicht ueber dem Rand, nicht hinter anderen Elementen)
- Position ueberlebt Reload (das ist automatisiert)
- Blase auf verschiedenen Viewport-Groessen korrekt skaliert
- Mehrere Blasen ueberlappen nicht ungewollt

**Frequenz:** Bei jeder Aenderung am Comic-Editor oder
am Panel-Layout-System.

---

## 5. Echte Service-Worker-Caches (Teil von TC-064)

**Warum manuell:** Der Stale-SW-Test (TC-064) erfordert echte
Browser-DevTools: Service Worker Unregister, Clear Site Data,
Hard Reload mit "Disable Cache". Playwright kann Service Worker
registrieren/deregistrieren, aber nicht den echten Cache-
Invalidierungspfad eines deployten Bundles testen. Der
automatisierte Teil (curl auf Live-Chunk mit String-Literal)
deckt nur die Erkennung ab, nicht den echten Browser-Pfad.

**Was pruefen:**
1. DevTools → Application → Service Workers → Unregister
2. DevTools → Application → Storage → "Clear site data"
3. Hard Reload (Strg+Shift+R) mit "Disable cache"
4. Jede Hauptseite oeffnen (Dashboards, Editoren, Settings,
   Import, Hilfe)
5. Network-Tab: frische Chunks, kein altes Bundle
6. curl auf den Live-Chunk: enthaelt String-Literal der
   aktuellen Aenderung (automatisierter Teil)

**Frequenz:** Nach JEDEM Deploy auf GitHub Pages. Release-Blocker.

---

## Zusammenfassung

| # | Testfall | Grund | Frequenz |
|---|----------|-------|----------|
| 1 | Audiobook TTS | Audio-Qualitaet, echtes Backend | TTS-Aenderungen |
| 2 | SW-Update-Timing | Echtes Browser-Verhalten | Jeder Deploy |
| 3 | Theme-Bewertung | Subjektive visuelle Qualitaet | Theme-Aenderungen |
| 4 | Comic-Drag-Geometrie | Pixel-genaue visuelle Position | Comic-Editor-Aenderungen |
| 5 | Echte SW-Caches | DevTools-Interaktion, Deploy-Verifikation | Jeder Deploy (Blocker) |

Alle anderen Testfaelle (TC-001 bis TC-063) sind voll oder
teilweise automatisiert via Playwright (`e2e/manual-automation/`
und `e2e/smoke/`).
