# UX-Full-Audit — Bibliogon Frontend

**Date:** 2026-05-14
**Scope:** All 8 routes / 5 Surface Groups under `frontend/src/`
**Method:** Audit-B — running Bibliogon dev instance + 209-corpus + Playwright walkthrough + code inspection
**Corpus state:** 198 articles + 11 ArticleComments imported via `/api/medium-import/import`; 2 books pre-existing (untouched).

## Status

**🚧 IN PROGRESS** — Group 1 (Core Editors) walked; Groups 2-5 pending direction.

**Related bug closures during this audit cycle:**

- **Bug A (Articles-Trash Restore "broken" user report)** — resolved as **not a code bug**. Manual smoke against the running dev instance + corpus showed the restore POST fires correctly (workbox "No route found" was misread as blocking; the message is benign pass-through). The real signal in the user's report was the `[Violation] 'click' handler took 419ms` console line — perception-lag from chained roundtrips in `handleRestore`. Filed as `RESTORE-UX-FEEDBACK-01` (P3 IMPROVEMENT) in backlog; lessons-learned entry "Workbox 'No route found' is benign info, not a bug indicator" added.

## Severity rollup (Group 1 only, partial)

| Severity | Count |
|---|---:|
| BLOCKER | 0 |
| IMPROVEMENT | 4 |
| DEFER | 1 |

## Conventions to audit against (Pre-Inspection Step 0.2)

| Convention | Canonical | Used in |
|---|---|---|
| Dialogs | `AppDialog` + `useDialog` | 16 callsites (vs 27 custom-dialog markup outside AppDialog — at least some legitimate per-modal scope) |
| Bulk-destructive confirm | `TypeToConfirmDialog` | dedicated module |
| Toasts | `react-toastify` via `utils/notify.ts` | repo-wide |
| Selection | `useArticleSelection` / `useBookSelection` | 2 surfaces |
| Bar visibility at count=0 | unmount (Bibliogon's confirmed pattern) | both bars |
| Empty state | **NO shared `<EmptyState>` component** — 4 ad-hoc implementations | 4 surfaces |
| Loading state | mix of disabled button + inline text | scattered |
| i18n | `useI18n` + `t(key, fallback)` | 128 source files |

---

## Surface Group 1: Core Editors

Surfaces audited:
- ArticleEditor (`pages/ArticleEditor.tsx`, 1494 LOC, 38 testids)
- BookEditor (`pages/BookEditor.tsx`, 700 LOC, 0 testids)
- Shared Toolbar (`components/Toolbar.tsx`)
- TipTap shell (`components/Editor.tsx`)

Walkthrough spec: `e2e/tests/ux-audit-group1.spec.ts` (5 specs; 4 passed, 1 timed out on `.ProseMirror` rendering because the dev-DB book has 0 chapters — see G1-F2).

### G1-F1 — IMPROVEMENT — BookEditor lacks ALL testids (testability + parallel-surface parity gap)

**Evidence:** `frontend/src/pages/BookEditor.tsx` is 700 LOC and contains **zero `data-testid` attributes**. Parallel surface `pages/ArticleEditor.tsx` has 38 testids over 1494 LOC.

Per-page testid table:

| Page | LOC | testids |
|---|---:|---:|
| `ArticleList.tsx` | 1541 | 50 |
| `ArticleEditor.tsx` | 1494 | 38 |
| `Settings.tsx` | 2338 | 14 |
| `Dashboard.tsx` | 856 | 19 |
| `MediumImportPage.tsx` | 196 | 3 |
| **`BookEditor.tsx`** | **700** | **0** |
| **`GetStarted.tsx`** | **341** | **0** |
| **`Help.tsx`** | **114** | **0** |

**Why this matters:**
- E2E coverage cannot use testid selectors on BookEditor → falls back to CSS / text / structural locators which are brittle (per Bibliogon's own coding-standards rule: "E2E: data-testid selectors only, no brittle CSS or XPath").
- Parallel-surface inconsistency (Articles vs Books) — exactly the bug class that surfaced today's Articles-Trash Restore false-alarm and the BulkActionBar stale-state bug.
- No existing test surface to land regression-pin tests on BookEditor-specific bugs (the rule shipped in `e426f3c`'s predecessor: "Every bug fix ships its regression-pin test").

**Recommendation:** add testids to the structural BookEditor elements (chapter sidebar root, chapter list items, editor pane, metadata toggle, save badge, save button, kebab menu, version-history modal trigger). Mirror the naming convention from ArticleEditor (`book-editor-{role}` pattern, paralleling `article-editor-{role}`).

**Suggested resolution:** file as `BOOKEDITOR-TESTIDS-01` (P3, IMPROVEMENT), execute in a dedicated session. Effort: S-M (mechanical addition).

### G1-F2 — IMPROVEMENT — BookEditor has no empty-state UX when book has 0 chapters

**Evidence:** Dev DB book `0be7631d7fa54705b66ba3fd966a9f54` ("Nasenbohrer-Chronicles") has 0 chapters. Navigating to `/book/{id}` doesn't render `.ProseMirror` (no chapter to edit). The Playwright walkthrough timed out at 15s waiting for the editor surface. Code grep on `BookEditor.tsx` for `empty|no.*chapter|create.*chapter` returns no explicit empty-state branch — the editor render path assumes at least one chapter exists.

**User-facing symptom:** a user creating a fresh book sees the BookEditor mount but no clear "Create your first chapter" affordance. The ChapterSidebar likely shows an empty list; the editor pane is presumably blank or unmounted.

**Why this matters:** first-time UX. A user who creates a book and lands on its editor with zero chapters needs an obvious next step. The current state is "figure out what to click" rather than "guided".

**Recommendation:** wire an `<EmptyState>` block (or use the existing pattern from Dashboard/ArticleList) into BookEditor for the zero-chapters case. Suggested CTA: prominent "Add your first chapter" button + a hint that templates are available via the `<NewFromTemplateButton kind="book">` flow that exists elsewhere.

**Suggested resolution:** `BOOKEDITOR-EMPTY-STATE-01` (P3, IMPROVEMENT). Effort: S.

### G1-F3 — IMPROVEMENT — Empty-state pattern is not shared across surfaces

**Evidence:** 4 surfaces implement their own empty-state markup (`Dashboard.tsx`, `ArticleList.tsx`, `components/CoverUpload.tsx`, `components/help/HelpPanel.tsx`). No shared `<EmptyState>` component. Each implementation has slightly different copy, illustration, CTA wiring.

**Why this matters:** as new list-view surfaces are added (e.g. Comments-Admin tab, future Publications-by-platform view), each will likely reinvent the empty state. Inconsistent first-impressions across the app.

**Recommendation:** extract a generic `<EmptyState title icon? body? cta?>` component to `frontend/src/components/EmptyState.tsx`. Migrate the 4 ad-hoc surfaces. Future surfaces use the shared component by default.

**Suggested resolution:** `EMPTYSTATE-EXTRACT-01` (P3, IMPROVEMENT). Effort: S-M (component + 4 migrations + visual-regression smoke test).

### G1-F4 — IMPROVEMENT — Toolbar copy split-button: testid mismatch with my initial audit guess (audit-process note, not a real bug)

**Evidence:** Toolbar.tsx testids are:
- `toolbar-copy-group` (wrapper)
- `toolbar-copy-markdown` (primary)
- `toolbar-copy-chevron` (dropdown trigger)
- `toolbar-copy-markdown-item` (dropdown item 1)
- `toolbar-copy-plain-item` (dropdown item 2)

I expected `toolbar-copy-button` for the primary action. The actual `toolbar-copy-markdown` is more descriptive (encodes the default-action format) but slightly diverges from the chevron's name.

**Why this matters (downgraded note):** naming-consistency only. `toolbar-copy-markdown` for the primary + `toolbar-copy-chevron` for the dropdown is fine. The dropdown items `toolbar-copy-markdown-item` and `toolbar-copy-plain-item` use a different suffix pattern (`-item`) than the trigger pair — that's a minor inconsistency.

**Recommendation:** non-essential. If a future session renames for symmetry, the canonical pattern would be `toolbar-copy-{action}` for triggers + `toolbar-copy-{action}-item` for dropdown items (current state already follows this — the apparent mismatch was my expectation, not the code's).

**Suggested resolution:** DEFER. No action needed.

### G1-F5 — IMPROVEMENT — ArticleEditor save-badge label is German-only at render time

**Evidence:** Playwright walkthrough surfaced the save-badge text as `"Alle Änderungen gespeichert"` — German fallback. The frontend's i18n is keyed (`useI18n` with `t(key, fallback)`), but the runtime locale resolution wasn't visibly switched during the walkthrough.

**Why this matters:** the user's locale was likely DE during the walkthrough (Bibliogon defaults to DE). This is correct behavior, not a bug. **Filed as DEFER / non-finding** unless we discover a hardcoded string elsewhere.

**Suggested resolution:** DEFER — verify during cross-cutting concerns sweep in Group 4.

---

## Group 1 summary

5 findings total (4 IMPROVEMENT, 1 DEFER, 0 BLOCKER).

**Top priority candidate from Group 1:** `BOOKEDITOR-TESTIDS-01` (G1-F1) — the testability + parallel-surface gap. Not BLOCKER because no user-visible bug is caused by it directly, but it amplifies the risk of future BookEditor bugs slipping past CI (no E2E coverage possible).

## Group 1 reproduction commands

```bash
# State: dev backend on :8000, frontend on :5173, corpus already imported.
cd e2e && npx playwright test tests/ux-audit-group1.spec.ts --project=chromium --reporter=line
# 4 specs pass (Articles dashboard, ArticleEditor open, ArticleEditor dark mode, Toolbar copy);
# 1 spec times out (BookEditor — book has 0 chapters, .ProseMirror never mounts).

# Screenshots produced at:
# docs/audits/ux-full-audit-2026-05-14-screenshots/group1-*.png
```

## Surface Group 2: Dashboards

Surfaces audited 2026-05-15: Articles Dashboard, Books Dashboard, Articles Trash, Books Trash, Comments Admin (in Settings), Medium Import.

Walkthrough spec: `e2e/tests/ux-audit-group2.spec.ts` (7 specs; all pass). State at run time: 198 articles + 11 ArticleComments + 2 books + 49 comments (where the 49 is `/api/comments` total — likely the 11 from import + reciprocal-reclassify activity).

### G2-F1 — IMPROVEMENT — Articles filter UI duplicates `DashboardFilterBar` shape with divergent testid namespace

**Evidence:** Two filter-bar implementations:

- **Books dashboard** (`Dashboard.tsx:602`) renders `<DashboardFilterBar>` from `components/DashboardFilterBar.tsx`. Testids: `filter-bar`, `filter-search-input`, `filter-sort-direction`, `filter-reset`.
- **Articles dashboard** (`ArticleList.tsx:788`) renders an **inline** `ArticleFilterBar` component defined in the same file (`ArticleList.tsx:1128`+, ~200 LOC). Testids: `article-list-filter`, `article-list-search`, `article-list-filter-{status}`, `article-list-filter-topic`, `article-list-filter-language`, `article-list-filter-series`, `article-list-filter-tag`, `article-list-sort-by`, `article-list-sort-order`, `article-list-filter-clear`.

The Articles filter bar has **6 filter slots** vs Books' search-only + sort + reset shape. Genuine feature divergence (Articles needs topic / language / series / tag filters; Books doesn't), so a 1:1 extraction would force generalization of `DashboardFilterBar` into a slot-based API.

**Why this matters:**
- Lower-priority extraction value than I initially suspected (real feature divergence, not pure duplication).
- BUT the inline definition keeps `ArticleList.tsx` at 1541 LOC — moving `ArticleFilterBar` to its own file would let the page focus on the orchestration logic.
- Testid namespace inconsistency means E2E specs for filters need different selectors per surface. Future cross-surface filter tests would benefit from at least namespace alignment.

**Recommendation:**
- DEFER the extraction-to-shared-component decision.
- IMPROVEMENT: move `ArticleFilterBar` to `frontend/src/components/articles/ArticleFilterBar.tsx`. Mechanical extraction; the component is already a pure function of `filters` (the hook return value).
- DEFER: consider testid-namespace alignment in a future audit pass.

**Suggested resolution:** `ARTICLEFILTERBAR-EXTRACT-01` (P3, IMPROVEMENT). Effort: S.

### G2-F2 — IMPROVEMENT — View-mode testid namespace differs between grid and list modes

**Evidence:** `BookCard.tsx:32` uses `data-testid="book-card-${book.id}"` for grid mode. `BookListView.tsx:88` uses `data-testid="book-list-row-${book.id}"` for list mode. Both render the same Book entity but expose it under different testid namespaces.

E2E consequence: any test that exercises a Book interaction (open editor, delete, etc.) must EITHER target both namespaces OR force the page into a specific view mode before running. The existing trash.spec.ts works around this by always testing in grid mode (the default for fresh sessions).

**Why this matters:** if a user has list mode persisted in localStorage (via `useViewMode`), the existing E2E specs targeting `book-card-{id}` selectors all silently skip the cards. The audit's own Group 2 walkthrough hit this exact issue: book count came back 0 because my Playwright session inherited list mode from a previous run.

**Recommendation:** add a stable `book-{id}` (or `book-tile-{id}`) testid to the wrapper of BOTH BookCard and BookListView row entries, in addition to the existing view-specific testids. E2E specs target the stable testid; view-specific testids remain for finer-grained selection.

Same pattern applies to articles (grid view + list view) if it exists — confirm in Group 5 cross-cut.

**Suggested resolution:** `VIEW-MODE-TESTID-PARITY-01` (P3, IMPROVEMENT). Effort: S.

### G2-F3 — IMPROVEMENT — Comments admin: 49 rows render in DOM unconditionally (no pagination / virtualization)

**Evidence:** The Comments-Admin tab in Settings renders all 49 comment rows in a single table without pagination, infinite-scroll, or virtualization. Page weight scales linearly with comment count.

**Why this matters:** at 49 rows it's fine; at 500+ rows the DOM weight + initial render time degrade. For a feature whose use case is "admin reviews all comments", the cap could be reached on a heavily-imported Medium archive (the v0.32.0 import auto-classifies short articles as ArticleComments; on a 1000-post Medium archive, comment count could be 50-100+).

**Recommendation:** add pagination OR virtualization OR a hard cap with a "Show all" affordance. Pagination is the lightest-touch fix.

**Suggested resolution:** `COMMENTS-ADMIN-PAGINATION-01` (P3, IMPROVEMENT). Effort: S-M. Trigger: first user with >200 comments OR first complaint about Settings sluggishness.

### G2-F4 — IMPROVEMENT — Filter reset button is conditional on active filters (good UX, but `filter-reset` testid never exists in default state)

**Evidence:** Books dashboard had `filter-reset=0` despite the dashboard rendering its filter bar correctly. Source inspection: the reset button only mounts when at least one filter is non-default. This is correct UX (no point in a Reset button when there's nothing to reset).

**Audit-process note:** my walkthrough briefly thought this was a missing testid. It's actually correct conditional rendering. Documenting so future audits don't repeat the false flag.

**Suggested resolution:** DEFER. No action needed.

### G2-F5 — DEFER — Filter state persistence on navigation: couldn't measure reliably with current testids

**Evidence:** Spec 02 attempted to type into `filter-search-input`, navigate away, navigate back, and check whether the search value persisted. The Articles dashboard's filter uses the `article-list-search` testid (not `filter-search-input`), so the spec failed to interact. Needs re-run with corrected selectors.

**Suggested resolution:** re-run spec 02 in Group 5 (cross-cutting) where filter state persistence will be checked as part of the cross-surface parity table. Defer per-group.

### G2-F6 — IMPROVEMENT — Medium Import page testid coverage incomplete

**Evidence:** `MediumImportPage.tsx` has 3 button testids (`medium-import-back`, `medium-import-home-btn`, `medium-import-start`) but the file input lacks one. The full result-table (imported / skipped / errored) also lacks granular testids — I couldn't find `medium-import-result-imported-count` or similar.

**Recommendation:** add testids to the file input + the three result-section counts. Modest effort, high test-coverage value.

**Suggested resolution:** `MEDIUM-IMPORT-TESTIDS-01` (P3, IMPROVEMENT). Effort: S.

---

## Group 2 summary

6 findings: 4 IMPROVEMENT + 1 DEFER (false-flag) + 1 DEFER (re-test pending) — 0 BLOCKER.

**Top priority candidate from Group 2:** G2-F1 + G2-F2 cluster — both touch the Articles-vs-Books parallel-surface asymmetry pattern. ArticleFilterBar extraction is small and isolated; the view-mode-testid parity is broader but cheaper than it sounds. Filed in backlog after full audit per yesterday's decision protocol.

## Group 2 reproduction commands

```bash
# Dev backend + frontend running (per yesterday's resume notes).
cd e2e && npx playwright test tests/ux-audit-group2.spec.ts --project=chromium --reporter=line
# 7 specs pass; key console outputs above.

# New screenshots:
# docs/audits/ux-full-audit-2026-05-14-screenshots/group2-*.png
```

## Pending groups (awaiting direction)

- **Group 3 Settings** — 7 tabs (app / ai / author / topics / plugins / comments / support), AI provider panel, plugin enable/disable, theme switcher
- **Group 4 Cross-Cutting** — dark mode parity, loading states, error states, empty states, toasts, dialogs, keyboard nav, i18n coverage
- **Group 5 Articles-vs-Books Parity** — table of parallel features with status per side. Will absorb the Articles-vs-Books findings from Groups 1 and 2 (BookEditor zero testids, ArticleFilterBar inline duplication, view-mode testid asymmetry).

## STOP gate

Group 2 complete. Awaiting direction.
