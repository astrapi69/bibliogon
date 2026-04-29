# Articles-Backup Debug — Phase 1

Datum: 2026-04-29.
Status: Phase 1 (Diagnose) abgeschlossen. Phase 2 wartet auf Daten
von Aster + Go.

Auftrag: Commit `ed2e3ec` hat Articles-Support in
`backup_export.py` ergaenzt (5 Backend-Tests gruen). Aster meldet:
ZIP enthaelt keine Articles. Tests treffen also den modifizierten
Pfad, der User-Click trifft etwas anderes — oder es gibt eine
externe Ursache (Cache, alte Prozess-Instanz, ...).

---

## Endpoint-Trace (komplett)

### Frontend Backup-Button (beide Dashboards)

Beide Dashboards rufen **denselben** Handler:

| Dashboard | Komponente | Datei:Zeile | onClick | API-Call |
|-----------|------------|-------------|---------|----------|
| Books | `Dashboard` | `frontend/src/pages/Dashboard.tsx:185` `data-testid="backup-export-btn"` | `handleBackupExport` (Zeile 153) | `window.open(api.backup.exportUrl(), "_blank")` |
| Articles | `ArticleList` | `frontend/src/pages/ArticleList.tsx:330` `data-testid="article-backup-export-btn"` | `handleBackupExport` (Zeile 70) | `window.open(api.backup.exportUrl(), "_blank")` |

Beide Handler sind funktional identisch — `api.backup.exportUrl()`
gibt `${BASE}/backup/export` zurueck (`frontend/src/api/client.ts:1380`).

### Backend Route

`GET /api/backup/export` ist in `backend/app/routers/backup.py:27`
definiert. Der Handler ruft direkt
`export_backup_archive(db, include_audiobook=...)` aus
`backend/app/services/backup/backup_export.py:38`. **Kein
Orchestrator dazwischen.**

### ZIP-Build-Pfade — alle gefunden

```
grep -rn 'ZipFile\|zipfile' backend/app/ --include='*.py' | grep -v test
```

| Datei | Zweck | Schreibt manifest.json? |
|-------|-------|-----------------------|
| `services/backup/backup_export.py` | **Backup-Export** (das ZIP, das Aster bekommt) | Ja (Zeile 213) |
| `services/backup/backup_import.py` | Restore-Reader | Nein (liest nur) |
| `services/backup/backup_compare.py` | V-02 Backup-Vergleich | Nein (liest nur) |
| `import_plugins/handlers/bgb.py` | CIO-Restore-Handler | Nein (liest nur) |
| `routers/audiobook.py` | Audiobook-Chapter-ZIP-Download | Nein (anderer Use-Case) |
| `routers/plugin_install.py` | ZIP-installierter Plugin | Nein (liest nur) |
| `routers/git_import_backfill.py` | Git-Import | Nein (liest nur) |

**Es gibt nur einen einzigen ZIP-Build-Pfad fuer Backup.** Das ist
`backup_export.py` — die Datei, die in `ed2e3ec` modifiziert wurde.

### manifest.json-Writer

```
grep -rn 'manifest.json' backend/app/ --include='*.py' | grep -v test
```

Nur `backup_export.py:213` schreibt manifest.json fuer Backups.
Andere Hits sind Reader (`archive_utils`, `bgb.py`, `backup_import`).

---

## Fazit der Code-Pfade-Analyse

**Der User-Pfad geht durch den geaenderten Code.**

```
[Backup-Button click]
  -> handleBackupExport
  -> window.open("/api/backup/export")
  -> backend route export_backup
  -> export_backup_archive()      <-- in ed2e3ec geaendert
  -> Articles-Query + articles/-Dir
  -> manifest.json mit version=2.0
```

Dieselbe Funktion wird von 5 Tests in `test_backup_articles.py`
ausgefuehrt; alle gruen. Wenn der User-Pfad ein Problem hat,
dann liegt es **NICHT am Code in `ed2e3ec`**, sondern eine Stufe
hoeher.

---

## Hypothesen mit Code-Evidenz

### H1 — Backend laeuft mit altem Code (uvicorn nicht restartet)

**Wahrscheinlichkeit: HOCH.**

Aster fuehrt `make dev` aus. uvicorn laeuft mit `--reload`. Das
sollte automatisch File-Aenderungen sehen, aber:

- Wenn `make dev` vor `ed2e3ec` gestartet wurde, sieht der
  Watch-Mechanismus die neuen Imports zwar, aber bereits geladene
  Module bleiben unter Umstaenden gecached, je nach Watcher.
- `lessons-learned.md` notiert separat: path-installed plugins
  und Cross-File-Imports koennen `--reload` umgehen.
- Nach Backend-Aenderungen, die mehrere Module beruehren
  (`backup_export.py` + `backup_import.py` + `serializer.py` +
  `archive_utils.py`), ist ein Hard-Restart sicher.

**Verifikation durch Aster:** Backend stoppen + neu starten,
dann Backup nochmal probieren.

```bash
make dev-down
rm -f backend/bibliogon.db   # nicht zwingend, aber auf Nummer sicher
make dev
# dann Backup-Button klicken
```

### H2 — Aster's Articles sind 0 oder alle in Trash

**Wahrscheinlichkeit: NIEDRIG.**

`backup_export.py:43` macht `db.query(Article).all()` — liefert
**alle** Articles inkl. soft-deleted (kein `deleted_at IS NULL`-
Filter). Wenn Aster Articles hat, landen sie im ZIP unabhaengig
vom Trash-Status.

Pruefe: ist die Articles-Liste im Articles-Dashboard tatsaechlich
nicht leer?

**Verifikation durch Aster:** Articles-Dashboard zeigt N
nicht-getrashte Articles. Im Trash-Panel zeigt M soft-deleted.
Wenn N + M = 0 → kein Bug, sondern leere DB.

### H3 — Aster hat altes Backup angeschaut

**Wahrscheinlichkeit: MITTEL.**

Wenn Aster ein `.bgb` aus einer **frueheren Session** angeschaut
hat (vor `ed2e3ec`), enthaelt dieses ZIP per Definition keine
Articles und keine `version=2.0`-Manifest. Das ist kein Bug;
das alte ZIP ist unveraenderbar.

**Verifikation durch Aster:** Den Output der folgenden Befehle
nachreichen, ausgefuehrt **nach** Hard-Restart auf einem **frisch
heruntergeladenen** ZIP:

```bash
unzip -l <neuestes>.bgb | head
unzip -p <neuestes>.bgb manifest.json
```

Wenn `manifest.json` `"version": "2.0"` zeigt aber keine
`articles/`-Eintraege auftauchen, ist H1/H2 ausgeschlossen und
es liegt ein anderer Bug vor.

Wenn `manifest.json` `"version": "1.0"` zeigt, ist H1 (alter
Backend-Prozess) belegt.

### H4 — Frontend-Bundle-Cache (Service Worker / PWA)

**Wahrscheinlichkeit: NIEDRIG bis MITTEL.**

`vite-plugin-pwa` ist installiert. Wenn der Service Worker einen
alten Bundle cached, koennte der Backup-Button theoretisch noch
einen alten URL-Path benutzen. Nur **theoretisch** — der URL-Path
hat sich seit Monaten nicht geaendert (`/backup/export`). Selbst
ein gecachtes Bundle ruft denselben Endpoint.

Auch wenn der Frontend-Cache stale waere, der Backend-Code waere
trotzdem neu — und der Backend-Code baut das ZIP. Frontend-Cache
betrifft den Backup-Inhalt nicht.

**Praktisch ausschliessbar.**

### H5 — Articles-Query liefert leeres Ergebnis durch Sessions-Bug

**Wahrscheinlichkeit: NIEDRIG.**

Theoretisch koennte der `db: Session = Depends(get_db)` Scope-
Issue haben (z.B. eine Session, die nicht den richtigen
DB-Connection-State sieht). Aber:

- Books-Query `db.query(Book).all()` funktioniert (Aster sieht
  Books im ZIP).
- Articles-Query `db.query(Article).all()` ist syntaktisch
  identisch.
- Wenn Books gehen, gehen Articles auch — selbe Session, selber
  Pool.

Praktisch ausschliessbar ohne Code-Beweis fuers Gegenteil.

---

## Wahrscheinlichste Ursache + naechster Schritt

**H1 (alter Backend-Prozess) — Wahrscheinlichkeit ~70%.**
**H3 (altes Backup angeschaut) — ~20%.**
**Sonst — ~10%.**

### Aster bitte folgende Outputs nachreichen

Damit Phase 2 zielgenau wird, brauche ich:

1. **Frische Backend-Restart-Sequenz:**
   ```bash
   git log --oneline | head -3                # zeigen, dass ed2e3ec / aktueller HEAD eingespielt ist
   make dev-down
   make dev
   # Browser: Articles erstellen (mind. 2)
   # Browser: Backup-Button klicken
   ```

2. **Inhalt des frisch erzeugten ZIP:**
   ```bash
   unzip -l ~/Downloads/<neuestes>.bgb | head -30
   unzip -p ~/Downloads/<neuestes>.bgb manifest.json
   ```

3. **DB-Stand vor dem Klick:**
   ```bash
   sqlite3 backend/bibliogon.db "SELECT COUNT(*) FROM articles;"
   sqlite3 backend/bibliogon.db "SELECT id, title, deleted_at FROM articles LIMIT 5;"
   ```

Mit diesen drei Outputs ist die Ursache eindeutig zuordenbar.

---

## Zusaetzliche Findings (nicht User-Bug, aber dokumentenswert)

### Forward-Compat-Version-Check fehlt

`backup_import._validate_backup_manifest` (siehe
`backend/app/services/backup/backup_import.py:83-92`) prueft nur
`format == "bibliogon-backup"`. **`version` wird gar nicht
gelesen.** Heisst:

- Backups mit `version: "1.0"` und `version: "2.0"` werden gleich
  behandelt.
- Ein hypothetisches Backup mit `version: "3.0"` wuerde silently
  durchlaufen, koennte aber ein neues ZIP-Layout haben, das der
  Reader nicht versteht — sicherheitsproblematisch fuer kuenftige
  Format-Major-Bumps.

**Empfehlung:** In Phase 2 (oder als Add-On) eine warning-only
Pruefung einbauen:

```python
version = manifest_data.get("version", "1.0")
if version not in {"1.0", "2.0"}:
    logger.warning(
        "Backup manifest version %s is newer than this Bibliogon "
        "supports; restoring with best-effort. Please upgrade.",
        version,
    )
```

Hard-Reject nicht noetig — additive Erweiterungen (`articles/` in
2.0) brechen den 1.0-Reader nicht. Nur logging.

### Test-Lucke — User-Pfad wurde nicht durch HTTP getestet

Aktuelle 5 Tests in `test_backup_articles.py` rufen
`export_backup_archive(db)` und `import_backup_archive(upload, db)`
**direkt** auf. Sie umgehen die FastAPI-Route. Theoretisch
koennte ein Route-Decorator oder ein Middleware-Fehler den
HTTP-Pfad anders verhalten lassen. Praktisch ist die Route
trivial (siehe `backup.py:27-43`), aber ein User-Pfad-Test ueber
`TestClient.get("/api/backup/export")` waere die Lucke, die
jetzige Tests nicht decken.

**Empfehlung Phase 2:** Ein zusaetzlicher Test mit
``TestClient(app).get("/api/backup/export")``, ZIP entpacken,
articles-Eintraege pruefen. Schliesst H1-H5 als Test-Beweis aus.

---

## Phase-2-Plan (sobald Aster's Outputs vorliegen)

### Szenario A: H1 belegt (alter Prozess)

Kein Code-Fix. Kurze Notiz im
`docs/help/{de,en}/developers/troubleshooting.md`: nach
Backup-relevanten Backend-Aenderungen `make dev-down && make dev`
ausfuehren.

Plus: User-Pfad-Test (HTTP) als Test-Lucken-Schliesser.

Plus: Forward-Compat warning-only check (Add-On).

### Szenario B: H3 belegt (altes Backup)

Kein Code-Fix. Aster sieht im neuen ZIP alle Articles.
Test-Lucke + Forward-Compat trotzdem ergaenzen.

### Szenario C: Manifest zeigt 2.0 aber kein articles/ im ZIP

Echter Bug. Dann tracen:
- Wert von `len(articles)` in der Export-Funktion (logging
  einbauen).
- DB-Connection-Pool-Frage (Session-Scope der Route vs Test).
- Race-Condition bei `mkdir(parents=True)` — sehr unwahrscheinlich.

### Szenario D: Manifest zeigt 1.0 nach Hard-Restart

Heisst: der Endpoint ruft eine **andere** Funktion. Dann
nochmal mit `import` -mocking debuggen + ggf. Plugin-System auf
Pre-Hook untersuchen, der Manifest neu schreibt.

---

## STOP — warte auf Aster's Outputs

Nichts implementieren bis:
1. Output 1-3 von oben nachgereicht
2. Eines der Szenarien A-D bestaetigt

---

## Phase 1 — Conclusion (nach Aster's Outputs)

Datum: 2026-04-29 (gleiche Session, nach Output-Lieferung).

### Aster's Outputs

```
$ git log --oneline | head -3
f0139a6 docs(explorations): debug articles-backup user-flow gap (Phase 1)
ed2e3ec feat(backup): articles + publications + article-assets in .bgb (manifest 2.0)
faf3f9c docs(explorations): backup/restore articles audit (Phase 1)

$ unzip -l ~/Downloads/bibliogon-backup-2026-04-29.bgb | head -30
   Length    Date      Time    Name
        0    2026-04-29 18:54  articles/
        0    2026-04-29 18:54  books/
      232    2026-04-29 18:54  manifest.json
        0    2026-04-29 18:54  articles/c1942c352cee434aa6f1c062d259645d/
    25436    2026-04-29 18:54  articles/c1942c352cee434aa6f1c062d259645d/article.json
                                5 files
```

Warnung im UI: **"No book.json inside the backup."**

### Befund — Szenarien A/B/C/D ALLE falsch

H1 (alter Prozess) ausgeschlossen: HEAD = f0139a6, Backend nach
`make dev-down && make dev` neu gestartet.

H3 (altes Backup) ausgeschlossen: ZIP-Datum 2026-04-29 18:54.

Export funktioniert: `articles/c1942c.../article.json` ist da,
`books/` leer (korrekt — Aster hat 0 Books).

**Die Warnung kommt vom Restore-Pfad, nicht vom Export.** Aster
hat den Import-Button geklickt. Der CIO-Handler
`backend/app/import_plugins/handlers/bgb.py` ist article-blind.

### Echter Bug — Szenario E

CIO `BgbImportHandler` kennt nur Books:

| Code-Pfad | Verhalten |
|-----------|-----------|
| `bgb.py:54` `detect()` | Scant nur `book.json` via `_book_blobs` |
| `bgb.py:64` | Wirft Warnung `"No book.json inside the backup."` wenn `_book_blobs == []` |
| `bgb.py:329` `_book_blobs(zf)` | `for name in namelist(): if name.endswith("/book.json")` — keine Article-Erkennung |
| `bgb.py:387` `_book_count(path)` | Identische Filterlogik |
| `bgb.py:436` `_restore_single_book` | Wirft `_BgbInvalid("Backup has no restorable book.json.")` (Zeile 464) wenn 0 Books |
| `bgb.py:172` `execute_multi` | Iteriert nur `books_dir`, ignoriert `articles_dir` |

Es gibt zwei Import-Pfade in der Codebase:

1. **Legacy** `POST /api/backup/import` →
   `backup_import.import_backup_archive` — restauriert Articles
   (commit `ed2e3ec`).
2. **CIO** `POST /api/import/...` →
   `BgbImportHandler` — restauriert NUR Books.

`ed2e3ec` hat nur Pfad 1 erweitert. Der UI-Import-Button geht
durch Pfad 2.

### Phase 2 — Scope

**Pflicht (laut User-Auftrag):**

1. `bgb.py` article-aware machen:
   - `detect()` zaehlt Articles + Books, Warnung nur wenn beide 0
   - `execute()` / `execute_multi()` ruft Article-Restore-Helpers
     aus `backup_import.py` auf
   - Neue Felder im `DetectedProject` fuer Article-Counts (oder
     `plugin_specific_data`)
2. HTTP-User-Pfad-Test:
   `TestClient.post("/api/import/upload", files=...)` mit
   articles-only `.bgb` — verifiziert dass Articles via CIO
   restauriert werden.
3. Forward-Compat-Version-Check: warning-only, additiv.

**Optional (auf separaten Commit verschieben):**

- Wizard-UI fuer Articles-Preview (`DetectedBookSummary` →
  `DetectedArticleSummary` o.ae.). Erstmal nur Restore
  funktional kriegen.

Phase 2 wartet auf explizites Go.
