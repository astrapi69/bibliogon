# Test Session: 2026-04-28 — Session 2: smoke findings (partial)

**Tester:** Aster (manual smoke) + Claude (CC, fixes)
**Bibliogon version:** v0.24.0 (commit `2b7c577` at session start)
**Environment:** Linux 6.8.0-110-lowlatency, Chromium-class browser, DE locale
**Date:** 2026-04-28
**Duration:** ~30 min (partial — Session 2 continues at next slot)
**Session number:** 2/3 (partial)

## Pre-flight

- [x] App started cleanly via `make dev`.
- [x] Browser console clean on dashboard load (per Aster's report).
- [x] DE locale switched in Settings.

## Scope

In scope this slot:
- Manual smoke against template + book metadata flows.
- Fix any High-severity finding inline.

## Findings

### F-1: Book templates display in English despite DE UI

- **Severity:** Medium
- **Reproduction:**
  1. Settings → Language → Deutsch.
  2. Dashboard → "Neues Buch" → "Aus Vorlage".
  3. Observe template names + descriptions.
- **Expected:** Template names/descriptions in German.
- **Actual:** English strings everywhere.
- **Root cause:** `backend/app/data/builtin_templates.py` hardcodes
  English `name` + `description` strings. Seeded once into the DB
  at startup; no i18n lookup at render time.
- **Disposition:** Backlog entry **TPL-I18N-01** under Quality /
  Polish in `docs/backlog.md`. Three fix options sketched
  (DB columns vs i18n keys vs frontend translation map);
  recommendation is (c) frontend map keyed by template `name` slug
  with DB-string fallback. Effort: M.
- **Tracking:** `docs/backlog.md` TPL-I18N-01.

### F-3: WBT ZIP import drops every non-checked-out language branch

- **Severity:** High
- **Reproduction:**
  1. WBT git repo with multiple language branches (`main`,
     `main-de`, `main-es`, `main-fr`).
  2. ZIP it (including `.git/`).
  3. Dashboard → Import Book → upload the ZIP.
  4. Complete wizard.
- **Expected:** All four language branches imported as linked
  books with one shared `translation_group_id` (per PGS-04).
- **Actual:** Only the working-tree language imported; other
  three branches sit unused in the adopted `.git/`.
- **Root cause:** The ZIP-upload path goes through
  `WbtImportHandler` which only inspects the working tree.
  PGS-04 multi-branch logic (`translation_import.py`) is only
  reachable via `POST /api/translations/import-multi-branch`
  which takes a **git URL**. The two paths are not unified; the
  wizard has no UI to invoke multi-branch on a ZIP.
- **Test data:** `tmp/eternity-ebook.zip` has `main`/`main-de`/`main-es`/`main-fr`.
- **Disposition:** **GH#16 opened**, fix deferred. Larger scope
  (orchestrator extension + new fixture + E2E). Workaround
  documented in the issue: clone the repo locally, push to a
  git host, and use the Git-URL multi-branch path.
- **Tracking:** GH#16.

### F-4: WBT import drops `backpage_description` + `backpage_author_bio`

- **Severity:** High
- **Reproduction:**
  1. Import any current write-book-template project.
  2. Open the imported book.
  3. Metadata → General.
- **Expected:** `Rückseitenbeschreibung` and `Über den Autor`
  populated.
- **Actual:** Both empty. No backend warning.
- **Root cause:**
  [`backend/app/services/backup/project_import.py:139-141`](backend/app/services/backup/project_import.py#L139-L141)
  read the legacy filenames `cover-back-page-description.md` and
  `cover-back-page-author-introduction.md`. Current
  write-book-template convention is `backpage-description.md` and
  `backpage-author-description.md` — the importer matched neither
  shape against current exports.
- **Test data:** `tmp/eternity-ebook.zip` ships
  `config/backpage-description.md` + `config/backpage-author-description.md`,
  both lost on import.
- **Fix shipped:** `project_import.py` tries the new convention
  first, falls back to the legacy form. Both old and new exports
  import cleanly. Two new pytest cases in
  `test_wbt_metadata_propagation.py` pin the new convention; full
  file 14/14 green.
- **Tracking:** GH#17 (auto-closed via this commit's `Closes #17`).

### F-2: "Autoren in Einstellungen verwalten" link does nothing

- **Severity:** High
- **Reproduction:**
  1. Open existing book in editor.
  2. Metadata → General → Author field.
  3. Click "Autoren in Einstellungen verwalten" link.
- **Expected:** Navigate to Settings → Author tab.
- **Actual:** No navigation. No console error.
- **Root cause:** Two bugs in
  [`BookMetadataEditor.tsx:484-487`](frontend/src/components/BookMetadataEditor.tsx#L484-L487)
  - the click handler set `window.location.hash = "#/settings/general"`,
  but the app uses `BrowserRouter` (path-based, not hash-based).
  Plus the path `/settings/general` does not exist; only
  `/settings` does. Settings tabs were Radix-internal state with
  no URL deep-link.
- **Fix:** Two-part fix shipped this slot:
  1. `frontend/src/pages/Settings.tsx` reads `?tab=` from
     `useSearchParams` on mount, mirrors tab clicks back into the
     URL via `setSearchParams(..., {replace: true})`. New
     `VALID_SETTINGS_TABS` allowlist + `isSettingsTab` guard so
     stale URLs fall back to `app` rather than landing on an
     invalid Radix tab.
  2. `frontend/src/components/BookMetadataEditor.tsx` `AuthorSelectField`
     now uses `useNavigate("/settings?tab=author")` instead of
     hash assignment. `href` updated to the same path so right-
     click "Open in new tab" works correctly.
- **Tracking:** GH#15 (auto-closed via this commit's `Closes #15`).
- **Verified:** Manual recheck pending (Aster). Vitest 664/664 pass;
  tsc clean.

## Outcome

| Metric | Value |
|--------|-------|
| Tests in scope this slot | 2 (manual, surfaced as findings) |
| Tests run | 2 |
| Pass | 0 |
| Fail | 2 |
| Blocked | 0 |
| Skipped | 0 |

**Issues created:** GH#15 (closed in same session via fix).
**Backlog entries added:** 1 (TPL-I18N-01).
**Coverage matrix updated:** No (gaps unchanged; findings are
defects, not coverage gaps).

## Time tracking

Partial slot — full Session 2 continues later. ~30 min spent on
two findings + fixes. Remaining Session 2 budget rolls forward.

## Stop conditions hit

None. Aster paused for the day; Session 2 continues when signalled.

## Recommendations for resumed Session 2

1. Re-verify F-2 fix on actual hardware after `make dev` restart
   (URL ?tab=author selects Author tab; URL persists across reload;
   browser back button steps through tab history without polluting).
2. Add Vitest coverage for the new `?tab=` deep-link logic in
   Settings.tsx (initial render with valid + invalid + missing
   query param).
3. Continue with Tier A coverage gaps from
   `docs/testing/coverage-matrix.md`: article translation E2E,
   publications + drift E2E, plugin-git-sync commit + diff E2E.
4. Decide on TPL-I18N-01 fix option before next release if it
   blocks the DE-language UX story.
