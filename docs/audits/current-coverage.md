# Test Coverage Audit - v0.12.0

Audit date: 2026-04-12 (updated after Phase 3)
Baseline before all coverage work: 244 backend `make test`, 145 Vitest, 52 E2E.
Post-Phase 1+2: 308 backend (244+64), 145 Vitest, 57 E2E (52+5).
Post-Phase 3a: 308 backend, 246 Vitest (145+101), 57 E2E.
Post-Phase 3b: 308 backend, 283 Vitest (246+37), 57 E2E.
Post-Phase 4: 308 backend, 283 Vitest, 88 E2E (57+31).

---

## Coverage Map

### Backend Unit Tests

| Module | Test File | Coverage |
|--------|-----------|----------|
| `app/models/__init__.py` | NONE | **NONE** |
| `app/schemas/__init__.py` | `test_keywords_schema.py` (partial) | LOW |
| `app/services/covers.py` | `test_covers.py` | HIGH |
| `app/services/backup/backup_export.py` | `test_import_export.py`, `test_backup_compare.py` | HIGH |
| `app/services/backup/backup_import.py` | `test_import_export.py` | HIGH |
| `app/services/backup/smart_import.py` | `test_smart_import.py` | HIGH |
| `app/services/backup/backup_compare.py` | `test_backup_compare.py` | HIGH |
| `app/services/backup/project_import.py` | `test_import_export.py` | HIGH |
| `app/services/backup/markdown_import.py` | indirect via `test_smart_import.py` | MEDIUM |
| `app/services/backup/serializer.py` | `test_serializer.py` (10 tests) | HIGH |
| `app/services/backup/markdown_utils.py` | NONE | **NONE** |
| `app/services/backup/archive_utils.py` | NONE | **NONE** |
| `app/services/backup/asset_utils.py` | NONE | **NONE** |
| `app/licensing.py` | `test_license_tiers.py` (21 tests) | MEDIUM |
| `app/job_store.py` | `test_job_store.py` (14 tests) | HIGH |
| `app/credential_store.py` | `test_credential_store.py` (15 tests) | HIGH |
| `app/voice_store.py` | `test_voice_store.py` (8 tests) | HIGH |
| `app/backup_history.py` | NONE | **NONE** |
| `app/ai/llm_client.py` | `test_ai_client.py` (10 tests) | HIGH |
| `app/ai/routes.py` | NONE | **NONE** |

### Plugin Unit Tests

| Plugin | Module | Test File | Coverage |
|--------|--------|-----------|----------|
| audiobook | `generator.py` | `test_generator.py` | HIGH |
| audiobook | `tts_engine.py` | `test_tts_engine.py` | HIGH |
| audiobook | `audiobook_storage.py` | `test_audiobook_storage.py` | HIGH |
| audiobook | `plugin.py`, `routes.py` | NONE | LOW |
| export | `tiptap_to_md.py` | `test_tiptap_to_md.py` | HIGH |
| export | `scaffolder.py` | `test_scaffolder.py` | HIGH |
| export | `html_to_markdown.py` | `test_html_to_markdown.py` (26 tests) | HIGH |
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

| Endpoint Group | Routes Tested | Routes Untested | Coverage |
|----------------|--------------|-----------------|----------|
| `/api/books` CRUD | 5/5 | - | HIGH |
| `/api/books/{id}/chapters` | 7/7 | - | HIGH |
| `/api/books/{id}/cover` | 3/3 | - | HIGH |
| `/api/books/{id}/assets` | 5/5 | - | HIGH |
| `/api/books/trash/*` | 5/5 | - | HIGH |
| `/api/backup` (core) | 4/5 | `GET /history` | HIGH |
| `/api/backup/compare` | 1/1 | - | HIGH |
| `/api/export/jobs` | 4/4 | - | HIGH |
| `/api/books/{id}/audiobook` | 8/14 | dry-run, previews, google-cloud-tts | MEDIUM |
| `/api/settings/app` | 2/2 | - | HIGH |
| `/api/settings/plugins` | 9/9 | - | HIGH |
| `/api/licenses` | 3/3 | - | HIGH |
| `/api/plugins/install` | 3/3 | - | HIGH |

### Frontend Unit Tests (Vitest)

| Module | Test File | Coverage |
|--------|-----------|----------|
| `api/client.ts` | `client.test.ts` | HIGH |
| `hooks/useI18n.ts` | `useI18n.test.ts` | HIGH |
| `hooks/useBookFilters.ts` | `useBookFilters.test.ts` | HIGH |
| `hooks/useTheme.ts` | `useTheme.test.ts` (10 tests) | HIGH |
| `hooks/useEditorPluginStatus.ts` | `useEditorPluginStatus.test.ts` (11 tests) | HIGH |
| `components/KeywordInput.tsx` | `KeywordInput.test.ts` + `.render.test.tsx` | HIGH |
| `components/ChapterSidebar.tsx` | `ChapterSidebar.test.tsx` (CSS only) | MEDIUM |
| `components/AudioExportProgress.tsx` | `AudioExportProgress.test.ts` (formatter only) | MEDIUM |
| `contexts/AudiobookJobContext.tsx` | `AudiobookJobContext.test.ts` (helper only) | MEDIUM |
| `contexts/HelpContext.tsx` | `HelpContext.test.tsx` (6 tests) | HIGH |
| `utils/notify.ts` | `notify.test.ts` | HIGH |
| `utils/eventRecorder.ts` | `eventRecorder.test.ts` | HIGH |
| `themes/palettes.ts` | `palettes.test.ts` | HIGH |
| `test/markdown-helpers.test.ts` | (self-contained) | HIGH |
| `components/AppDialog.tsx` | `AppDialog.test.tsx` (10 tests) | HIGH |
| `components/CreateBookModal.tsx` | `CreateBookModal.test.tsx` (11 tests) | HIGH |
| `components/CoverUpload.tsx` | `CoverUpload.test.tsx` (8 tests) | MEDIUM |
| `components/ErrorReportDialog.tsx` | `ErrorReportDialog.test.tsx` (10 tests) | HIGH |
| `components/BackupCompareDialog.tsx` | `BackupCompareDialog.test.tsx` (7 tests) | MEDIUM |
| `components/ThemeToggle.tsx` | `ThemeToggle.test.tsx` (4 tests) | HIGH |
| `components/BookCard.tsx` | `BookCard.test.tsx` (11 tests) | HIGH |
| `components/OrderedListEditor.tsx` | `OrderedListEditor.test.tsx` (9 tests) | HIGH |
| `components/BookMetadataEditor.tsx` | `BookMetadataEditor.test.tsx` (19 tests) | HIGH |
| `components/ExportDialog.tsx` | `ExportDialog.test.tsx` (18 tests) | HIGH |
| `components/Editor.tsx` | NONE (deferred - TipTap in JSDOM unreliable) | **NONE** |
| `components/Toolbar.tsx` | NONE (deferred - coupled to Editor) | **NONE** |
| All page components | NONE (E2E covers page rendering) | **NONE** |

### E2E Smoke Tests (Playwright)

| User Flow | Covered? | Spec File |
|-----------|----------|-----------|
| Dashboard CRUD | YES | `dashboard.spec.ts` |
| Chapter editing | YES | `book-editor.spec.ts` |
| Export dialog UI | YES (UI only) | `export.spec.ts` |
| Actual file export + download | **NO** | - |
| Book metadata editing + roundtrip | YES | `book-metadata.spec.ts`, `book-metadata-roundtrip.spec.ts` |
| Keyword chip input | YES | `keywords-editor.spec.ts` |
| Navigation between pages | YES | `navigation.spec.ts` |
| Settings pages | YES | `settings.spec.ts` |
| Trash / soft-delete / restore | YES | `smoke/trash.spec.ts` |
| Theme switching + persistence | YES | `smoke/themes.spec.ts` |
| Dashboard search/filter/sort | YES | `smoke/dashboard-filters.spec.ts` |
| Chapter sidebar responsive | YES | `smoke/chapter-sidebar-viewport.spec.ts` |
| Backup export + import roundtrip | YES | `smoke/backup-roundtrip.spec.ts` |
| Editor formatting (bold, italic, headings, lists, etc.) | YES | `smoke/editor-formatting.spec.ts` |
| Toolbar keyboard shortcuts (Ctrl+B/I/U/Z) | YES | `smoke/editor-formatting.spec.ts` |
| Toolbar button state sync (active indicators) | YES | `smoke/editor-formatting.spec.ts` |
| Text alignment (center, right, justify) | YES | `smoke/editor-formatting.spec.ts` |
| Undo/Redo via toolbar and keyboard | YES | `smoke/editor-formatting.spec.ts` |
| Audiobook generation flow | **NO** | - |
| Plugin ZIP installation | **NO** | - |
| License activation/deactivation | **NO** | - |
| Import (project / markdown ZIP) | **NO** | - |
| Image/asset upload in editor | **NO** | - |
| Chapter drag-and-drop reorder | **NO** | - |

---

## Prioritized Gap List

### Completed (Critical - Category A/B)

All critical gaps were closed in Sessions 1-2 (2026-04-12):

1. ~~serializer.py tests~~ - 10 tests in `test_serializer.py`
2. ~~Backup export + import roundtrip E2E~~ - 5 tests in `smoke/backup-roundtrip.spec.ts`
3. ~~Trash endpoints integration tests~~ - 14 tests in `test_trash.py`
4. ~~html_to_markdown.py tests~~ - 26 tests in `test_html_to_markdown.py`
5. ~~License activation/deactivation integration~~ - 12 tests in `test_license_api.py`
6. ~~Plugin install/uninstall integration~~ - 15 tests in `test_plugin_install.py`
7. ~~Settings GET/PATCH integration~~ - 23 tests in `test_settings_api.py`

### Standard (Category C) - deferred, fill organically

| # | Gap | Rationale |
|---|-----|-----------|
| 8 | `useTheme.ts` hook tests | Theme logic + localStorage, currently NONE |
| 9 | `pandoc_runner.py` (export plugin) | Pandoc invocation wrapper, no tests |
| 10 | `backup_history.py` + `GET /api/backup/history` | Feature + endpoint, zero tests |
| 11 | `archive_utils.py`, `asset_utils.py`, `markdown_utils.py` | Backup utility modules, zero tests |
| 12 | Plugin `routes.py` files (grammar, kdp, kinderbuch, translation) | Plugin API endpoints, no dedicated integration tests |
| 13 | Audiobook dry-run + preview endpoints | 6 untested audiobook endpoints |
| 14 | Google Cloud TTS config endpoints | 4 untested endpoints |
| 15 | Plugin enable/disable settings endpoints | Settings plugin management |
| 16 | `ExportDialog.tsx`, `CreateBookModal.tsx` component tests | Complex form components, zero Vitest coverage |
| 17 | Actual file export E2E (trigger export, verify download) | Current E2E only tests dialog UI |

### Nice-to-have (Category D) - ignore unless a bug arises

| # | Gap | Rationale |
|---|-----|-----------|
| 18 | Model relationship tests (Book -> Chapters cascade) | SQLAlchemy handles this |
| 19 | `useEditorPluginStatus.ts` hook | Low-risk polling hook |
| 20 | Page component rendering tests | E2E covers page rendering |
| 21 | `Toolbar.tsx`, `AppDialog.tsx` component tests | Simple wrappers |
| 22 | Chapter drag-and-drop E2E | Reorder API tested; DnD is @dnd-kit |

---

## Summary Statistics

| Level | Modules/Groups Tested | Total | Coverage % |
|-------|----------------------|-------|------------|
| Backend unit tests | 16/20 | 80% | MEDIUM-HIGH |
| Plugin unit tests | 19/25 | 76% | MEDIUM-HIGH |
| Backend integration (endpoint groups) | 13/13 | 100% | HIGH |
| Frontend unit tests | 25/37 | 68% | MEDIUM-HIGH |
| E2E user flows | 19/20 | 95% | HIGH |

### Test Count Totals (post-sessions 1-2)

| Suite | Count |
|-------|-------|
| Backend + plugins (`make test`) | 308 |
| - Backend tests alone | 183 |
| - Plugin tests alone | 125 (export 63, grammar 10, kdp 33, kinderbuch 8, ms-tools 88, translation 35, audiobook 88, help ~12, getstarted ~8) |
| Frontend (Vitest) | 283 |
| E2E (Playwright) | 88 (52 existing + 5 backup + 31 editor) |
