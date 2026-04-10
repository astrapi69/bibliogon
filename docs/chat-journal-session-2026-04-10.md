# Chat-Journal: Bibliogon Session 2026-04-10

Dokumentation aller Prompts, Optimierungsvorschlaege und Ergebnisse.

---

## 1. ElevenLabs API-Key UI + persistente Audiobook-Ablage (fortgesetzt)

- Fortfuehrung der Session vom 2026-04-09. Commits 263715e + 882aed0 bereits gepusht.
- Siehe chat-journal-session-2026-04-09.md Eintrag #2 fuer Details.

---

## 2. Prefix-Format und Hintergrund-Fortschritt (fortgesetzt)

- Commits ba52fd7 + 2d4cf46 bereits gepusht.
- Siehe chat-journal-session-2026-04-09.md Eintrag #3.

---

## 3. Voice-Dropdown leakt Edge-Voices in andere Engines (fortgesetzt)

- Commits 4af6bac + f7a161f bereits gepusht.
- Siehe chat-journal-session-2026-04-09.md Eintrag #4.

---

## 4. Stimme mit Sprache im Dropdown

- Kleiner Follow-Up: `formatVoiceLabel(v)` zeigt jetzt "Katja (de-DE, Female)" statt nur "Katja (Female)".
- Commit: 9a1e81a

---

## 5. Google Cloud TTS Integration - Tranche 1

- Original-Prompt: Ausfuehrlicher Spec fuer Google Cloud TTS als Premium-Engine.
- Umfangreiche Rueckfrage-Runde: Scope-Analyse (10 Features in einem Prompt), 7 konkrete Fragen an den User.
- User-Entscheidungen: (1) Tranchen-Ansatz, (2) Credentials verschluesselt, (3) optionale Dependency mit lazy import, (4) Refactoring als eigener Commit vorab.
- Zweiter Prompt verwies auf manuscripta v0.7.0 (nicht installiert war 0.6.1). Check auf PyPI: v0.7.0 existiert und hat exakt die API die der Prompt annimmt (create_adapter, TTSAdapter, VoiceInfo, TTSError Hierarchie, tenacity Retry).

### Commit 1: chore: update manuscripta to ^0.7.0 (0949d09)
- pyproject.toml in audiobook + export Plugin auf ^0.7.0
- Direkte Deps auf edge-tts, gtts, pyttsx3, elevenlabs entfernt (manuscripta verwaltet sie)
- Import-Pfad-Fix: gtts_adapter -> google_translate_adapter, GoogleTTSAdapter -> GoogleTranslateTTSAdapter
- Test-Mock auf neuen Modulpfad angepasst

### Commit 2: refactor: delegate engines to manuscripta adapters (e69b4c7)
- tts_engine.py komplett umgeschrieben: alle 4 Engines delegieren jetzt an manuscripta.audiobook.tts.create_adapter() statt eigene Implementierungen
- Public API (TTSEngine, get_engine, ENGINES, set_elevenlabs_api_key) unveraendert
- adapter.speak() -> adapter.synthesize() (deprecated in 0.7.0)
- Tests: sys.modules-Patching ersetzt durch patch("manuscripta.audiobook.tts.create_adapter")

### Commit 3: feat: encrypted credential storage (3ab0167)
- Neues Modul backend/app/credential_store.py
- Fernet-Verschluesselung (AES-128-CBC + HMAC-SHA256) mit BIBLIOGON_CREDENTIALS_SECRET
- validate_service_account_json, save_encrypted, load_decrypted, load_to_tempfile, secure_delete, is_configured, get_metadata
- 16 Unit-Tests inkl. Roundtrip, Wrong-Secret, Null-Overwrite-Verification
- cryptography als Dependency in Backend + Audiobook-Plugin
- .gitignore Eintrag fuer google-credentials.enc

### Commit 4: feat: Google Cloud TTS engine + credentials UI + voice seeding (e7643c9)
- GoogleCloudTTSEngine in tts_engine.py (ID: "google-cloud-tts", lazy Import)
- AudioVoice.quality Spalte + Alembic-Migration c3d4e5f6a7b8
- voice_store.get_voices liefert quality im Response
- 4 neue Backend-Endpoints: POST/GET/DELETE/test /api/audiobook/config/google-cloud-tts
- Async Voice-Seeding als BackgroundTask nach Upload
- Frontend: GoogleCloudTTSPanel in Settings (File-Upload, Status-Polling, Test, Remove)
- "google-cloud-tts" in beiden Engine-Dropdowns
- AudiobookVoice.quality + formatVoiceLabel zeigt Quality-Tier
- API-Client: 4 neue Methoden + 2 TypeScript-Interfaces
- i18n: 14 neue Strings (google_*) in DE und EN

---

## 6. Google Cloud TTS Integration - Tranche 2

### Commit 5: feat: content-hash-based regeneration cache (126c1e6)
- should_regenerate() prueft .meta.json Sidecar (SHA-256 content hash + engine + voice + speed)
- generate_audiobook() bekommt cache_dir Parameter, _run_audiobook_job uebergibt uploads/{book_id}/audiobook/chapters/
- Cache-Hit: MP3 wird aus dem persistenten Verzeichnis kopiert statt neu generiert, "chapter_reused" SSE-Event
- Cache-Miss: MP3 wird generiert, .meta.json Sidecar geschrieben
- audiobook_storage.persist_audiobook() kopiert jetzt auch .meta.json Sidecars
- 8 neue Unit-Tests (should_regenerate fuer jeden Mismatch-Axis + Integration-Test mit gemocktem Engine)
- i18n: event_reused in DE + EN

### Commit 6: feat: cost estimation and savings tracking (0f9f890)
- Nach Export: Generator berechnet geschaetzte Kosten via manuscripta adapter.estimate_cost()
- "done" SSE-Event traegt cost_usd und saved_usd
- Progress-Dialog rendert: "Generierung abgeschlossen | Wiederverwendet: 12 | Kosten: ~$0.47 | Gespart: ~$1.87"
- Kostenlose Engines (Edge, gTTS, pyttsx3) geben None zurueck, werden ignoriert
- i18n: event_reused_count, event_cost, event_saved in DE + EN

---

## Zusammenfassung

### Commits (in chronologischer Reihenfolge)
1. 263715e - feat(audiobook): persistent file storage and ElevenLabs key UI
2. 882aed0 - docs: backfill commit hash
3. ba52fd7 - feat(audiobook): prefix log format and persistent background progress
4. 2d4cf46 - docs: backfill commit hash
5. 4af6bac - fix(audiobook): voice dropdown leaks Edge voices into other engines
6. f7a161f - docs: backfill commit hash
7. 9a1e81a - feat(audiobook): show language alongside voice name in dropdown
8. 0949d09 - chore(audiobook): update manuscripta to ^0.7.0
9. e69b4c7 - refactor(audiobook): delegate engines to manuscripta adapters
10. 3ab0167 - feat(audiobook): encrypted credential storage with Fernet
11. e7643c9 - feat(audiobook): Google Cloud TTS engine + credentials UI
12. 126c1e6 - feat(audiobook): content-hash-based regeneration cache
13. 0f9f890 - feat(audiobook): cost estimation and savings tracking

### Tests
- Start der Session: 422 Tests
- Ende der Session: 430 Tests (Backend 153, Plugins 188, Vitest 68, E2E 52)
- Neue Tests: +16 credential_store, +8 content-hash cache, +8 voice_store, diverse Test-Updates

### Hauptergebnisse
- Google Cloud TTS vollstaendig integriert (Engine, verschluesselte Credentials, UI, Voice-Seeding)
- Content-Hash-Cache spart TTS-Kosten bei unveraenderten Kapiteln
- Kostentransparenz im Progress-Dialog (Kosten + Ersparnisse)
- manuscripta 0.7.0 als TTS-Backend, eigene Engine-Implementierungen entfernt
- Voice-Dropdown-Bug gefixt (kein engine-agnostischer Edge-Fallback mehr)
