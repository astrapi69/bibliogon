# Bibliogon - Anforderungen und Roadmap

Offene Punkte, geplante Features und technische Schulden.
Checkboxen: `[ ]` = offen, `[x]` = erledigt.
IDs: U=UI/UX, I=i18n, X=Import/Export, T=TipTap, B=Backend, Q=Tests, P=Plugin, S=Schulden, O=Offline-Haertung.

Prompt-Referenz: `Setze T-01 um.` reicht als Anweisung.

---

## Naechste Schritte (priorisiert)

Diese Punkte haben Vorrang vor den kategorisierten Listen unten.

- [x] W-01: PWA-Support (manifest.json, Service Worker, Offline-Cache, installierbar)
- [x] K-01: KDP-Plugin fertig implementieren und deployen
- [x] K-02: Cover-Validierung: Dimensionen, DPI, Farbprofil gegen KDP-Specs
- [x] K-03: Metadaten-Completeness-Check vor Export (Pflichtfelder pruefen)
- [x] A-03: Klare UI-Trennung: AI-Vorschlaege in eigenem Panel, 
      nicht inline im Text. Autor uebernimmt explizit per Klick.
- [x] A-02: Optionales AI-Metadata-Flag im EPUB/PDF-Export.
- [x] V-01: Versionsgeschichte-Tab: Chronologische Liste aller Backups
- [x] K-04: Changelog-Export: Welche Version wurde wann publiziert


## UI/UX

- [x] Papierkorb: Loeschen ohne Bestaetigungsdialog, direkt verschieben
- [x] Papierkorb: Roter "Endgueltig loeschen"-Button im Widget
- [x] BookCard: Drei-Punkte-Menu statt einzelnem Trash-Icon
- [x] CreateBookModal: Zwei-Stufen-Dialog (Pflicht + aufklappbar Optional)
- [x] CreateBookModal: Genre-Feld mit Datalist (eingabefaehig)
- [x] CreateBookModal: Serie hinter Checkbox versteckt
- [x] Sidebar: Aufklappbare Sektionen (Front-Matter, Kapitel, Back-Matter)
- [x] Responsive Layout: Hamburger-Menu auf Mobile
- [x] BookEditor: Sidebar als Overlay auf Mobile
- [x] GetStarted: Interaktiver Step-by-Step Wizard
- [x] Settings: White-Label Konfiguration (App umbenennen, Core-Plugins togglen)
- [x] Settings: Autor-Tab mit Pseudonym-Verwaltung
- [x] Core-Plugins: "Standard" Badge, kein Loeschen/Deaktivieren
- [x] Dashboard: Buch-Suche/Filter (nach Titel, Autor, Genre, Sprache)
- [x] U-01: Dashboard: Sortierung (nach Datum, Titel, Autor)
- [x] U-02: Dashboard: Buch-Cover als Thumbnail auf der BookCard
- [x] U-03: Editor: Bild-Upload per Drag-and-Drop in den Editor
- [x] U-04: Editor: Fussnoten-Support (tiptap-footnotes Extension)
- [x] U-05: Editor: Suchen und Ersetzen im Kapitel
- [x] U-06: Editor: Wortanzahl-Ziel pro Kapitel (Progress-Bar)
- [x] U-07: Sidebar: Kapitel per Rechtsklick umbenennen
- [x] U-08: Dark Mode: Sidebar-Theme unabhaengig vom Haupt-Theme
- [x] U-09: Papierkorb: Auto-Loeschen nach X Tagen (konfigurierbar)

## i18n

- [x] useI18n Hook mit 216 Strings in 5 Sprachen
- [x] Alle Hauptkomponenten migriert (Sidebar, Editor, Settings, GetStarted, Export, Dashboard)
- [x] Settings: Restliche Strings migrieren (einige Toast-Messages noch hardcoded)
- [x] I-01: Sprachumschaltung live ohne Reload
- [x] I-02: Fehlende Sprachen: Portugiesisch, Tuerkisch, Japanisch
- [ ] I-03: i18n retroaktive Vervollstaendigung fuer ES, FR, EL, PT, TR, JA.
      Nach dem v0.11 -> v0.12 Audit fehlen in diesen Sprachen ca. 100
      Keys pro Sprache (alle aus Features die nach der ersten
      Uebersetzung dazugekommen sind: TranslationSettingsPanel,
      BackupCompareDialog, neue ChapterTypes, error_report, audiobook
      overwrite/skip Sub-UI, help/backup Root-Sektionen). DE und EN sind
      die einzigen Sprachen die voll aktuell sind; die kritischsten
      v0.11->v0.12 Keys wurden in den sechs anderen Sprachen punktuell
      nachgepflegt (siehe `feat(i18n)` Commits), aber die alten Luecken
      brauchen idiomatische Uebersetzungen, idealerweise mit Muttersprachler-
      Review. Bis dahin faellt der Frontend-`t()`-Helper auf den English
      Fallback zurueck, also bleibt die UI funktional, nur unuebersetzt.
      Fortschritts-Test: `_FULLY_MAINTAINED_LANGUAGES` in
      `backend/tests/test_i18n_structure.py` — Liste erweitern sobald
      eine Sprache auf Vollstaendigkeit ist.

## Import/Export

- [x] write-book-template Import mit 21 Kapiteltypen
- [x] Section-Order aus export-settings.yaml
- [x] Asset-Import mit Pfad-Rewriting
- [x] EPUB-Export mit Bildern und manuellem TOC
- [x] Backup/Restore mit Assets und allen Metadaten
- [x] PDF-Export: Cover-Bild als erste Seite
- [x] X-01: EPUB: epubcheck-Validierung nach Export (automatisch)
- [x] X-02: Import: Erkennung von Markdown-Dateien ohne write-book-template Struktur
- [x] X-03: Export: Kapiteltyp-spezifische Formatierung (Widmung zentriert, Motto kursiv)
- [x] X-04: Export: Custom CSS pro Kapiteltyp
- [x] X-05: Batch-Export: Alle Formate auf einmal (EPUB + PDF + DOCX)

## Editor (TipTap)

- [x] 15 offizielle Extensions + Figure/Figcaption
- [x] 24 Toolbar-Buttons
- [x] Markdown-Toggle mit Bild-Erhalt
- [x] T-01: Fussnoten (tiptap-footnotes)
- [x] T-02: Suchen und Ersetzen (@sereneinserenade/tiptap-search-and-replace)
- [x] T-03: Office-Paste (tiptap-extension-office-paste)
- [x] T-04: Bild-Resize per Drag
- [x] T-05: Spellcheck-Integration (LanguageTool, wenn Grammar-Plugin aktiv)
- [x] T-06: Lesezeit-Schaetzung pro Kapitel
- [x] T-07: Focus-Mode (nur aktueller Absatz hervorgehoben)

## Backend

- [x] Auto-Migration fuer DB-Schema (fehlende Spalten)
- [x] Plugin-ZIP-Installation mit dynamischem Laden
- [x] Umgebungsvariablen (CORS, DEBUG, SECRET, DB_PATH)
- [x] Non-Root Docker, Health-Checks
- [x] B-01: Alembic-Migrationen statt Auto-Migration (robuster)
- [x] B-02: Structured Logging (JSON-Format fuer Produktion)
- [ ] B-03: Rate Limiting auf API-Endpunkte
- [ ] B-04: API-Versionierung (v1/v2 Prefix)
- [x] B-05: Asynchrone Export-Jobs (lange Exports blockieren nicht)

## Tests

- [x] 228 Backend + Plugin-Tests (pytest, via `make test-backend` + `make test-plugins`)
- [x] 90 Frontend-Tests (Vitest)
- [x] 52 E2E-Tests (Playwright)
- [x] Q-01: E2E-Tests aktualisieren fuer Radix-Selektoren und neue Features
- [x] Q-02: Mutation Testing mit mutmut einrichten
- [x] Q-03: Roundtrip-Tests: Import -> Editor -> Export -> epubcheck
- [x] Q-04: API-Client Unit Tests (Vitest)
- [x] Q-05: mypy Type-Checking fuer Python Backend
- [x] Q-06: CI-Pipeline (GitHub Actions)

## Plugins (Roadmap)

### Phase 8: Manuskript-Qualitaet (v0.9.0)
- [x] P-09: plugin-manuscript-tools: Style-Checks, Sanitization
- [x] P-10: Filler-Woerter, Passiv, Satzlaenge
- [x] P-11: Lesbarkeits-Metriken (Flesch-Kincaid)

### Phase 9: Uebersetzungs-Plugin (v0.10.0, Premium)
- [x] P-06: plugin-translation: DeepL/LLM Uebersetzung
- [x] P-07: LMStudio fuer lokale LLM-Uebersetzung
- [x] P-08: Kapitelweise Uebersetzung als neues Buch
  
### Phase 10: Audiobook-Plugin (v0.11.0, Premium)
- [x] P-01: plugin-audiobook: TTS-basierte Audiobook-Generierung
- [x] P-02: TTS-Engine Auswahl: Edge TTS, Google TTS, pyttsx3, ElevenLabs
- [x] P-03: Voice-Settings pro Buch
- [x] P-04: MP3 pro Kapitel, Merge zu Audiobook (ffmpeg)
- [x] P-05: Vorhoer-Funktion im Editor

### Phase 11: Multi-User und SaaS (v1.0.0)
- [ ] P-12: Benutzerregistrierung und Authentifizierung
- [ ] P-13: PostgreSQL statt SQLite
- [ ] P-14: Pen-Name-Verwaltung pro User (nicht global)
- [ ] P-15: Plugin-Marketplace
- [ ] P-16: Stripe-Integration

## Technische Schulden

- [x] S-01: Hardcoded Strings in Dashboard (einige Dialog-Texte)
- [x] S-02: BookCard: Genre-Badge i18n (zeigt aktuell den Key statt uebersetzten Namen)
- [x] S-03: Settings-Seite: ~10 verbleibende hardcoded Strings
- [x] S-04: Export-Plugin: tiptap_to_md.py unterstuetzt nicht alle neuen Extensions (Table, TaskList)
- [x] S-05: Playwright E2E: Einige Tests brauchen Anpassung fuer Radix-Selektoren (erledigt in Q-01)
- [x] S-06: package.json: Chunk-Size Warning beim Build (>500KB)
- [x] S-07: Docker: Multi-Stage Build fuer kleineres Backend-Image
- [x] S-08: backend/app/routers/backup.py auf Service-Module aufteilen.
      Stand: 1070 Zeilen, mehrere god methods (`import_project` 263 LOC,
      `import_backup` 123, `_import_with_section_order` 101,
      `export_backup` 86, `smart_import` 82). Der 04-05 Refactor hatte nur
      die Buch-Serialisierung extrahiert; Folge-Features (V-01, smart-import,
      X-02 plain-Markdown) haben wieder god methods direkt in den Router
      gelegt. Plan: `app/services/backup/` mit `serializer.py`,
      `backup_export.py`, `backup_import.py`, `project_import.py`,
      `markdown_import.py`, `format_detection.py`. Router enthaelt nur noch
      duenne Endpunkte die delegieren.
- [x] S-09: plugins/bibliogon-plugin-export/.../scaffolder.py: god methods
      `scaffold_project` (197) und `_html_to_markdown` (123) zerlegt.
      `scaffold_project` in 6 Step-Helfer aufgeteilt; HTMLParser in eigenes
      `html_to_markdown.py`-Modul ausgezogen mit per-Tag Open/Close-Handlern
      via Dispatch-Tabellen.
- [x] S-10: plugins/bibliogon-plugin-translation/.../routes.py: god method
      `translate_book` (~106 LOC) in 5 Step-Helfer aufgeteilt:
      `_open_db_session_or_500`, `_load_book_with_chapters`,
      `_build_translation_clients`, `_create_translated_book`,
      `_translate_chapters_into` plus per-Kapitel `_translate_one_chapter`.
- [x] S-11: plugins/bibliogon-plugin-export/.../pandoc_runner.py: god method
      `run_pandoc` (~84 LOC) in 5 Step-Helfer aufgeteilt:
      `_read_export_settings`, `_resolve_section_order`,
      `_set_manuscripta_output_file`, `_resolve_cover_path`,
      `_find_output_file`. Body von ~84 auf ~25 LOC geschrumpft.
- [x] S-12: backend/app/routers/chapters.py: god method `validate_toc`
      (~98 LOC) in 6 Step-Helfer aufgeteilt: `_collect_valid_anchors`,
      `_collect_chapter_anchors`, `_add_title_anchors`,
      `_add_heading_anchors`, `_add_explicit_id_anchors`, `_check_toc_links`
      mit `_iter_toc_links` Generator. `_TYPE_ANCHORS` als Modul-Konstante
      aus dem Funktionskoerper rausgezogen.

## Offline-Haertung

- [ ] O-01: Alle UI-Schriftarten lokal buendeln statt Google-Fonts-CDN.
      Aktuell laedt `frontend/index.html` sechs Schriftfamilien
      (Crimson Pro, JetBrains Mono, DM Sans, Inter, Lora, Source Serif
      Pro) ueber `fonts.googleapis.com`, was offline und in
      privacy-sensitiven Umgebungen bricht. Plan: WOFF2-Dateien nach
      `frontend/public/fonts/` legen (OFL-lizenziert, Lizenztexte als
      `LICENSE-{name}.txt` mit ablegen), passende `@font-face`-Regeln
      in `global.css` ergaenzen, Google-Fonts-Link aus `index.html`
      entfernen, PWA-Manifest/Service-Worker die neuen Asset-URLs
      cachen lassen. Muss konsistent sein: entweder alle sechs Fonts
      lokal oder keine. Teil-Umstellungen erzeugen nur Verwirrung.
      Auslagerung aus dem Themes-Task weil dort nur die drei neuen
      Schriften hinzukamen; das Bundling betrifft alle sechs.

## KDP Publishing Workflow
- [x] K-01: KDP-Plugin fertig implementieren und deployen
- [x] K-02: Cover-Validierung: Dimensionen, DPI, Farbprofil gegen KDP-Specs
- [x] K-03: Metadaten-Completeness-Check vor Export (Pflichtfelder pruefen)
- [x] K-04: Changelog-Export: Welche Version wurde wann publiziert

### AI-Assistenz (aufbauend auf Translation-Plugin)
- [x] A-01: Generisches AI-Plugin (Ollama/LMStudio-Anbindung)
- [x] A-02: Optionales AI-Metadata-Flag im Export (Commit 881e84c)

- [x] A-03: Klare UI-Trennung: AI-Vorschlaege in eigenem Panel, 
      nicht inline im Text. Autor uebernimmt explizit per Klick.

## Versionierung (leichtgewichtig, kein Git)
- [x] V-01: Versionsgeschichte-Tab: Chronologische Liste aller Backups
- [x] V-02: Backup-Vergleich: Zwei Versionen nebeneinander anzeigen (Implementiert als Upload-Dialog: POST /api/backup/compare + Dashboard-Button "Backups vergleichen". Wird spaeter durch das Sicherungs-Feature mit automatischen Speicherpunkten ersetzt.)
## Manuskript-Tools (M)

Abgeschlossen:
- [x] M-01: Wortwiederholungs-Erkennung mit konfigurierbarem Fenster
- [x] M-02: Redundante Phrasen Erkennung (DE + EN Listen)
- [x] M-03: Adverb-Erkennung nach Suffix (-lich/-ly/-ment/-mente)
- [x] M-04: Unsichtbare Unicode-Zeichen entfernen (NBSP, ZWSP, BOM, Soft Hyphen)
- [x] M-05: HTML/Word-Artefakte entfernen (leere Tags, Style-Attribute, Namespace-Tags)
- [x] M-06: Sanitization-Vorschau (Diff-Endpoint)
- [x] M-07: Passiv-Quote als Prozent (war nur Count)
- [x] M-08: Durchschnittliche Wortlaenge in Zeichen
- [x] M-09: Zeichenzahl, Absatzzahl, geschaetzte Seitenzahl
- [x] M-10: CSV/JSON-Export der Metriken pro Buch
- [x] M-11: Default-Schwellwert 25 Woerter (war 30)

Geplant:
- [x] M-12: Auto-Sanitization beim Import (Hook ins Import-System)
- [ ] M-13: Adjektiv-Dichte via POS-Tagging (spaCy/NLTK Dependency)
- [ ] M-14: Inline-Markierungen im TipTap-Editor (TipTap-Extension)
- [ ] M-15: Qualitaets-Tab in Buch-Metadaten (Kapitel-Tabelle mit Ausreisser-Markierung)
- [x] M-16: Pro-Buch Schwellwerte persistieren (DB-Migration)
- [x] M-17: Füllwort-Listen aus YAML laden (erweiterbar durch User)
- [x] M-18: Begriffe von Prüfung ausschließen (Allowlist)

## Sicherung (Git-Integration) - Phase 2

- [ ] SI-01: "Remote-Stand uebernehmen" Button fuer externe 
       Aenderungen. Erstellt automatischen Speicherpunkt vom 
       aktuellen Stand, dann `git reset --hard origin/main`, 
       dann Reload der geaenderten Kapitel in die Bibliogon-DB.
- [ ] SI-02: Merge-Hilfe bei einfachen Konflikten (nur ein 
       Kapitel geaendert, keine ueberlappenden Zeilen)
- [ ] SI-03: SSH-Schluessel-Generierung aus der UI heraus 
       (fuer User ohne bestehenden SSH-Key)
- [ ] SI-04: Visueller Indikator in der Sidebar wenn Remote-Stand 
       neuer ist als lokal (Warnung statt erst beim Push-Versuch)


- [ ] O-01: Bundle all fonts locally for true offline-first compliance.
       Currently all six theme fonts (Crimson Pro, Lora, Source Serif Pro, 
       Inter, Crimson Text, Atkinson Hyperlegible) are loaded from Google 
       Fonts CDN. This contradicts the offline-first principle. Move to 
       frontend/public/fonts/ with @font-face rules and SIL OFL license 
       files. Verify all six fonts are SIL OFL compatible before bundling.