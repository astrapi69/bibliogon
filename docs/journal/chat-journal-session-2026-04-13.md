# Chat-Journal: Bibliogon Session 2026-04-13

Release v0.13.0, licensing removal, i18n completion, metadata improvements.

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

## 6. Backpage import investigation (no bug found)

- Reported: backpage_description and backpage_author_bio dropped during import
- Investigated all import paths: .bgb (serializer), .bgp (project_import), PATCH endpoint, frontend form
- Finding: all paths correctly handle both fields
- .bgb roundtrip verified via TestClient: create -> PATCH -> export -> delete -> import -> GET confirms fields preserved
- .bgp export gap was already fixed in commit 09e0030 (scaffolder writes cover-back-page-*.md files)
- BookCreate schema intentionally excludes backpage fields (only title/author/language needed for creation)
- Conclusion: no bug in current code. Original report likely caused by stale .bgp file from before the scaffolder fix, or a test artifact
- User will re-test with clean reproduction; case closed pending that verification
