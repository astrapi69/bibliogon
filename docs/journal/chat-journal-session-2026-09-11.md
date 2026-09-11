# Chat-Journal Session 2026-09-11 (Session 9: Bulk-Buch-Import)

## 1. Brainstorming Bulk-Import (08:15)

- Original prompt: 42 Buecher pruefen + fehlende per Import-Wizard anlegen;
  Mehrfach-Import per Links existiert nicht - Brainstorming Best Practice.
- Ergebnis: Pre-audit fand die Einzelteile bereits vorhanden
  (detect/git + execute Orchestrator, BookImportSource-Duplikatcheck,
  Medium-Import als Bulk-UX-Vorbild). Dreistufiger Plan: Script (heute),
  UI-Feature, Client-Zipball fuer PWA.

## 2. Stage-1-Script (08:30)

- Ziel: Katalog-getriebener check-and-fill Importer ueber existierende
  Endpoints.
- Ergebnis: `scripts/bulk_import_books.py` (Katalog-YAML, per-Repo-Isolation,
  --dry-run, Report, Exit 1 bei Fehlern) + make import-books(-check) +
  14 Tests RED-first inkl. 2 Integrationstests gegen den echten Orchestrator.
- Commit: `4d8d7e88` (Issue #758, PR #759)

## 3. Realer Katalog erzwingt Branch-Support (08:50)

- Befund aus `book-collection/data/books-list.csv`: nur 9 von 45 Buechern
  auf Default-Branches; 8 Repos tragen Sprachvarianten als Branches.
- Ergebnis: `detect/git` bekommt validierten `branch`-Param (Option-
  Injection-Guard), plugin-git-sync klont Branch + Staging-Dir
  `<slug>@<branch>` (Signature bleibt branch-distinkt, keine Migration);
  Katalog-Identitaet = (URL, Branch).
- Commit: `bd5c8286` (Issue #760)

## 4. Import-Laeufe + Empirie (09:00-09:45)

- Lauf 1 (https): 35/42 Fehler "could not read Username" -> private Repos;
  Loesung SSH-URLs (gh protocol: ssh, Agent geladen).
- Lauf 2 (ssh, 1 Eintrag pro Branch): 40 imported, ABER 112 DB-Rows -
  der EXISTIERENDE WBT-Multi-Branch-Import (import_translation_group)
  importiert pro execute die ganze Branch-Gruppe; Katalog-Eintrag pro
  Branch = kartesisches Produkt. Pre-audit hatte den Pfad uebersehen
  (Pre-Coding-Reality-Check-Klasse). Idempotenz-Luecke als #762 gefiled.
- Nebenbefund gefixt: metadata.yaml mit `author` als Objektliste crashte
  die Detect-Validierung -> `_parse_author`-Normalisierung im shared
  Parser, 5 Tests RED-first. Commit `3a71a4ca` (Issue #761).
- Lauf 3 (Katalog v3: 1 Eintrag pro Gruppen-Repo, 24 Eintraege):
  24/24 imported, 0 Fehler. Bereinigung: 8 main/main-de-Doubletten +
  2 Geisterkopien (Sprachfeld-Drift) in den Papierkorb.
- CSV-Korrekturen evidenzbasiert (git ls-remote + metadata.yaml-Probes):
  politisches-profil -> political-profile-international (umbenannt),
  4 stale Branches, 1 ARCHIVED-Altauflage gestrichen.

## 5. Jaeger-Baende (10:10)

- CSV zeigte beide Baende aufs Waechter-Repo; tatsaechlich eigenes Repo
  `astrapi69/die-jaeger-und-die-gejagten` (main = EN, main-de = DE).
- Ergebnis: Gruppen-Import beider Baende; Katalog ergaenzt.
- Endstand: **43 Buecher** in der Dev-Instanz (25 DE / 9 EN / 5 ES / 4 FR),
  finaler Dry-run 25/25 present = idempotent.

## 6. Session-10-Planung (09:50)

- Original prompt: drei Tracks priorisiert, Exploration-Docs mit Pre-audit,
  noch keine Issues.
- Ergebnis: `docs/explorations/{book-to-learnset-export,author-promotion,
  bulk-import-stage2}.md` mit file:line-Pre-audits. Prio: Lernset-Export ->
  Promotion -> Bulk-Stage-2 (Blocker #762).
- Commit: `c867bbca`

## 7. Session 10 Phase 1: plugin-learnset (10:30)

- Original prompt: Buch -> Lernset-Export, nur Phase 1, ohne AI, TDD,
  Library-First pruefen.
- Verify-First: `learn-content-engine` 0.23.0 liegt lokal, wird aber nur
  ueber npm publiziert. Kein PyPI-Paket, kein `[project]`/`[build-system]`
  in seiner `pyproject.toml` - also keine pinbare Python-Abhaengigkeit.
  Schemas + `python/lce_schema.py` werden vendored.
- Ergebnis: `plugins/bibliogon-plugin-learnset` exportiert ein Buch als
  schema-validiertes alc-ZIP. PR #766 (Issue #763).
- Fehler unterwegs: der Eintrag in `app.yaml.example` war ein stiller
  No-op - die Beispieldatei nutzt 2 statt 4 Leerzeichen Listeneinrueckung,
  mein Anker traf nie. CI startete ohne das Plugin.

## 8. #765 Backend-offline-Banner (10:50)

- Original prompt (CCW-Lane): ein persistenter Banner statt Toast-Sturm,
  Netzwerkfehler von fachlichen Fehlern trennen, kein aggressives Polling.
- `backendReachability` pollt `/api/health` nur solange down, plus sofort
  bei `window online`. `guardedFetch` klassifiziert jetzt: AbortError bleibt
  unberuehrt, echte Netzwerkfehler werden `ApiError{status:0, network:true}`.
- Empirisch gemessen statt angenommen: der Vite-Proxy liefert bei totem
  Upstream `502 text/plain` (nginx: `502 text/html`), keinen TypeError.
  Ohne die Content-Type-Unterscheidung waere der Banner in Produktion nie
  gefeuert.
- Madge-Zyklus `http.ts <-> backendReachability.ts` aufgeloest ueber das
  Blatt-Modul `apiBase.ts`. PR #767.
- Out-of-scope-Funde als eigene Issues: #769 (4 Komponenten umgehen
  `notify`), #770 (request-spezifischer Fehler kurz als globaler Ausfall).

## 9. Backup-Feedback + Hook-Enforcement (11:20)

- Original prompt: "Backup in Buechern geht nicht mehr", dann "oeffnet nur
  about:blank", dann "es dauert und es fehlt die Fortschrittsanzeige".
- Ursache war nicht der Export, sondern `window.open(url, "_blank")` an zwei
  Stellen: der Tab oeffnet sofort leer und bleibt es, bis der Server nach
  ~20s antwortet. RCU-Extraktion `downloadFromUrl` + `useBackupExport`,
  beide Call-Sites migriert. PR #772 (Issue #771).
- Kein-`Co-Authored-By` von Disziplin auf Enforcement umgestellt:
  `commit-msg`-Hook + CI-Job ueber alle PR-Commits (#768/#773).
- Der Hook hat danach jeden Commit blockiert: ausgeliefert mit
  `language: script`, aber Modus `100644` - "is not executable". Hotfix
  PR #776 (`language: system` + `python3`-Entry + Modusbit + 2 Tests).

## 10. #762 Translation-Group-Idempotenz + Altbestand (11:45)

- Befund: der Gruppen-Import legte pro `execute` die ganze Gruppe neu an -
  41 Katalogeintraege ergaben 112 Buecher. Die WBT-Ordnersignatur hasht den
  Staging-Verzeichnisnamen und ist fuer Git-Quellen zu fragil.
- Fix: stabile Identitaet `(repo_url, branch)` ueber `git_source_identifier`,
  `BookImportSource`-Zeile je importiertem Branch, `_existing_book_for()`
  ueberspringt bereits importierte Branches. Branchlose Anfragen matchen
  ueber Praefix.
- Nebenfund: `rstrip(".git")` frass Zeichen aus der Menge `{.,g,i,t}` -
  ersetzt durch `removesuffix`.
- Altbestand: `scripts/backfill_import_sources.py` (idempotent, `--dry-run`,
  Slug-Recovery ueber den Katalog). 21 Gruppenbuecher mit toten
  `/tmp/bibliogon_import_staging/...`-URLs repariert. Vorher DB-Backup.
- PR #774. Regressionsnachweis `make import-books-check`: 25/25 present,
  0 would import, 0 errors.

## 11. #775 Learnset-Follow-up (12:00)

- Schema-Drift wurde gemessen entschieden, nicht bevorzugt: kein PyPI-Paket,
  kein Build-Backend - also Nightly-Guard statt Dependency.
  `scripts/check_learnset_schema_drift.py` holt die gepinnte npm-Version
  ueber `npm pack` und vergleicht die drei vendorten Artefakte byteweise.
  Bewusst kein PR-Gate: ein fremdes Upstream-Release darf keinen fremden
  PR rot faerben.
- Version-Stamp: Pin in `vendor/engine-version.txt`, Export schreibt
  `generated_by`/`engine_version`/`schema_version` in die Manifest-Metadaten
  (dort `additionalProperties: true`).
- Zwei Punkte brauchten keinen Code: der Smoke-Lauf sammelt
  `e2e/smoke/learnset-export.spec.ts` schon ueber `testDir: "./smoke"`
  naechtlich ein, und das Desktop-Gating ist eine bewusste
  Maximal-Offline-Ausnahme (serverseitiger ZIP-Bau + Python-`jsonschema`).
  Beides dokumentiert, die `DESKTOP_ONLY`-Liste in der Architektur-Regel
  war ausserdem um drei Eintraege veraltet.
- PR #777.

## Summary

- Gemergt auf develop: #759 (Bulk-Import-Script), #767 (#765 Banner),
  #766 (#763 plugin-learnset Phase 1), #773 + #776 (#768 Hook-Enforcement
  plus Hotfix), #774 (#762 Idempotenz), #777 (#775 Drift-Guard), #772
  (#771 Backup-Feedback).
- Offen: #769 und #770 (beide Frontend, CCW-Lane, bewusst aus #765
  herausgehalten). Lernset-Phase 2 bleibt blockiert bis zum
  Akzeptanztest mit zwei exportierten Lernsets in adaptive-learner.
- Regressionsnachweis nach dem Altbestands-Backfill:
  `make import-books-check CATALOG=book-catalog.yaml` meldet 25/25 present,
  0 would import, 0 errors.
- Offene CSV-Korrekturen (book-collection, Nutzer-Repo): Jaeger-Zeilen,
  political-profile-international, Titel-Drift eternity + ai-designs.
