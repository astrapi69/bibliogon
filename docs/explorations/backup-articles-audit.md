# Backup/Restore: Articles parallel zu Books — Phase 1 Audit

Datum: 2026-04-29.
Status: Phase 1 (Audit) abgeschlossen. Phase 2 (Implementation)
wartet auf Go.

Auftrag: Smoke-Test hat aufgedeckt, dass `.bgb`-Backups Articles
nicht enthalten. Datenverlust-Risiko bei Restore. Articles wurden
in v0.24.0 als first-class Feature eingefuehrt, das
Backup-System (vor v0.20) kennt sie nicht.

---

## 1. Aktueller Backup-Pfad (nur Books)

### 1.1 Endpoints

| Methode | Pfad | Datei |
|---------|------|-------|
| `GET /api/backup/export?include_audiobook={bool}` | Buch-Backup als `.bgb` | `backend/app/routers/backup.py:27` |
| `POST /api/backup/import` (multipart `file`) | `.bgb` Restore | `backend/app/routers/backup.py:52` |
| `GET /api/backup/history?limit=N` | Backup-Aktionsverlauf | `backend/app/routers/backup.py:46` |
| `POST /api/backup/compare` | V-02 Backup-Diff | `backend/app/routers/backup.py:58` |

### 1.2 Service-Funktionen

**Export** ([backend/app/services/backup/backup_export.py](backend/app/services/backup/backup_export.py)):

- `export_backup_archive(db, include_audiobook)` — Top-level
  Builder. Liest **nur** `db.query(Book).options(joinedload(Book.chapters))`
  (Zeile 31).
- `_write_book_dir(...)` — pro Book: `book.json` + `chapters/` +
  `assets/` + optional `audiobook/`.
- `_serialize_chapter(...)` — Chapter-Felder (id/title/content/
  position/chapter_type/created_at/updated_at).
- `_write_assets(db, book_id, ...)` — `db.query(Asset).filter(book_id)`.
- `_write_manifest(...)` — schreibt `manifest.json` mit:
  ```json
  {
    "format": "bibliogon-backup",
    "version": "1.0",
    "created_at": "...",
    "book_count": N,
    "includes_audiobook": bool
  }
  ```

**Restore** ([backend/app/services/backup/backup_import.py](backend/app/services/backup/backup_import.py)):

- `import_backup_archive(file, db)` — Top-level. Validiert
  Filename (`.bgb`), entpackt, prueft Manifest, erwartet
  `books/`-Verzeichnis (`_require_books_dir`).
- Returnt `{"imported_books": N}`.
- `_restore_book_from_dir(db, book_dir)` — pro Buch.
- `_restore_chapters` + `_restore_assets`.
- Format-Validation: nur `format == "bibliogon-backup"` wird
  akzeptiert (Zeile 88-92). `version` wird **nicht** geprueft —
  ein neueres Backup mit `version=2.0` wuerde aktuell ohne Warnung
  durchlaufen, aber die Articles-Daten ignorieren.

### 1.3 Aktueller Datenumfang Backup (vollstaendige Liste)

```
manifest.json
books/
  <book_id>/
    book.json           # Book-Felder (siehe serializer.py)
    chapters/<id>.json  # je Chapter
    assets.json + assets/<filename>  # cover/figure/diagram/table
    audiobook/          # optional
```

### 1.4 Aktueller Datenumfang Restore

Identisch zu Export. Skipt Books die `id` schon haben **und live
sind**; soft-deleted Books werden hard-gelöscht und neu eingefuegt
(siehe `_restore_book_from_dir` Zeilen 129-142).

### 1.5 Archive-Layout-Helper

`backend/app/services/backup/archive_utils.py`:
- `find_manifest(extracted)` — Top-Level oder eine Ebene tief.
- `find_books_dir(extracted)` — sucht `books/`-Verzeichnis.
- `find_project_root(extracted)` — fuer WBT-ZIPs (separat).

---

## 2. Article-Entities (was fehlt)

### 2.1 Tabellen die exportiert werden muessen

| Tabelle | Zweck | FK | Anmerkung |
|---------|-------|----|-----------|
| `articles` | Standalone Article | — | id, title, subtitle, author, language, content_type, content_json, status, canonical_url, featured_image_url, excerpt, tags (JSON-text), topic, seo_title, seo_description, deleted_at, ai_tokens_used |
| `publications` | Publish-Records pro Article | `article_id` ON DELETE CASCADE | platform, external_url, content_snapshot, published_at, last_verified_at, ... |
| `article_assets` | Hochgeladene Bilder pro Article | `article_id` ON DELETE CASCADE | id, article_id, filename, asset_type ("featured" / ...), path |

### 2.2 Disk-Pfade

- Featured Images: `uploads/articles/{article_id}/{asset_type}/<filename>`
  (siehe `backend/app/routers/article_assets.py` Zeile 62).

### 2.3 Topics

`Topic` ist **kein** eigenes Model — Topics sind ein
settings-managed `list[str]` in `app.yaml` (`topics:`-Block, siehe
`backend/app/routers/settings.py:55-58`). Articles speichern den
Topic als freien String (`Article.topic`) damit der Backup keine
referenzierte Topic-Liste neu aufbauen muss.

**Auswirkung Backup:** Topics-Liste muss **nicht** mit ins
`.bgb` — sie lebt in `app.yaml`, das ist eine separate
Konfigurationsdatei. Articles tragen den Topic-String selbst.

### 2.4 Article-Export ist NICHT Backup

Articles haben bereits Phase-3 Export (Markdown/HTML/PDF/DOCX) ueber
`POST /api/articles/{id}/export` — das ist **per-article** Format-
Konvertierung fuer Veroeffentlichung. Der Backup-Use-Case ist
**alle Articles in einem ZIP** zur Wiederherstellung. Beide
Pipelines bleiben getrennt; Backup nutzt eine eigene serializer-
Schicht analog zu `serialize_book_for_backup`.

---

## 3. Frontend-Audit

### 3.1 Backup-Button

- **Books-Dashboard:** `Dashboard.tsx:185` — `data-testid="backup-export-btn"`,
  ruft `handleBackupExport()` → `window.open(api.backup.exportUrl(), "_blank")`.
- **Articles-Dashboard:** seit Round-2 (Commit `f9d127d`) parallel
  vorhanden mit selbem Handler.

### 3.2 Restore / Import-Wizard

- `ImportWizardModal` ist die einzige sichtbare Restore-Surface.
  Frontend ruft NICHT `api.backup.import` direkt — der Wizard geht
  ueber den CIO-Orchestrator (`/api/import/detect` + `/api/import/execute`).
- `api.backup.import` (defined `frontend/src/api/client.ts:1386`)
  ist Legacy + **wird nicht aufgerufen** von der UI. Der CIO-
  Orchestrator behandelt `.bgb`-Files via einen eigenen Handler
  (`bgb_handler.py`, siehe `backend/app/import_plugins/handlers/bgb.py`).
- Erfolgs-Toast: kommt aus dem Wizard-State-Machine `success` step;
  zeigt "**N Bücher importiert**".

### 3.3 Toast-Strings die Phase 2 anpassen muss

Wizard `SuccessStep` und `SuccessMultiStep` in
`frontend/src/components/import-wizard/`:
- `success_books_imported: "{n} Bücher importiert"` —
  muss um Articles-Zahl erweitert werden.

Backup-Export erzeugt keinen Toast (Browser-Download).

---

## 4. CIO-Pfad: BGB Handler (wo der Article-Restore wirklich landet)

`backend/app/import_plugins/handlers/bgb.py` ist **der**
tatsaechliche Pfad fuer Restore. Er ruft intern
`backup_import.import_backup_archive` auf wenn die Datei nach
manifest.json + books/ aussieht.

Das heisst: **Phase 2 erweitert primaer den
`backup_import._restore_book_from_dir` + `backup_export._write_book_dir`
Service-Code.** Der CIO-Handler delegiert; Wizard-State-Machine
zeigt das Ergebnis.

`bgb_handler` muesste minimal angepasst werden um Articles-
Counts zurueckzugeben (DetectedProject/ExecuteResponse-Schema).
Audit:

```bash
backend/app/import_plugins/handlers/bgb.py:114
    backpage_description=first_blob.get("backpage_description"),
```

→ BGB-Handler kennt aktuell `book.json` Pfade. Article-Counts werden
ein neues Feld auf `DetectedProject` brauchen
(`articles_count: int`).

---

## 5. Format-Version + Backwards-Compat

### 5.1 Aktuelles manifest.json

```json
{
  "format": "bibliogon-backup",
  "version": "1.0",
  ...
}
```

`version` wird beim Restore **nicht** geprueft. Phase 2 muss:
1. Beim Export: `version` auf `"2.0"` bumpen + neuen `articles_count`-
   Block schreiben.
2. Beim Restore: `version` lesen.
   - `1.0` (oder fehlend) → kein `articles/`-Verzeichnis erwartet.
   - `2.0` → `articles/` lesen, jeder Article landet in DB.
3. Alte `.bgb` ohne articles/ darf **nicht crashen**: leeres
   articles/-Verzeichnis behandeln wie kein articles/.

### 5.2 ID-Konflikte

Books-Pattern in `_restore_book_from_dir`:
- Live-Book mit selber id existiert → skip (idempotent).
- Soft-deleted-Book → hard-delete + neu einfuegen.
- Keine ID kollidiert → frisch einfuegen.

Articles muessen **dasselbe** Pattern bekommen
(Article hat `deleted_at` seit `82acc16`).

### 5.3 Risiken

- **Roundtrip-Test fehlt fuer Articles.** Phase-2-Test muss klar
  zeigen: 5 Articles + 3 Publications + 2 Featured-Images →
  Backup → DB leeren → Restore → alle Felder identisch.
- **Featured-Image-Pfad-Konflikt.** Article-Asset wird mit
  absolutem `path` exportiert (`uploads/articles/{id}/featured/foo.png`).
  Beim Restore muss der Pfad regeneriert werden falls die
  `uploads/`-Struktur sich geaendert hat — gleiches Risiko wie
  beim Books-`_restore_assets`.
- **Soft-deleted Articles im Backup.** Aktuell exportiert der
  Books-Pfad **alle** Books inkl. soft-deleted. Article-Backup
  muss konsistente Wahl treffen — Empfehlung: alle Articles
  inkl. soft-deleted exportieren, `deleted_at` mit serialisieren,
  beim Restore `deleted_at`-Status uebernehmen. Mirror Books-
  Verhalten.

---

## 6. Plan fuer Phase 2

### 6.1 Service-Aenderungen

**`backend/app/services/backup/serializer.py`** (Erweiterung):
- Neu: `serialize_article_for_backup(article)` mit allen Article-
  Feldern + nested Publications + Article-Assets.
- Neu: `restore_article_from_data(article_data)` →
  Article-ORM, Publications-Liste, Asset-Records.

**`backend/app/services/backup/backup_export.py`**:
- `export_backup_archive` zusaetzlich `db.query(Article)` (analog
  Books).
- Neu: `_write_article_dir(article, dir, ...)` mit `article.json` +
  `publications.json` + `assets.json` + `assets/<filename>`.
- `_write_manifest` bekommt:
  - `version` → `"2.0"`
  - `article_count` + `publication_count` + `article_asset_count`.

**`backend/app/services/backup/backup_import.py`**:
- `import_backup_archive` returnt
  `{"imported_books": N, "imported_articles": M}`.
- Neuer `_restore_article_from_dir` analog
  `_restore_book_from_dir`. Soft-delete-Behandlung kopieren.
- Backwards-compat: kein `articles/`-Verzeichnis = 0 imported_articles,
  kein Crash.
- `_validate_backup_manifest` akzeptiert `version 1.0` UND `2.0`.

**`backend/app/services/backup/archive_utils.py`**:
- Neu: `find_articles_dir(extracted)` analog `find_books_dir`.

**`backend/app/import_plugins/handlers/bgb.py`**:
- DetectedProject bekommt `article_count` Feld.
- ExecuteResult returnt erweiterten Counts-Block.

### 6.2 Frontend-Aenderungen

- `frontend/src/api/client.ts`: `api.backup.import`'s Return-Type
  erweitern auf `{imported_books, imported_articles}`.
- Wizard `SuccessStep`: Toast/Headline erweitern auf
  "**N Bücher, M Artikel importiert**".
- i18n × 8 Sprachen: neuer Key + bestehender bekommt Plural-Variante.

### 6.3 Tests

- `backend/tests/test_backup_export.py` (neu oder Erweiterung):
  - Export mit 0 Articles: ZIP enthält **kein** articles/-Verzeichnis,
    manifest hat `article_count=0`. Backwards-compat smoke.
  - Export mit N Articles: alle Felder + Publications + Assets im ZIP.
  - manifest.json hat `version=2.0` + Article-Counts.

- `backend/tests/test_backup_import.py` (Erweiterung):
  - **Roundtrip-Schluesseltest:** 5 Articles erzeugen → Backup →
    Articles + Publications + Article-Assets aus DB löschen →
    Restore → alles wieder da, alle Felder gleich.
  - Legacy-Backup-Fixture (manifest version=1.0, kein articles/):
    Restore funktioniert, 0 Articles importiert.
  - ID-Konflikt: Article mit selber id existiert live → skip.
  - Soft-deleted Article: hard-delete + neu einfuegen (mirror Books).

### 6.4 Geschaetzter Aufwand

- Backend Export: ~45 min
- Backend Restore + Backwards-Compat: ~60 min
- Tests (Roundtrip + Legacy + ID-Konflikt): ~45 min
- Frontend Toast + i18n × 8: ~30 min
- **Gesamt: ~3 h.** Innerhalb des 5h-Hard-Stops.

---

## 7. STOP — Phase 2 wartet auf Go

Bestaetige bitte einen der drei Pfade:

- **A) Phase 2 wie geplant.** Articles + Publications + Article-Assets
  ins `.bgb`. format_version 2.0. Backwards-Compat fuer 1.0.
- **B) Reduzierter Scope.** Nur Articles (ohne Publications oder
  Article-Assets). Kommt aber in einem zweiten Schritt.
- **C) Anderer Plan.** Bitte Korrektur an den Audit-Findings oben.

Open Questions die Phase 2 beruehren:

1. **Soft-deleted Articles im Backup:** mirror Books (alle
   exportieren) — OK?
2. **Topics:** kein Backup-Eintrag, da settings-managed in
   `app.yaml` (siehe 2.3) — OK?
3. **`api.backup.import`-Frontend-Toast:** wird der per-Wizard-
   Erfolgsschritt erweitert oder kommt ein separater Toast?
   Empfehlung: Wizard `SuccessStep` headline erweitern.
4. **format_version-Bump:** `1.0` → `2.0` (Major) oder `1.1`
   (Minor)? Rein additiv → Empfehlung **`2.0`** weil Restore-
   Verhalten unterscheidet (neue Felder werden gelesen / nicht).
