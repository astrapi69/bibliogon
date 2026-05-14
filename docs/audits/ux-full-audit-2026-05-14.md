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

## Pending groups (awaiting direction)

- **Group 2 Dashboards** — Articles dashboard, Books dashboard, both Trash views, Comments Admin, Medium Import page
- **Group 3 Settings** — 7 tabs (app / ai / author / topics / plugins / comments / support), AI provider panel, plugin enable/disable, theme switcher
- **Group 4 Cross-Cutting** — dark mode parity, loading states, error states, empty states, toasts, dialogs, keyboard nav, i18n coverage
- **Group 5 Articles-vs-Books Parity** — table of parallel features with status per side

## STOP gate

Awaiting user direction on:
1. Whether to commit the partial Group 1 audit doc + the spec now, or only after full audit complete
2. Whether to continue with Group 2 in this same session OR pause + queue
3. Whether the 4 IMPROVEMENT findings should be filed in backlog immediately (G1-F1 + G1-F2 + G1-F3 as backlog items, G1-F4 + G1-F5 as documentation in the audit only)
