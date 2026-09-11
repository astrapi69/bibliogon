# Bulk Import Stage 2: Wizard UI + Files (EPUB/DOCX)

**Status:** Exploration (Session-10 feature planning, 2026-09-11).
**Priority:** 3 of 3 (after [book-to-learnset-export.md](book-to-learnset-export.md)
and [author-promotion.md](author-promotion.md)).
**Prior stages:** stage 1 shipped 2026-09-11 (#758 script, #759 PR, #760
branch support, #761 author-shape fix) and imported the author's 42-book
catalog end-to-end.

## Goal

Lift the stage-1 script capability into the product: a bulk-import surface
in the UI that takes MANY sources at once - git repo URLs (with branches)
AND local files (EPUB/DOCX/Markdown/ZIP) - shows per-source progress, and
ends with an imported/present/errored report. Target audience: onboarding
authors who have their backlist as files (the "other authors have PDFs and
EPUBs lying around" use case), plus catalog-scale git users.

## Pre-audit: current state of the moving parts

### Import machinery (all shipped, stage 1 verified it at 42-book scale)

- Two-phase orchestrator: `POST /api/import/detect` (multipart file),
  `POST /api/import/detect/git` (`backend/app/routers/import_orchestrator.py:214`,
  with `branch` since #760), `POST /api/import/execute`
  (`import_orchestrator.py:283`) with duplicate_action create/overwrite/
  cancel + git_adoption.
- Duplicate identity: `BookImportSource` (`backend/app/models/__init__.py:520`)
  - sha256 for files, folder signature for cloned dirs (branch-distinct via
  the `<slug>@<branch>` staging name since #760).
- Format handlers: WBT (+ multi-branch translation-group import via
  `import_translation_group`, `backend/app/import_plugins/handlers/wbt.py:240`),
  markdown, markdown-folder, office (`handlers/office.py`: **DocxImportHandler
  and EpubImportHandler exist since CIO-04**, Pandoc-based), scrivener, bgb.
- Stage-1 script: `scripts/bulk_import_books.py` - catalog parsing,
  per-source isolation, present-vs-imported classification, report,
  `--dry-run`. Its loop IS the reference implementation for the backend
  bulk endpoint.

### Empirical lessons from the 42-book run (must shape stage 2)

1. **Catalog data drifts:** 5 of 45 CSV rows were wrong (renamed repo,
   stale branches, archived title). The UI must treat per-source errors as
   normal outcomes with actionable detail (stderr excerpt), never abort the
   batch.
2. **Multi-branch repos import as groups:** one execute on a repo with >=2
   translation branches imports EVERY branch (translation_group). A naive
   "one catalog row per branch" duplicates entire groups (produced 112 rows
   from 41 entries before the v3 catalog fix). Stage 2 MUST either
   deduplicate group-repos client-side before dispatch or - better - fix
   idempotency server-side: `import_translation_group` does not register
   per-branch `BookImportSource` rows today, so re-imports slip past the
   duplicate check. That server-side gap needs its own issue at
   implementation time (found 2026-09-11, run 3 evidence).
3. **Private repos need SSH:** https clones fail non-interactively
   (`could not read Username`); ssh URLs + the host agent work. The UI must
   surface this failure class with a "use the SSH URL" hint.
4. **Auth-shape variance in real metadata.yaml** (#761 fixed lists) - more
   real-world-shape fixes will surface as third-party files arrive; keep
   the per-source error isolation so one bad file never kills a batch.

### UI building blocks

- `ImportWizardModal` (tabbed File/GitHub/URL single-import; the trigger
  surfaces live on Dashboard + ArticleList).
- Medium import page precedent: bulk operations earn a page route with
  per-item progress + a 3-section result table (lessons-learned "Bulk
  operations earn page-route UX even when single-item siblings use
  modals") - stage 2 follows this, NOT a modal.
- Long-job pattern: SSE + context provider (AudiobookJobContext,
  BulkAiFillJobContext precedents; "SSE listener belongs in the context,
  not in the modal"). A 40-source batch runs minutes - same shape.
- Dropzone component exists (DropZone, used by the article-list import
  path - its refactor once cost a testid, see the v0.56.0 E2E lesson;
  pin testids per the namespace rule from day 1).

### PDF: deliberately OUT of scope for stage 2

- No PDF handler exists; Pandoc cannot read PDF. PDF is a layout format -
  text extraction loses chapter structure, headers/footers and hyphenation
  pollute the text, multi-column output is garbage.
- Decision ladder (from the 2026-09-11 brainstorming):
  (a) PDF-as-asset attach (book shell + PDF file) - honest, cheap;
  (b) lossy text import with heavy expectation management - own project;
  (c) wizard nudge "PDF detected - do you have the EPUB/DOCX? It imports
  losslessly" - best ROI, ships with stage 2 as a detect-time hint.
  Content-level PDF import stays a separate future exploration gated on
  real demand.

### Constraints

- Desktop-only for git (clone needs backend) - feature-strategy gating as
  with git-sync. File bulk-import COULD go client-side for EPUB later
  (stage 3: JSZip + DOMParser per the client-side Medium import precedent,
  Maximal-Offline direction); stage 2 ships the backend path first and
  keeps the PWA surface disabled-with-reason.
- E2E: data-testid namespace + positive coverage per the testid rules;
  specs live in `e2e/smoke/` and ride the same change as the feature.
- i18n: 8 catalogs; no hard time-bound strings ("larger batches take
  longer", per the user-facing-time-estimates rule).

## Proposal

### Backend: `POST /api/import/bulk` async job

Request: a list of sources `{kind: git|file_ref, git_url?, branch?,
git_adoption?, temp_ref?}` (files are uploaded first via the existing
detect staging to get temp_refs, or uploaded with the job - decide at
planning). The job loops detect -> execute per source with per-source
try/except (stage-1 semantics), emits SSE events
(`source_start/source_done/source_error/done`), persists a job report.
Reuses `job_store` + the SSE streaming shape from export jobs.

### Frontend: `/books/import/bulk` page

- Two input lanes on one page: repo-URL textarea (one per line,
  `url#branch` suffix syntax or a parsed table) + multi-file dropzone
  (.epub/.docx/.md/.zip; .pdf accepted but routed to the nudge banner).
- Progress list with per-source state, result table
  imported/present/errored (Medium-import pattern), errors with detail +
  retry-single.
- Job context provider + dock badge so navigation survives the run.

### Rollout

- **P1:** backend bulk endpoint + SSE job (git sources only) + page with
  URL lane - the stage-1 script becomes a thin client of it.
- **P2:** file lane (EPUB/DOCX/MD/ZIP) + PDF nudge.
- **P3 (separate exploration):** client-side EPUB path for the PWA.

## Open questions

1. Upload strategy for many files (sequential multipart per file vs one
   ZIP-of-files) - decide with real corpus sizes.
2. Server-side translation-group idempotency (pre-audit finding 2) - fix
   inside stage 2 or as its own prerequisite issue? Leaning prerequisite:
   it is a correctness gap independent of UI.
3. Catalog file (YAML) upload as a third lane for power users - cheap since
   the parser exists, but maybe script-only forever.

## References

- Stage 1: #758/#759/#760/#761; `scripts/bulk_import_books.py`
- Orchestrator: `backend/app/routers/import_orchestrator.py:214,283`
- Office handlers: `backend/app/import_plugins/handlers/office.py`
- Multi-branch: `backend/app/import_plugins/handlers/wbt.py:240`
- UX precedents: Medium import page; AudiobookJobContext SSE pattern
