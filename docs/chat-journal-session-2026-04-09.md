# Chat-Journal: Bibliogon Session 2026-04-09

Dokumentation aller Prompts, Optimierungsvorschlaege und Ergebnisse.

---

## 1. Audiobook-Merge: 3-Modi-Enum + Buch-Override (10:30)

- Original-Prompt: "Audiobook-Merge: Buch-Metadaten und dritte Option" - Dropdown
  in BookMetadataEditor (Audiobook-Tab) hinzufuegen, AudioConfig.merge von
  Boolean zu String-Enum (separate, merged, both) mit Migration True->merged,
  False->separate, Settings-Panel und i18n in 8 Sprachen entsprechend updaten,
  Tests fuer alle drei Modi und Migration.
- Optimierter Prompt: Identisch klar, da bereits scope, default, migration und
  tests explizit benannt waren.
- Ziel: Pro-Buch Audiobook-Merge-Auswahl mit drei Optionen (separate/merged/both)
  und sauberer Bool-Migration im gesamten Stack (DB, Plugin-Generator,
  Export-Plugin, Settings-UI, Buch-Metadaten-UI, i18n).
- Ergebnis:
  - Backend Model: Neue Spalte `Book.audiobook_merge` (String, nullable)
    plus Alembic-Migration `a1b2c3d4e5f6_add_audiobook_merge_to_books.py`.
  - Schemas (`BookUpdate`, `BookOut`) und Backup-Routen serialisieren das Feld.
  - `bibliogon_audiobook.generator`:
    - `MERGE_MODES = ("separate", "merged", "both")`
    - `normalize_merge_mode(value)` mit Bool->Enum-Migration
      (True->"merged", False->"separate", default "merged").
    - `generate_audiobook(..., merge=...)` akzeptiert jetzt Bool *und* String
      und gibt `merge_mode` im Result-Dict zurueck.
    - Neue Helferfunktion `bundle_audiobook_output(result, dir, title)` baut
      die finale Datei: einzelnes MP3 (merged), ZIP nur mit Kapiteln (separate)
      oder ZIP mit Kapiteln + merged MP3 (both).
  - Audiobook-Plugin Routes/Plugin-Hook nutzen den neuen Helfer; per-Buch
    Override (`book.audiobook_merge`) schlaegt Plugin-Default in
    `audiobook.yaml` (jetzt `merge: merged`).
  - Export-Plugin (sync + async): `_resolve_audiobook_merge_mode` liest
    Buch-Override und faellt auf Plugin-Config zurueck; nutzt
    `bundle_audiobook_output` statt eigene ZIP-Logik.
  - Frontend `BookMetadataEditor`: Dropdown im Audiobook-Tab (gleicher Style
    wie Engine/Voice/Speed), per-Buch Wert wird gespeichert.
  - Frontend `Settings.tsx > AudiobookSettingsPanel`: 3-Optionen-Dropdown
    statt Boolean, neue `normalizeMergeMode`-Helferfunktion (gleiche
    Bool-Migration wie Backend).
  - i18n: Neue Keys `ui.audiobook.merge_separate|merge_merged|merge_both` in
    allen 8 Sprachen (DE, EN, ES, FR, EL, PT, TR, JA), alte
    `merge_yes|merge_no` Keys ersetzt.
  - Tests: 10 neue Tests im Audiobook-Plugin (normalize_merge_mode bool->enum
    Migration, alle drei Bundle-Modi, Generator-Roundtrip mit legacy bools).
    audiobook 32 -> 42 Tests, alles gruen.
- Commit: 6236fbd

---

## 2. Bugfix: voice_store nested event loop crash beim Startup (11:05)

- Original-Prompt: User zeigt Startup-Log mit
  `RuntimeWarning: coroutine 'list_voices' was never awaited` und
  `ERROR: Cannot run the event loop while another loop is running`
  nach `alembic upgrade` auf den neuen Migration-Head a1b2c3d4e5f6.
- Optimierter Prompt: "voice_store sync_edge_tts_voices crasht beim
  Startup wenn die audio_voices-Tabelle leer ist - bitte fixen."
- Ziel: Edge-TTS Voice-Seeding darf den FastAPI-Lifespan-Handler nicht
  mehr crashen.
- Ursache: `sync_edge_tts_voices` baute mit `asyncio.new_event_loop()`
  einen verschachtelten Loop auf, der vom uvicorn-Loop des
  `async def lifespan`-Handlers blockiert wurde. Vorbestehender Bug,
  nur sichtbar geworden weil die Tabelle bei mir leer ist und der
  Seed-Branch zum ersten Mal feuerte.
- Ergebnis:
  - `sync_edge_tts_voices` ist jetzt `async` und nutzt direkt
    `await edge_tts.list_voices()` statt eigenen Loop.
  - `lifespan` und `POST /api/voices/sync` awaiten die Funktion.
  - `make seed-voices` ruft sie ueber `asyncio.run(...)` auf
    (CLI-Kontext, kein laufender Loop).
  - `make test` weiterhin gruen (87 backend, 135 plugin, 50 vitest).
- Commit: 1c6288d

---

## 3. S-08: backup.py auf Service-Module aufteilen (11:15)

- Original-Prompt: User wollte wissen wie weit die Refactoring-Phase ist;
  Analyse zeigte: keine formelle Phase, der 04-05 Cleanup-Pass war
  ad-hoc, und `backup.py` ist seitdem auf 1070 Zeilen mit mehreren god
  methods (import_project 263, import_backup 123, _import_with_section_order
  101, export_backup 86, smart_import 82) gewachsen. User entschied:
  Roadmap-Eintrag plus direkte Umsetzung.
- Optimierter Prompt: "Lege S-08 (backup.py refactor) in der Roadmap an
  und setze ihn direkt um: app/services/backup/-Paket mit serializer,
  markdown_utils, asset_utils, archive_utils, backup_export, backup_import,
  project_import, markdown_import, smart_import. Router enthaelt nur noch
  duenne Endpoints die delegieren. Maximalfunktionsgroesse <50 Zeilen,
  jede Funktion einzeln testbar."
- Ziel: God methods aus dem Backup-Router eliminieren, Geschaeftslogik
  in testbare Service-Module ziehen, Router auf Routing-Layer reduzieren.
- Ergebnis:
  - Neuer Eintrag S-08 in docs/ROADMAP.md unter "Technische Schulden",
    plus S-09 (scaffolder.py) als naechster Kandidat.
  - Neues Paket `backend/app/services/backup/` mit 9 Modulen:
    - `__init__.py` (39 LOC) - re-exportiert Public API
    - `serializer.py` (66) - Book ORM <-> dict round-trip
    - `markdown_utils.py` (156) - md_to_html, extract_title,
      detect_chapter_type, FRONT/BACK_MATTER_MAP, import_special_chapters
    - `asset_utils.py` (99) - import_assets, rewrite_image_paths,
      _classify_asset_type Helfer
    - `archive_utils.py` (40) - find_manifest, find_books_dir,
      find_project_root
    - `backup_export.py` (116) - .bgb-Build, in `_write_book_dir`,
      `_write_chapters`, `_write_assets`, `_write_manifest`,
      `_build_bgb_archive` zerlegt
    - `backup_import.py` (172) - .bgb-Restore, in `_validate_bgb_filename`,
      `_extract_bgb`, `_validate_backup_manifest`, `_require_books_dir`,
      `_restore_book_from_dir`, `_restore_chapters`, `_restore_assets`
      zerlegt
    - `project_import.py` (477) - write-book-template Import, mit
      typed `ProjectMetadata` Dataclass, `_parse_series`, `_parse_isbn`,
      `_parse_asin`, `_parse_keywords`, `_normalize_language`;
      Section-Order Loop ueber `_SectionOrderState` Dataclass statt
      loser Variablen
    - `markdown_import.py` (84) - `import_single_markdown`,
      `import_plain_markdown_zip`, `_derive_book_title`
    - `smart_import.py` (97) - `smart_import_file` Dispatcher mit
      _dispatch_zip Helper
  - `backend/app/routers/backup.py`: 1070 -> 60 Zeilen, nur noch 5
    Endpoints die jeweils 1-3 Zeilen Service-Aufruf enthalten.
  - Toter Code entfernt: `_remove_first_heading` (definiert aber
    nirgends aufgerufen).
  - Laengste Funktion danach: `import_with_section_order` (38 LOC),
    `_import_project_root` (22 LOC Body) - alle unter dem 50-Zeilen-Limit.
  - Tests: `make test` komplett gruen ohne Test-Anpassungen
    (87 backend, 135 plugin, 50 vitest), weil alle Tests via HTTP-Endpoint
    laufen und die Endpoint-API unveraendert ist.
- Commit: f598a83

---

## 4. S-09: scaffolder.py god methods zerlegen (11:35)

- Original-Prompt: "weitermachen" - direkt im Anschluss an S-08, naechster
  Refactor-Kandidat war S-09 (scaffolder.py mit `scaffold_project` 197 LOC
  und `_html_to_markdown` 123 LOC).
- Optimierter Prompt: "Setze S-09 um. `scaffold_project` in fokussierte
  Step-Helfer aufteilen, der verschachtelte HTMLParser von
  `_html_to_markdown` in ein eigenes Modul `html_to_markdown.py` ausziehen
  mit per-Tag Open/Close-Handlern via Dispatch-Tabellen statt grosser
  if/elif-Kaskaden."
- Ziel: Beide god methods in scaffolder.py eliminieren, ohne die externe
  API zu brechen (`scaffold_project` und `_content_to_markdown` werden von
  Tests und routes.py importiert).
- Ergebnis:
  - Neues Modul
    `plugins/bibliogon-plugin-export/bibliogon_export/html_to_markdown.py`
    (204 LOC) mit:
    - `html_to_markdown(html: str) -> str` als duenner Wrapper.
    - `_HtmlToMdParser(HTMLParser)` Klasse mit kleinen
      `handle_starttag`/`handle_endtag`/`handle_data`-Methoden, die per
      `_START_HANDLERS` / `_END_HANDLERS` Dispatch-Tabellen je Tag in
      eigene Modul-Funktionen delegieren (`_open_list`, `_open_li`,
      `_open_a`, `_open_figure`, `_open_figcaption`, `_open_img`,
      `_open_br`, `_open_hr`, `_close_list`, `_close_li`, `_close_a`,
      `_close_figure`, `_close_figcaption`, `_close_p`).
    - `Callable`-Type-Aliases `_StartHandler` / `_EndHandler`.
  - `scaffolder.py`: 519 -> 439 LOC. `scaffold_project` Body von
    ~106 LOC auf 17 LOC geschrumpft, in 6 Step-Helfer aufgeteilt:
    - `_create_project_skeleton(project_dir)` - mkdir-only
    - `_ensure_output_file(export_settings, slug)` - Default-Slug setzen
    - `_rewrite_chapter_image_paths(chapters, asset_path_map)` - in-place
    - `_write_partitioned_chapters(manuscript_dir, chapters)` - Dispatch
      auf front/back/chapters Dirs, returns has_toc
    - `_write_placeholders(project_dir, book, has_toc)` - TOC und
      about-the-author Placeholder
    - `_write_styles_css(path, custom_css)` - Default + Custom CSS
  - Inline `_html_to_markdown` mit verschachteltem `_MD(HTMLParser)`
    Klasse komplett entfernt; `_content_to_markdown` ruft jetzt
    `html_to_markdown` aus dem neuen Modul auf.
  - Laengste Funktion danach: `scaffold_project` 17 LOC Body,
    `_write_partitioned_chapters` 16 LOC, `_write_metadata` 18 LOC,
    `html_to_markdown` 5 LOC. Alle Parser-Handler in
    `_HtmlToMdParser` unter 15 LOC.
  - Tests: `make test` komplett gruen ohne Test-Anpassungen
    (87 backend, 135 plugin, 50 vitest); Test-Imports von
    `scaffold_project` und `_content_to_markdown` weiterhin gueltig.
- Commit: 809f377

---

## 5. S-10/S-11/S-12: Drei weitere god methods zerlegt (11:50)

- Original-Prompt: "ja mach mehr" - User wollte die Refactoring-Welle
  fortsetzen.
- Optimierter Prompt: "Identifiziere die naechsten echten god methods im
  Codebase (`translate_book` ~106 LOC, `run_pandoc` ~84 LOC, `validate_toc`
  ~98 LOC) und zerlege sie nach demselben Muster wie S-08/S-09: kleine
  Step-Helfer, jede Funktion einzeln testbar, max ~40 LOC."
- Ziel: Die letzten drei groesseren god methods im Backend und in den
  Plugins entfernen, ohne Verhalten oder API zu aendern.
- Ergebnis:
  - S-10 `translate_book` in
    `plugins/bibliogon-plugin-translation/bibliogon_translation/routes.py`:
    von ~106 LOC Body auf 22 LOC geschrumpft. Neue Helfer:
    `_open_db_session_or_500`, `_load_book_with_chapters`,
    `_build_translation_clients`, `_create_translated_book`,
    `_translate_chapters_into`, `_translate_one_chapter`. Jede Funktion
    macht genau eine Sache. Try/Except pro Kapitel ist jetzt im
    `_translate_one_chapter`-Helfer und gibt ein Fehler-Dict zurueck
    statt mitten in einer Loop zu mutieren.
  - S-11 `run_pandoc` in
    `plugins/bibliogon-plugin-export/bibliogon_export/pandoc_runner.py`:
    von ~84 LOC Body auf ~30 LOC geschrumpft. Neue Helfer:
    `_read_export_settings`, `_resolve_section_order` (filtert
    nicht-existierende .md-Dateien), `_set_manuscripta_output_file`
    (mutiert manuscripta's Modul-Global), `_resolve_cover_path` (mit
    Absolute-Path/relativ/assets/covers Fallback-Kette),
    `_find_output_file`. `_OUTPUT_EXTENSIONS` als Modul-Konstante
    rausgezogen.
  - S-12 `validate_toc` in `backend/app/routers/chapters.py`:
    von ~98 LOC Body auf 28 LOC geschrumpft. Neue Helfer:
    `_collect_valid_anchors`, `_collect_chapter_anchors`,
    `_add_title_anchors` (GitHub + Pandoc Slug + explicit
    Marker), `_add_heading_anchors` (Markdown `##` und HTML `<h*>`),
    `_add_explicit_id_anchors` (`{#anchor}` und `id="..."`),
    `_check_toc_links` plus `_iter_toc_links` Generator. Die
    `_TYPE_ANCHORS`-Map aus dem Funktionskoerper als Modul-Konstante
    rausgezogen - sie wurde vorher bei jedem Aufruf neu allokiert.
  - Tests: `make test` komplett gruen ohne Test-Anpassungen
    (87 backend, 135 plugin, 50 vitest). Translation-Plugin 35,
    Export-Plugin 30, alle HTTP-Tests fuer chapters.py weiterhin gueltig.
- Commit: abd1fd3

---

## 6. Audiobook UX: Dual-Save-Bug + Custom Filename Feld (12:00)

- Original-Prompt: "im audiobook plugin in den allgemeinen einstellungen
  gibt es zwei speichern button, die Frage ist das so gewollt? Und in den
  Bucheinstellungen für audiobook sollte eine checkbox sein für einen
  benutzerdefinierten Namen für das hörbuch. Daneben ein Textfeld mit
  den default Namen, der deaktiviert ist und sobald die checkbox den
  hacken hat kann der anwender den Namen ändern"
- Optimierter Prompt: "Bug: Settings > Plugins > Audiobook hat zwei
  Speichern-Buttons - klaeren ob beabsichtigt und falls nicht, fixen.
  Feature: Im BookMetadataEditor Audiobook-Tab Checkbox 'Eigener Dateiname'
  und Textfeld mit slug-basiertem Default; Textfeld disabled bis die
  Checkbox gesetzt wird; leerer Wert -> Backend speichert null und nutzt
  Default."
- Ziel: (a) Dual-Save-Buttons-Bug fixen. (b) Pro-Buch Override fuer den
  Audiobook-Dateinamen.
- Ergebnis (Bug):
  - Ursache: `PluginCard` rendert Plugin-Settings in 3 Bloecken (Scalars,
    OrderedLists, Complex). Audiobook-Scalars laufen durch
    `AudiobookSettingsPanel` mit eigenem Save, aber der OrderedList-Block
    feuerte danach trotzdem fuer `skip_types` -> zweiter Save-Button.
  - Fix: `skip_types` als `OrderedListEditor` in `AudiobookSettingsPanel`
    integriert, einziger Save sendet jetzt alles inkl. `skip_types`.
    OrderedList-Block in `PluginCard` ueberspringt
    `name === "audiobook"`.
- Ergebnis (Feature):
  - Backend: Neue Spalte `Book.audiobook_filename` (String 255, nullable)
    plus Migration `b2c3d4e5f6a7_add_audiobook_filename_to_books.py`.
    `BookUpdate`/`BookOut`-Schemas und backup serializer ergaenzt.
  - Export-Plugin Helfer `_audiobook_base_name(book_data, default)` in
    `routes.py`: nutzt die User-Eingabe wenn gesetzt, sanitiert Pfad-
    Separatoren, strippt user-supplied `.mp3`/`.zip`/`.m4a`/`.m4b`
    Endungen, faellt auf den Default zurueck wenn Resultat leer.
    Wird vom sync `_export_audiobook` und vom async-Job aufgerufen,
    aber nur fuer `fmt == "audiobook"` - andere Exporte unangetastet.
  - Frontend: `Book.audiobook_filename` in `client.ts`. Neue
    `CustomFilenameField`-Komponente in `BookMetadataEditor.tsx` mit
    Checkbox + Textfield + slug-basiertem Default-Placeholder.
    Lokaler `slugifyForFilename` Helfer spiegelt das Backend
    `scaffolder._slugify` Verhalten (Umlaute, ss, etc.) damit der
    angezeigte Default mit dem tatsaechlichen Export-Namen
    uebereinstimmt. Empty string wird im Save zu `null`.
  - i18n: Drei neue Keys (`ui.audiobook.skip_types`,
    `ui.audiobook.custom_filename`, `ui.audiobook.custom_filename_hint`)
    in allen 8 Sprachen.
  - Tests: Neuer `tests/test_audiobook_filename.py` im Export-Plugin
    mit 7 Tests (default-fallback, None/empty, custom, extension-strip,
    Pfad-Sanitization, pure-extension-collapse). Beim ersten Lauf
    schlug `test_pure_extension_collapses_to_default` fehl - mein
    eigener Test deckte einen Off-by-Order-Bug auf: `.strip(". ")` lief
    VOR der Extension-Pruefung, also wurde `.mp3` zu `mp3` und der
    `.mp3`-Suffix-Strip griff nicht mehr. Fix: Extension-Strip vor
    `strip(". ")`. Export-Plugin 30 -> 37 Tests, alles gruen.
- Commit: 1a6039d

---

---
