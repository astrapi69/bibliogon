# Changelog - Bibliogon

Erledigte Phasen und deren Inhalt. Aktueller Stand in CLAUDE.md, offene Punkte in ROADMAP.md.

## [0.12.0] - 2026-04-11

### Added
- **Backup-Vergleich (V-02):** `POST /api/backup/compare` vergleicht zwei hochgeladene `.bgb`-Dateien in-memory ohne Server-State. Liefert per-Buch-Diff mit Metadaten-Tabelle und Zwei-Spalten-Kapitel-Vergleich (rot/grün) auf HTML-zu-Plain-Text projiziertem Content. Frontend-Dialog im Dashboard neben dem Versionsgeschichte-Toggle. Stop-Gap bis zur geplanten Git-Sicherung.
- **Per-Buch Audiobook-Overwrite-Flag:** `Book.audiobook_overwrite_existing` (neue Alembic-Migration) ersetzt das plugin-globale `overwrite_existing`-Flag. Sichtbar als Checkbox in Metadaten > Audiobook. Wenn aktiviert: Content-Hash-Cache wird für diesen Lauf deaktiviert, die "audiobook_exists" 409-Warnung wird übersprungen.
- **Per-Buch Audiobook-Skip-Chapter-Types:** `Book.audiobook_skip_chapter_types` (JSON-text) ersetzt das plugin-globale `skip_types`. UI in Metadaten > Audiobook als Checkbox-Liste aller 26 Typen, gruppiert in "Im Buch vorhanden" und "Weitere Typen". Dry-Run-Cost-Estimate respektiert die per-Buch-Liste (zwei hardcoded Skip-Sets im Backend entfernt, Bug-Fix).
- **Per-Buch ms-tools-Schwellwerte (M-16):** `Book.ms_tools_max_sentence_length`, `ms_tools_repetition_window`, `ms_tools_max_filler_ratio` als Spalten. `/ms-tools/check` akzeptiert `book_id` und löst Thresholds in der Reihenfolge Request > Buch > Plugin-Config > Default auf.
- **Auto-Sanitization beim Markdown-Import (M-12):** Neuer Hook `content_pre_import` im Hookspec, ms-tools implementiert ihn via `sanitize()` auf Buch-Sprache. Gated durch `auto_sanitize_on_import: true` in `ms-tools.yaml`. Wirkt auf alle 4 Import-Pfade.
- **5 neue ChapterTypes:** `part`, `final_thoughts`, `also_by_author`, `excerpt`, `call_to_action`. Insgesamt jetzt 26 Typen. Marketing-Typen (also_by_author, excerpt, call_to_action) sind im Audiobook-Export per Default in der Skip-Liste. Scaffolder erkennt Body-Level-Typen explizit (`_BODY_TYPES`) statt über Default-Fall.
- **Grammar-Plugin Premium-Auth:** `languagetool_username` und `languagetool_api_key` in neuer minimaler `grammar.yaml`. LanguageToolClient hängt beide als POST-Form-Felder an wenn gesetzt. Ermöglicht Self-Hosting und LanguageTool-Premium.
- **Plugin-Settings Audit:** Generic Plugin-Settings-Panel rendert Scalars typisiert (Boolean → Checkbox, Number → Number-Input, String → Text-Input, Objekt → JSON-Textarea mit Advanced-Hinweis). 4 bisher als "string true/false" gerenderte Felder werden jetzt als Checkbox angezeigt. Neuer TranslationSettingsPanel mit Provider-Select und maskiertem DeepL-API-Key.
- **Event-Recorder und Error-Report-Dialog:** Ring-Buffer für User-Aktionen mit Sanitizer, opt-in History, verbesserter GitHub-Issue-Dialog mit Preview und URL-Length-Truncation.
- **M-17/M-18:** Füllwort-Listen werden aus YAML-Dateien geladen (pro Sprache, erweiterbar durch User-Edit). Per-Sprache Allowlist zum Ausschluss von Begriffen aus den Checks.

### Changed
- **Architektur-Regel: Plugin-Settings Sichtbarkeit.** Jedes `config/plugins/*.yaml`-Feld muss entweder UI-editierbar oder mit `# INTERNAL` markiert sein. Tote Settings sind verboten. Per-Buch-Werte gehören aufs Book-Modell, nicht ins Plugin-YAML. Codifiziert in `.claude/rules/architecture.md`.
- **Architektur-Regel: Plugin-Paket-Versionen.** Plugin-Versionen sind unabhängig von der App-Version. Kein Zwangs-Bump bei App-Releases.
- **Plugin-Settings Aufraeumung:** `audiobook.yaml` verliert `overwrite_existing`, `skip_types`, `language` (alle jetzt per-Buch oder dead). `ms-tools.yaml` verliert `languages` (hardcoded im Code). `kdp.yaml` verliert den kompletten `settings.cover` und `settings.manuscript` Block (von Amazon vorgegeben, als Modul-Konstante `KDP_COVER_REQUIREMENTS` dokumentiert). `export.yaml` `formats`, `export_defaults`, `ui_formats` als `# INTERNAL` markiert.
- **Scaffolder Bug-Fix:** `part_intro` und `interlude` werden jetzt explizit als Body-Typen klassifiziert statt über den Default-Branch zu fallen.
- **Dokumentation aufgeräumt:** `CLAUDE.md` auf v0.12-Stand gebracht (manuscripta ^0.7.0, ChapterType-Liste vollständig, Test-Zahlen korrigiert, KDP nicht mehr "geplant"). `docs/API.md` zu einem <100-Zeilen High-Level-Überblick umgeschrieben, der auf `/docs` und `/openapi.json` als Quelle der Wahrheit verweist. `docs/CONCEPT.md` Version/Stand-Header entfernt. `docs/help/de+en/export/audiobook.md` um per-Buch Overwrite/Skip/ChapterNumber-Sektionen erweitert, veraltete "Skip-Liste in Plugin-Konfiguration"-Referenz entfernt. Leere `docs/de/` und `docs/en/` Placeholder-Verzeichnisse gelöscht.

### Fixed
- **i18n Bug (kritisch, v0.11.x):** Beim Einfügen des TranslationSettingsPanel wurden die neuen `ui.translation:` Keys an der falschen Stelle in `de.yaml` und `en.yaml` eingefügt. Das hat den `ui.settings:`-Block frühzeitig beendet und ~50 Settings-Keys (free, premium, active, off, on, expand_settings, plugin_*, white_label_*, trash_*, license_required, enter_license) unter `ui.translation:` reparentet. Der Frontend-`t()`-Helper fand sie nicht und fiel auf englische Fallbacks zurück, also sah die UI in englischer Locale "korrekt" aus aber deutsche User sahen englische Strings. Commit `fix(i18n): move translation section out of settings and quote on/off`.
- **YAML 1.1 Bool-Trap:** `on:` und `off:` als YAML-Keys wurden in pt/tr/ja.yaml zu Python `True`/`False` Keys geparst und waren im Frontend-Lookup unerreichbar. Jetzt als `"on":` / `"off":` gequotet.
- **Dry-Run-Cost-Estimate:** Zwei hardcoded Skip-Sets im `audiobook.py` Dry-Run-Endpoint ignorierten die YAML und jede per-Buch-Konfiguration. Jetzt via `_resolve_book_skip_types(book)` Helper, der die per-Buch Spalte liest und auf `DEFAULT_AUDIOBOOK_SKIP_TYPES` zurückfällt.
- **Error-Report Issue-Body:** URL-Length-Truncation verhindert dass GitHub den Body abschneidet.
- **Audiobook Downloads:** Audio-Player + Confirm vor Delete, individuelle Chapter-MP3-Liste expanded by default, per-Chapter-Delete-Button im Downloads-Tab.
- **Dev-Mode:** Backend startet vor Frontend, ECONNREFUSED-Rauschen beim Start unterdrückt.
- **Sprachnamen:** Die Sprach-Namen-Strings werden in die aktuelle UI-Sprache übersetzt (nicht in die native Sprach-Form).

### Security
- Audit aller `config/plugins/*.yaml` gegen UI-Sichtbarkeit, keine aktiven Settings ohne Kontrolle mehr.

### Removed
- Plugin-globales `audiobook.settings.overwrite_existing` (ersetzt durch `Book.audiobook_overwrite_existing`, Migration seedet einmal aus YAML)
- Plugin-globales `audiobook.settings.skip_types` (ersetzt durch `Book.audiobook_skip_chapter_types`, Migration seedet einmal aus YAML)
- Plugin-globales `audiobook.settings.language` (war UI-only Voice-Filter, nie von Export-Pipeline gelesen)
- `ms-tools.settings.languages` (wurde nie gelesen, Sprachen kommen aus Modul-Konstanten)
- Alle `kdp.settings.cover.*` und `kdp.settings.manuscript.*` Felder (nie gelesen, Amazon-vorgegebene Werte jetzt als Modul-Konstante)
- Grammar-Plugin `default_language`, `enabled_rules`, `disabled_rules`, `disabled_categories` (nicht gepflegt, LanguageTool-Defaults reichen)
- Leere `docs/de/` und `docs/en/` Placeholder-Verzeichnisse

## [0.11.0] - 2026-04-10

### Added
- Google Cloud TTS Engine mit Service Account Authentifizierung, Quality-Detection (standard/wavenet/neural2/studio/journey) und Voice-Seeding (audiobook)
- Verschlüsselte Credential-Speicherung via Fernet/AES für Google SA JSON und ElevenLabs API-Key (credential_store)
- Content-Hash-Cache: unveränderte Kapitel werden beim Re-Export nicht neu generiert, spart TTS-Kosten (audiobook)
- Kostenschätzung und Ersparnisse-Tracking im Progress-Dialog nach Export-Abschluss (audiobook)
- Dry-Run Modus: Probe hören + Kosten-Preview vor dem echten Export (audiobook)
- Quality-Filter-Toggle im Voice-Dropdown für Google Cloud TTS Stimmen (audiobook)
- Persistente Audiobook-Ablage unter uploads/{book_id}/audiobook/ mit Download-Endpoints (audiobook)
- TTS-Preview-Cache und Preview-Persistenz mit Kapitel-Kontext im Metadata-Tab (audiobook)
- Inline Audio-Player für TTS-Preview im Editor mit Play/Pause/Volume/Close (editor)
- ElevenLabs API-Key UI in Settings mit Verify/Test/Remove (audiobook)
- Help-System: Single-Source-of-Truth Dokumentation mit In-App HelpPanel (react-markdown, Suche, Navigation, Breadcrumb, kontext-sensitive HelpLinks) und MkDocs Material Site auf GitHub Pages (help)
- 26 Markdown-Dokumentationsseiten (12 DE + 12 EN + 2 ms-tools) in docs/help/ (help)
- MkDocs Setup mit Material Theme, i18n, git-revision-dates und GitHub Actions Auto-Deploy (docs)
- Manuscript-Tools: Wortwiederholungs-Erkennung, Redundante Phrasen (15 DE + 15 EN), Adverb-Erkennung, Unsichtbare Zeichen entfernen, HTML/Word-Artefakte entfernen, Sanitization-Vorschau (Diff), CSV/JSON Metriken-Export (ms-tools)
- Plugin-Status-Endpoint GET /api/editor/plugin-status mit Health-Checks und 30s Cache (editor)
- Disabled Buttons mit Tooltips für unavailable Plugins (Grammar, AI, Audiobook) im Editor (editor)
- Audiobook Progress: "01 | Vorwort" Prefix-Format statt "Kapitel 1:", SSE-Listener im Context statt Modal, localStorage-Persistenz, F5-Recovery, Hintergrund-Badge mit Popover (audiobook)
- Regeneration-Warnung vor Überschreibung bestehender Audiobooks mit Confirm-Dialog (audiobook)
- Backup mit optionalem include_audiobook Parameter (backup)
- Toolbar i18n: 32 Button-Labels in 8 Sprachen extrahiert (editor)
- Audiobook Tab in Metadaten mit Sub-Tabs "Downloads" und "Previews" (metadata)

### Fixed
- Voice-Dropdown leakt keine Edge-TTS-Stimmen mehr in andere Engines (audiobook)
- LanguageTool: Texte werden in 900-Zeichen-Chunks aufgeteilt um 413 Payload Too Large zu vermeiden (grammar)
- Grammar-Plugin: Config wird korrekt an Routes weitergereicht (grammar)
- Plugin-Loading: AttributeError auf _settings vor activate() behoben für KDP, Kinderbuch und Grammar (plugins)
- Grammar-Plugin zu enabled-Liste in app.yaml hinzugefügt (config)
- Error-Toast: Overflow behoben, "Issue melden" Button sichtbar und klickbar, closeOnClick deaktiviert (ui)
- Browser-confirm() durch AppDialog für Audiobook-Löschen ersetzt (ui)
- LLM-Port von 11434 (Ollama) auf 1234 (LMStudio) als Default geändert (ai)
- Fehlermeldung bei nicht erreichbarem KI-Server jetzt auf Deutsch mit Handlungsempfehlung (ai)
- MkDocs i18n: docs_structure: folder, index.md pro Locale, Nav-Generator mit Homepage (docs)
- Diverse Doku-Fixes in MkDocs Config (5 Iterationen bis CI grün) (docs)

### Changed
- manuscripta ^0.7.0: alle TTS-Engines delegieren an manuscripta-Adapter statt eigener Implementierung (audiobook)
- Direkte Dependencies auf edge-tts, gtts, pyttsx3, elevenlabs entfernt (audiobook)
- GoogleTTSAdapter umbenannt von gtts_adapter zu google_translate_adapter (manuscripta 0.7.0 Compat) (audiobook)
- AudioVoice DB-Model: neue quality-Spalte + Alembic-Migration (models)
- voice_store.get_voices: zweistufiges Language-Matching (exact bei Region, Prefix bei bare Code) (voice_store)
- formatVoiceLabel() zeigt jetzt Sprache + Quality im Dropdown (ui)
- Hardcoded EDGE_TTS_VOICES Fallback-Liste entfernt, edge-tts-voices.ts gelöscht (frontend)
- Deutsche i18n-Strings und Docs nutzen jetzt echte Umlaute (ä ö ü ß) statt ASCII-Ersatz (i18n)
- Default-Satzlänge-Schwellwert für MS-Tools von 30 auf 25 Wörter geändert (ms-tools)
- Passiv-Quote als Prozent statt Count im Style-Check-Output (ms-tools)

### Security
- Google Service Account JSON wird Fernet-verschlüsselt gespeichert, nie im Klartext (credential_store)
- ElevenLabs API-Key wird bei vorhandenem BIBLIOGON_CREDENTIALS_SECRET ebenfalls verschlüsselt (credential_store)
- Secure Delete: Credentials werden vor dem Löschen mit Null-Bytes überschrieben (credential_store)
- Path-Traversal-Schutz auf allen neuen File-Download-Endpoints (audiobook, help)

## Phase 9: Übersetzung, Audiobook, Infrastruktur (v0.10.0)

- plugin-translation (Premium): DeepL + LMStudio Client, kapitelweise Buchuebersetzung als neues Buch
- plugin-audiobook (Premium): Edge TTS, TTS Engine Abstraction, MP3 pro Kapitel, ffmpeg Merge, Vorhoer-Funktion
- Freemium-Lizenzsystem: license_tier (core/premium), Trial-Keys (Wildcard), Settings UI mit Premium-Badges
- Infrastruktur: Alembic-Migrationen, GitHub Actions CI, mypy, mutmut, Structured Logging, Async Export Jobs
- Editor: Focus Mode, Office Paste, Spellcheck Panel, Kapitel-Rename (Rechtsklick/Doppelklick), Audio Preview
- i18n: 8 Sprachen (DE, EN, ES, FR, EL, PT, TR, JA), Live-Sprachumschaltung
- 303 Tests (78 backend, 125 plugin, 50 vitest, 52 e2e)

## Phase 8: Manuskript-Qualitaet, Editor, Export (v0.9.0)

- plugin-manuscript-tools (MIT): Style-Checks (Filler-Woerter DE+EN, Passiv, Satzlaenge), Sanitization (typografische Anfuehrungszeichen 5 Sprachen, Whitespace, Dashes, Ellipsis), Lesbarkeits-Metriken (Flesch Reading Ease, Flesch-Kincaid Grade, Wiener Sachtextformel, Lesezeit)
- TipTap-Erweiterungen: Fussnoten, Suchen/Ersetzen, Bild-Resize per Drag, Bild-DnD-Upload
- Export: Batch-Export (EPUB+PDF+DOCX), Kapiteltyp-spezifisches CSS, Custom CSS, epubcheck-Validierung
- Import: Plain-Markdown-ZIP ohne Projektstruktur, tiptap_to_md erweitert (Table, TaskList, Figure)
- UI: Dashboard-Sortierung, Cover-Thumbnails, Wortanzahl-Ziel pro Kapitel, Keyword-Tag-Editor
- Infrastruktur: Multi-Stage Docker Build, Frontend-Chunk-Splitting, Roundtrip-Tests

## Phase 7: Erweiterte Buch-Metadaten (v0.7.0)

- Erweiterte Metadaten pro Buch: ISBN (ebook/paperback/hardcover), ASIN, Publisher, Edition, Datum
- Buch-Beschreibung als HTML (fuer Amazon), Rueckseitenbeschreibung, Autor-Kurzbiographie
- Keywords pro Buch (7 SEO-optimierte Keywords fuer KDP)
- Cover-Image Zuordnung pro Buch
- Custom CSS-Styles pro Buch (EPUB-Styles)
- "Config von anderem Buch uebernehmen" Wizard/Dialog
- Erweiterte Kapiteltypen: Epilog, Impressum, Naechstes-in-der-Reihe, Part-Intros, Interludien
- Buch-Metadaten-Editor im BookEditor (5 Sektionen: Allgemein, Verlag, ISBN, Marketing, Design)
- Playwright E2E-Tests erweitert auf 52 Tests

## Phase 6: Editor-Erweiterungen (v0.6.0)

- WYSIWYG/Markdown Umschaltung mit Markdown-zu-HTML Konvertierung beim Wechsel
- Drag-and-Drop Kapitel-Sortierung
- Autosave-Indikator, Wortzaehler
- plugin-grammar (LanguageTool)
- i18n: ES, FR, EL hinzugefuegt (5 Sprachen total)
- Dark Mode mit 3 Themes (Warm Literary, Cool Modern, Nord)
- Settings-Seite mit App-, Plugin- und Lizenz-Konfiguration
- Settings API zum Lesen/Schreiben von YAML-Configs ueber die UI
- PluginForge als PyPI-Paket ausgelagert (pluginforge ^0.5.0)
- Lizenzierung in Backend verschoben (app/licensing.py)
- pre_activate Callback fuer Lizenzpruefung
- plugin-help und plugin-getstarted als Standard-Plugins
- Export-Plugin auf manuscripta umgestellt
- Export-Dialog mit Format/Buchtyp/TOC-Tiefe/Section-Order Auswahl
- Papierkorb (Soft-Delete) mit Wiederherstellen und endgueltigem Loeschen
- Eigene Dateiformate: .bgb (Backup), .bgp (Projekt)
- Custom Dialog-System (AppDialog) statt nativer Browser-Dialoge
- Toast-Notifications (react-toastify)
- Playwright E2E-Tests (39 Tests)
- Umfassende Hilfe (23 FAQ, 12 Shortcuts, bilingual DE/EN)
- write-book-template Import kompatibel mit echten Projekten

## Phase 5: Premium-Plugins und Lizenzierung (v0.5.0)

- Offline-Lizenzierung (HMAC-SHA256, LicenseStore)
- plugin-kinderbuch, plugin-kdp

## Phase 4: Import, Backup, Kapiteltypen (v0.4.0)

- ChapterType Enum, Asset Upload, Full-Data Backup/Restore
- write-book-template ZIP Import

## Phase 3: Export als Plugin (v0.3.0)

- bibliogon-plugin-export (TipTap-JSON -> Markdown, Scaffolder, Pandoc)
- Alter Export-Code entfernt, Editor auf TipTap-JSON umgestellt

## Phase 2: PluginForge (v0.2.0)

- PluginManager auf pluggy, YAML-Config, Lifecycle, FastAPI-Integration
- Entry Point Discovery, Hook-Specs

## Phase 1: MVP (v0.1.0)

- Book/Chapter CRUD, TipTap Editor, Pandoc Export, Docker
