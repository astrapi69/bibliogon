# Backend God-Files Audit (2026-06-14)

Read-only audit. No code changed. Source of truth for the file-size
gate: `.filesize-baseline` (debt list, split-TODO) + `.filesize-whitelist`
(legitimate single-concern files). Gate thresholds (`scripts/check-file-sizes.sh`):
WARN > 500 lines, ERROR (merge-block) > 1000 lines.

The `backend/mutants/` tree (mutmut-generated) is excluded throughout — it
is not real source.

## Gate-status context

- **Whitelisted (legitimate, single-concern, NOT God-files):**
  `backend/app/models/__init__.py` (1526), `backend/app/schemas/__init__.py`
  (2135). Both are pure declarations (SQLAlchemy models / Pydantic contracts),
  one concern each, no behaviour. Splitting would hurt findability. Leave as-is.
- **Baselined backend debt (ERROR-zone, > 1000):** only `backend/app/main.py`.
- **WARN-zone (501-1000, not yet baselined):** the rest of the table below.
  These are not merge-blockers today, but they mix concerns and are the
  highest-value split targets before they cross 1000.

## Backend God-Files Audit

| Datei | Zeilen | Concerns | Split-Vorschlag | Imports-von | Risiko |
|-------|--------|----------|-----------------|-------------|--------|
| `app/main.py` | 1046 | App-Setup + Lifespan (8 Phasen) + 4-Schicht-Config-Merge + Secrets + Plugin-Lizenz/Discovery + Middleware + ~30 `include_router` + Exception-Handler + ~10 Inline-Routes (`/voices`, `/plugins/*`, `/i18n`, `/health`, `/test/reset`) + Static-Serving | `app/config_loader.py`, `app/exception_handlers.py`, `app/lifespan.py`, `app/router_registration.py`, `app/routes_misc.py` (voices/i18n/health), `app/routes_admin.py` (plugins/rediscover/test-reset) | `ai/routes.py` (`_load_app_config`), `routers/settings.py` (`_get_user_override_path`, `invalidate_plugin_status_cache`), `services/reset_service.py`, `services/backup/markdown_utils.py` (`manager`) | **Hoch** — zentrale Verdrahtung; 4 Importeure haengen an konkreten Exports. Facade-Re-Export noetig. |
| `app/routers/audiobook.py` | 862 | Router + ElevenLabs-Key-Verify (externer HTTP-Call) + Google-TTS-Creds-Upload + Voice-Seeding (DB-Mutation) + Dry-Run-TTS-Synthese (File-I/O, Kostenschaetzung) | `services/audiobook_credentials.py`, `services/google_tts_setup.py`, `services/audiobook_synthesis.py`; Router duenn halten | nur Tests (`DEFAULT_AUDIOBOOK_SKIP_TYPES`) | **Hoch** — externe APIs + DB + Background-Tasks + FS eng gekoppelt. |
| `app/routers/ai_template_bulk_fill.py` | 824 | Config-Caps + Rate-Limit + Request-Schemas + DB-Loader + Field-Class-Validatoren + Kostenschaetzung-Heuristik + 8 Endpoints (Article/Book × estimate/start/get/stream) + 2 async Job-Worker | `..._config.py`, `..._estimate.py`, `..._jobs.py`, `..._articles.py`, `..._books.py` | keine externen | **Mittel** — keine Fremd-Importeure; haengt an `ai/routes.py`-Helpern. Reine Klarheits-Split. |
| `app/ai/template_schema.py` | 801 | Versions-Konstanten + Custom-Exception + 6 Pydantic-Modelle + statische AI-Rules-Header + TipTap-Body-Extraktion + Field-Apply-Primitiven + YAML-Serialize/Parse + Template-Factories | `template_models.py`, `template_headers.py`, `template_body.py`, `template_apply.py`, `template_yaml.py`, `template_factories.py` | 8 Dateien (article/book ai_fill+template, ai_template_bulk(_fill), `services/reclassify.py`, `routers/articles.py`) | **Hoch** — 8 Importeure mit breitem Symbol-Bezug. Facade essenziell. |
| `app/routers/books.py` | 750 | CRUD-Router + 3× Inline-`app.yaml`-Read (`_is_permanent_delete`, `_allow_books_without_author`, `_get_trash_auto_delete_config`) + Trash-Cleanup + Article→Book-Konversion (6 Schritte: validate/sort/front+back-matter/commit) | `services/book_config.py`, `services/article_to_book.py`; Router duenn | `routers/book_ai_template.py`, `routers/import_orchestrator.py` (`_allow_books_without_author`), `main.py` (`cleanup_expired_trash`) | **Mittel-Hoch** — Config-Reads pro Request (DRY-Verstoss mit articles.py), Konversion mit Routes verwoben. |
| `app/services/git_backup.py` | 909 | Repo-Lifecycle + State-Inspektion + Commit + Remote-Config (YAML+verschluesselt) + Push/Pull (FF-only) + 3-Way-Merge/Konflikt + Book→FS-Serialisierung + Chapter-Klassifizierung + Auth/SSH | `git_repo_ops.py`, `git_remote_ops.py`, `git_merge_ops.py`, `git_book_serializer.py`, `git_auth_helpers.py` | `services/git_import_adopter.py` | **Mittel** — Serializer eng an DB-Modelle + `bibliogon_export` gekoppelt (lazy load bewahren). |
| `app/services/git_sync_diff.py` | 714 | 3-Way-Diff-Klassifizierer + Rename-Detection + Markdown-Normalisierung + Git-Ref-Reading + DB→Markdown-Projektion + Resolution-Apply + Chapter-Identity-Mapping + Konflikt-Marker | `git_sync_diff_classifier.py`, `git_sync_markdown_utils.py`, `git_sync_resolver.py`, `git_ref_reader.py` | `routers/git_sync.py` (`apply_resolutions`, `diff_book`) | **Mittel-Hoch** — `apply_resolutions` ist State-Machine-Orchestrator (DB+Markdown+HTML+Git); harte `tiptap_to_markdown`-Abhaengigkeit. |
| `app/import_plugins/handlers/wbt.py` | 667 | `ImportPlugin`-Protokoll (`can_handle`/`detect`/`execute`) + Format-Detection + ZIP-Extraktions-Cache + SHA256-Signatur + Metadata-Read + Chapter/Asset-Preview + Git-Adoption + Multi-Branch-Translation-Import | `wbt_detection.py`, `wbt_extraction_cache.py`, `wbt_metadata.py`, `wbt_preview.py`, `wbt_executor.py`, `wbt_translation_groups.py` | `import_plugins/handlers/__init__.py` (Klasse) | **Hoch** — Detection/Execute ist Protokoll-Vertrag mit Deferred-Import-Pattern; Translation-Pfad jung + gekoppelt. |
| `app/routers/import_orchestrator.py` | 629 | Orchestrator-Router + Staging-Dir-Management (`_stage_uploads`/`_resolve_staged`/`_drop_staged`/`_gc_stale_staging`) + 2-Phasen-Import (detect/execute) + Duplikat-Detection | `services/import_staging.py`, `services/import_orchestration.py`; Router duenn | nur Tests (`_STAGING_DIR`, `_STAGING_TTL_SECONDS`) | **Mittel** — bewusster Orchestrator; Staging-Plumbing klar extrahierbar. |
| `app/ai/routes.py` | 614 | Config-Read (lazy aus `main`) + Caps-Validierung + Client-Factory + Feature-Flag + Usage-Tracking + 4 Request-Schemas + generische LLM-Endpoints + Review (sync+async+SSE+cancel) + Marketing-Generation | `ai/config.py`, `ai/llm_factory.py`, `ai/schemas.py`, `ai/endpoints_generic.py`, `ai/endpoints_review.py`, `ai/review_jobs.py`, `ai/endpoints_marketing.py` | `main.py` (router) + 6 Dateien (interne Helper `_get_client`/`_is_ai_enabled`/`_get_bulk_ai_caps`/`_get_ai_config`) | **Mittel** — Router nur von main importiert, aber Helper breit. Facade-Re-Export noetig. |
| `app/routers/settings.py` | 611 | Settings-Router + Dashboard/UI-Default-Validierung + Secrets-Detection + Plugin-Discovery (Dir-Scan + ZIP) + License-Tier-Resolve/-Check + Manager-Config-Refresh | `services/settings_validation.py`, `services/secrets_management.py`, `services/plugin_discovery.py`; Router duenn | keine (nur HTTP) | **Mittel** — Dir-Scan pro Request; verschachtelte try/except-Fallbacks. |
| `app/services/backup/project_import.py` | 613 | Metadata-YAML-Parse + Book-Model-Bau + Stylesheet-Discovery + Chapter-Import (section-order/alpha) + Chapter-Type-Inference + Asset-Import/Cover + Backfill-Helper | `project_metadata_parser.py`, `project_stylesheet_loader.py`, `project_chapter_importer.py`, `project_asset_importer.py` | `services/translation_import.py`, `handlers/wbt.py` (`_import_project_root` u.a.) | **Niedrig** — klare Daten-Transform-Grenzen; Funktionen weitgehend rein/isoliert. |
| `app/routers/articles.py` | 579 | CRUD-Router + 3× Inline-Config-Read (Duplikat von books.py) + Asset-Cleanup (`shutil.rmtree` an 4 Stellen) + Article→Comment-Reclassify + AI-Meta-Generation (Prompt+LLM+Parse+DB) | gemeinsamer `services/book_config.py` (DRY), `services/asset_cleanup.py`, `services/article_ai_meta.py`; Reclassify nutzt bestehenden `services/reclassify.py` | `routers/comments.py` (`CommentOut` Schema), `main.py` (`cleanup_expired_article_trash`) | **Mittel** — Config-Duplikat mit books.py; AI-Pfad ungebremst. |
| `app/routers/chapters.py` | 563 | CRUD-Router (duenn) + Slug-Generierung (10+ Regex) + Anchor-Extraktion (markdown/HTML) + TOC-Validierung-Orchestrierung + Version/Snapshot-Inline (Word-Count, Trim, Restore) | `services/chapter_anchors.py`, `services/toc_validation.py`; Snapshot in bestehenden `services/chapter_snapshots.py` | keine (nur HTTP) | **Mittel** — Kern-CRUD duenn, aber TOC/Slug substanziell. |
| `app/import_plugins/handlers/bgb.py` | 555 | `ImportPlugin`-Protokoll + BGB-Format-Detection (Magic Bytes) + Manifest-Validierung + Book-Blob-Extraktion + Source-ID/Duplikat-Detection (DB-Query in `detect`) + Multi-Book-Support + Preview + Single/Multi-Restore-Dispatch | `bgb_detection.py`, `bgb_archive_reader.py`, `bgb_duplicate_detection.py`, `bgb_preview.py`, `bgb_executor_single.py`, `bgb_executor_multi.py` | `import_plugins/handlers/__init__.py` (Klasse) | **Mittel** — Protokoll-Vertrag; Multi-Book-Logik unabhaengig + sicher extrahierbar. |
| `app/services/backup/backup_import.py` | 487 | ZIP-Extraktion/Validierung + Book-Restore-Orchestrierung (Soft-Delete-Revive) + Article+Publications-Restore + Asset-File-Restore + Chapter-Restore + FK-geordnete Child-Restore + Globals-Restore (v3.0: authors/templates/orphan-comments) | `backup_archive_validation.py`, `backup_book_restorer.py`, `backup_article_restorer.py`, `backup_asset_file_handler.py`, `backup_globals_restorer.py` | `services/backup/__init__.py` (`import_backup_archive`), `handlers/bgb.py` (`_restore_book_from_dir`, `_restore_article_from_dir`) | **Mittel** — FK-Ordering + Soft-Delete-Revive heikel; Flush/Commit-Vertrag dokumentieren (BACKUP-PARITY-PIN). |

### Vorbildlich (kein Split noetig)

- `app/routers/git_sync.py` (423) — **duenner Router-Goldstandard**: einzige
  Logik ist ein `_is_dirty()`-Check; alles delegiert an `services/git_sync_*`.
  Vorlage fuer alle anderen Router.

### Korrektur (2026-06-14, nachgereicht)

Die erste Fassung dieses Reports fuehrte `app/routers/ai_template_bulk.py`
(445 Zeilen) in der Prioritaetsliste als Erst-Split-Kandidaten und beschrieb
ihn faelschlich als "WARN-Zone". Beim Lesen der Datei (Split #1 Pre-Audit)
zeigte sich:

- `ai_template_bulk.py` ist **445 Zeilen, unter der WARN-Schwelle (500)** —
  kein Gate-Verstoss, nicht in `.filesize-baseline`. Ein Split ist optionale
  Bereinigung, keine Schuldentilgung.
- Die im Split-Prompt zugeordneten Concerns (8 Endpoints, Rate-Limit,
  Kostenschaetzung, async Job-Worker, Field-Class-Validatoren) gehoeren zu
  `ai_template_bulk_fill.py` (824, Zeile 28 dieser Tabelle), **nicht** zu
  `ai_template_bulk.py`. Die nahezu identischen Dateinamen wurden in der
  Parallel-Planung verwechselt.
- Reale Concerns von `ai_template_bulk.py`: Cap-Config
  (`MAX_BULK_AI_TEMPLATE`, `_get_active_bulk_ai_template_cap`,
  `_enforce_bulk_ai_template_cap`), Request-Schema (`_BulkExportRequest`),
  ZIP-Utilities (`_dedupe_filenames`, `_build_zip`, `_zip_response`,
  `_iter_yaml_entries`), DB-Loader (`_load_articles_by_id`,
  `_load_books_by_id`), 4 Endpoints (article/book × export/import). Keine
  Jobs, keine Schaetzung, kein Rate-Limit.

Konsequenz: `ai_template_bulk.py` faellt aus der Prioritaetsliste (sub-WARN);
`services/backup/project_import.py` (613, echte WARN-Zone) rueckt auf Platz 1.
Die Liste unten ist entsprechend neu nummeriert.

## Priorisierte Split-Reihenfolge

Kriterium: niedrigstes Risiko × hoechster Benefit zuerst. "Benefit" = mischt
echte Business-Logik in einen Router/God-File (Architektur-Regel-Verstoss) und/
oder naehert sich der 1000-Zeilen-ERROR-Schwelle.

1. **`services/backup/project_import.py` (613)** — Risiko **Niedrig**, klare
   reine Transform-Grenzen. Hoher Benefit (4 saubere Module). **Erst-Split.**
2. **`routers/settings.py` (611)** — Risiko **Mittel**, keine Fremd-Importeure;
   Business-Logik (Plugin-Discovery, License-Check) raus aus Router → Architektur-Gewinn.
3. **`routers/chapters.py` (563)** — Risiko **Mittel**, keine Fremd-Importeure;
   TOC/Slug → Service. Kern-CRUD bleibt duenn.
4. **`routers/import_orchestrator.py` (629)** — Risiko **Mittel**,
   Staging-Plumbing klar trennbar; nur Test-Importeure.
5. **`routers/ai_template_bulk_fill.py` (824)** — Risiko **Mittel**, keine
   Fremd-Importeure; reine Klarheit, aber nahe ERROR-Schwelle → bald angehen.
6. **`routers/books.py` (750)** — Risiko **Mittel-Hoch**; zuerst gemeinsamen
   `services/book_config.py` einziehen (loest zugleich DRY-Duplikat mit articles.py).
7. **`routers/articles.py` (579)** — direkt nach books.py, teilt `book_config.py`.
8. **`services/backup/backup_import.py` (487)** — Risiko **Mittel**; BACKUP-PARITY-PIN
   beachten, Round-Trip-Test als Gate vor/nach Split.
9. **`services/git_sync_diff.py` (714)** — Risiko **Mittel-Hoch**; State-Machine
   vorsichtig schneiden.
10. **`services/git_backup.py` (909)** — Risiko **Mittel**, nahe ERROR-Schwelle;
    Serializer/Auth/Merge klar, aber DB+Export-Kopplung.
11. **`import_plugins/handlers/bgb.py` (555)** — Risiko **Mittel**; Protokoll-Vertrag
    bewahren.
12. **`ai/template_schema.py` (801)** — Risiko **Hoch**, 8 Importeure; Facade
    zwingend.
13. **`ai/routes.py` (614)** — Risiko **Mittel**, aber Facade-Re-Export fuer 6
    Helper-Importeure noetig.
14. **`import_plugins/handlers/wbt.py` (667)** — Risiko **Hoch**; Protokoll +
    Deferred-Import + junge Translation-Pfade.
15. **`routers/audiobook.py` (862)** — Risiko **Hoch**, nahe ERROR; externe APIs +
    DB + Background eng gekoppelt.
16. **`app/main.py` (1046)** — Risiko **Hoch**, einziger ERROR-Blocker + 4
    Importeure an konkreten Exports. Facade-main, das Sub-Module re-exportiert.
    Zuletzt, weil zentral und am riskantesten.

Nicht in der Liste: `routers/ai_template_bulk.py` (445, sub-WARN — optionale
Bereinigung, kein Gate-Verstoss; siehe Korrektur oben).

### Querschnitt-Empfehlungen

- **DRY:** `_is_permanent_delete` / `_*_trash_auto_delete_config` / Config-Reads
  sind in `books.py` UND `articles.py` dupliziert → ein gemeinsamer
  `services/book_config.py` schlaegt zwei Fliegen.
- **Facade-Muster:** fuer `main.py`, `ai/routes.py`, `ai/template_schema.py` die
  Original-Datei als Re-Export-Facade behalten, damit Importeure nicht in einem
  Commit mit-migriert werden muessen (gruene Zwischenstaende, atomare Commits).
- **Goldstandard:** `routers/git_sync.py` als Referenz fuer "duenner Router".

## Frontend God-Files (separat — fuer CCW-Uebergabe, NICHT analysiert)

Nur Bestandsaufnahme der Zeilenanzahl. Keine Concern-/Import-Analyse (per Auftrag
dem Frontend-Tool ueberlassen). Alle > 1000 ausser den letzten vier, die neu in
der WARN-Zone (800-1000) auftauchen und noch NICHT in `.filesize-baseline` stehen.

| Datei | Zeilen | Baseline? |
|-------|--------|-----------|
| `frontend/src/api/client.ts` | 5212 | ja |
| `frontend/src/components/BookMetadataEditor.tsx` | 2699 | ja |
| `frontend/src/components/Editor.tsx` | 2043 | ja |
| `frontend/src/storage/dexie-storage.ts` | 1978 | ja |
| `frontend/src/pages/ArticleEditor.tsx` | 1640 | ja |
| `frontend/src/pages/ArticleList.tsx` | 1633 | ja |
| `frontend/src/components/import-wizard/steps/PreviewPanel.tsx` | 1622 | ja |
| `frontend/src/components/articles/ConvertToBookWizard.tsx` | 1336 | ja |
| `frontend/src/components/ComicBookEditor.tsx` | 1323 | ja |
| `frontend/src/components/PageCanvas.tsx` | 1281 | ja |
| `frontend/src/pages/Dashboard.tsx` | 1276 | ja |
| `frontend/src/components/CommentsAdminSection.tsx` | 1141 | ja |
| `frontend/src/pages/BookEditor.tsx` | 1119 | ja |
| `frontend/src/components/ChapterSidebar.tsx` | 1033 | ja |
| `frontend/src/components/Storyboard.tsx` | 955 | **nein (WARN)** |
| `frontend/src/pages/GitBackupPage.tsx` | 922 | **nein (WARN)** |
| `frontend/src/components/LayoutConfigImageRow.tsx` | 864 | **nein (WARN)** |
| `frontend/src/components/CollageCanvas.tsx` | 859 | **nein (WARN)** |

Hinweis: `client.ts` (5212) ist mit Abstand der groesste God-File des Repos —
ein typischer API-Client, der natuerlich per Ressource (books/articles/chapters/
ai/git/...) in `api/*.ts`-Module zerlegt werden kann. Top-Prioritaet fuer die
Frontend-Uebergabe.
