# Backend-Test-Abdeckung Audit (2026-06)

Datum: 2026-06-15
Gemessen an Commit: `3b1f596f` (develop)
Kommando:

```bash
cd backend && poetry run pytest tests/ --cov=app --cov-report=term-missing
```

Testlauf: **2604 passed, 1 skipped** (397 s).
Gesamt-Abdeckung `app/`: **90,1 %** (12 615 / 14 000 Statements abgedeckt; 1 385 fehlend).

> Reiner Bericht. Kein Test-Code geschrieben. Priorisierung nach
> Wert-pro-Aufwand; externe-Service-Grenzen (TTS/Google/ElevenLabs/Git)
> sind bewusst niedriger priorisiert, weil sie ohne echte Credentials nur
> mit Mocks testbar sind.

---

## 1. Abdeckung pro Paket (Rollup)

| Paket | Statements | Abgedeckt | % |
|---|--:|--:|--:|
| `import_plugins` | 1152 | 1000 | 86,8 % |
| `middleware` | 80 | 70 | 87,5 % |
| `(root)` (`app/*.py`) | 1506 | 1326 | 88,0 % |
| `routers` | 4038 | 3605 | 89,3 % |
| `services` | 3948 | 3543 | 89,7 % |
| `schemas` | 1162 | 1055 | 90,8 % |
| `ai` | 889 | 819 | 92,1 % |
| `models` | 467 | 447 | 95,7 % |
| `repositories` | 685 | 677 | 98,8 % |
| `data` | 73 | 73 | 100,0 % |

Die Basis ist solide: Repository-Layer (98,8 %) und Models (95,7 %) sind
sehr gut abgedeckt. Die Lücken konzentrieren sich auf das `root`-Paket
(`app/*.py`-Einzeldateien), `import_plugins` und einzelne Router/Services
an externen Grenzen.

## 2. Module unter 85 % (>= 20 Statements) - die handlungsrelevante Menge

131 von 160 Modulen liegen bei >= 85 %. Die folgenden 27 sind die
relevanten Lücken:

| Modul | Zeilen | Abgedeckt | % | Lücken |
|---|--:|--:|--:|--:|
| `services/google_tts_setup.py` | 33 | 12 | 36,4 % | 21 |
| `routes_misc.py` | 31 | 17 | 54,8 % | 14 |
| `import_plugins/handlers/bgb_archive_reader.py` | 61 | 35 | 57,4 % | 26 |
| `routers/audiobook.py` | 225 | 131 | 58,2 % | 94 |
| `routes_admin.py` | 91 | 58 | 63,7 % | 33 |
| `logging_config.py` | 29 | 20 | 69,0 % | 9 |
| `services/audiobook_credentials.py` | 93 | 66 | 71,0 % | 27 |
| `services/git_sync_mapping.py` | 60 | 44 | 73,3 % | 16 |
| `routers/licenses.py` | 84 | 62 | 73,8 % | 22 |
| `paths.py` | 39 | 29 | 74,4 % | 10 |
| `import_plugins/overrides.py` | 59 | 45 | 76,3 % | 14 |
| `main.py` | 165 | 129 | 78,2 % | 36 |
| `services/ai_bulk_fill_jobs.py` | 106 | 83 | 78,3 % | 23 |
| `voice_store.py` | 60 | 47 | 78,3 % | 13 |
| `routers/git_backup.py` | 206 | 163 | 79,1 % | 43 |
| `services/story_entity_registry.py` | 59 | 47 | 79,7 % | 12 |
| `import_plugins/handlers/wbt_preview.py` | 75 | 60 | 80,0 % | 15 |
| `credential_store.py` | 123 | 99 | 80,5 % | 24 |
| `routers/assets.py` | 62 | 50 | 80,6 % | 12 |
| `import_plugins/handlers/wbt.py` | 187 | 152 | 81,3 % | 35 |
| `services/git_import_inspector.py` | 172 | 140 | 81,4 % | 32 |
| `routers/websocket.py` | 44 | 36 | 81,8 % | 8 |
| `services/git_book_serializer.py` | 80 | 66 | 82,5 % | 14 |
| `services/plugin_discovery.py` | 23 | 19 | 82,6 % | 4 |
| `routers/plugin_install.py` | 166 | 138 | 83,1 % | 28 |
| `ai/routes.py` | 239 | 201 | 84,1 % | 38 |
| `services/git_sync_unified.py` | 52 | 44 | 84,6 % | 8 |

## 3. Die 5 Module mit der niedrigsten Abdeckung

### 3.1 `services/google_tts_setup.py` - 36,4 % (fehlend: 27-28, 38-74)

**Ungetestet:** der komplette `seed_google_voices_sync()`-Body (Google-
Cloud-TTS-Voice-Seeding via `manuscripta.create_adapter` -> `list_voices`
-> DB-Replace) inklusive des `except`-Pfads (rollback + Fehler-Status), und
der `ImportError`-Zweig in `set_google_cloud_credentials_path()`.

**Charakter:** externe-Service-Integration + Error-Handling. Ohne echte
Google-Cloud-Credentials nur mit gemocktem Adapter testbar.

### 3.2 `routes_misc.py` - 54,8 % (fehlend: 25-32, 38-46, 52)

**Ungetestet:** die Happy-Paths von `GET /voices`, `POST /voices/sync` und
`GET /i18n/{lang}`. Dünne Delegations-Endpoints (an `voice_store` bzw.
`load_i18n`), aktuell ohne einen einzigen TestClient-Aufruf.

**Charakter:** schlichte Endpoint-Contracts. Trivial per `TestClient` +
gemocktem `voice_store` abzudecken. **Bestes Wert/Aufwand-Verhältnis.**

### 3.3 `import_plugins/handlers/bgb_archive_reader.py` - 57,4 % (fehlend: 22-33, 52-54, 67-68, 84-90, 94-95)

**Ungetestet:** `_parse_keywords_field` (alle Edge-Cases: JSON-String,
direkte Liste, Fallback bei kaputtem JSON), `_sha256_of_file`,
`_first_book_blob` (Multi-Book-Warnung + "kein book.json"-Pfad) und
`_book_count`.

**Charakter:** reine Funktionen, datenintegritäts-nah (`.bgb`-Backup-
Preview). Triviale Unit-Tests gegen kleine ZIP-/Dict-Fixtures, kein
Backend-Roundtrip nötig. **Hoher Wert / niedriger Aufwand.**

### 3.4 `routers/audiobook.py` - 58,2 % (fehlend: 94 Zeilen, u. a. 296-346, 452-515)

**Ungetestet:** die Datei-ausliefernden + löschenden Endpoints
(`/audiobook`, `/merged`, `/chapters/{filename}`, `/zip`, `/previews...`,
`/classify`) und die Provider-Config-Endpoints (Google/ElevenLabs). Die
Lücken sind vor allem die **404-/Leerzustands-Zweige** (kein Audiobook
persistiert, Datei nicht vorhanden) und die `classify`-Verzweigungen.

**Charakter:** gemischt. Die 404-/Leerzustands-Pfade sind billig
(`_verify_book_exists` + leeres Storage). Die Datei-Download-Happy-Paths
und die externen Config-Tests (Google-Credentials-Test) brauchen
Fixtures bzw. Mocks. **Größte absolute Einzel-Lücke der Top-5.**

### 3.5 `routes_admin.py` - 63,7 % (fehlend: 51, 101, 108-145, 155-178, 299-306)

**Ungetestet:** die Plugin-Status-Aggregation (`needs_service`-Health-
Check-Zweige: erreichbar / nicht erreichbar / Exception) sowie die
Endpoints `/plugins/manifests`, `/plugins/health`, `/plugins/errors`.

**Charakter:** Service-Health-Branches (mit gemocktem `manager` /
`plugin.health()`) plus drei triviale Read-Endpoints. **Mittlerer
Aufwand**; die drei Read-Endpoints sind Quick Wins.

## 4. Empfehlung - höchster Wert pro Aufwand

**Stufe 1 - Quick Wins (niedriger Aufwand, hoher Wert):**

1. **`routes_misc.py`** - 3 TestClient-Tests (`/voices`, `/voices/sync`,
   `/i18n/{lang}`), `voice_store` gemockt. Hebt das Modul von 55 % auf
   nahe 100 %. ~3 kleine Tests.
2. **`bgb_archive_reader.py`** - Unit-Tests für `_parse_keywords_field`
   (4 Edge-Cases), `_first_book_blob` (Multi-Book + leer), `_book_count`,
   `_sha256_of_file`. Datenintegritäts-nah, reine Funktionen. ~6 Tests.
3. **`routes_admin.py` Read-Endpoints** - `/plugins/manifests|health|errors`
   per TestClient. ~3 Tests.
4. **`routers/audiobook.py` 404-/Leerzustands-Pfade** - je ein Test gegen
   ein Buch ohne persistiertes Audiobook (`/audiobook`, `/merged`, `/zip`,
   `/previews`). Deckt einen großen Teil der 94 fehlenden Zeilen billig ab.

**Stufe 2 - mittlerer Aufwand:**

5. **`routes_admin.py` Health-Branches** - `needs_service`-Pfade mit
   gemocktem `plugin.health()` (ok / nicht erreichbar / Exception).
6. **`audiobook.py` Config-Endpoints** - ElevenLabs-Key set/get/delete,
   Google-Credentials-Status, mit gemockten Provider-Aufrufen.

**Stufe 3 - bewusst niedrige Priorität (externe Grenzen):**

7. `google_tts_setup.py` (Google-Cloud-Adapter), die Git-Sync/Backup-
   Services (`git_backup`, `git_import_inspector`, `git_sync_mapping`) und
   `audiobook_credentials.py` - nur mit umfangreichem Mocking sinnvoll
   testbar; geringerer Wert-pro-Aufwand als Stufe 1/2.

**Faustregel:** Die billigsten und wertvollsten Punkte sind Endpoint-
Contracts (`routes_misc`, `routes_admin`-Reads, `audiobook`-404-Pfade) und
reine Helfer (`bgb_archive_reader`). Sie heben drei der fünf schwächsten
Module ohne externe Abhängigkeiten deutlich an. Die TTS-/Git-/Provider-
Integrationen sind die teuersten und sollten zuletzt kommen.

## 5. Methodik-Hinweise

- `mutants/` (mutmut-Artefakt) wurde via `--ignore=mutants` ausgeschlossen;
  sonst bricht die Collection mit `ImportPathMismatchError` ab.
- Prozentwerte aus dem `coverage`-JSON-Report (nicht aus Grep abgeleitet),
  Statement-Coverage. Plugins sind hier nicht enthalten (`--cov=app`); sie
  laufen in der CI-Coverage-Matrix separat.
