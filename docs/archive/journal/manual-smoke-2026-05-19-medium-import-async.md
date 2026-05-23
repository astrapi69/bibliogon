# Manual smoke — Medium-Import v2 + Async-Progress (2026-05-19)

Scope: the three medium-import features shipped in this session
(MEDIUM-IMPORT-V2-01 + ASYNC-IMPORT-PROGRESS-01 +
MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01).

Run-through gate: **pass all GO criteria before authorizing
Stream 3 (v0.35.0 release cut)** per the v0.35.0 release-cut
handoff doc.

Estimated time: 10-15 min if everything works, 20-30 min if
something needs investigation.

---

## Prerequisites

1. **Bibliogon dev server running**:
   ```
   make dev
   ```
   Frontend at http://localhost:5173, backend at
   http://localhost:8000.

2. **Browser DevTools open** on the Network + Console panels
   for visibility on SSE events + the `/api/medium-import/*`
   calls. Filter Network by "medium-import" or "export/jobs".

3. **A Medium archive ZIP** ready for upload. Two options:
   - **A. Use the bundled fixture**:
     ```
     ls -lh e2e/fixtures/minimal-medium-export.zip
     ```
     2-post fixture (~10 KB). Fast smoke; doesn't exercise the
     large-archive UX feel.
   - **B. Use a real archive**: any user-owned Medium export
     ZIP. The actual UX-testing value lives here (200-post
     archives, image-download timing, real comment-classification).
     If none on hand, a copy of the 209-file production export
     under
     `/home/astrapi69/Downloads/medium-export-2b0d2a60a17096f8a5eda39b89fe9722e92245fab55862dc870ab3754baeaaf4/`
     is the canonical reference.

4. **Clean state** before each fresh-flow test:
   - Either reset the test DB (rare for smoke):
     `curl -X POST http://localhost:8000/api/test/reset`
     (only available in debug mode)
   - Or accept that the dedup-badge will fire on rows whose
     canonical URL already exists.

5. **Optional**: change language between flows to verify the
   8-catalog i18n keys land (settings cog → Language).
   Recommended pairs: DE + one of (ES / FR / EL / PT / TR / JA).

---

## Flow 1 — Dry-run preview happy path (MEDIUM-IMPORT-V2-01)

| # | Action | Expected |
|---|---|---|
| 1 | Navigate to `/articles/import/medium` | Page loads with header, settings card, upload card, "Vorschau & Auswahl" / "Preview & select" button (disabled) |
| 2 | Drag-and-drop or click-to-pick a Medium ZIP | File appears in upload zone with filename + size badge; Start button enables |
| 3 | Click "Vorschau & Auswahl" | Upload progress bar fires (determinate, %), then "Vorschau wird geladen …" / "Loading preview …" label appears |
| 4 | Wait for preview table to render | New "Vorschau & Auswahl" card appears below upload card; table shows one row per post; counter shows `N von N ausgewählt` / `N of N selected`; all checkboxes pre-checked |
| 5 | Inspect a row's columns | Checkbox · Title · Date (formatted local) · Language · Classification badge (Artikel / Kommentar) · Status badges (Duplikat for known canonical URL, Warnungen for walker warnings) |
| 6 | Hover a row | Background lightens; tooltip on title shows canonical URL |
| 7 | Uncheck one row's checkbox | Row visually dimmed (opacity 0.55); counter decrements; Import button label updates with new count |
| 8 | Click master checkbox (deselect all) | All rows dim; Import button disables |
| 9 | Re-click master checkbox | All rows re-check; Import button re-enables |
| 10 | Click "Abbrechen" / "Cancel" | Preview card unmounts; file STAYS in upload zone; Start button re-enabled for retry |
| 11 | Re-trigger preview from same file | Same flow; new preview_id under the hood |

**GO criteria**: rows visible, columns populated, deselect ticks the count, cancel preserves the file, re-trigger works.

**Likely fail modes**: empty table after "load preview" (backend rejected the ZIP — check Network 400 detail); checkbox-deselect not updating count (state-machine break); Cancel removing the file too (regression of v0.32.0 contract).

---

## Flow 2 — Async import with SSE progress (ASYNC-IMPORT-PROGRESS-01)

| # | Action | Expected |
|---|---|---|
| 1 | Continue from Flow 1 (preview table visible) | OK |
| 2 | Click "{N} Beiträge importieren" / "Import N posts" | Network tab shows: POST `/api/medium-import/import/async/{preview_id}` → 202 with `{job_id, status: "pending"}`; immediately followed by GET `/api/export/jobs/{job_id}/stream` (status pending, then connected as EventSource) |
| 3 | Watch the page below the preview table | "Vorschau wird geladen …" replaced by an async progress UI: determinate bar with `{current}/{total}` posts + percent, current filename below the bar, tally row at bottom (`{imported} importiert · {skipped} übersprungen · {errored} Fehler [· {imported_comments} Kommentare]`) |
| 4 | Watch the bar tick | For small fixtures (2 posts) bar fills in <1 sec; for real 200-post archives the bar advances per `post_done` / `post_skipped` event |
| 5 | Watch the tally row tick | Numbers tick up as events arrive; correct breakdown of imported vs skipped vs errored vs comments |
| 6 | Wait for completion | Result panel renders below; preview section + async-progress UI both unmount; file auto-clears from upload zone (regression-pinned v0.32.0 behavior preserved) |
| 7 | Inspect the result panel | Summary row: imported / skipped / errored counts; if comment-routing fired, also Kommentare-imported + Kommentare-übersprungen counts (RESPONSE-INTERFACE-SYNC-01) |
| 8 | DevTools: check the SSE stream events | EventSource events visible in Network → name → EventStream tab; sequence `start` → `post_start`/`post_done`/etc. → `done` → `stream_end`; final `stream_end` carries `status: completed` |
| 9 | Toast | "Import abgeschlossen: {N} importiert, {M} übersprungen, {K} Fehler." (notify.success when errored=0, notify.warning when errored>0) |

**GO criteria**: async progress UI replaces the synchronous spinner; counters tick visibly per post; result panel renders after stream_end; file auto-cleared.

**Likely fail modes**:
- Progress UI never appears → SSE subscription broken (check Console for EventSource errors)
- Counters frozen → state-machine doesn't fold events into live counters
- Result panel doesn't render → `getJobResult` 404/409 (check the dedicated `GET /api/medium-import/jobs/{id}/result` call in Network tab)
- File NOT cleared on success → v0.32.0 regression returned

---

## Flow 3 — Cancel mid-import

| # | Action | Expected |
|---|---|---|
| 1 | Use a LARGE archive (≥50 posts) so cancel-window is real | Preview + import-submission as in Flows 1+2 |
| 2 | Immediately after clicking Import, click "Import abbrechen" / "Cancel import" | Network: DELETE `/api/export/jobs/{job_id}` → 204; SSE stream emits `stream_end` with `status: cancelled` |
| 3 | Page state | Async-progress UI unmounts; preview table RE-APPEARS (not idle, not result) — user can re-select and retry without re-uploading |
| 4 | Preview cache | The preview_id is STILL valid (cache reaped only on success); retry from this state submits a new async job against the same cached ZIP |
| 5 | Counters before cancel | Reflect the posts that completed before the asyncio.sleep(0) yield-point caught the cancel; partially-imported posts are real DB rows (no rollback mid-post) |

**GO criteria**: cancel button is contextual ("Cancel" before import, "Cancel import" during); cancel returns to preview; re-attempt works.

**Likely fail modes**: cancel doesn't stop the worker (cooperative-cancellation contract broken); preview cache reaped on cancel (forces re-upload); cancel button still says "Cancel" during importing (label-swap broken).

---

## Flow 4 — F5 mid-import recovery (MediumImportJobContext)

| # | Action | Expected |
|---|---|---|
| 1 | Use a large archive so the import takes 10+ sec | Preview + import-submission as in Flows 1+2 |
| 2 | While async-progress UI is ticking, hit F5 | Page reloads. The context's mount-effect reads localStorage, finds the persisted `{jobId}` entry, reopens the EventSource against `/api/export/jobs/{jobId}/stream` |
| 3 | Page state after F5 | Page renders directly in the importing phase (NOT idle dropzone); async-progress UI mounts; events continue to fold into counters as they arrive |
| 4 | Wait for completion | Result panel renders as in Flow 2 |
| 5 | DevTools localStorage | Key `bibliogon.medium_import_job` is removed on stream_end so a second F5 after completion doesn't try to reconnect to a finished job |

**GO criteria**: F5 mid-import re-attaches to the running job; persistence cleared on completion.

**Likely fail modes**: F5 drops the user to the idle dropzone (context's mount-effect not firing OR localStorage write not happening at job start); localStorage still has the entry after completion (cleanup branch in stream_end handler broken).

---

## Flow 5 — Comment-routing surface (RESPONSE-INTERFACE-SYNC-01)

Requires a Medium archive that contains comment-shaped posts
(the walker's classification will fire). The 209-file
production export contains 11 such cases per the audit; the
2-post bundled fixture does NOT.

| # | Action | Expected |
|---|---|---|
| 1 | Upload a comment-containing archive, preview, import (Flows 1-2) | Same UX |
| 2 | After completion, inspect the result panel summary row | Two NEW count badges visible alongside the article counts: `{N} Kommentare importiert` / `{M} Kommentare übersprungen`. ONLY rendered when their respective counts > 0 (plain-article archives don't show them) |
| 3 | Two new collapsible sections at bottom of result panel | "Importierte Kommentare anzeigen ({N})" / "Übersprungene Kommentare anzeigen ({M})". Closed by default. |
| 4 | Click the imported-comments trigger | Section expands; each row shows filename + body_preview (or "—" when preview is empty) |
| 5 | Click the skipped-comments trigger | Section expands; each row shows filename + reason (`mode_skip` or `orphan_skip`) |
| 6 | Plain-article-only archive (no comments) | Result panel should look identical to the previous v2 shape — comment counts + sections hidden |

**GO criteria**: comment counts appear in summary when > 0; both collapsible sections behave; plain-article path unchanged.

**Likely fail modes**: counts visible even when 0 (rendering gate broken); sections empty when expanded (interface fields missing from response — re-check `api.mediumImport.importSelectedAsync` body shape).

---

## Flow 6 — i18n cross-language quick-check

Optional but high-value: switches make any missing-key
fallback obvious because non-default languages have NO
fallback string in the code.

| # | Action | Expected |
|---|---|---|
| 1 | Open Settings (cog icon), change Language to EN | Page re-renders in English |
| 2 | Navigate back to `/articles/import/medium` | Page header / upload card / preview button labels in English |
| 3 | Run Flows 1-2 partial (just into preview) | Preview table column headers in English (Title / Date / Language / Type / Status); badges in English (Article / Comment / Duplicate / N warnings) |
| 4 | Trigger async import | Progress UI labels in English (Import progress, {N} of {M} posts, {N} imported, etc.) |
| 5 | Result panel | All labels in English including comment counts + section triggers |
| 6 | Switch to another language (DE / ES / FR / EL / PT / TR / JA) | Each catalog should have native strings for every label encountered above |

**GO criteria**: no fallback English strings showing through in a non-EN language; no untranslated keys (no raw `ui.medium_import.foo.bar` showing up in the UI).

**Likely fail modes**: a label rendering as the i18n KEY (not the value) indicates a key typo or missing entry in that catalog.

---

## Aggregate GO / NO-GO summary

| Flow | GO criteria met? |
|---|---|
| 1. Dry-run preview happy path | ☐ |
| 2. Async import with SSE progress | ☐ |
| 3. Cancel mid-import | ☐ |
| 4. F5 mid-import recovery | ☐ |
| 5. Comment-routing surface | ☐ |
| 6. i18n cross-language | ☐ |

**Authorize Stream 3 (v0.35.0 release cut)** iff all six are
GO **AND** the parallel session's PB-PHASE4 Session 4c-B
smoke also passes.

If any NO-GO: pause Stream 3, surface the failure, and we
investigate. Per the lessons-learned rule "User-perceived bug
≠ code bug", run the diagnostic before assuming a code break.

---

## Quick-diagnostic crib

When something looks wrong, the per-layer test paths are
already green — so re-run them first to localise:

```
# Backend medium-import
cd backend && poetry run pytest tests/test_medium_import_*.py -q
# Plugin-only
cd plugins/bibliogon-plugin-medium-import && poetry run pytest tests/ -q
# Frontend medium-import
cd frontend && npx vitest run \
  src/contexts/MediumImportJobContext.test.tsx \
  src/components/medium-import/MediumImport*.test.tsx \
  src/api/client.medium-import.test.ts \
  src/pages/MediumImportPage.test.tsx
# E2E
cd e2e && npx playwright test --project=smoke smoke/medium-import-preview.spec.ts
```

If those are green and the manual UX is broken, the bug is
either in the SSE event-shape contract between worker and
context (Network → EventStream tab is the inspection surface)
or in a wiring step the unit tests don't reach (the
cross-layer Playwright spec is the cheapest catch).

---

## Origin commits (for `git bisect` if regression suspected)

- `fa0369e` — Async backend (importer.py async + endpoint + worker)
- `c380cc2` — Async frontend (context + page state-machine swap)
- `8595053` — Playwright extension
- `bd2b878` — i18n bundle (commit message describes Export-PDF labels but the diff also carries async-progress keys; see handoff doc for the shared-working-tree bundling note)
- `cb7edc5` — Response-interface-sync (TS interface + Result UI comment surfaces + i18n)
