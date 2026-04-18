# Chat-Journal: Bibliogon Session 2026-04-11

Dokumentation aller Prompts, Optimierungsvorschlaege und Ergebnisse.

---

## 1. M-12: Auto-Sanitization beim Import

- Original-Prompt: "Setze M-12 um"
- Optimierter Prompt: "Implementiere M-12 aus docs/ROADMAP.md: beim Import von Markdown/write-book-template-Projekten soll ms-tools automatisch ueber einen Hook in das Import-System eingehaengt werden und den Rohtext saeubern (unsichtbare Zeichen, typografische Quotes, HTML-Artefakte), bevor er in die DB geschrieben wird. Default: aktiv, per ms-tools Config abschaltbar."
- Ziel: ms-tools Sanitization automatisch auf jedes importierte Kapitel anwenden, ohne dass der User daran denken muss.
- Ergebnis:
  - Neuer Hookspec `content_pre_import(content, language)` in `backend/app/hookspecs.py` fuer den Import-Pfad (NICHT `chapter_pre_save`, der fuer TipTap-JSON gedacht ist).
  - `MsToolsPlugin` implementiert den Hook und ruft `sanitize()` mit der Buch-Sprache auf. Gated durch neues Config-Feld `auto_sanitize_on_import` (Default `true`) in `backend/config/plugins/ms-tools.yaml`.
  - Neuer Helper `sanitize_import_markdown(content, language)` in `markdown_utils.py` ruft `manager.call_hook(...)` und faellt bei Fehler/leer auf Original-Content zurueck (import-lokal, vermeidet Zirkular-Imports durch `from app.main import manager` innerhalb der Funktion).
  - Language wird von `book.language` durch `_import_chapters`, `_add_chapter_from_file`, `import_special_chapters`, `_import_chapter_placeholder`, `_import_section_order_file`, `_import_remaining_special_files` sowie `import_single_markdown` und `import_plain_markdown_zip` gereicht. Sanitization passiert VOR `md_to_html()` auf dem rohen Markdown, weil der Sanitizer auf Plain-Text am besten funktioniert und Quote-Fixes HTML-Attribute brechen koennten.
  - Tests: 6 Unit-Tests in `plugins/bibliogon-plugin-ms-tools/tests/test_plugin_hooks.py` (Hook-Verhalten, Enable/Disable, leerer Input), 5 Integrationstests in `backend/tests/test_import_sanitization.py` (Helper, single markdown Import, ZIP-Import). Alle Tests muessen durch `with TestClient(app):` laufen, damit das Lifespan die Plugins mountet.
- ROADMAP: M-12 als `[x]` markiert.

---

## 2. M-16: Pro-Buch Schwellwerte persistieren (DB-Migration)

- Original-Prompt: "Setze M-16 um"
- Optimierter Prompt: "Implementiere M-16 aus docs/ROADMAP.md: die ms-tools Style-Check-Schwellwerte (max_sentence_length, repetition_window, max_filler_ratio) sollen pro Buch in der Datenbank ueberschreibbar sein. Alembic-Migration, Spalten im Book-Model, Pydantic-Schemas, PATCH /api/books Integration und Ausloesung der Overrides im /ms-tools/check Endpoint inklusive."
- Ziel: Jedes Buch kann seine eigenen Quality-Schwellwerte haben. Ohne Override greifen die Plugin-Defaults.
- Ergebnis:
  - Neue Alembic-Migration `d4e5f6a7b8c9_add_ms_tools_thresholds_to_books.py` fuegt drei nullable Spalten in `books`: `ms_tools_max_sentence_length` (Integer), `ms_tools_repetition_window` (Integer), `ms_tools_max_filler_ratio` (Float). Folgt dem `batch_alter_table`-Pattern der bestehenden Migrationen.
  - Mapped-Columns im `Book`-Model (`backend/app/models/__init__.py`), `Float`-Import ergaenzt.
  - `BookUpdate` und `BookOut` Schemas um die drei Felder erweitert. `PATCH /api/books/{id}` persistiert sie automatisch ueber `exclude_unset`.
  - Backup-Serializer (`backend/app/services/backup/serializer.py`) nimmt die Felder in Export und Restore auf, sodass `.bgb`-Backups sie mit uebertragen.
  - `StyleCheckRequest` in `plugins/bibliogon-plugin-ms-tools/bibliogon_ms_tools/routes.py` akzeptiert jetzt optional `book_id`. Neue `_resolve_thresholds()`-Funktion implementiert die Aufloesung in der Reihenfolge *expliziter Request > Buch-Override > Plugin-Config > Default* (25 / 50). Die Request-Felder sind jetzt `int | None`, damit das Weglassen wirklich "nicht gesetzt" bedeutet.
  - Tests: 4 Integrationstests in `backend/tests/test_ms_tools_book_thresholds.py`: Persistenz via PATCH, None-Default bei neuen Buechern, Buch-Override schlaegt durch (lange Saetze werden mit niedrigerem Schwellwert geflaggt), Request-Override schlaegt Buch-Override.
- Fallstrick: Beim ersten Test-Run schlug die Alembic-Migration in `init_db()` fehl, weil die Test-Konfiguration (`backend/bibliogon.db` mit stamp auf altem Head) das Schema ueber `Base.metadata.create_all` bereits mit den neuen Spalten angelegt hatte, und Alembic dann per `ALTER TABLE` nochmal hinzufuegen wollte ("duplicate column name"). Loesung war ein einmaliges `rm backend/bibliogon.db`; init_db sieht dann keine Tabellen, legt sie an und stampt auf den neuen Head. In lessons-learned.md als "Alembic-Migrationen brauchen frische Test-DB nach Model-Aenderung" dokumentiert.
- POST /api/books liefert 201, mein Test-Template hatte 200 erwartet. Fix: `assert r.status_code in (200, 201)`.
- ROADMAP: M-16 als `[x]` markiert.

---

## 3. V-02: Backup-Vergleich (Variante B - Upload-basiert)

- Original-Prompt: "Setze V-02 um"
- Architektur-Diskussion: Vor der Umsetzung wurde analysiert, dass der aktuelle Versionsgeschichte-Tab nur ein Audit-Log ist (`.bgb`-Dateien werden nicht auf dem Server persistiert) und dass das separate todo-prompts.md die Einfuehrung einer Git-basierten Sicherung plant, die V-01 und V-02 explizit ersetzen soll. Drei Optionen diskutiert:
  - **A)** Persistente Server-Backups mit Retention-Policy (20 auto + unbegrenzt manuell mit Stern-Icon). User-Entwurf war technisch gut durchdacht.
  - **B)** Zwei Dateien hochladen und vergleichen. Kein Server-State, keine Retention, keine UI-Konflikte mit dem spaeteren Sicherungs-Tab.
  - **C)** Eine Datei gegen aktuellen DB-Stand vergleichen.
- Entscheidung: **Variante B**. Grund war explizit die Vermeidung von Doppelarbeit zum geplanten Git-Sicherungs-Feature, das bereits einen `/sicherung/vergleichen` Endpoint und die Zwei-Spalten-Diff-Ansicht spezifiziert. Der User hat seine urspruengliche Praeferenz fuer A auf meinen Rat hin zurueckgezogen.
- Ergebnis:
  - Neuer Service `backend/app/services/backup/backup_compare.py`: liest zwei `.bgb`-Uploads in Temp-Dirs, parst die `book.json` + `chapters/*.json`, diffet 25 Buch-Metadaten-Felder und baut Line-Diffs per Kapitel via `difflib.ndiff`. Chapter-Content wird zuerst von HTML zu zeilenorientiertem Plain-Text reduziert (Block-Tags `</p>|</h1-6>|</li>|</blockquote>|</div>` fuegen Newlines ein, dann Tag-Strip + Entity-Decode), damit `ndiff` sinnvolle Ergebnisse liefert. Kein DB-Zugriff, alle Uploads werden in `tempfile.mkdtemp` extrahiert und im `finally` geloescht.
  - Neuer Endpoint `POST /api/backup/compare` in `backend/app/routers/backup.py` nimmt `file_a` + `file_b` als Multipart. Ablehnung mit HTTP 400 wenn: kein `.bgb`-Dateiname, beschaedigtes ZIP, oder keine gemeinsamen Buch-IDs zwischen den beiden Archiven.
  - 7 Integrationstests in `backend/tests/test_backup_compare.py`: identische Backups haben keine Aenderungen, Content-Change wird erkannt, neues Kapitel wird als "added" klassifiziert, Metadaten-Aenderungen tauchen im Diff auf, Dateityp-Validierung, common-book-id-Validierung, korrupt-Zip-Validierung.
  - Neuer Frontend-Dialog `BackupCompareDialog.tsx` mit zwei File-Pickern, Hinweis-Text zum geplanten Sicherungs-Feature, Zwei-Spalten-Diff-Ansicht pro geaendertem Kapitel (rot/gruen/neutral), Metadaten-Diff als Tabelle, Badges fuer added/removed/changed. Eintrag ueber einen neuen "Backups vergleichen"-Button neben dem Versionsgeschichte-Toggle im Dashboard.
  - API-Client erweitert um `api.backup.compare()` plus typisierte `BackupCompareResult`, `BackupBookDiff`, `BackupChapterDiff`, `BackupDiffLine`, `BackupMetadataChange` Interfaces.
  - 24 neue i18n-Strings in `de.yaml` und `en.yaml` unter `ui.dashboard.compare_backups` und `ui.backup.compare.*`. Die anderen sechs Sprachen (es, fr, el, pt, tr, ja) bekommen Fallback auf DE oder EN durch den useI18n Default-Parameter - bewusste Scope-Verkleinerung fuer ein Stop-Gap-Feature.
- Fallstrick: Erster Test-Run schlug fehl weil `_update_chapter` den Chapter-Router unter `/api/chapters/{id}` suchte; der lebt aber unter `/api/books/{book_id}/chapters/{id}`. Fix war die Test-Helper-Signatur zu aendern.
- ROADMAP: V-02 als `[x]` markiert mit Hinweis "Implementiert als Upload-Dialog. Wird spaeter durch das Sicherungs-Feature mit automatischen Speicherpunkten ersetzt."
- Bewusste Entscheidung: Das Feature ist als Stop-Gap markiert. Wenn das Git-basierte Sicherungs-Feature aus todo-prompts.md spaeter kommt kann der Dialog entweder bleiben (fuer Leute mit alten lokalen .bgb-Dateien) oder ersatzlos entfernt werden, ohne Datenmigration.

---

## 4. Audiobook-Overwrite-Flag: Plugin-global zu per-Buch migrieren

- Original-Prompt: Detaillierte Spezifikation fuer eine neue "Bestehende Dateien ueberschreiben"-Checkbox im Audiobook-Metadaten-Tab, motiviert als Kostenschutz.
- Pre-Check gemaess neuer lessons-learned Regel (aus dem V-02-Vorfall): Bevor ich mit dem Bau anfing habe ich die bestehende Audiobook-Infrastruktur geprueft. Das ergab drei bereits funktionale Mechanismen:
  1. Content-Hash-Cache auf Kapitel-Ebene in `generator.should_regenerate()` (Content + Engine + Voice + Speed Match)
  2. Persistenter Audiobook-Storage unter `uploads/{book_id}/audiobook/chapters/*.mp3` mit Sidecar-`.meta.json`
  3. 409 `audiobook_exists` Warnung in `export_async` vor Job-Start, Frontend zeigt Confirm-Dialog
  4. Plugin-globales Flag `overwrite_existing: false` in `audiobook.yaml` das die 409 ueberspringt
- Architektur-Hinweis an den User: Die Kosten-Motivation wird eigentlich schon von Mechanismen 1-3 abgedeckt. Das vorgeschlagene Flag ist invertiert (default off = aktueller Schutz bleibt, on = volle Regen erzwingen). Der Wert liegt aber in Sichtbarkeit + per-Buch-Granularitaet statt einer verborgenen YAML-Einstellung. Habe eine Klaerungsfrage gestellt ob das neue Buch-Flag das plugin-globale Flag ersetzt oder layert.
- User-Entscheidung: **Buch-Flag ersetzt globales Plugin-Flag.** Beim Migration-Upgrade wird der aktuelle YAML-Wert einmalig als Seed fuer alle bestehenden Buecher uebernommen, danach wird das Feld aus `audiobook.yaml` entfernt. Begruendung: Single Source of Truth, Konsistenz mit anderen buch-spezifischen Audio-Settings (`tts_engine`, `tts_voice`, `audiobook_merge`, `audiobook_filename` liegen alle auf dem Book-Modell), eindeutige Granularitaet.
- Ergebnis:
  - Neue Alembic-Migration `e5f6a7b8c9d0_add_audiobook_overwrite_to_books.py`: fuegt `audiobook_overwrite_existing` als Boolean nullable=False mit server_default=false hinzu. In `upgrade()` wird der alte YAML-Wert aus `config/plugins/audiobook.yaml` gelesen; falls true, wird mit `UPDATE books SET audiobook_overwrite_existing = 1` der Wert fuer alle bestehenden Buecher uebernommen. Die Migration ist idempotent und faellt stillschweigend auf False zurueck wenn die YAML-Datei fehlt.
  - `Book.audiobook_overwrite_existing: Mapped[bool]` mit `default=False` in `models/__init__.py`.
  - `BookUpdate` und `BookOut` Schemas erweitert um das neue Feld.
  - Backup-Serializer ergaenzt das Feld in Export und Restore.
  - `audiobook.yaml:38` entfernt, Kommentar hinterlassen der auf die Migration verweist.
  - `export_async` in `plugins/bibliogon-plugin-export/bibliogon_export/routes.py`: neuer Helper `_load_book_overwrite_flag(book_id)` liest nur die eine Spalte ohne das komplette Book zu laden (Pre-flight 409 muss performant bleiben). Die 409-Pruefung nutzt jetzt ausschliesslich das Buch-Feld - kein OR mit Plugin-Setting.
  - `_run_audiobook_job`: wenn `book_data["audiobook_overwrite_existing"]` true ist, wird `cache_dir=None` an `generate_audiobook` weitergegeben. Das deaktiviert den Content-Hash-Cache vollstaendig fuer diesen Lauf und erzwingt volle Regen. `_serialize_book` im Export-Plugin liest das Feld aus dem ORM.
  - Test `test_async_audiobook_overwrite_existing_setting_skips_warning` umgeschrieben: statt YAML-File zu schreiben patcht er jetzt die Buch-Spalte via PATCH und verifiziert dasselbe Verhalten.
  - Neuer Test `test_book_overwrite_flag_persists_via_patch`: PATCH setzt das Feld, GET liefert es zurueck.
  - Neuer Test `test_book_overwrite_flag_disables_content_hash_cache`: zaehlt `synthesize()`-Calls ueber drei aufeinanderfolgende Exports. Erster Lauf: Cold-Cache, beide Kapitel werden synthetisiert (2 Calls). Zweiter Lauf mit Flag aus: Cache-Hit, 0 Calls. Dritter Lauf mit Flag an: Cache ignoriert, 2 Calls. Das ist die echte Verhaltens-Verifikation dass das Flag wirklich den Cache deaktiviert.
  - Frontend: neue Checkbox in `AudiobookBookConfig` innerhalb `BookMetadataEditor`. Separater `audiobookOverwrite: boolean` State statt die bestehende string-only `form`-Struktur zu widen'en. `handleSave` setzt `data.audiobook_overwrite_existing = audiobookOverwrite` explizit, saubere Trennung von den anderen String-Feldern.
  - `Book` Interface in `api/client.ts` um `audiobook_overwrite_existing: boolean` erweitert.
  - i18n: zwei neue Keys `ui.audiobook.overwrite_label` und `ui.audiobook.overwrite_description` in `de.yaml` und `en.yaml` mit echten Umlauten.
- Fallstrick: Erster `npx tsc --noEmit` Lauf schlug fehl weil das Widen der `form` State zu `Record<string, string | boolean | null>` alle anderen Lesepunkte von `form.xxx` kaputt machte (`Field` Component erwartet `string | null`). Loesung: separaten `audiobookOverwrite` Boolean-State statt die Form zu widen'en. Kein Cast-Salat, kein Aenderung an bestehenden Feldern.
- Testergebnis: 194 backend + 90 frontend gruen. Die beiden neuen Tests decken Persistence und Cache-Disable-Verhalten ab.

---

## 5. Plugin-Settings Audit (versteckte vs. sichtbare Konfiguration)

- Original-Prompt: Detaillierter 6-Schritt-Plan fuer einen Audit aller Plugin-YAML-Felder gegen UI-Sichtbarkeit, motiviert durch den Befund dass `audiobook.overwrite_existing` (vorherige Aufgabe) Verhalten beeinflusst hat ohne in der UI zu erscheinen.

### Schritt 1+2: Inventar
Alle 8 Plugin-YAMLs in `backend/config/plugins/` plus die bundled grammar.yaml geprueft. Cross-Reference gegen Code-Konsumenten ergab:
- 4 Felder die Verhalten beeinflussen aber in der UI als String/nicht editierbar sind: `audiobook.read_chapter_number`, `export.type_suffix_in_filename`, `ms-tools.auto_sanitize_on_import`, `translation.deepl_free_api`. Plus `translation.provider` (sollte Select sein) und `translation.deepl_api_key` (sollte Password sein) → Kategorie A, 6 Felder.
- 3 Felder als Pipeline-Mappings ohne User-Konfigurationsziel: `export.formats`, `export.export_defaults`, `export.ui_formats` → Kategorie B (mit `# INTERNAL` Kommentar markieren).
- Mehrere Cluster toter Felder: `audiobook.language` (UI-only Voice-Filter, nie konsumiert), `ms-tools.languages` (Code liest hardcoded Modul-Konstanten), die kompletten 11 `kdp.cover/manuscript`-Felder (Routes hardcoden, ignoriert YAML), die bundled `plugins/.../config/grammar.yaml` (wird ueberhaupt nicht geladen weil pluginforge nur `backend/config/plugins/` liest) → Kategorie C.
- `help.yaml` und `getstarted.yaml` enthalten keine `settings`-Bloecke, nur Content (FAQ, Onboarding-Guide). Aus Audit-Scope.

User-Entscheidungen via Klaerungs-Fragen:
- **Grammar:** Variante (a) MINIMAL — neue `backend/config/plugins/grammar.yaml` mit nur 3 Feldern: `languagetool_url`, `languagetool_username`, `languagetool_api_key`. Bundled grammar.yaml geloescht, alle anderen alten Felder weg.
- **KDP:** Variante (b) — alle 11 dead settings entfernen, hardcoded Werte in `routes.py` als benannte Konstante `KDP_COVER_REQUIREMENTS` mit Kommentar dokumentieren dass Amazon das vorgibt und User es nicht aendern duerfen.
- **Generic Panel:** Sammelfix statt Per-Feld-Custom-Panel. Render Scalars typisiert: bool→Checkbox, number→Number-Input, string→Text-Input, object→editierbares JSON-Textfeld mit Advanced-Hinweis.

### Schritt 3: Aktion
- Neue Helper-Komponenten in `Settings.tsx`: `ScalarSettingField` (typed dispatch), `ComplexSettingField` (JSON textarea, Validierung onBlur, faengt Parse-Errors statt Werte zu verlieren). Loest auf einen Schlag 4 der 6 Kategorie-A-Felder.
- `AudiobookSettingsPanel`: neue `read_chapter_number` Checkbox + Beschreibungstext, plus `language` aus `handleSave` rausgezogen (lokaler State bleibt fuer den Voice-Filter, wird nicht persistiert).
- Neuer `TranslationSettingsPanel`: provider als Radix-Select, deepl_api_key als Password-Input mit show/hide-Toggle (Eye/EyeOff Lucide-Icons), deepl_free_api als Checkbox, lmstudio_temperature als Number-Input. Wired in den generischen Plugin-Card-Switch (`name === "translation" ? <TranslationSettingsPanel/> : ...`).
- `audiobook.yaml`: `language` Feld entfernt, Kommentar hinterlassen.
- `ms-tools.yaml`: `languages` Feld entfernt, Kommentar hinterlassen.
- `kdp.yaml`: kompletter `settings` Block entfernt, Kommentar verweist auf `KDP_COVER_REQUIREMENTS` in `bibliogon_kdp/routes.py`.
- `kdp/routes.py`: hardcoded Dict aus `validate_cover_endpoint` rausgezogen in eine Modul-Konstante mit ausfuehrlichem Kommentar zur Amazon-Begruendung.
- `export.yaml`: drei `# INTERNAL` Kommentar-Bloecke vor `formats`, `export_defaults`, `ui_formats`.
- `bibliogon_grammar/languagetool.py`: `LanguageToolClient.__init__` um `username` und `api_key` Parameter erweitert, beide werden in `_check_single` als POST-Form-Felder `username`/`apiKey` angehaengt wenn beide gesetzt sind. Falls eines fehlt geht der Request anonym raus (Free-Quota).
- `bibliogon_grammar/plugin.py`: liest `languagetool_username` und `languagetool_api_key` aus dem Settings-Block. Die alten `default_language`/`disabled_rules`/`disabled_categories` Reads sind weg.
- Neue `backend/config/plugins/grammar.yaml` mit dem 3-Feld-Minimal-Schema. Bundled `plugins/bibliogon-plugin-grammar/config/grammar.yaml` und das jetzt leere `config/` Verzeichnis geloescht.
- i18n-Strings: 4 neue Audiobook-Keys (`read_chapter_number_label/description`), 3 neue Settings-Keys (`advanced`, `advanced_hint`, `invalid_json`), 7 neue Translation-Keys, alles in DE und EN.

### Schritt 5: Architektur-Regel
Neue Sektion "Plugin-Settings Sichtbarkeit" in `.claude/rules/architecture.md`. Klare Regel: jedes Setting ist entweder UI-sichtbar oder mit `# INTERNAL` markiert. Tote Settings sind verboten. Per-Buch-Werte gehoeren auf das Book-Modell, nicht ins Plugin-YAML.

Lessons-learned-Eintrag dazu mit dem Generic-Panel-Render-Pattern (bool→Checkbox usw.) als konkrete Umsetzungs-Erinnerung.

### Schritt 4: Tests
- Bestehende Tests laufen alle durch (kdp 31, grammar 10, ms-tools 88, audiobook persistence 15, full backend 194, frontend 90).
- Keine neuen Vitest-Tests fuer die Settings-Komponenten gemacht — die existierenden Tests decken die Datenfluss-Schicht ab, der UI-Render ist ein einfacher typed dispatch ohne Edge-Cases die einen Test rechtfertigen.

### Resultat
- 6 versteckte/broken Settings sichtbar gemacht
- 3 INTERNAL-Settings dokumentiert
- 14 tote Settings entfernt (audiobook.language, ms-tools.languages, 11x kdp.cover/manuscript, plus die komplette stale grammar.yaml im Plugin-Paket)
- Architektur-Regel codifiziert
- Generic Panel rendert Booleans und Objects jetzt UX-richtig

---

## 6. Audiobook Skip-Chapter-Types per Buch (Migration analog overwrite_existing)

- Original-Prompt: Detaillierter 9-Schritt-Plan fuer eine sichtbare und editierbare Skip-Liste der Kapiteltypen im Buch-Metadaten-Tab. User stellt explizit Schritt 1 voran: "Zeig mir das Audit-Ergebnis bevor du etwas aenderst."
- Audit-Befund: Skip-Logik existiert vollstaendig, ist aber nur plugin-global konfiguriert. Strukturell identisch zur ueberwrite_existing-Migration vom Vortag, nur mit Array-Feld statt Boolean. Alle 21 ChapterType-Werte und alle 21 i18n-Labels sind schon da. Progress-Dialog rendert chapter_skipped Events bereits in muted color (Schritt 6 vom Prompt war schon erledigt). Zwei hardcoded Skip-Sets im Dry-Run-Endpoint ([audiobook.py:415,471](backend/app/routers/audiobook.py)) ignorieren YAML und Buch komplett - das ist ein Cost-Estimation-Bug der mit ins Ticket gehoert.
- Sechs Klaerungsfragen ans User vorab gestellt; alle Antworten gingen mit meinen Empfehlungen mit:
  1. **Migration-Default**: bestehender YAML-Wert wird einmalig fuer ALLE Buecher ueber `UPDATE books SET ...` geseedet, neue Buecher bekommen denselben Default
  2. **YAML-Cleanup**: ersatzlos loeschen, konsistent mit overwrite_existing-Pattern
  3. **Dry-Run hardcoded Sets**: ja, im selben Ticket reparieren - sonst luegt die Cost-Estimation
  4. **Save-UX**: globaler Save-Button statt Auto-Save - die urspruengliche Prompt-Idee waere inkonsistent mit dem Rest des Metadata-Editors
  5. **UI-Layout**: alle 21 Typen, im Buch vorhandene mit Hervorhebung in eigener Gruppe, kein neuer chapter-types-Endpoint
  6. **`copyright` ChapterType**: existiert nicht im Modell, `imprint` deckt es ab, kein neuer Enum-Wert
- Architektur-Pattern: Per-Buch-Migration analog `overwrite_existing` (Plugin-global -> Book-Spalte, YAML-Cleanup, Settings-Panel-Cleanup)
- Ergebnis:
  - Neue Alembic-Migration `f6a7b8c9d0e1_add_audiobook_skip_chapter_types.py`: fuegt `audiobook_skip_chapter_types` als nullable `Text` hinzu (JSON-encoded list, gleiches Pattern wie `Book.keywords`). Liest beim Upgrade `audiobook.yaml settings.skip_types` einmalig und seedet ALLE bestehenden Buecher mit `UPDATE books SET ...` auf den Wert. Faellt auf `DEFAULT_SKIP_TYPES = [toc, imprint, index, bibliography, endnotes]` zurueck wenn die YAML fehlt.
  - `Book.audiobook_skip_chapter_types: Mapped[str | None] = mapped_column(Text, nullable=True)`. Gleiches Pattern wie `keywords`, kommentiert.
  - `BookUpdate` und `BookOut` Pydantic-Schemas erweitert. `BookOut` hat einen `field_validator(mode="before")` der die JSON-Text-Spalte beim Laden aus dem ORM in `list[str]` decodiert (kein Type-Mismatch zwischen DB und API). `update_book`-Router serialisiert die eingehende `list[str]` mit `json.dumps` bevor `setattr`, damit der generische Loop sonst unveraendert bleibt.
  - Backup-Serializer ergaenzt das Feld in Export und Restore.
  - `_run_audiobook_job` in `bibliogon-plugin-export/routes.py`: liest jetzt `book_data["audiobook_skip_chapter_types"]` statt `_read_audiobook_settings().get("skip_types")`. Leere Liste -> `None` -> Generator faellt auf seine eingebaute `SKIP_TYPES`-Konstante zurueck (Library-Default fuer externe Caller, kein User-Setting).
  - Neuer Helper `_decode_skip_chapter_types(raw)` im Export-Plugin der den JSON-Text aus der Spalte robust in eine Liste decodiert. Tolerantes Parsen: `None`, leerer String, malformed JSON, list-already-decoded, alle landen auf `[]`.
  - `_serialize_book` im Export-Plugin nimmt das Feld in das `book_data`-Dict mit auf das an `_run_audiobook_job` gereicht wird.
  - **Dry-Run-Endpoint**: zwei hardcoded `skip_types = {"toc", ...}` Stellen in `backend/app/routers/audiobook.py:415,471` durch eine neue Hilfsfunktion `_resolve_book_skip_types(book)` ersetzt, die die JSON-Text-Spalte decodiert und auf `DEFAULT_AUDIOBOOK_SKIP_TYPES` zurueckfaellt wenn die Spalte leer ist. Damit ist die Cost-Estimation jetzt ehrlich fuer alle Buecher die ihre Skip-Liste ueberschrieben haben.
  - `audiobook.yaml`: `skip_types`-Block entfernt, NOTE-Kommentar verweist auf die Migration und die per-Buch-UI.
  - `AudiobookSettingsPanel`: `skipTypes`-State, save-Schluessel und OrderedListEditor entfernt. Save-Funktion droppt `skip_types` aus dem `settings`-Dict bevor sie es weiterreicht (gleiches Drop-Pattern wie schon fuer `language`).
  - **Frontend Skip-Liste**: neue `AudiobookSkipChapterTypes` Sub-Komponente direkt in `BookMetadataEditor.tsx` (kein eigenes File - Schritt-Reduktion vom User akzeptiert). Sortiert die 21 Typen nach typischer Buch-Reihenfolge (front matter -> body -> back matter), splittet in zwei Gruppen: "Im Buch vorhanden" (in Schwarz, fett, oben) und "Weitere Typen" (muted, normal-weight, unten). Pro Typ eine Checkbox + lokalisiertes Label + technischer Key in Klammern. Kein neuer API-Endpoint, die Anwesenheit wird clientseitig aus `book.chapters` (BookDetail) abgeleitet.
  - `BookMetadataEditor` Prop-Type von `Book` auf `BookDetail` verbreitert, damit `book.chapters` zur Verfuegung steht. Kein Refactor auf der Caller-Seite noetig weil `BookEditor.tsx` ohnehin schon `BookDetail` haelt.
  - `Book` Interface in `api/client.ts` ergaenzt um `audiobook_skip_chapter_types: string[]`.
  - i18n: 5 neue Keys `ui.audiobook.skip_title/description/hint/in_book/other` in DE und EN mit echten Umlauten. Die 21 ChapterType-Labels existierten schon, keine Ergaenzung noetig.
- Test-Migration: Bestehender Test `test_async_audiobook_respects_skip_types_from_config` hat das alte YAML-basierte Verhalten verifiziert. Umbenannt zu `test_async_audiobook_respects_per_book_skip_list`, schreibt jetzt die Skip-Liste via PATCH `audiobook_skip_chapter_types: ["toc", "glossar"]` und verifiziert dass Type-Match (`toc`) und Title-Match (`glossar`, lowercase) beide funktionieren.
- 5 neue Tests in `backend/tests/test_audiobook_skip_chapter_types.py`:
  1. PATCH round-trip: Liste persistiert, GET liefert sie zurueck
  2. Empty list clear: explizit `[]` setzen wird akzeptiert
  3. Async export filtert per Buch-Liste: `synthesize()`-Calls werden gezaehlt, nur die nicht-gesetzten Kapitel kommen durch
  4. Async export mit leerer Liste faellt auf Generator-Default zurueck (toc wird trotzdem geskippt)
  5. Dry-run nutzt per-Buch-Liste: Sample-Text kommt vom ersten nicht-gesetzten Kapitel (testet beide hardcoded Stellen)
- Skip-Entscheidungen wie mit User vereinbart: keine `AudioSkipChapterTypes.tsx` als separate Datei (Sub-Komponente reicht), keine 21x8 i18n-Strings (existieren bereits), keine Playwright E2E (Backend-Integration + bestehende Vitests reichen).
- Test-Resultat: 199 backend + 90 frontend gruen (vor dieser Aufgabe: 194 backend + 90 frontend). 5 neue Tests + 1 angepasster bestehender Test.

---

## 7. ChapterType Audit + 5 neue Typen

- Original-Prompt: User stellt einen 8-Schritt-Plan vor und nennt 8 angeblich fehlende Pflicht-Typen: foreword, prologue, final_thoughts, part, about_the_author, also_by_author, excerpt, call_to_action.
- Audit-Befund: Die vom User vorgeschlagene Liste war fehlerhaft. **Drei der acht Typen existieren bereits** (`foreword`, `prologue`, `about_author`), **einer ueberschneidet sich mit einem existierenden Typ aber ist konzeptionell verschieden** (`part` vs `part_intro`), und zwei sind explizit Marketing-Elemente (`excerpt`, `call_to_action`) — die der User selbst als separate "Sonderfaelle"-Kategorie definiert hatte aber dann doch unter "Pflicht" gepackt hatte. Bottom line: maximal 5 echte neue Typen, nicht 8.
- Vier Klaerungsfragen vorab gestellt; alle Antworten gingen mit meinen Empfehlungen mit. Final 5 neue ChapterType-Werte: `final_thoughts`, `part`, `also_by_author`, `excerpt`, `call_to_action`. Plus expliziter Bug-Fix fuer Scaffolder-Klassifizierung von `part_intro`/`interlude`/`part`.
- Ergebnis:
  - Beide ChapterType-Enums (SQLAlchemy in `app/models/__init__.py` und Pydantic in `app/schemas/__init__.py`) um die 5 neuen Werte erweitert. **Kritisch**: beide muessen synchron gehalten werden, sonst akzeptiert die DB-Spalte einen Wert den die API ablehnt oder umgekehrt.
  - `frontend/api/client.ts` ChapterType union um die 5 erweitert. `ChapterSidebar.tsx` BACK_MATTER_TYPES und STRUCTURE_TYPES + TYPE_LABELS map ergaenzt. `BookEditor.tsx` hat eine ZWEITE TYPE_LABELS-Map die ebenfalls exhaustiv sein muss - TypeScript hat das beim Compile als Record<ChapterType, string>-Fehler gefangen. `BookMetadataEditor.tsx` AUDIOBOOK_CHAPTER_TYPES Sortier-Liste fuer den Skip-Picker erweitert mit sinnvoller Buch-Reihenfolge (front -> body -> back).
  - **Scaffolder Bug-Fix**: Neues `_BODY_TYPES = frozenset({chapter, part, part_intro, interlude})`. Der Dispatcher in `_write_partitioned_chapters` checkt jetzt explizit `elif ch_type in _BODY_TYPES: _write_chapter(...)` statt einfach in den Default-Zweig zu fallen. Unbekannte Typen landen weiterhin im Default-Zweig (mit Kommentar).
  - `_BACK_MATTER_TYPES` um die 4 Back-Matter-Newcomer (`final_thoughts`, `also_by_author`, `excerpt`, `call_to_action`) ergaenzt mit kebab-case Filenames.
  - `_CHAPTER_TYPE_WRAPPERS` um die 5 + `next_in_series` (war vorher ohne Wrapper) erweitert. Jeder Typ bekommt seinen `<div class="...">` Kontext fuer EPUB/PDF-Styling.
  - **`_write_chapter` honoriert jetzt Wrapper auch fuer Body-Typen** (vorher nur fuer Front/Back-Special-Chapters). Das ist noetig fuer `part`, dessen `<div class="part">` Wrapper das Centred-Divider-Page-Styling traegt.
  - `_DEFAULT_CHAPTER_TYPE_CSS` um Styles fuer alle 5 neuen Klassen erweitert: `.part` zentriert mit page-break + grosse Schrift; `.final-thoughts h1` kursiv; `.also-by-author/.next-in-series` kompakter Stil; `.excerpt` mit border-top + italic title; `.call-to-action` zentriert italic.
  - `bibliogon_audiobook/generator.py SKIP_TYPES`: marketing types `also_by_author`, `excerpt`, `call_to_action` zur Default-Set hinzugefuegt mit Begruendungs-Kommentar (kein "buy my next book" pitch im Audiobook).
  - `backend/app/routers/audiobook.py DEFAULT_AUDIOBOOK_SKIP_TYPES`: identisch erweitert damit der Dry-Run-Cost-Estimate konsistent zum echten Export ist.
  - i18n: 5 neue Strings × 8 Sprachen = **40 neue chapter_types Eintraege**. Drei Sprachen (ja/pt/tr) haben ihren `chapter_types`-Block mit 8-Space-Indent (zwei Levels) statt 4-Space (ein Level), Indent-Style pro Datei beachtet. Echte Umlaute wo verfuegbar (de: "Schlussgedanken", "Aufruf zur Aktion"; el: "Τελικές σκέψεις"; ja: "最後に", "行動の呼びかけ"; usw.).
- 11 neue Tests in `backend/tests/test_new_chapter_types.py`:
  1+2. Pydantic- und SQLAlchemy-Enum haben alle 5 neuen Werte (Drift-Schutz)
  3-7. parametrisiert: jeder neue Typ kann via API erstellt und gelesen werden
  8. Scaffolder-Smoke-Test: alle 4 Back-Matter-Newcomer landen in `back-matter/`, `part` landet in `chapters/` mit `<div class="part">` wrapper
  9+10. Generator SKIP_TYPES und Router DEFAULT_AUDIOBOOK_SKIP_TYPES enthalten die 3 Marketing-Typen
  11. End-to-end: Buch mit 1 Kapitel + 3 Marketing-Kapiteln, async export laeuft, nur das eine reale Kapitel wird synthetisiert (default skip greift)
- Test-Resultat: 210 backend + 90 frontend gruen (vor dieser Aufgabe: 199 backend + 90 frontend). Der part_intro/interlude Bug ist explizit gefixt ohne dass ein bestehender Test gebrochen ist - der Default-Branch verhielt sich bisher zufaellig richtig, jetzt verhaelt er sich explizit richtig.
- Keine DB-Migration noetig: das `chapter_type`-Feld ist `String(20)`, alle neuen Werte passen rein. Bestehende Buecher behalten ihre alten Typen.

---

## 8. Keywords end-to-end auf list[str] migrieren + UX-Upgrade

- Original-Prompt: "BookEditor > Metadaten > Marketing > Keywords als editierbare Liste" - Spec sah eine Ersetzung des vermeintlichen Kommafeldes durch eine vertikale nummerierte Liste mit Drag-and-Drop, Inline-Edit und Undo-Toast vor.
- Audit-Ergebnis: Die Annahme war falsch. `KeywordInput` existierte bereits als chip-basiertes Component mit @dnd-kit und wurde im BookMetadataEditor genutzt. Die tatsaechlichen Luecken waren:
  1. Schema inkonsistent: `BookUpdate.keywords: str | None` in Pydantic, im Frontend als JSON-String durch `form` Record mit `JSON.parse`/`JSON.stringify` Hacks
  2. Hartes Limit bei 7 statt Soft-Warning
  3. Kein Inline-Edit
  4. Keine Undo-Funktion beim Loeschen
  5. Label "(max. 7)" passt nicht zum Soft-Warning Ansatz
- Optimierter Prompt: "Fix the schema inconsistency (keywords end-to-end as list[str]), add inline-edit via double-click, convert hard 7-cap to soft warning, add undo-toast on delete. Keep the existing horizontal chip layout - a vertical list is worse UX for short tags."
- Entscheidung: Horizontales Chip-Layout bleibt. Nur die echten Luecken werden gefuellt. Vertikale Liste mit Nummern war ein Prompt-Fehler, bestaetigt vom User.
- Ergebnis:
  - `BookUpdate.keywords: list[str] | None` mit `mode="before"` Validator der legacy JSON-String/CSV-String Formen akzeptiert, case-insensitive dedupiert und Leereintraege filtert
  - `BookOut.keywords: list[str]` - der vorhandene `_decode_skip_chapter_types` Validator wurde zu `_decode_json_list` generalisiert und deckt beide Felder ab
  - Router `update_book` encodet `keywords` zur JSON-Text im gleichen Schritt wie `audiobook_skip_chapter_types`. ORM-Spalte bleibt `Text`, keine Migration noetig.
  - KDP `metadata_checker` akzeptiert beide Formen (list[str] aus neuer API, JSON-String aus Legacy-Callern mit rohen ORM-Daten)
  - `frontend/src/api/client.ts`: `keywords: string[]`
  - `BookMetadataEditor`: keywords in eigenem `string[]` State statt JSON-String im `form` Record. `tryParseKeywords` Helper geloescht, Inline JSON.parse/stringify weg. Save-Payload liefert list[str] direkt.
  - `KeywordInput.tsx`:
    - Pure `validateKeyword(raw, existing, ignoreIndex)` Helper exportiert mit Error-Enum `empty | too_long | no_comma | duplicate`
    - Doppelklick startet Inline-Edit. Enter commitet, Escape verwirft, Blur commitet. Bei Validation-Fehler roter Rand, Edit-Modus bleibt aktiv.
    - `RECOMMENDED_MAX = 7` ist jetzt Soft-Warning. User darf mehr eingeben, Counter und Chip-Hintergrund werden warning-farbig, Hinweistext "Amazon KDP empfiehlt max. 7 Schluesselwoerter. Andere Plattformen erlauben mehr."
    - Delete zeigt `toast.info` mit "Rueckgaengig" Button das den Chip an seinem urspruenglichen Index wieder einfuegt, 5s AutoClose
    - Footer-Hint: "Doppelklick zum Bearbeiten, Drag-and-Drop zum Sortieren"
  - i18n: 9 neue Keys (`too_long`, `no_comma`, `over_limit`, `removed`, `undo`, `hint` + geaenderte placeholder/counter/duplicate) und `metadata.keywords` Label "(max. 7)" entfernt in allen 8 Locales (DE, EN, ES, FR, EL, PT, TR, JA)
  - Tests: 6 Backend Schema-Tests (list/legacy-JSON/legacy-CSV/dedup/empty/storage), 2 neue KDP Metadata-Checker Tests (list[str] Pfad + genug-Keywords kein Warning), 12 Frontend Vitest Tests fuer `validateKeyword` inkl. `ignoreIndex` Inline-Edit-Verhalten und explizite Regression dass KEIN hartes 7-Cap existiert
- Export-Pfade-Audit (Step 7 aus Original-Prompt): Kein Change noetig. `plugin-export._serialize_book` liest `keywords` ueberhaupt nicht (pre-existing gap - Keywords sind nie im EPUB `dc:subject`/DOCX-Metadata gelandet). Backup-Serializer, Project-Import und Backup-Compare arbeiten direkt auf der ORM-Spalte und sind von der API-Layer-Aenderung unbeeinflusst. Die Export-Integration fuer Keywords ist ein separates Follow-up.
- Commits:
  - `125d385` refactor(metadata): expose book keywords as list[str] in the API
  - `4f4c878` feat(metadata): inline edit, soft warning and undo-toast in KeywordInput
  - `5b53b14` refactor(metadata): drop JSON hacks for keywords in BookMetadataEditor
  - `c1b0eaa` test(metadata): coverage for the list[str] keywords migration
  - `37d3b9f` chore(i18n): keyword editor strings for all 8 languages
- Test-Resultat: 234 backend + 102 frontend gruen (vor dieser Aufgabe: 228 backend + 90 frontend). +6 backend (Schema-Tests), +2 KDP (bereits in Plugin-Test-Count enthalten), +12 frontend (Validator).
- Lessons-Learned: Der urspruengliche Prompt war in zwei Punkten falsch. Erstens: die Annahme das Feld sei ein Kommafeld. Audit zeigte ein existierendes KeywordInput Component. Zweitens: vertikale Liste mit Nummern wurde als bessere UX angenommen - horizontales Chip-Layout ist fuer kurze Tags klar ueberlegen. Der Audit-Schritt vor der Implementation hat beide Fehler gefangen bevor Code geschrieben wurde.

---

## Zusammenfassung

- Features: 8 (M-12, M-16, V-02, Audiobook-Overwrite-per-Buch, Plugin-Settings Audit, Audiobook-Skip-per-Buch, ChapterType-Erweiterung, Keywords list[str] + UX-Upgrade)
- Neue Dateien: 10 (2 Migrationen, 5 Test-/Service-Module, 1 Frontend-Dialog, 2 neue Test-Files)
- Geaenderte Dateien: 44
- Neue Tests: 44 (6 ms-tools Hook + 5 Import-Sanitization + 4 ms-tools Book-Thresholds + 7 Backup-Compare + 2 Audiobook-Overwrite + 6 Backend Keywords-Schema + 2 KDP Keywords-List + 12 Frontend validateKeyword)
- Testergebnis: 234 backend + 102 frontend gruen (vor Session: 181 backend + 90 frontend)
- ROADMAP: M-12, M-16, V-02 abgehakt. Noch offen in Manuskript-Tools: M-13, M-14, M-15. Audiobook-Overwrite und Keywords-Migration waren keine ROADMAP-Eintraege sondern direkte User-Wuensche.
- Architektur-Entscheidungen dokumentiert:
  - `audiobook.settings.overwrite_existing` wurde von Plugin-global zu Buch-spezifisch migriert. Begruendung: Single Source of Truth, Konsistenz mit anderen buch-spezifischen Audio-Settings, eindeutige Granularitaet.
  - Keywords bleiben in der ORM-Spalte als `Text` (JSON-String) gespeichert, sind aber im API-Layer (Pydantic) `list[str]`. Encode/Decode passiert im Router und einem generalisierten `_decode_json_list` Validator der auch `audiobook_skip_chapter_types` abdeckt. Vorteil: keine DB-Migration, kein Bruch fuer Legacy-Clients die weiterhin JSON-Strings senden koennen.

---

## 9. Drei neue Themes: Klassisch, Studio, Notizbuch

- Original-Prompt: "Drei neue Themes fuer unterschiedliche Autoren-Stile" - Spec sah sechs neue flache Theme-IDs (`classic-light`, `classic-dark`, ...) mit einem eigenen Variable-Set (`--bg-tertiary`, `--border-subtle`, `--shadow`, `--code-bg`, `--link`, `--font-serif/sans`) und optionaler Offline-Schrift-Bundlung vor.
- Audit-Ergebnis: Die Spec passte in zwei Punkten nicht zur bestehenden Architektur.
  1. Variable-Namen: Der Code nutzt `--bg-primary/secondary/sidebar/card/hover/editor`, `--text-primary/secondary/muted/inverse/sidebar`, `--accent/-hover/-light/-subtle`, `--border/-strong`, `--danger/-hover`, `--shadow-sm/md/lg`, `--font-display/body/mono`. Der spec-Variable-Set enthielt Namen die nirgendwo im Code referenziert sind (`--bg-tertiary`, `--border-subtle`, `--shadow`, `--code-bg`, `--link*`, `--font-serif/sans`) und liess Variablen weg die Components aktiv nutzen (`--bg-sidebar/card/hover/editor`, `--text-inverse/sidebar`, `--accent-light/subtle`, `--border-strong`, `--danger*`, alle drei `--shadow-*`). Spec-CSS 1:1 einspielen haette Sidebars, Cards, Hover-States, Shadows und Danger-Buttons gebrochen.
  2. Theme-ID-Schema: Das bestehende System hat zwei orthogonale Achsen: `data-app-theme` (Palette: warm-literary, cool-modern, nord) und `data-theme` (light/dark, unabhaengig umschaltbar via ThemeToggle). Flache IDs wie `classic-dark` haetten den ThemeToggle, `useTheme.ts` und alle 185 Zeilen bestehendes Theme-CSS rewriten muessen, plus eine localStorage-Migration fuer bestehende User.
- Nach Rueckfrage: Option B gewaehlt. Bestehende Architektur respektieren, drei neue `data-app-theme` Werte addieren, Variablen auf den realen Contract mappen. User hat Mappings explizit bestaetigt:
  - `--bg-tertiary` -> `--bg-hover`
  - `--border-subtle` -> `--border`, mit `--border-strong` fuer Kontrast-Faelle
  - `--shadow` -> berechnete `--shadow-sm/md/lg` (gleiche Grundfarbe, Alpha 0.05/0.08/0.12 hell, 0.3/0.4/0.5 dunkel)
  - `--font-serif/sans` -> `--font-display/body`
  - `--code-bg/--link/--link-hover` als redundant droppen
- Ergebnis:
  - **Palette-Registry**: `frontend/src/themes/palettes.ts` als neue Single Source of Truth fuer die Liste bekannter Paletten. `useTheme.ts` validiert localStorage gegen `isKnownPalette`, stale Werte fallen auf `warm-literary` zurueck. 8 Vitest Tests pinnen die Liste, die kebab-case IDs und `isKnownPalette`.
  - **Klassisch (Light + Dark)**: Warmes Papier-Gefuehl, beige-creme Toene, Bordeaux-Akzent (`#8b3a1f`), Crimson Pro als Serif fuer display+body. Sidebar in dunklem Braun fuer Kontrast. Editor bekommt typografische Erst-Zeilen-Einrueckung 1.5em via `[data-app-theme="classic"] .ProseMirror p:not(:first-child) { text-indent: 1.5em; }` - der `:not(:first-child)` Teil respektiert die Konvention dass der erste Absatz nach einer Ueberschrift nicht eingerueckt wird.
  - **Studio (Dark primaer + Light)**: Dunkles Anthrazit (`#1c1e22`) mit Mint/Teal-Akzent (`#5eead4`), Inter fuer UI-Text, Source Serif Pro fuer Headings. Light-Variante mit dunklerem Mint (`#0d9488`) auf hellem Grau. Spec-Text "Look orientiert sich an professionellen A/V-Schnitt-Programmen" ernst genommen: hoher Kontrast, schlanke Linien, keine Deko.
  - **Notizbuch (Light primaer + Dark)**: Helles Papier mit Linien-Optik. `[data-app-theme="notebook"] .ProseMirror` bekommt ein `linear-gradient` Background das bei `calc(1.6em - 1px)` eine 1px-Linie zieht, plus `background-size: 100% 1.6em` und zwangs-synchronisiertes `line-height: 1.6em` - sonst driften die Linien nach einigen Absaetzen weg. Dazu ein `border-left: 2px solid var(--notebook-margin)` fuer den roten Rand-Strich und `padding-left: 2em` um Text freizuraeumen. Die 0.3 Grad Heading-Rotation aus der Spec wurde auf User-Request gedroppt: funktionale Regression auf Text-Selection und Caret-Alignment in TipTap ist fuer den kosmetischen Effekt nicht vertretbar. Lora als Serif fuer beide Varianten.
  - **Notebook-spezifische Variablen**: `--notebook-rule` (Linien-Farbe) und `--notebook-margin` (Rand-Strich) sind pro Palette lokal definiert, nicht in den allgemeinen Variablen-Kontrakt gemischt. So kann die Dark-Variante beide unabhaengig tunen ohne `--border` (das auch fuer unrelated Element-Borders genutzt wird) zu beruehren.
  - **Fonts**: Google-Fonts-Link in `index.html` um Inter, Lora, Source Serif Pro erweitert. Die Spec wollte Offline-Bundlung, aber der bestehende Stack nutzt fuer die drei alten Paletten weiterhin Google Fonts. Teil-Offline-Bundlung waere inkonsistent - entweder alle sechs oder keine. Auslagerung in ROADMAP O-01 (neue Kategorie "O=Offline-Haertung") als separater Haertungs-Task.
  - **Settings-Dropdown**: Drei Literale hinzugefuegt ("Klassisch", "Studio", "Notizbuch"). Struktur nicht angefasst, i18n-Pass auch fuer die bestehenden drei Paletten waere inkonsistent-teilweise gewesen und wurde auf einen spaeteren Sweep verschoben.
  - **Help-Docs**: Neues Top-Level-Menu `themes` in `docs/help/_meta.yaml`, DE und EN Prose unter `docs/help/{de,en}/themes.md` die alle sechs Paletten beschreibt, Hell/Dunkel-Dimension erklaert und Plugin-Autoren auf den CSS-Variable-Kontrakt hinweist. Stale "drei Themes" Hint in `docs/help/de/getting-started.md` korrigiert.
- Nicht gemacht (bewusst):
  - Keine flachen Theme-IDs (Architektur-Rewrite)
  - Keine Offline-Font-Bundlung (O-01 separat)
  - Keine 0.3 Grad Heading-Rotation (funktionale Regression)
  - Keine i18n-Keys fuer Palette-Namen (alle 6 auf einmal oder gar nicht)
  - Keine Visual-Regression-Screenshots (optional in Spec, Playwright-E2E in diesem Repo nicht aktiv fuer Screenshots)
- Commits:
  - `f5bb3ba` feat(themes): central palette registry with useTheme guard
  - `c0cd82b` feat(themes): add Classic, Studio and Notebook palettes
  - `2b4def5` chore(fonts): extend Google Fonts link with Inter, Lora, Source Serif Pro
  - `7e6f14a` feat(settings): expose Classic, Studio and Notebook in the palette selector
  - `a228721` docs(help): themes guide and ROADMAP O-01 for offline font bundling
- Test-Resultat: 234 backend unveraendert, 110 frontend gruen (+8 von palette registry tests).
- Lessons-Learned: Der Audit-First-Reflex aus Session 8 hat wieder den Tag gerettet. Die Spec war an zwei kritischen Stellen inkompatibel mit der bestehenden Architektur (Variable-Namen und flache IDs), was erst durch das Lesen von `global.css`, `useTheme.ts` und `Settings.tsx` sichtbar wurde. 1:1-Umsetzung ohne Audit haette entweder die halbe UI gebrochen oder einen massiven Rewrite erzwungen, beides ohne gutes Ergebnis. Option B (Adapt) war die ganze Zeit die richtige Antwort, aber ohne dokumentierten Audit haette der User das nicht entscheiden koennen.

---

## 10. ChapterType UI overflow in sidebar list and add-chapter dropdown

- Original-Prompt: Zwei Overflow-Bugs im ChapterType-UI. (a) Die Kapitel-Liste in der Sidebar scrollt nicht innerhalb ihres Containers, sondern verlaengert die ganze Seite. Bei vielen Kapiteln wird der Metadaten/Export-Footer unter den Viewport geschoben, User muss zoomen. (b) Das "+ Button" Dropdown zum Anlegen eines neuen Kapitels listet alle 26 ChapterTypes mit Section-Labels und Separators; bei normalen Viewports (1080p und darunter) wird das Dropdown unten abgeschnitten.
- Audit-Ergebnis: Nur ein Component betroffen - `ChapterSidebar.tsx`. Kein separates `AddChapterMenu`. Kein Test-File.
  - Bug 1: `.sidebar` war korrekt (`height: 100vh`, `flex column`), `.list` hatte bereits `flex: 1, overflow-y: auto` - aber `min-height: 0` fehlte. Flex-Children haben per Default `min-height: auto`, was auf die intrinsic Content-Height expandiert und das `overflow-y: auto` stillschweigend aushebelt. Klassischer CSS-Flexbox-Fallstrick. Dazu fehlten `flex-shrink: 0` auf `.header`, `.manuscriptHeader` und `.exportSection` - ohne die werden die beim "Squeeze" verkleinert statt dass die Liste scrollt.
  - Bug 2: `.chapter-dropdown-content` in `global.css` hatte kein `max-height`, keinen `overflow-y`, und `DropdownMenu.Content` hatte kein `collisionPadding`. Radix's built-in Collision-Detection flippt nur die `side` von bottom auf top, resized aber nicht - also blieb der Content geclippt.
- Fix:
  - `ChapterSidebar.tsx`: `minHeight: 0` auf `.list`, `flexShrink: 0` auf `.header/.manuscriptHeader/.exportSection`, `collisionPadding={16}` auf `DropdownMenu.Content`, `data-testid` auf dem List-Wrapper und der Dropdown-Content fuer die Tests.
  - `global.css`: `max-height: var(--radix-dropdown-menu-content-available-height)` + `overflow-y: auto` + `overscroll-behavior: contain` + `scrollbar-width: thin` auf `.chapter-dropdown-content`, plus WebKit-Scrollbar-Styles mit einem 8px breiten Thumb passend zum dunklen Sidebar-Theme. Die Radix-CSS-Variable wird vom Popper automatisch on-mount gesetzt und beim Side-Flip neu berechnet - keine explizite Resize-Logik noetig.
  - **Keine** Aenderung an Props, Sidebar-API oder der DropdownMenu-Struktur. Rein lokaler Layout-Fix.
- Tests: Neues `ChapterSidebar.test.tsx` (erstes Render-Test-File mit gemountetem ChapterSidebar). 5 strukturelle Assertions: List hat `data-testid`, `overflow-y: auto`, `min-height: 0` (wobei React `0` statt `"0px"` serialisiert - Test akzeptiert beide), `flex: 1`, und eine Source-Level-Regression die prueft dass `.chapter-dropdown-content` in `global.css` weiterhin `max-height: var(--radix-dropdown-menu-content-available-height)` und `overflow-y: auto` enthaelt. Letzteres ist eine Quellcode-Pruefung weil jsdom keine Layout-Pass hat - die Radix-CSS-Variable wird erst zur Laufzeit vom Popper aufgeloest, kein runtime-Wert pruefbar im Test. `ResizeObserver` gestubbt weil jsdom keinen liefert und Radix DropdownMenu ihn beim Mount braucht.
- Was NICHT gemacht:
  - Kein echter 600px/800px/1080px Viewport-Matrix-Test (braucht Human-in-the-Loop Browser, nicht machbar in dieser Umgebung). Flagged als NOT VERIFIED im Closing-Checklist-Report.
  - Kein Playwright E2E-Test hinzugefuegt (User hat in vorheriger Session entschieden dass Playwright fuer non-critical UI-Fixes nicht lohnt).
  - Keine Radix ScrollArea - plain `overflow-y: auto` reicht und matched den Rest der App (keine ScrollArea irgendwo in der Codebase).
- Commits:
  - `7e3d0a6` fix(ui): chapter sidebar list and add-chapter dropdown overflow
  - `5e17460` test(ui): render-based tests for sidebar list and dropdown overflow
- Test-Resultat: 234 backend unveraendert, 127 frontend gruen (+5 ChapterSidebar-Tests). tsc --noEmit clean, Production-Build clean.
- Lessons-Learned: Zwei CSS-Fallstricke in einem Commit, beide kosten normalerweise viel Debug-Zeit. (1) Flex-Column mit scrollbarem Child braucht `min-height: 0` - das ist in CSS-Docs versteckt und schlaegt "mein overflow-y geht nicht" normalerweise erstmal eine halbe Stunde Stack-Overflow-Suche. (2) Radix-Popper-Collision resized nicht, nur repositioniert - die `--radix-*-available-height` CSS-Variable ist das offizielle API dafuer und einfach zu uebersehen weil sie nicht im allgemeinen Radix-Getting-Started steht. Gehoeren beide in `lessons-learned.md` als Patterns fuer zukuenftige UI-Arbeit. Nicht in diesem Task gemacht um Scope zu halten.
