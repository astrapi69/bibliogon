# EXP-002: User Event Recording (Fehlerbericht-Mechanismus)

**Kategorie:** Querschnitt / Diagnostik · **Phase:** teilweise umgesetzt ·
**Priorität:** P3 (Infrastruktur; Basis lebt bereits) · **Abhängig von:**
Dexie-Storage-Seam, feature-strategy-Registry, ErrorBoundary · **Issue:** #259

> Design-Dokument. Kein Code. EXP-002 (EXP-001 = `i18n-strategy.md`).
>
> **Pre-Audit-Befund (wichtig):** Ein funktionierender Event-Recorder
> **existiert bereits** in Bibliogon. Dieses Dokument beschreibt zuerst den
> Ist-Zustand (Abschnitt 2a + 5) und scopt danach den Delta gegenüber dem
> ursprünglichen Vorschlag (Abschnitt 2b). Die Roadmap-Tasks (Abschnitt 6)
> zielen auf die Lücken, nicht auf eine Neuimplementierung - konsistent mit
> der Regel "darauf aufbauen, nicht neu erfinden".

---

## 1. Idee

Ring-Buffer (letzte 100 Aktionen in-memory), user-initiierter Export als
Fehlerbericht. **Kein automatisches Senden, kein Server-Upload.** Der User
entscheidet, was er teilt.

Motivation: Bibliogon läuft als Offline-PWA ohne Backend-Logs. Wenn ein User
einen Bug meldet, haben wir keine Reproduktions-Daten. Ein lokaler
Event-Recorder gibt dem User die Möglichkeit, seine letzten Schritte als
Fehlerbericht zu exportieren.

---

## 2a. Architektur - Ist-Zustand (as-built)

Die Basis ist implementiert und im App-Root verdrahtet. Konkrete Dateien
siehe Abschnitt 5.

- **Ring-Buffer:** `EventRingBuffer` (Singleton `eventRecorder`) in
  `frontend/src/utils/eventRecorder.ts`. Feste Größe **100**, FIFO über
  `push()` + `shift()` (kein Circular-Index). **Nur in-memory** - nichts wird
  persistiert, alles geht beim Tab-Schließen (und damit auch bei einem
  Crash/Reload) verloren.

- **Event-Modell (Ist):** flaches, **typ-basiertes** Schema (`EventType`),
  nicht das im Vorschlag genannte `category`/`action`/`payload`-Schema:

  | Feld | Ist-Zustand |
  |------|-------------|
  | `type` | `click` \| `navigation` \| `dialog_open` \| `dialog_close` \| `dropdown_change` \| `checkbox_change` \| `file_upload` \| `api_call` \| `api_error` \| `toast` \| `uncaught_error` \| `unhandled_rejection` |
  | `timestamp` | `performance.now()` (ms seit Page-Load), **nicht** ISO 8601 |
  | Nutzlast | typ-spezifische Felder: `text`, `testId`, `method`, `endpoint`, `status`, `durationMs`, `value`, `field`, `message`, `level`, `source`, `line`, `from`, `to` |
  | `appState` | **nicht pro Eintrag** - Version/Browser/OS/Route werden erst beim Export einmalig angehängt |

- **Privacy-Filter (Ist, `sanitizeEvent`):** erfüllt die Vorschlags-Intention:
  - Felder/Texte mit `password|token|api.?key|secret|license|credential`
    werden zu `[REDACTED]`.
  - URL-Query-Parameter werden entfernt (`endpoint`, `to` auf `pathname`
    reduziert).
  - Texte auf 200 Zeichen gekürzt.
  - **Keine Tastatureingaben, kein Editor-/Textarea-Inhalt** werden je erfasst
    (Klick-Listener liest nur Button-Label/aria-label/title).

- **Auto-Capture (Ist):** `frontend/src/components/EventRecorderSetup.tsx`
  (einmal im App-Root gemountet):
  - Button-Klicks (Label + `data-testid`)
  - Routing-Wechsel (`from` -> `to`)
  - `window.onerror` -> `uncaught_error`
  - `unhandledrejection` -> `unhandled_rejection`
  - API-Calls + API-Fehler: in `frontend/src/api/http.ts` direkt
  - Toasts: in `frontend/src/utils/notify.ts` direkt

- **Export (Ist):** `frontend/src/components/ErrorReportDialog.tsx` - der User
  sieht die erfasste Historie (Transparenz), kann Umgebungs-Infos +
  Aktions-Historie per Checkbox ein-/ausblenden, eine Vorschau anzeigen, in
  die Zwischenablage kopieren und einen **vorausgefüllten GitHub-Issue**
  öffnen (Markdown-Body, auf ~7800 Zeichen encoded-URL gekürzt). Der
  Env-Header enthält `__APP_VERSION__`, Browser, OS, Route.

## 2b. Architektur - vorgeschlagene Erweiterungen (Delta)

Der ursprüngliche Vorschlag geht über den Ist-Zustand hinaus. Die folgenden
Punkte sind die echten offenen Arbeiten:

- **Persistenz (größte Lücke):** Der Vorschlag will **Dexie**-Persistenz
  (überlebt Tab-Refresh + App-Neustart). Ist-Zustand ist rein in-memory - ein
  uncaught error, der zum Reload führt, **löscht den Buffer, bevor der User
  ihn exportieren kann**. Empfehlung: Dexie-Tabelle `eventLog`, debounced
  Persist (alle ~10s; bei `error`-Events sofort), Cap auf die letzten 100.

- **Kategorie-Taxonomie:** Der Vorschlag will eine semantische
  `category`-Achse (navigation | editor | storage | export | import | error |
  network) plus `action`-Strings (`book.create`, `chapter.save`,
  `export.pdf`) und ein `payload`-Objekt. Ist-Zustand erfasst storage/export/
  import nur indirekt (generischer `api_call` + `click`). Eine Kategorie-Achse
  würde Fehlerberichte filterbar machen; sie kann **additiv** zum bestehenden
  `EventType` eingeführt werden (kein Breaking Change).

- **Per-Eintrag `appState`:** `storageMode`, `language`, `online`, `theme`,
  `version` pro Eintrag statt nur einmal beim Export - macht Modus-Wechsel
  innerhalb einer Session sichtbar (z.B. online -> offline).

- **ISO-8601-Timestamp** zusätzlich zu `performance.now()` (oder statt) - für
  absolute Zeitbezüge im Bericht.

- **Export-Formate:** Ist-Zustand bietet Markdown (GitHub-Issue) + Clipboard.
  Der Vorschlag will zusätzlich **JSON-Datei-Download**
  (`bibliogon-fehlerbericht-{YYYY-MM-DD-HHmm}.json`) für technisches
  Debugging.

- **Circular-Index statt `push`/`shift`:** mikrooptimierung; bei 100 Einträgen
  vernachlässigbar, aber Teil der generischen `RingBuffer`-Extraktion
  (Abschnitt 4).

---

## 3. User-Flow

**Ist-Zustand:** der `ErrorReportDialog` öffnet **reaktiv** aus dem
Fehlerpfad (App-State `errorReport.open`, gespeist u.a. von der
`ErrorBoundary` / dem "Issue melden"-Pfad). Es gibt **keinen** proaktiven
Einstieg über die Settings.

**Vorschlag (Delta):** zusätzlicher proaktiver Einstieg
Settings -> Hilfe/Support -> "Fehlerbericht erstellen", damit ein User auch
**ohne** vorausgehenden harten Fehler (z.B. bei "es verhält sich komisch")
seine letzten Schritte teilen kann:

1. **Vorschau:** die letzten 100 Schritte (Transparenz - vorhanden im Dialog).
2. **Beschreibung:** optionales Textfeld ("Was ist passiert?") - neu.
3. **Export-Optionen:** JSON (Debugging, neu) · Markdown (GitHub, vorhanden) ·
   Clipboard-Copy (vorhanden).
4. **Dateiname:** `bibliogon-fehlerbericht-{YYYY-MM-DD-HHmm}.json` (neu).

Der Markdown-Export formatiert die Events als lesbaren Block mit Timestamp,
Typ/Kategorie, Aktion - ohne sensible Payload-Details (Privacy) - mit
App-State-Header (Version, Storage-Mode, Sprache, Theme). Markdown existiert
bereits via `formatEventLog`; der App-State-Header existiert als Env-Block.

---

## 4. Technische Details

- **Generische `RingBuffer<T>`-Extraktion (neu):** der heutige
  `EventRingBuffer` ist app-spezifisch inline. Vorschlag: generische
  `RingBuffer<T>` nach `frontend/src/lib/utils/RingBuffer.ts` (kein App-Import,
  TSDoc, Tests), und `eventRecorder` baut darauf auf. Skizze:

  ```typescript
  class RingBuffer<T> {
    private buffer: (T | undefined)[];
    private index = 0;
    private count = 0;
    constructor(private capacity: number) {
      this.buffer = new Array(capacity);
    }
    push(item: T): void { /* circular write */ }
    toArray(): T[] { /* oldest first */ }
    clear(): void { /* reset */ }
  }
  ```

- **`eventRecorder` (vorhanden, erweitern):** bleibt der app-spezifische
  Layer (Privacy-Filter + Auto-Capture); ergänzt um Dexie-Persist + optionale
  Kategorie/`appState`-Felder.

- **Bundle-Größe:** Basis existiert bereits im Bundle. Der Delta (RingBuffer-
  Extraktion + Dexie-Persist + JSON-Export + Settings-Einstieg) bleibt
  < 2 kB gzipped.

- **Beide Storage-Modi:** der Recorder nutzt immer Dexie (lokale Persistenz),
  unabhängig vom Storage-Mode der App. Im API-Modus werden **trotzdem keine**
  Events ans Backend gesendet.

- **feature-strategy (neu):** `EVENT_RECORDING` als `ALWAYS_ACTIVE`
  registrieren (rein client-seitig, kein Backend nötig). Heute ist der
  Recorder nicht in der Registry geführt - er läuft unbedingt, was funktional
  korrekt ist, aber eine explizite `ALWAYS_ACTIVE`-Deklaration macht die
  Policy sichtbar.

---

## 5. Integration mit bestehendem Code (Audit-Ergebnis)

Pre-Audit (2026-06-15) ergab: Event-Recording **existiert bereits**. Relevante
Dateien:

| Datei | Rolle |
|-------|-------|
| `frontend/src/utils/eventRecorder.ts` | Ring-Buffer-Singleton + `sanitizeEvent` + `formatEventLog` |
| `frontend/src/utils/eventRecorder.test.ts` | Tests des Recorders |
| `frontend/src/components/EventRecorderSetup.tsx` | Auto-Capture (Klicks, Navigation, `onerror`, `unhandledrejection`) - im App-Root gemountet |
| `frontend/src/api/http.ts` | erfasst `api_call` + `api_error` |
| `frontend/src/utils/notify.ts` | erfasst `toast` |
| `frontend/src/components/ErrorReportDialog.tsx` | user-facing Review + GitHub-Issue-Export + Clipboard |
| `frontend/src/components/ErrorReportDialog.test.tsx` | Tests des Dialogs |
| `frontend/src/components/ErrorBoundary.tsx` | React Error-Boundary (Surface-getaggt) |
| `frontend/src/App.tsx` | mountet `EventRecorderSetup` + `ErrorReportDialog` |

Konsequenz: **aufbauen, nicht neu erfinden.** Die EVT-Tasks (Abschnitt 6)
sind als Erweiterungen der obigen Dateien formuliert.

Hook-Integration (Vorschlag, additiv): ein dünner `useEventRecorder()`-Hook
oder direkte `eventRecorder.add(...)`-Aufrufe in den Storage-Entity-Methoden
(`book.create`, `chapter.save`, ...), damit die Kategorien storage/export/
import erstklassig statt nur über generische API-Events erscheinen.

---

## 6. Roadmap-Tasks

Prefix `EVT-`. Aufwand: S/M/L. Spalte "Ist" markiert, was schon existiert.

| ID | Task | Ist | Aufwand |
|----|------|-----|---------|
| EVT-01 | Generische `RingBuffer<T>` nach `src/lib/utils/` extrahieren + Tests; `eventRecorder` darauf umstellen | inline vorhanden | S |
| EVT-02 | Dexie-Persistenz für den Buffer (debounced; sofort bei error-Events; Cap 100; Restore beim Start) | fehlt (in-memory) | M |
| EVT-03 | Proaktiver Settings-Einstieg (Hilfe/Support -> "Fehlerbericht erstellen") + Beschreibungsfeld | fehlt (nur reaktiv) | M |
| EVT-04 | JSON-Datei-Export (`bibliogon-fehlerbericht-{ts}.json`) neben Markdown/Clipboard | fehlt | S |
| EVT-05 | Optionale Kategorie-Achse + `action`/`appState` pro Eintrag (additiv zu `EventType`); Storage/Export/Import erstklassig erfassen | teilweise (typ-basiert) | M |
| EVT-06 | `EVENT_RECORDING = ALWAYS_ACTIVE` in feature-strategy registrieren | fehlt | S |

Bereits erledigt (kein Task nötig): Ring-Buffer (Größe 100), Privacy-Filter,
Auto-Capture (Klick/Navigation/Error/API/Toast), Markdown-Export,
Clipboard-Copy, GitHub-Issue-Vorausfüllung, ErrorBoundary.

---

## 7. Offene Fragen + Empfehlungen

1. **Buffer-Größe 100 oder mehr?** 100 deckt grob 10-15 Minuten typische
   Nutzung ab. Für längere Sessions: 250. Empfehlung: 100 als Default,
   später in Settings konfigurierbar.

2. **Events auch im Backend aufzeichnen (Desktop-App)?** Empfehlung: Nein.
   Gleiches Client-Side-Verhalten in beiden Modi. Einfacher, konsistenter,
   keine Backend-Abhängigkeit.

3. **Automatischer Upload an einen Fehler-Service?** Empfehlung: Nein.
   Open-Source-Projekt, kein Server für Telemetrie. User-initiierter Export
   reicht. Falls später SaaS: optionales opt-in Telemetrie als Phase 2.

4. **Integration mit Sentry/LogRocket?** Empfehlung: nicht für die PWA. Für
   die Desktop-App optional als Plugin (PluginForge). Der Event-Buffer bleibt
   die lokale Basis.

5. **Datenschutz/GDPR:** keine PII im Buffer, kein automatisches Senden, der
   User sieht alles vor dem Export. GDPR-konform by Design - heute schon, da
   der Sanitizer Credentials redigiert und Editor-Inhalt nie erfasst wird.

6. **Persistenz-Reihenfolge:** EVT-02 (Dexie) ist der wertvollste Einzelschritt
   - ohne Persistenz verliert ein Crash genau die Daten, die den Crash
   erklären würden. Empfehlung: EVT-01 + EVT-02 zuerst, der Rest nach Bedarf.

**Kein MVP-Blocker.** Die Basis lebt; dieses Dokument scopt die Reifung.
