# Polish Audit: 2026-04-18

## Scope

Read-only scan of the repo for concrete polish candidates. Seven
categories covered: TODOs, deprecations, unused exports, hardcoded
strings, stale docs, test coverage gaps, existing audit items.

## Findings summary

### 1. TODOs / FIXMEs

- 1 match: `frontend/src/components/ConflictResolutionDialog.tsx:114`
  - "Save as new chapter" deferred from v1

### 2. Deprecations / warnings

- Backend: 0 deprecations
- 21 `ResourceWarning` emitted by `pytest -W default`:
  - 20x unclosed asyncio event loop in audiobook async tests
  - 1x unclosed file in `smart_import.py:66` (RESOLVED in commit
    `08ff3ba` on 2026-04-18)
- Frontend: 0 deprecations. Loud test output from happy-dom:
  `ECONNREFUSED 127.0.0.1:3000` + `AsyncTaskManager destroyed`
  messages on every run despite 397 passing tests. Source is a
  CORS/navigation test that fetches
  `http://localhost:3000/evil.com`.

### 3. Unused exports

Skipped. The grep heuristic was too noisy without an AST walker.
A future audit could use `ts-prune` or similar to get reliable
signal.

### 4. Hardcoded strings (i18n candidates)

- `frontend/src/pages/BookEditor.tsx:423` - "Front Matter"
  (RESOLVED in commit `989a7c8` on 2026-04-18)
- `frontend/src/pages/BookEditor.tsx:442` - "Back Matter"
  (RESOLVED in commit `989a7c8` on 2026-04-18)
- Other matches were proper nouns (Bibliogon, ElevenLabs, Flesch)
  and do not need i18n keys.

### 5. Stale documentation

Nothing truly stale. Oldest non-journal file:
`docs/help/en/plugins/ms-tools.md` (2026-04-10, 8 days old). All
other docs touched within the past week.

### 6. Source files without tests

Notable untested modules:

- `backend/app/licensing.py` - security-adjacent
- `backend/app/services/backup/asset_utils.py`,
  `archive_utils.py`, `markdown_utils.py`
- `backend/app/services/backup/project_import.py`,
  `markdown_import.py`, `backup_import.py`
- `backend/app/ai/llm_client.py`, `providers.py`

Absence from the test list is a signal, not proof of missing
coverage - some modules are tested indirectly through integration
tests.

### 7. Audit-flagged (from `current-coverage.md`)

- `pandoc_runner.py` in export plugin - zero unit tests
- `backup_history.py` + `GET /api/backup/history` - zero tests
- `archive_utils.py`, `asset_utils.py`, `markdown_utils.py` under
  `app/services/backup/` - zero direct unit tests
- Audiobook generation E2E - no dedicated spec
- Image/asset upload in editor E2E - no spec

## Prioritized candidates

| # | Area | Finding | Effort | Value | Status |
|---|------|---------|--------|-------|--------|
| 1 | ResourceWarning | Unclosed file at `smart_import.py:66` | Small | Medium | **Resolved 2026-04-18** (commit `08ff3ba`) |
| 2 | ResourceWarning | 20x unclosed asyncio loop in audiobook tests | Medium | Medium | Open |
| 3 | Frontend test noise | CORS/navigation test spams stderr | Small | Low-Med | Open |
| 4 | i18n | "Front Matter" / "Back Matter" hardcoded | Small | Medium | **Resolved 2026-04-18** (commit `989a7c8`) |
| 5 | Test coverage | `backup_history.py` zero tests | Medium | Medium | Open |
| 6 | Test coverage | `archive_utils.py` / `asset_utils.py` / `markdown_utils.py` | Medium | Medium | Open |
| 7 | Test coverage | `licensing.py` zero tests (security-adjacent) | Large | High | Open |
| 8 | TODO | Deferred "Save as new chapter" v1 in conflict dialog | Large | Low | Open |

## How to re-run this audit

Re-run the seven-category scan by pasting the "Polish Candidates:
Audit and Propose" prompt template. Categories and thresholds
should stay consistent across runs so deltas are comparable.
