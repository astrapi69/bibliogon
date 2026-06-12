# Chat journal - session 2026-06-12

## 1. Offline import: close the empty-state import-wizard leak (issue #74)

- Original prompt: "Import Offline implementieren ... Client-side
  Format-Detection, Import-Router, JSON + Medium funktionieren offline,
  nur `.bgb` bleibt hidden. Plus den 'Projekt importieren' Button finden
  und entweder client-side verdrahten oder per feature-strategy hidden
  machen."
- Optimized prompt: "Audit the offline (Dexie) import surfaces. The
  named prompt file is missing - reconstruct scope from code. Confirm
  which import paths already work offline, find any import-wizard trigger
  that still leaks `/api/import/*` offline, and gate it. Backlog anything
  that would need a new client-side engine."
- Goal: make project import behave correctly on the backendless build -
  no broken `/api/import/*` flow reachable offline.
- Result:
  - Evidence audit (the referenced `cc-prompt-import-offline.md` does not
    exist on disk / in git / in the backlog): the offline import story
    was already complete except one leak. JSON full-data backup import
    (`export/backupImport.ts` via Settings > Backups) and Medium import
    (`/articles/import/medium` via `medium-import/clientImport.ts`) both
    run through the storage seam offline. The project-import wizard hosts
    backend-only formats (Pandoc docx/epub, ZIP wbt/bgb, git URL) and is
    correctly `hidden` offline via the feature registry.
  - The single gap: the Dashboard empty-state button
    `dashboard-empty-import` ("Projekt importieren") was the only one of
    five wizard triggers not wrapped in `{!offline && ...}`. A fresh
    Dexie boot has zero books, so the empty state renders and the button
    is reachable; picking a file then hits `guardedFetch`. The two
    Dashboard header triggers and both ArticleList triggers were already
    gated.
  - Fix: wrapped the empty-state button in `{!offline && ...}`
    (`offline = useFeature(FEATURES.BGB_IMPORT).isHidden`), consistent
    with the other four sites. The wizard internals
    (`DetectingStep`/`ExecutingStep`) are now unreachable offline.
  - Regression pin in `e2e/smoke/offline-pwa.spec.ts` ("backend-only
    backup + import actions are hidden offline"): `dashboard-empty-import`
    must have `toHaveCount(0)` offline. Fails on pre-fix code.
  - Checks: `tsc --noEmit` clean; eslint + prettier clean on
    `Dashboard.tsx`. (The e2e spec's prettier warning is pre-existing and
    outside the pre-commit/Prettier scope.)
  - Filed `IMPORT-WIZARD-CLIENT-SIDE-MARKDOWN-01` (P5) for the deferred
    ambitious path (a client-side Markdown/TXT import inside the wizard) -
    a separate feature, not this bugfix.
- Commit: see branch `fix/import-wizard-offline-empty-state-leak`
  (Closes #74).

## Summary

- Commits: 1 (`fix/import-wizard-offline-empty-state-leak`).
- Issue: #74 opened + closed by the fix.
- Files changed: `frontend/src/pages/Dashboard.tsx`,
  `e2e/smoke/offline-pwa.spec.ts`, `docs/backlog.md`,
  `docs/journal/chat-journal-session-2026-06-12.md`.
- Net result: the project-import wizard is now fully offline-gated;
  JSON + Medium import continue to work offline through their own
  surfaces.

## 2. Import wizard works offline — client-side detection + routing (issue #76)

- Original prompt: "NICHT verstecken. IMPLEMENTIEREN. Maximal Offline heisst:
  die Funktion funktioniert, nicht 'der Button ist weg'." + a full spec
  (client-side format detection, import router, md/txt/html importers, offline
  dialog, .bgb the only gate). Plus a follow-up: the .bgb gate must use the
  feature-strategy library (`useFeature`/`<Feature>`), not an ad-hoc `offline`
  boolean (the point of #63).
- Goal: make the project-import flow actually WORK in Dexie mode instead of
  being hidden. Supersedes #74.
- Result:
  - Reverted #74: the empty-state "Projekt importieren" button (and the two
    header import triggers) are visible offline again and open a working
    client-side dialog.
  - New `frontend/src/import/`: `detectFormat.ts` (extension-first + content
    probe for json-backup/medium-zip), `htmlToTipTap.ts` (one DOM->TipTap
    walker serving both HTML and Markdown-via-`marked`; emits `imageFigure`),
    `chapterImporters.ts` (md/txt/html -> new book + chapter, or appended to an
    existing book, all via `getStorage()`), `importRouter.ts` (dispatch;
    `OfflineNotSupportedError` for `.bgb`, `UnknownFormatError` otherwise;
    reuses `importFullBackup` + the Medium client importer).
  - New `OfflineImportDialog.tsx`: detect -> "import as new book / chapter in
    existing book" for md/txt/html; direct flow for JSON backup + Medium; the
    `.bgb` path is gated through `<Feature id={FEATURES.BGB_IMPORT}>` (the
    library component, not a raw boolean) and shows the desktop-app hint.
  - Dashboard routes by `useStorageMode()`: `dexie` -> OfflineImportDialog,
    `api` -> the untouched backend ImportWizardModal. The import triggers no
    longer derive an `offline` boolean from BGB_IMPORT; that gate moved inside
    the dialog where it belongs.
  - New dependency: `marked` 16.4.1 (Markdown -> HTML; single package, 0 vulns).
  - i18n: 27 `ui.offline_import.*` keys in all 8 catalogs + reseed.
  - Tests: 26 Vitest cases across detect/html/importers/router (101 green in the
    touched/depended sweep). Offline E2E updated: import triggers now visible;
    a markdown file -> new book + chapter via Dexie; `.bgb` shows the hint.
    The spec's hard `route.abort('**/api/**')` gate enforces zero `/api`.
  - Removed the now-implemented `IMPORT-WIZARD-CLIENT-SIDE-MARKDOWN-01` backlog
    entry.
  - Backend import code unchanged; API-mode behaviour unchanged.
- Commit: branch `feature/import-wizard-offline-client-side` (Closes #76).
