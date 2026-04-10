# Bekannte Fallstricke und Patterns

Diese Regeln stammen aus realer Entwicklung und loesen Probleme die sonst wiederholt auftreten.

## TipTap Editor

### Speicherformat
- TipTap speichert als JSON. NICHT HTML, NICHT Markdown.
- TipTap kann KEIN Markdown rendern. Markdown muss vor der Speicherung zu HTML konvertiert werden.
- Beim Import: Markdown-Dateien mit Python `markdown` Library zu HTML konvertieren, dann als TipTap JSON speichern.
- Beim Wechsel WYSIWYG -> Markdown: JSON zu Markdown konvertieren (nodeToMarkdown).
- Beim Wechsel Markdown -> WYSIWYG: Markdown zu HTML konvertieren, dann zu JSON.

### Extensions
- StarterKit enthaelt KEINE Image-Extension. @tiptap/extension-image separat noetig.
- Figure/Figcaption: @pentestpad/tiptap-extension-figure nutzen, KEIN Custom-Code.
- Zeichenzaehlung: @tiptap/extension-character-count nutzen, KEIN Custom-Code.
- Aktuell 15 offizielle + 1 Community Extension installiert (siehe CLAUDE.md).
- Vor Custom-Code IMMER pruefen ob eine offizielle TipTap-Extension existiert.

### Peer Dependencies
- Community Extensions (@pentestpad/tiptap-extension-figure, tiptap-footnotes) koennen unbemerkt auf @tiptap/core v3 upgraden. Immer mit --save-exact pinnen.
- @pentestpad/tiptap-extension-figure: Pin auf 1.0.12 (letzte v2-kompatible), 1.1.0 erfordert @tiptap/core ^3.19.
- tiptap-footnotes: Pin auf 2.0.4 (letzte v2-kompatible), 3.0.x erfordert @tiptap/core ^3.0.
- npm ci in CI schlaegt fehl bei Peer-Dep-Konflikten. NICHT --legacy-peer-deps als Loesung verwenden.

### CSS
- TipTap rendert innerhalb von .ProseMirror. CSS-Selektoren muessen das beruecksichtigen.
- Spezifitaet: `.ProseMirror p.classname` statt `.tiptap-editor classname`.
- Alle Styles MUESSEN mit CSS Variables arbeiten (3 Themes x Light/Dark = 6 Varianten).

## Import (write-book-template)

### Markdown-zu-HTML
- IMMER Markdown zu HTML konvertieren beim Import. TipTap kann kein Markdown.
- Python `markdown` Library nutzen (bereits installiert).
- Einrueckung: write-book-template nutzt 2-Space-Indent fuer Listen, Python's markdown braucht 4-Space. Einrueckung vor Konvertierung verdoppeln.

### Kapiteltyp-Mapping
- acknowledgments gehoert in BACK-MATTER, nicht Front-Matter.
- TOC (toc.md) wird als eigener Kapiteltyp importiert (chapter_type: toc).
- next-in-series.md wird gemappt auf chapter_type: next_in_series.
- part-intro und interlude werden korrekt erkannt.

### Reihenfolge
- Section-Order aus export-settings.yaml lesen und fuer Kapitel-Positionierung nutzen.
- TOC muss als erstes in Front-Matter stehen.
- Fallback auf alphabetische Sortierung wenn keine export-settings.yaml existiert.

### Assets/Bilder
- Assets aus assets/-Ordner importieren und als DB-Assets speichern.
- Bild-Pfade von `assets/figures/...` zu `/api/books/{id}/assets/file/{filename}` umschreiben.
- Asset-Serving-Endpoint: GET /api/books/{id}/assets/file/{filename}

### Metadaten
- metadata.yaml parsen fuer: title, subtitle, author, language, series, series_index.
- ISBN/ASIN aus metadata.yaml extrahieren (isbn_ebook, isbn_paperback, isbn_hardcover, asin_ebook).
- description.html, backpage-description, backpage-author-bio, custom CSS importieren.
- series kann ein dict sein (name + index), nicht nur ein String. Beide Varianten handlen.
- language normalisieren (z.B. "german" -> "de").

## Export

### Ueberschriften
- Content kann bereits eine H1 enthalten. Vor dem Hinzufuegen einer H1 pruefen ob schon eine existiert.
- _prepend_title muss checken ob Content mit `#` oder `<h1` beginnt.

### TOC
- Wenn manuelles TOC-Kapitel existiert: use_manual_toc=true an manuscripta durchreichen.
- KEIN doppeltes TOC (generiert + manuell). Checkbox im Export-Dialog laesst User waehlen.
- Verschachtelte Listen im TOC: Baumstruktur mit 2-Space-Einrueckung pro Level beibehalten.

### Bilder im EPUB
- Assets muessen beim Scaffolding aus der DB in die Projektstruktur kopiert werden.
- API-Pfade (/api/books/.../assets/file/...) zurueck zu relatives Pfade (assets/figures/...) umschreiben.

### Pandoc/manuscripta
- manuscripta's OUTPUT_FILE ist ein Modul-Global. Muss direkt gesetzt werden, nicht ueber CLI.
- section_order aus dem scaffolded Projekt lesen, fehlende Dateien filtern.
- metadata.yaml braucht --- YAML-Delimiter fuer Pandoc.
- --- in Markdown (Horizontal Rules) zu *** konvertieren, sonst YAML-Parse-Konflikte.

### Dateinamen
- Buchtyp-Suffix im Dateinamen: title-ebook.epub, title-paperback.pdf.
- Setting type_suffix_in_filename (default: true).

## Config-Migration (Bool -> Enum)

- Wenn ein Boolean-Setting zu einem Enum mit mehr Optionen erweitert wird (z.B. audiobook `merge: true|false` -> `merge: separate|merged|both`): IMMER eine `normalize_*`-Funktion einfuehren die alte Bool-Werte stillschweigend uebersetzt (True -> "merged", False -> "separate") und unbekannte/None-Werte auf den Default mappt.
- Begruendung: User-Configs in YAML, Backups (.bgb) und DB-Spalten enthalten weiterhin alte Bool-Werte. Eine harte Schema-Validierung wuerde bestehende Installationen brechen. Der Default im Pydantic-Schema wird vom Typ-System nicht auf Migration geprueft.
- Praxis: Die Normalisierung MUSS sowohl im Backend (Generator/Service-Layer) als auch im Frontend (State-Init aus Settings) passieren, damit beide Seiten dieselben Migrationsregeln teilen. Sonst zeigen alte Configs im UI den falschen Default.
- Tests: Pro Bool-Wert ein expliziter Migrationstest plus Passthrough fuer alle Enum-Werte plus Default fuer None/Unknown.

## Stimmen-Dropdown: KEIN engine-agnostischer Fallback

- Frueher fielen `BookMetadataEditor` und `Settings` auf eine hardcoded `EDGE_TTS_VOICES`-Liste zurueck wenn `/api/voices?engine=X&language=Y` ein leeres Array lieferte. Effekt: User waehlt Google TTS / pyttsx3 / ElevenLabs, der Backend-Cache hat keine Voices fuer diese Engines (nur Edge wird ueber `sync_edge_tts_voices` geseedet) -> Frontend dumpt 16 Edge-DE-Voices in das Dropdown obwohl die Engine sie gar nicht abspielen kann. Bug-Report war "Dropdown zeigt ALLE Stimmen statt nur die passenden".
- Loesung: Ein gemeinsamer Helper `api.audiobook.listVoices(engine, language)` versucht erst `/api/voices` (Cache), dann `/api/audiobook/voices` (Live-Plugin-Endpoint), dann gibt er `[]` zurueck. KEINE hardcoded Liste mehr. Beide UI-Stellen rendern bei `voices.length === 0` einen klaren Empty-State "Keine Stimmen fuer {engine} in {language} verfuegbar" statt etwas zu fingieren.
- `frontend/src/data/edge-tts-voices.ts` wurde komplett geloescht. Wenn ein User wirklich Edge-DE-Voices sehen will, ist Edge die einzige Engine die der Backend-Cache seedet und das Dropdown wird durch den normalen Pfad gefuellt.
- Backend `voice_store.get_voices` matcht jetzt zweistufig: enthaelt das `language` einen Bindestrich (`"de-DE"`), ist es ein exakter case-insensitiver Match. Bare Code (`"de"`) ist Prefix-Match (`de-DE`, `de-AT`, `de-CH`). Vorher hat er den Region-Suffix immer abgeschnitten, sodass `"de-DE"` und `"de"` dasselbe Ergebnis lieferten - das war zwar fuer Bibliogons aktuelles Datenmodell egal (Book.language ist ein bare Code), aber die strikte Variante schliesst Plugin-Tests und kuenftige Caller mit ein.
- Tests: `backend/tests/test_voice_store.py` (8 Tests) deckt jeden Pfad ab (Engine-Isolation, Bare vs Region, Case-Insensitivitaet, unbekannte Engine, unbekannte Sprache, Engine-Leak-Regression). `frontend/src/api/client.test.ts` haelt fest dass die Helper-Funktion bei `[]` aus beiden Endpoints **kein** hardcoded Edge-Fallback mehr liefert - das ist die Regression-Versicherung gegen das urspruengliche Symptom.

## Audiobook Progress-Dialog: SSE-Listener gehoert in den Context, nicht in die Komponente

- Frueher lebte der `EventSource` im `AudioExportProgress`-Modal. Sobald der User minimierte oder einen Re-Render triggerte, wurde der Listener neu aufgebaut und Events gingen verloren - oder noch schlimmer, der Job war nach `clear()` weg, weil das Modal die einzige Stelle mit Live-State war.
- Loesung: Der gesamte SSE-Lifecycle (open/onmessage/close) lebt jetzt im `AudiobookJobProvider`. Die Phase, der Event-Log, current/total/currentTitle, downloadUrl/chapterFiles - alles liegt im Context. Das Modal und das Badge sind reine Konsumenten und tauschen sich nicht gegenseitig aus.
- Reload-Recovery: jobId+bookId+bookTitle werden in `localStorage` (`bibliogon.audiobook_job`) gespiegelt. Beim Mount des Providers prueft `useEffect`, ob ein persisted Job existiert, und reaktiviert die SSE-Verbindung. Das Badge taucht nach F5 wieder auf, das Modal bleibt minimiert (kein Pop-up ins Gesicht).
- Persisted-Eintrag wird beim `stream_end`-Event geloescht. Sonst meldet sich nach Reload ein Job zurueck der bereits beendet ist.
- Wichtige Konvention: Nummern als reine Anzeige-Logik. `formatChapterPrefix(index, total)` baut "01 | Vorwort" / "003 | Vorwort" - die TTS-Engine bekommt weiterhin NUR den nackten Chapter-Title, keine Nummer, keinen Pipe. SSE-Event traegt `{type, index, title, duration_seconds}` als getrennte Felder, das Frontend formatiert. Ein Test in `tests/test_generator.py` haelt fest dass `chapter_done` ein `duration_seconds`-Feld mitliefert, ein Vitest-Test in `AudioExportProgress.test.ts` haelt fest dass das Frontend NIE "Kapitel X:" rendert.
- BookEditor liest jetzt `?view=metadata` aus `useSearchParams`, damit das Badge nach Abschluss `navigate("/book/{id}?view=metadata")` aufrufen kann und der Tab direkt offen ist. `setShowMetadata` wurde in `_setShowMetadata` gewrappt das Query-Param und State synchron haelt.

## Generierte Audiobook-Dateien muessen persistent gespeichert werden

- Vor v0.10.x lebten exportierte Audiobook-MP3s ausschliesslich in einem Temp-Dir des Job-Workers. Sobald der User den Progress-Dialog geschlossen hatte, war die einzige Kopie weg - bei ElevenLabs (kostenpflichtig) ist das echter Daten- und Geldverlust.
- Loesung: nach erfolgreichem `_run_audiobook_job` werden alle generierten Dateien nach `uploads/{book_id}/audiobook/` kopiert (chapters/ + audiobook.mp3 + metadata.json). Die Endpoints `GET/DELETE /api/books/{id}/audiobook` plus `/merged`, `/chapters/{name}` und `/zip` exposen sie wieder zum Download.
- Wichtig: das Persistieren passiert im `try/except` und darf einen erfolgreichen Job NIE abbrechen. Lieber loggen, Datei ist im Temp-Dir noch downloadbar.
- Die Persistenz-Endpoints leben im Backend-Core (`backend/app/routers/audiobook.py`), NICHT im premium-lizenzierten Audiobook-Plugin. Sonst kann ein User mit abgelaufener Lizenz seine bereits generierten Dateien nicht mehr abrufen.
- Regeneration warnt vor Ueberschreibung: `POST /api/books/{id}/export/async/audiobook` antwortet mit HTTP 409 + `{code: "audiobook_exists", existing: {engine, voice, created_at, ...}}`, sobald `audiobook_storage.has_audiobook(book_id)` true ist. Frontend zeigt einen Confirm-Dialog mit den existierenden Metadaten und ruft denselben Endpoint mit `?confirm_overwrite=true` erneut auf.
- Plugin-Setting `audiobook.settings.overwrite_existing: true` ueberspringt die 409 - User-Wunsch: "es gibt auch ne konfig fuer die ueberschreibung aber trotzdem warnung", deshalb bleibt der Frontend-Confirm trotzdem als zweite Sicherheit.
- Backup: `GET /api/backup/export?include_audiobook=true` bundelt die persistenten Audiobook-Verzeichnisse mit ein. Default ist false, weil MP3-Backups schnell auf 100+MB pro Buch wachsen.

## ElevenLabs API-Key gehoert NICHT in .env

- Der ElevenLabs-API-Key wurde frueher nur ueber `ELEVENLABS_API_KEY` env var gelesen. Das ist fuer User undurchsichtig: keine UI, kein Test-Knopf, keine Fehlermeldung wenn der Key fehlt.
- Loesung: `audiobook.yaml` hat jetzt einen `elevenlabs.api_key` Block, gefuettert ueber `POST /api/audiobook/config/elevenlabs` (verifiziert vor dem Speichern gegen `GET https://api.elevenlabs.io/v1/user`). `tts_engine.set_elevenlabs_api_key()` bekommt den Key beim Plugin-Activate und bei jedem POST.
- Env-Var bleibt als Fallback - bestehende Installationen mit `.env` brechen nicht.
- Der Key wird in GET-Responses NIE im Klartext zurueckgegeben. Frontend zeigt nur `{configured: bool}` und bietet "Schluessel hinterlegt"-Indikator + Loeschen-Button.
- Die Endpoints liegen wie die Persistenz-Endpoints im Backend-Core, weil das Audiobook-Plugin premium ist und User trotzdem ihren Key konfigurieren koennen sollen wenn die Lizenz aus anderen Gruenden gerade nicht aktiv ist.

## Audiobook-Export ist asynchron mit SSE-Progress

- Der Endpoint `POST /api/books/{id}/export/audiobook` darf NIE synchron eine MP3 zurueckgeben. Audiobook-Generierung dauert Minuten; jeder synchrone Pfad blockiert den Request-Thread und liefert dem User nichts Sichtbares.
- Pflicht-Form: Client schickt `POST /api/books/{id}/export/async/audiobook`, bekommt `{job_id}` zurueck, abonniert anschliessend `GET /api/export/jobs/{job_id}/stream` (Server-Sent Events).
- Die alte sync-Route `GET /api/books/{id}/export/audiobook` antwortet jetzt absichtlich mit HTTP 410 + Hinweis auf den async-Pfad. Regression-Test `test_sync_audiobook_route_returns_410` schlaegt Alarm wenn jemand den Endpoint wieder anschaltet.
- Progress-Events die der Generator emittiert: `start`, `chapter_start`, `chapter_done`, `chapter_skipped`, `chapter_error`, `merge_start`, `merge_done`, `merge_error`, `done`. Der Routen-Wrapper fuegt `ready` (mit `download_url`) und `JobStore.update()` haengt das synthetische `stream_end` an, damit SSE-Subscriber sauber rausfliegen.
- Frontend nutzt browser-natives `EventSource` (kein Package noetig). Modal ist `modal=true` und nicht via Escape/Click-Outside schliessbar bis der Job einen Terminal-Status hat - sonst orphaned der User Jobs durch versehentliches Klicken.
- Generator-Callbacks duerfen niemals den Export killen: `progress_callback`-Aufrufe sind in `try/except` gewickelt und loggen nur. Ein broken Subscriber darf NICHT eine Stunde TTS-Arbeit zerstoeren.
- Tests muessen durch `with TestClient(app) as c:` laufen, sonst feuert FastAPIs lifespan nicht und der Plugin-Manager mounted die Audiobook-/Export-Routen ueberhaupt nicht (404 statt 410). TTS-Engine immer mocken via `patch("bibliogon_audiobook.generator.get_engine", ...)`.

## Async im FastAPI-Lifespan

- Im `async def lifespan(app)` Handler laeuft bereits der uvicorn-Event-Loop. `asyncio.new_event_loop()` + `loop.run_until_complete(...)` ist dort verboten und crasht mit "Cannot run the event loop while another loop is running".
- Wenn eine Hilfsfunktion wie `sync_edge_tts_voices` waehrend des Startups eine Coroutine ausfuehren muss: Funktion `async` machen und im Lifespan `await`-en, NICHT eigenen Loop bauen.
- Symptome wenn falsch gemacht: `RuntimeWarning: coroutine '...' was never awaited` plus das Loop-Conflict-ERROR im Startup-Log.
- Andere Aufrufer derselben Funktion (CLI-Targets im Makefile, sync FastAPI-Endpoints) muessen mitziehen: `asyncio.run(...)` im CLI, `async def` + `await` in Endpoints.

## Config-Migration (Bool -> Enum)

- Wenn ein Boolean-Setting zu einem Enum mit mehr Optionen erweitert wird (z.B. audiobook `merge: true|false` -> `merge: separate|merged|both`): IMMER eine `normalize_*`-Funktion einfuehren die alte Bool-Werte stillschweigend uebersetzt (True -> "merged", False -> "separate") und unbekannte/None-Werte auf den Default mappt.
- Begruendung: User-Configs in YAML, Backups (.bgb) und DB-Spalten enthalten weiterhin alte Bool-Werte. Eine harte Schema-Validierung wuerde bestehende Installationen brechen. Der Default im Pydantic-Schema wird vom Typ-System nicht auf Migration geprueft.
- Praxis: Die Normalisierung MUSS sowohl im Backend (Generator/Service-Layer) als auch im Frontend (State-Init aus Settings) passieren, damit beide Seiten dieselben Migrationsregeln teilen. Sonst zeigen alte Configs im UI den falschen Default.
- Tests: Pro Bool-Wert ein expliziter Migrationstest plus Passthrough fuer alle Enum-Werte plus Default fuer None/Unknown.

## HTML-zu-Markdown Konvertierung

- KEIN Regex-basierter Konverter fuer verschachtelte HTML-Strukturen.
- HTMLParser-basierten Konverter nutzen der Verschachtelungstiefe trackt.
- Speziell fuer <ul>/<li>: Korrekte 2-Space-Einrueckung pro Level.

## Deployment

- Default-Port: 7880 (nicht 8080, zu oft belegt).
- /api/test/reset NUR im Debug-Modus (BIBLIOGON_DEBUG=true).
- CORS ueber BIBLIOGON_CORS_ORIGINS konfigurierbar (nicht hardcoded).
- SQLite-Pfad konfigurierbar mit Docker-Volume-Persistenz.
- BIBLIOGON_SECRET_KEY wird von start.sh automatisch generiert wenn nicht gesetzt.
- Non-Root User im Dockerfile.

## Lizenzierung

### license_tier Attribut
- PluginForge's BasePlugin ist ein externes PyPI-Paket - NICHT modifizieren. Stattdessen `license_tier` als Klassen-Attribut direkt auf den Plugin-Klassen setzen.
- `_check_license` in main.py liest `getattr(plugin, "license_tier", "core")` - Default ist "core" (abwaertskompatibel).

### Trial Keys
- Trial-Keys nutzen `plugin="*"` als Wildcard im Payload. `LicensePayload.matches_plugin()` muss `"*"` explizit als Match-All behandeln.
- Trial-Keys werden unter Key `"*"` in `licenses.json` gespeichert, nicht unter dem Plugin-Namen.
- Ablaufdatum: Immer `date.today()` (UTC) nutzen, nicht `datetime.now()`. `date.fromisoformat()` erwartet "YYYY-MM-DD" Format.
- `_check_license` muss sowohl per-Plugin-Key als auch Wildcard-Key pruefen (Fallback-Kette).

### Settings UI
- `discoveredPlugins` API liefert `license_tier` und `has_license` pro Plugin. Die Werte werden aus der Plugin-YAML (license-Feld) und dem LicenseStore/Validator abgeleitet.
- Premium-Plugins ohne Lizenz: "Lizenz eingeben" Button statt Toggle. Kein Enable/Disable moeglich.

## Allgemeine Patterns

- Vor Custom-Implementierungen: Pruefen ob eine Library/Extension das schon loest.
- Bei CSS-Problemen: Erst Spezifitaet pruefen (.ProseMirror Kontext).
- Bei Import-Problemen: Pruefen ob das Quellformat (Markdown) korrekt zu HTML konvertiert wird.
- Bei Export-Problemen: Pruefen ob HTML korrekt zurueck zu Markdown konvertiert wird.
- Roundtrip testen: Import -> Editor -> Export -> epubcheck.

## Code-Struktur

### God Method vermeiden
- Route-Handler die laenger als 50 Zeilen sind, muessen zerlegt werden.
- Typisches Symptom: if/elif-Kaskaden fuer verschiedene Formate/Typen in einem Handler.
- Loesung: ExportContext-Dataclass + eine Funktion pro Format-Gruppe + testbare Hilfsfunktionen.
- Jede extrahierte Funktion muss ohne den gesamten Request-Kontext testbar sein.
- Siehe coding-standards.md "Funktionsdesign" fuer das korrekte Pattern.

### Testbarkeit als Design-Kriterium
- Wenn eine Funktion schwer zu testen ist (viel Mocking noetig), ist das ein Signal fuer schlechtes Design.
- Service-Funktionen duerfen keine FastAPI-Abhaengigkeiten haben (kein Request, kein Response, kein Depends).
- Hilfsfunktionen (validate_format, build_filename, detect_manual_toc) muessen mit einfachen Parametern aufrufbar sein.
- Datenklassen (dataclass, TypedDict) statt loser Dicts fuer Kontext zwischen Funktionen.

### Error-Handling Fehler die wir gemacht haben
- HTTPException direkt in Services geworfen. Macht Services nicht testbar ohne FastAPI-Kontext. Loesung: Eigene Exception-Hierarchie (BibliogonError).
- Nackte `except Exception: pass` in Plugin-Code. Fehler verschwinden spurlos. Loesung: Spezifische Exceptions fangen, mindestens loggen.
- Externe Tool-Fehler (Pandoc subprocess.CalledProcessError) ungewrappt nach oben durchgereicht. User sieht kryptische Fehlermeldung. Loesung: ExternalServiceError mit klarem Service-Namen.
- Frontend: API-Calls ohne catch. User klickt "Exportieren" und nichts passiert. Loesung: Immer try/catch mit Toast-Feedback und finally fuer Loading-State.

### Fehler-Reporting Regeln
- Fehlerdetails muessen ein GitHub Issue direkt actionable machen, ohne Rueckfragen.
- Kette: BibliogonError (detail + str(e)) -> API Response (detail + traceback im Debug-Mode) -> Frontend ApiError -> Toast mit "Issue melden" Button -> GitHub Issue (Titel, Stacktrace, Browser, App-Version).
- JEDER except-Block MUSS logger.error() mit exc_info=True aufrufen.
- JEDER except-Block MUSS str(e) in die BibliogonError-Subklasse aufnehmen (NICHT HTTPException).
- JEDER Frontend catch-Block MUSS toast.error() mit dem ApiError-Objekt aufrufen, NICHT nur mit einem String.
- Generische Fehlermeldungen wie "Export failed" oder "Import failed" ohne Details sind VERBOTEN. Sie machen GitHub Issues wertlos.
- File-Upload-Funktionen (fetch statt request()) muessen bei Fehler ApiError werfen, nicht Error.
- Globaler Exception Handler in main.py loggt alle unbehandelten Fehler mit Stacktrace.
- Im Debug-Mode liefert die Backend-Response den Stacktrace mit (fuer den "Issue melden" Button).
