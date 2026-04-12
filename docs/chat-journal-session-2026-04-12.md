# Chat-Journal: Bibliogon Session 2026-04-12

Test coverage audit, gap closure (Sessions 1-2), infrastructure setup, single-source-of-truth consolidation.

---

## 1. Test Pyramid Coverage Audit (10:00)

- Original prompt: Full test pyramid coverage audit across all levels (unit, integration, E2E), with inventory, gap categorization, and prioritized report.
- Optimized prompt: n/a - the prompt was already structured with clear deliverables per pyramid level.
- Goal: Identify gaps in test coverage, categorize by severity, produce an actionable report.
- Result:
  - Three parallel research agents inventoried backend units (20 modules), plugin units (25 modules), integration tests (13 endpoint groups), frontend units (37 modules), and E2E flows (20 user flows).
  - Coverage map produced with HIGH/MEDIUM/LOW/NONE per module.
  - 22 gaps identified, categorized into Critical (7), Standard (10), Nice-to-have (5).
  - Key findings: 4 endpoint groups with zero integration tests (trash, settings, licenses, plugin install), 2 critical-path modules with zero tests (serializer.py, html_to_markdown.py), frontend at 32% coverage (weakest level).
- Commit: none (report only)

---

## 2. Session 1 - Data Integrity Tests (10:15)

### 2a. Item 7: serializer.py unit tests

- Goal: Pin the backup serializer roundtrip (Book ORM <-> dict).
- Result:
  - 10 tests in `backend/tests/test_serializer.py`.
  - Covers: serialize all 39 fields, ISO timestamps, deleted_at exclusion, None optionals, full roundtrip, minimal restore with defaults, 3x missing required field (parametrized), legacy backup without audiobook fields.
  - Finding: 39 serialized keys (not 40 as initially estimated). deleted_at intentionally excluded. Timestamps not preserved on restore (fresh ORM defaults).

### 2b. Item 1: Backup export + import roundtrip E2E

- Goal: End-to-end data integrity test for the backup pipeline.
- Result:
  - 5 tests in `e2e/smoke/backup-roundtrip.spec.ts`.
  - Covers: full roundtrip (2 books with chapters + chapter types -> export -> wipe -> import -> verify + UI check), metadata preservation (subtitle, genre, series, ISBN, keywords), merge into non-empty DB, export/import button visibility.
  - Added `data-testid` to Dashboard: `backup-export-btn`, `backup-import-btn`, `backup-import-input`.
  - Uses Playwright's `request` API for export/import (avoids flaky file-picker), `page.goto` + testid for UI assertions.

### 2c. Item 2: Trash endpoints integration tests

- Goal: Integration tests for the soft-delete lifecycle.
- Result:
  - 14 tests in `backend/tests/test_trash.py`.
  - Covers: soft-delete moves to trash, excluded from normal list, not updatable after deletion, trash list empty by default, trash list filtering, restore (happy + 404 for nonexistent + 404 for active), permanent delete (single + cascade chapters + 404 for nonexistent + 404 for active), empty trash (happy + already empty).

### 2d. Item 6: html_to_markdown.py unit tests

- Goal: Pin the HTML-to-Markdown converter on the critical export path.
- Result:
  - 26 tests in `plugins/bibliogon-plugin-export/tests/test_html_to_markdown.py`.
  - Covers: h1-h6, paragraphs, bold/italic/code, mixed inline, links (with and without href), flat/nested/deeply-nested lists (correct 2-space indentation), standalone images, figures with/without captions, blockquotes, horizontal rules, line breaks, empty/plain/whitespace/triple-newline edge cases.
  - Organized by element type using test classes (TestHeadings, TestLists, TestFigures, etc.).

- Commit: `b99955e` chore(audits): establish audit documentation structure

---

## 3. Session 2 - System Integrity Tests (10:30)

### 3a. Item 3: License activation/deactivation integration tests

- Goal: Integration tests for the license HTTP layer (previously only unit-tested).
- Result:
  - 12 tests in `backend/tests/test_license_api.py`.
  - Covers: list empty, list valid/expired/trial keys, activate valid/invalid/expired/wrong-plugin keys, activate replaces existing, deactivate (happy + idempotent), full activate-deactivate roundtrip.
  - Approach: Patched `licenses_module._validator`/`_store` with temp-backed instances. Set `_manager = None` to skip plugin activation side effects.

### 3b. Item 4: Plugin install/uninstall integration tests

- Goal: Integration tests for ZIP plugin installation (writes to filesystem).
- Result:
  - 15 tests in `backend/tests/test_plugin_install.py`.
  - Covers: install valid ZIP (verify files + config on disk), reject non-ZIP/bad-ZIP/missing-yaml/missing-plugin-py/missing-init/path-traversal/invalid-name, overwrite existing version, uninstall removes files + config, uninstall 404/400, list empty/after-install/after-uninstall.
  - Built `_make_plugin_zip()` helper for constructing test ZIPs with controllable structure.
  - Redirected `_base_dir`/`_installed_dir` to `tmp_path`.

### 3c. Item 5: Settings GET/PATCH integration tests

- Goal: Integration tests for the settings API (zero coverage before).
- Result:
  - 23 tests in `backend/tests/test_settings_api.py`.
  - Covers: GET app settings (happy + missing file), PATCH app (language/author/ui/disk-persistence/preserve-unmentioned/empty-body), list plugin configs (happy + empty), create plugin config (happy + duplicate 409), get single (happy + 404), update plugin settings (happy + 404), delete (happy + 404), enable (happy + idempotent), disable (happy + idempotent), enable-disable roundtrip.
  - Same `tmp_path` redirect pattern. Seeded with realistic `app.yaml` and one plugin config.

- Commit: included in `b99955e`

---

## 4. Coverage Infrastructure Setup (10:45)

- Original prompt: Establish coverage infrastructure - audit docs, rule additions, ROADMAP phases.
- Goal: Persistent structure for tracking coverage over time.
- Result:
  - Created `docs/audits/current-coverage.md` with full v0.12.0 audit.
  - Created `docs/audits/history/2026-04-12-coverage.md` as frozen snapshot.
  - Added "Test coverage audits" section to `.claude/rules/ai-workflow.md` (when to run, format, file conventions, delta tracking).
  - Added "Coverage targets per module type" section to `.claude/rules/quality-checks.md` with specific numbers per category and the principle that frontend coverage is not subordinate to backend.
  - Added "Coverage Work" section to `docs/ROADMAP.md` with 4 phases (CW-01 to CW-24).
  - Updated stale test counts in CLAUDE.md, ai-workflow.md, quality-checks.md.
- Commits:
  - `b99955e` chore(audits): establish audit documentation structure
  - `da28ff4` docs(rules): coverage audit workflow and target percentages
  - `1e854c7` docs(roadmap): coverage work phases

---

## 5. Single Source of Truth for Test Statistics (11:00)

- Original prompt: Consolidate all test count duplications to one authoritative file.
- Goal: Eliminate drift between files that all hardcode test counts.
- Result:
  - Audited all .md files for hardcoded test counts. Found duplications in CLAUDE.md, ROADMAP.md, ai-workflow.md, quality-checks.md.
  - Removed hardcoded counts from all four files, replaced with references to `docs/audits/current-coverage.md`.
  - Historical documents (CHANGELOG, chat journals) left alone as they record point-in-time state.
  - ROADMAP CW milestone items kept as delivered-work descriptions (not live counters).
  - Added "Single source of truth for volatile statistics" rule to ai-workflow.md covering test counts, ChapterType list, i18n languages, and plugin catalog with canonical location table.
  - Verification grep confirmed zero hardcoded test counts remain in the four main files.
- Commits:
  - `2f1f67c` refactor(docs): consolidate test count references to single source
  - `a79908c` docs(rules): add single-source-of-truth rule for test statistics

---

## Session Summary

### Statistics

- **Commits:** 5 (`b99955e`, `da28ff4`, `1e854c7`, `2f1f67c`, `a79908c`)
- **New test files:** 7 (test_serializer.py, test_trash.py, test_license_api.py, test_plugin_install.py, test_settings_api.py, test_html_to_markdown.py, backup-roundtrip.spec.ts)
- **New tests written:** 105 (10+14+26+12+15+23+5)
- **Test count delta:** Backend+plugins 244 -> 308 (+64), Frontend 145 (unchanged), E2E 52 -> 57 (+5)
- **New documentation files:** 3 (current-coverage.md, history/2026-04-12-coverage.md, this journal)
- **Modified rule files:** 2 (ai-workflow.md, quality-checks.md)
- **Modified docs:** 3 (CLAUDE.md, ROADMAP.md, quality-checks.md)

### Key decisions

- **Single source of truth:** Test counts now live exclusively in `docs/audits/current-coverage.md`. All other files reference it.
- **Coverage targets codified:** Backend services >= 80%, frontend hooks >= 80%, frontend forms >= 60%. Frontend is not subordinate to backend.
- **4-phase coverage plan:** Critical (done), Standard (deferred), Frontend Focus (32% -> 60%+), Polish (E2E gaps).
- **Pre-audit pattern:** Before writing tests for a zero-coverage module, show the plan (what the module does, what to test, asymmetries). This caught the 39-vs-40 key count issue in serializer.py.

### Critical gaps closed

All 7 items from the audit's Critical list are now covered:
1. serializer.py (data integrity)
2. Backup roundtrip E2E (data integrity)
3. Trash endpoints (data safety)
4. html_to_markdown.py (export path)
5. License API (security)
6. Plugin install (filesystem safety)
7. Settings API (user preferences)
