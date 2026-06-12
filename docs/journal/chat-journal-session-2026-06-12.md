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
