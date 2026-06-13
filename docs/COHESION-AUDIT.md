# Cohesion Audit — Bibliogon

Date: 2026-06-13
Base commit: `eb85306a` (develop)
Tool: `scripts/check-file-sizes.sh` (WARN > 500 lines, ERROR > 1000 lines)

File size is a proxy for cohesion: a file far above its peers usually mixes
concerns (business logic + IO + rendering) and is hard to navigate, test, and
review. This audit measures the proxy, separates intentionally-large cohesive
files from genuine God-files, and is enforced going forward by a CI gate.

## What the guard measures

`scripts/check-file-sizes.sh` scans **production source** only (`*.py`, `*.ts`,
`*.tsx`, `*.js`, `*.jsx`). It excludes generated trees (`node_modules/`,
`dist/`, `build/`, `backend/mutants/` mutmut output, `frontend/dev-dist/`,
`site/` mkdocs build, coverage, migrations) and **test files** (`*.test.*`,
`*.spec.*`, `test_*.py`, `*_test.py`, `tests/`, `e2e/`). Tests are excluded
because a large test file mirrors the unit it covers; splitting it artificially
hurts rather than helps.

583 production files scanned at audit time.

## Three categories

| Category | List | CI effect | Meaning |
|---|---|---|---|
| Whitelisted | `.filesize-whitelist` | pass (SKIP) | Intentionally large, single-concern, cohesive. Splitting would worsen cohesion. |
| Grandfathered | `.filesize-baseline` | pass (BASE) | Existing mixed-concern God-files > 1000 lines. Tracked debt, **not** endorsed. Must shrink; no new entries. |
| New / over | (neither list) | **fail** (ERROR) | A new file > 1000 lines. Must be split or (only if genuinely cohesive) whitelisted with a reason. |

WARN (500–1000, not on either list) is advisory only — 45 files at audit time
(see below). It surfaces the next refactoring candidates without blocking.

## Whitelist (intentionally large, cohesive)

| File | Lines | Single concern |
|---|---|---|
| `backend/app/models/__init__.py` | 1526 | SQLAlchemy domain model (all entities, one declarative file — see CLAUDE.md "Data model") |
| `backend/app/schemas/__init__.py` | 2135 | Pydantic v2 request/response schemas + field validators |

Both are pure declarations: no IO, no business logic. The "all entities in one
file" shape is a deliberate Bibliogon convention; splitting would only hurt
discoverability.

## Grandfathered God-files (refactoring backlog)

These 20 production files exceed 1000 lines and carry mixed concerns. They are
locked into `.filesize-baseline` so the ERROR gate can become a real
merge-blocker *now* (preventing new God-files) without blocking unrelated PRs.
Each is a split-TODO. When one is refactored below 1000 lines, remove its
baseline entry (the guard emits a `NOTE` for stale entries).

| File | Lines | Notes |
|---|---|---|
| `frontend/src/api/client.ts` | 5241 | Flat typed API client; split per resource group (books / articles / authors / export / ...). |
| `frontend/src/components/BookMetadataEditor.tsx` | 2699 | Tabbed metadata editor; extract per-tab subcomponents. |
| `frontend/src/components/Editor.tsx` | 2043 | TipTap setup + serializers + word-count + draft recovery in one file. |
| `frontend/src/storage/dexie-storage.ts` | 1918 | All-entity IndexedDB seam; split per entity group. |
| `plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py` | 1887 | Layout rendering + PDF walker. |
| `frontend/src/pages/ArticleEditor.tsx` | 1636 | Editor page; extract sections. |
| `frontend/src/pages/ArticleList.tsx` | 1628 | List + inline `ArticleFilterBar` (see ARTICLEFILTERBAR-EXTRACT-01). |
| `frontend/src/components/import-wizard/steps/PreviewPanel.tsx` | 1622 | Import preview rendering. |
| `plugins/bibliogon-plugin-export/bibliogon_export/routes.py` | 1619 | Export route handlers; thin them per coding-standards "God Method". |
| `frontend/src/components/articles/ConvertToBookWizard.tsx` | 1336 | Hand-rolled wizard (XState candidate). |
| `frontend/src/components/ComicBookEditor.tsx` | 1323 | Comic editor surface. |
| `frontend/src/components/PageCanvas.tsx` | 1281 | Per-layout canvas rendering. |
| `frontend/src/pages/Dashboard.tsx` | 1276 | Books dashboard; inline filter/selection logic. |
| `plugins/bibliogon-plugin-comics/bibliogon_comics/comic_book_pdf.py` | 1262 | Comic PDF generation. |
| `frontend/src/components/CommentsAdminSection.tsx` | 1141 | Comments admin + trash lifecycle. |
| `frontend/src/pages/BookEditor.tsx` | 1119 | Editor shell + URL state. |
| `backend/app/main.py` | 1046 | App factory + lifespan + plugin wiring + 29 imports; extract setup helpers. |
| `frontend/src/components/ChapterSidebar.tsx` | 1033 | Chapter tree + tools group. |

(`models/__init__.py` and `schemas/__init__.py` are also > 1000 but are
whitelisted above, not grandfathered.)

## WARN tier (500–1000, advisory)

45 production files sit in the 500–1000 range — the next candidates as the
backlog above is worked down. The largest:
`frontend/src/components/Storyboard.tsx` (955),
`frontend/src/pages/GitBackupPage.tsx` (922),
`backend/app/services/git_backup.py` (909),
`frontend/src/components/LayoutConfigImageRow.tsx` (864),
`backend/app/routers/audiobook.py` (862). Full list via `make check-cohesion`.

## Import-density hotspots (coupling signal)

High import counts correlate with low cohesion / high coupling. Worst:
`frontend/src/components/Editor.tsx` (52 imports),
`frontend/src/pages/Dashboard.tsx` (47),
`frontend/src/pages/ArticleList.tsx` (46),
`frontend/src/App.tsx` (40),
`frontend/src/components/BookMetadataEditor.tsx` (33);
backend: `backend/app/main.py` (29),
`backend/app/routers/ai_template_bulk_fill.py` (18). These overlap the
grandfathered set — confirmation that the size proxy is tracking real coupling.

## Enforcement

- `.github/workflows/cohesion-check.yml` runs the guard on PRs touching source.
- `make check-cohesion` runs it locally.
- ERROR (a new file > 1000, not on either list) fails CI. WARN never blocks.

## Out of scope / follow-ups

- Cyclomatic-complexity gate (radon / ESLint `complexity`) — deferred (P2);
  no new dependency added in this change.
- Actually splitting the grandfathered files — separate, per-file work tracked
  by this backlog; remove each baseline entry as it lands.
