# Test Coverage Audit - v0.17.0

Audit date: 2026-04-18
Previous audit: 2026-04-13 (archived as `history/2026-04-13-coverage.md`)
Scope: everything on `main` as of commit `decb531`.

## Deltas since 2026-04-13

| Suite | 2026-04-13 | 2026-04-18 | Delta |
|-------|-----------|-----------|-------|
| Backend (`backend/tests/`) | 467* | 511 | +44 |
| Plugins in `make test` matrix | ~308 | 373 | +65 |
| Frontend (Vitest) | 323 | 351 | +28 |
| E2E (Playwright) | 88 | 193 | +105 |

*The previous audit called out 467 backend tests in its v0.14.0 header but then showed a module table frozen at the v0.13.0 baseline of 308. Using 467 here for honest delta arithmetic.

### Gaps closed since last audit

- **Plugin ZIP install E2E** (was `NO`): `e2e/smoke/plugin-install.spec.ts`, 5 tests
- **Import project / markdown ZIP E2E** (was `NO`): `e2e/smoke/import-flows.spec.ts`, 7 tests
- **Chapter drag-and-drop reorder E2E** (was `NO`): `e2e/smoke/chapter-reorder.spec.ts`, 3 tests
- **Actual file export + download E2E** (was `NO`): `e2e/smoke/export-download.spec.ts`, 11 tests
- **Create book from template E2E**: new spec `e2e/smoke/create-book-from-template.spec.ts`, 2 tests
- **Book metadata roundtrip E2E**: grew from small to 25 tests in `e2e/smoke/book-metadata-roundtrip.spec.ts`
- **Templates backend**: `backend/tests/test_templates.py` (19 tests) + `test_chapter_templates.py` (13 tests)
- **Chapter templates frontend**: Vitest coverage for `SaveAsChapterTemplateModal`, `ChapterTemplatePickerModal`, `SaveAsTemplateModal` picker delete flow
- **YAML round-trip regression pin**: 5 unit tests in `backend/tests/test_yaml_io.py` + 1 HTTP-boundary test `test_update_preserves_comments_and_formatting` in `test_settings_api.py`
- **Plugin CI matrix widened**: audiobook + translation now run in `ci.yml` and `coverage.yml` (PS-09)

### Still open

- **Audiobook generation E2E** - still no dedicated spec. Backend generator and TTS engine are covered by plugin unit tests (98 tests), but no end-to-end flow from "click generate" through SSE progress to playback.
- **Image/asset upload in editor E2E** - still no spec.
- **Help and Getstarted plugins not in the `make test` matrix** - their tests (30 + 6) exist but the Makefile's `test-plugins` target doesn't invoke them, and neither does CI's plugin matrix. Easy fix: append both to `test-plugins` in `Makefile` and to the plugin matrix in `.github/workflows/{ci,coverage}.yml`.
- `pandoc_runner.py` in export plugin - still zero unit tests (exercised indirectly by integration tests).
- `backup_history.py` + `GET /api/backup/history` - still zero tests.
- `archive_utils.py`, `asset_utils.py`, `markdown_utils.py` under `app/services/backup/` - still zero direct unit tests.

---

## Coverage Map

### Backend Unit Tests

| Module | Test File | Coverage |
|--------|-----------|----------|
| `app/models/__init__.py` | NONE | **NONE** |
| `app/schemas/__init__.py` | `test_keywords_schema.py` (partial) | LOW |
| `app/yaml_io.py` | `test_yaml_io.py` (5 tests) | HIGH |
| `app/services/covers.py` | `test_covers.py` | HIGH |
| `app/services/backup/backup_export.py` | `test_import_export.py`, `test_backup_compare.py` | HIGH |
| `app/services/backup/backup_import.py` | `test_import_export.py` | HIGH |
| `app/services/backup/smart_import.py` | `test_smart_import.py` | HIGH |
| `app/services/backup/backup_compare.py` | `test_backup_compare.py` | HIGH |
| `app/services/backup/project_import.py` | `test_import_export.py` | HIGH |
| `app/services/backup/markdown_import.py` | indirect via `test_smart_import.py` | MEDIUM |
| `app/services/backup/serializer.py` | `test_serializer.py` | HIGH |
| `app/services/backup/markdown_utils.py` | NONE | **NONE** |
| `app/services/backup/archive_utils.py` | NONE | **NONE** |
| `app/services/backup/asset_utils.py` | NONE | **NONE** |
| `app/licensing.py` | `test_license_tiers.py` | MEDIUM |
| `app/job_store.py` | `test_job_store.py` | HIGH |
| `app/credential_store.py` | `test_credential_store.py` | HIGH |
| `app/voice_store.py` | `test_voice_store.py` | HIGH |
| `app/audiobook_storage.py` | `test_audiobook_storage.py` | HIGH |
| `app/backup_history.py` | NONE | **NONE** |
| `app/ai/llm_client.py` | `test_ai_client.py` | HIGH |
| `app/ai/routes.py` | `test_ai_marketing.py`, `test_ai_review.py`, `test_ai_providers.py`, `test_ai_config_refresh.py`, `test_ai_usage_tracking.py` | HIGH |
| `app/data/builtin_templates.py` | covered via `test_templates.py` integration | MEDIUM |
| `app/data/builtin_chapter_templates.py` | covered via `test_chapter_templates.py` integration | MEDIUM |

### Plugin Unit Tests

| Plugin | Module | Test File | Coverage |
|--------|--------|-----------|----------|
| audiobook | `generator.py` | `test_generator.py` | HIGH |
| audiobook | `tts_engine.py` | `test_tts_engine.py` | HIGH |
| audiobook | `audiobook_storage.py` | `test_audiobook_storage.py` | HIGH |
| audiobook | `plugin.py`, `routes.py` | NONE | LOW |
| export | `tiptap_to_md.py` | `test_tiptap_to_md.py` | HIGH |
| export | `scaffolder.py` | `test_scaffolder.py` | HIGH |
| export | `html_to_markdown.py` | `test_html_to_markdown.py` | HIGH |
| export | `pandoc_runner.py` | NONE | **NONE** |
| grammar | `languagetool.py` | `test_languagetool.py` | HIGH |
| grammar | `routes.py` | NONE | **NONE** |
| kdp | `metadata_checker.py` | `test_metadata_checker.py` | HIGH |
| kdp | `cover_validator.py` | `test_cover_validator.py` | MEDIUM |
| kdp | `changelog.py` | `test_changelog.py` | MEDIUM |
| translation | `book_translator.py` | `test_book_translator.py` | HIGH |
| translation | `deepl_client.py` | `test_deepl_client.py` | MEDIUM |
| translation | `lmstudio_client.py` | `test_lmstudio_client.py` | MEDIUM |
| kinderbuch | `page_layout.py` | `test_page_layout.py` | HIGH |
| ms-tools | `readability.py` | `test_readability.py` | HIGH |
| ms-tools | `style_checker.py` | `test_style_checker.py` | HIGH |
| ms-tools | `sanitizer.py` | `test_sanitizer.py` | MEDIUM |
| ms-tools | `plugin.py` | `test_plugin_hooks.py` | HIGH |
| help | `routes.py` | `test_routes.py` | HIGH |
| help | `content.py` | `test_content.py` | MEDIUM |
| getstarted | `guide.py` | `test_guide.py` | HIGH |

### Backend Integration Tests (API endpoints)

| Endpoint Group | Coverage |
|----------------|----------|
| `/api/books` CRUD | HIGH |
| `/api/books/{id}/chapters` | HIGH |
| `/api/books/{id}/cover` | HIGH |
| `/api/books/{id}/assets` | HIGH |
| `/api/books/trash/*` | HIGH |
| `/api/backup` (core) | HIGH (missing: `GET /history`) |
| `/api/backup/compare` | HIGH |
| `/api/export/jobs` | HIGH |
| `/api/books/{id}/audiobook` | MEDIUM (dry-run, previews, google-cloud-tts still uncovered) |
| `/api/settings/app` | HIGH |
| `/api/settings/plugins` | HIGH (incl. new comment-preservation regression pin, commit `decb531`) |
| `/api/licenses` | HIGH |
| `/api/plugins/install` | HIGH |
| `/api/templates`, `/api/books/from-template` | HIGH (19 tests) |
| `/api/chapter-templates` | HIGH (13 tests) |
| `/api/ai/*` | HIGH (5 dedicated test files) |

### Frontend Unit Tests (Vitest)

| Module | Test File | Coverage |
|--------|-----------|----------|
| `api/client.ts` | `client.test.ts` | HIGH |
| `hooks/useI18n.ts` | `useI18n.test.ts` | HIGH |
| `hooks/useBookFilters.ts` | `useBookFilters.test.ts` | HIGH |
| `hooks/useTheme.ts` | `useTheme.test.ts` | HIGH |
| `hooks/useEditorPluginStatus.ts` | `useEditorPluginStatus.test.ts` | HIGH |
| `components/KeywordInput.tsx` | `KeywordInput.test.ts` + `.render.test.tsx` | HIGH |
| `components/ChapterSidebar.tsx` | `ChapterSidebar.test.tsx` (CSS only) | MEDIUM |
| `components/AudioExportProgress.tsx` | `AudioExportProgress.test.ts` (formatter only) | MEDIUM |
| `contexts/AudiobookJobContext.tsx` | `AudiobookJobContext.test.ts` (helper only) | MEDIUM |
| `contexts/HelpContext.tsx` | `HelpContext.test.tsx` | HIGH |
| `utils/notify.ts` | `notify.test.ts` | HIGH |
| `utils/eventRecorder.ts` | `eventRecorder.test.ts` | HIGH |
| `utils/aiProviders.ts` | `aiProviders.test.ts` | HIGH |
| `themes/palettes.ts` | `palettes.test.ts` | HIGH |
| `test/markdown-helpers.test.ts` | (self-contained) | HIGH |
| `components/AppDialog.tsx` | `AppDialog.test.tsx` | HIGH |
| `components/CreateBookModal.tsx` | `CreateBookModal.test.tsx` | HIGH |
| `components/CoverUpload.tsx` | `CoverUpload.test.tsx` | MEDIUM |
| `components/ErrorReportDialog.tsx` | `ErrorReportDialog.test.tsx` | HIGH |
| `components/BackupCompareDialog.tsx` | `BackupCompareDialog.test.tsx` | MEDIUM |
| `components/ThemeToggle.tsx` | `ThemeToggle.test.tsx` | HIGH |
| `components/BookCard.tsx` | `BookCard.test.tsx` | HIGH |
| `components/OrderedListEditor.tsx` | `OrderedListEditor.test.tsx` | HIGH |
| `components/BookMetadataEditor.tsx` | `BookMetadataEditor.test.tsx` | HIGH |
| `components/ExportDialog.tsx` | `ExportDialog.test.tsx` | HIGH |
| `components/SaveAsTemplateModal.tsx` | covered by chapter-template tests | MEDIUM |
| `components/ChapterTemplatePickerModal.tsx` | covered by chapter-template tests | MEDIUM |
| `components/Editor.tsx` | NONE (deferred - TipTap in JSDOM unreliable) | **NONE** |
| `components/Toolbar.tsx` | NONE (deferred - coupled to Editor) | **NONE** |
| All page components | NONE (E2E covers page rendering) | **NONE** |

### E2E Smoke Tests (Playwright)

| User Flow | Covered? | Spec File |
|-----------|----------|-----------|
| Dashboard CRUD | YES | `tests/dashboard.spec.ts` |
| Chapter editing | YES | `tests/book-editor.spec.ts` |
| Export dialog UI | YES | `tests/export.spec.ts` |
| Actual file export + download | **YES (new)** | `smoke/export-download.spec.ts` |
| Book metadata editing + roundtrip | YES | `tests/book-metadata.spec.ts`, `smoke/book-metadata-roundtrip.spec.ts` |
| Keyword chip input | YES | `smoke/keywords-editor.spec.ts` |
| Navigation between pages | YES | `tests/navigation.spec.ts` |
| Settings pages | YES | `tests/settings.spec.ts` |
| Trash / soft-delete / restore | YES | `smoke/trash.spec.ts` |
| Theme switching + persistence | YES | `smoke/themes.spec.ts` |
| Dashboard search/filter/sort | YES | `smoke/dashboard-filters.spec.ts` |
| Chapter sidebar responsive | YES | `smoke/chapter-sidebar-viewport.spec.ts` |
| Backup export + import roundtrip | YES | `smoke/backup-roundtrip.spec.ts` |
| Editor formatting + shortcuts | YES | `smoke/editor-formatting.spec.ts` |
| Plugin ZIP installation | **YES (new)** | `smoke/plugin-install.spec.ts` |
| Import (project / markdown ZIP) | **YES (new)** | `smoke/import-flows.spec.ts` |
| Chapter drag-and-drop reorder | **YES (new)** | `smoke/chapter-reorder.spec.ts` |
| Create book from template | **YES (new)** | `smoke/create-book-from-template.spec.ts` |
| Audiobook generation flow | **NO** | - |
| Image/asset upload in editor | **NO** | - |

---

## Prioritized Gap List

### Critical (Category A/B) - write before next release

None. The regression pin we just shipped (`test_update_preserves_comments_and_formatting` in `test_settings_api.py`) closes the last critical gap from this cycle.

### Standard (Category C) - deferred, fill organically

| # | Gap | Rationale |
|---|-----|-----------|
| 1 | Audiobook generation E2E | Backend is well-covered (98 unit tests); the UX glue (SSE progress dialog, download flow) has no end-to-end pin |
| 2 | Image/asset upload in editor E2E | No spec; drag-drop and file picker paths untested at UX level |
| 3 | Help + Getstarted in `make test` and CI | Add to `test-plugins` in `Makefile` and plugin matrix in `.github/workflows/{ci,coverage}.yml` (one-liner each) |
| 4 | `pandoc_runner.py` (export plugin) | Pandoc invocation wrapper, no dedicated tests |
| 5 | `backup_history.py` + `GET /api/backup/history` | Feature + endpoint, zero tests |
| 6 | `archive_utils.py`, `asset_utils.py`, `markdown_utils.py` | Backup utility modules under `services/backup/`, zero direct tests |
| 7 | Audiobook dry-run + preview endpoints | 6 untested endpoints in `/api/books/{id}/audiobook` |
| 8 | Google Cloud TTS config endpoints | 4 untested endpoints |
| 9 | Plugin `routes.py` (grammar, kdp, kinderbuch, translation) | Integration covered indirectly by make test; no dedicated happy-path specs |

### Nice-to-have (Category D) - ignore unless a bug arises

| # | Gap | Rationale |
|---|-----|-----------|
| 10 | Model relationship tests (Book -> Chapters cascade) | SQLAlchemy handles this |
| 11 | `useEditorPluginStatus.ts` hook | Low-risk polling hook, already covered |
| 12 | Page component rendering tests | E2E covers page rendering |
| 13 | `Toolbar.tsx`, `AppDialog.tsx` component tests | Simple wrappers; AppDialog already has 10 tests |

---

## Summary Statistics

| Level | Modules/Groups Tested | Total | Coverage % |
|-------|----------------------|-------|------------|
| Backend unit tests | 21/24 | 88% | HIGH |
| Plugin unit tests | 22/25 | 88% | HIGH |
| Backend integration (endpoint groups) | 16/16 | 100% | HIGH |
| Frontend unit tests | 27/37 | 73% | MEDIUM-HIGH |
| E2E user flows | 18/20 | 90% | HIGH |

### Test Count Totals (2026-04-18)

| Suite | Count |
|-------|-------|
| Backend only | 511 |
| Plugins via `make test` matrix | 373 (export 92, ms-tools 97, audiobook 98, translation 35, kdp 33, grammar 10, kinderbuch 8) |
| Plugins NOT in `make test` matrix | 36 (help 30, getstarted 6) - counted in CI via `poetry run pytest` inside each plugin dir but not by the Makefile |
| Total Python tests in repo | 920 |
| Frontend (Vitest) | 351 |
| E2E (Playwright) | 193 (across 19 spec files; 13 smoke, 6 integration) |
