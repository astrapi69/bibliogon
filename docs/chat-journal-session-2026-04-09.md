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

---
