# Chat-Journal: Bibliogon Session 2026-04-13

Release v0.13.0, licensing removal, i18n completion, metadata improvements, coverage Phases 2-4 completion, roadmap cleanup.

---

## 1. Release v0.13.0

- Version bumped, CHANGELOG written, tag pushed, GitHub release created
- 47 commits since v0.12.0, 92 files, +12036/-2141 lines
- Highlights: dashboard filters, keyword editor, 3 new themes, 274 new tests

## 2. Journal path migration

- Moved chat-journal references from docs/ to docs/journal/ in 3 rule files

## 3. Licensing removal

- All 5 premium plugins changed to license_tier="core"
- LICENSING_ENABLED flag added to licensing.py (False)
- Licenses tab removed from Settings, premium badges removed
- /api/licenses endpoints return 410 Gone
- Help docs for licensing deleted, FAQ entries removed
- MN-01 added to ROADMAP, then moved to docs/explorations/monetization.md
- All premium/freemium references removed from user-facing docs
- Tests adjusted: 3 new 410 tests, 12 existing tests patched with LICENSING_ENABLED=True
- Commits: 5820bdc, 2dae0e1, 5da57fb, 161468e, eab5999, 8ca7825, 25a5fd1, b5ddf34

## 4. I-03: i18n completion for ES, FR, EL, PT, TR, JA

- Added 47-64 missing keys per language (error_report, help, editor, audiobook, export_dialog, metadata, settings, common)
- All 6 languages now have 0 missing keys vs EN reference
- _FULLY_MAINTAINED_LANGUAGES expanded to all 7 languages
- Commit: 2b7c28e

## 5. Metadata improvements

- HTML preview for Amazon book description with DOMPurify sanitization (5a98184)
- Backpage fields added to project export scaffolder (09e0030)
- B-03 and B-04 removed from ROADMAP as obsolete (8bef528)
- HTML preview extended to backpage_description and backpage_author_bio (451b4fd)
- Refactored to toggle-based single-view pattern: HtmlFieldWithPreview component shows either textarea OR preview in the same space (f7bdb2e)
- i18n keys renamed from html_preview_show/hide/hint to html_field_show_preview/show_source

## 6. Backpage import investigation (no bug found)

- Reported: backpage_description and backpage_author_bio dropped during import
- Investigated all import paths: .bgb (serializer), .bgp (project_import), PATCH endpoint, frontend form
- Finding: all paths correctly handle both fields
- .bgb roundtrip verified via TestClient
- Conclusion: no bug in current code, case closed

## 7. Coverage Phase 2: Standard (Category C) - fill organic gaps

All Phase 2 items completed. Delta: +70 tests.

| Item | Tests | Commit |
|------|-------|--------|
| CW-08: useTheme hook | 12 (pre-existing, marked done) | - |
| CW-09: pandoc_runner.py | +17 (6 helper functions) | f18e454 |
| CW-10: backup_history.py | +8 (add, list, clear, cap, corrupt) | 69e8f75 |
| CW-11: archive/asset/markdown utils | +26 (3 modules) | 69e8f75 |
| CW-12: kinderbuch + KDP routes | +10 (integration tests) | 0184582 |
| CW-13: audiobook dry-run | +4 (error paths) | 0184582 |
| CW-14: Google Cloud TTS config | +5 (config endpoints) | 0184582 |

## 8. Coverage Phase 3: Frontend Focus (remaining)

| Item | Tests | Commit |
|------|-------|--------|
| CW-17: actual file export E2E | +11 (6 formats + batch + errors + UI flow) | fc04d57 |

## 9. Coverage Phase 4: Editor E2E + remaining gaps

All Phase 4 items completed.

| Item | Tests | Commit |
|------|-------|--------|
| CW-26: toolbar data-testid migration | 30 testids added, 26 selectors migrated | 9a4aef0 |
| CW-23: import flows E2E | +7 (markdown, project roundtrip, history) | 835970b |
| CW-21: audiobook generation E2E | +4 (error paths, event fields) | 80bd5f7 |
| CW-22: plugin ZIP installation E2E | +5 (install/list/uninstall lifecycle) | 5751bbc |
| CW-24: chapter DnD reorder E2E | +3 (API reorder, reload, keyboard DnD) | 6b3b91d |

## 10. Roadmap cleanup: Phase 11 moved to explorations

- Phase 11 (multi-user and SaaS, v1.0.0) removed from ROADMAP.md
- Content preserved in docs/explorations/multi-user-saas.md
- Rationale: SaaS contradicts offline-first positioning, v1.0.0 should mean stable single-user, effort exceeds all prior work combined
- Removed SaaS references from CONCEPT.md, CLAUDE.md, ai-workflow.md, architecture.md, code-hygiene.md
- Commit: 519733b

---

## Session statistics

| Metric | Count |
|--------|-------|
| Commits | 18 (after journal entry from prior segment) |
| Backend tests | 374 (was 311) |
| Export plugin tests | 84 (was 67) |
| Frontend tests | 297 (was 292) |
| E2E smoke specs | 12 files (was 8) |
| New E2E tests | +31 across 4 new spec files |
| Coverage items closed | CW-08 through CW-14, CW-17, CW-21 through CW-26 |
| Exploration docs created | multi-user-saas.md |
| ROADMAP items removed | B-03, B-04, Phase 11 |
