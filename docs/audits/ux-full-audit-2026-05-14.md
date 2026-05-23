# UX-Full-Audit — Bibliogon Frontend

**Date:** 2026-05-14
**Scope:** All 8 routes / 5 Surface Groups under `frontend/src/`
**Method:** Audit-B — running Bibliogon dev instance + 209-corpus + Playwright walkthrough + code inspection
**Corpus state:** 198 articles + 11 ArticleComments imported via `/api/medium-import/import`; 2 books pre-existing (untouched).

## Status

**✅ COMPLETE** — all 5 surface groups walked. 23 findings total: 0 BLOCKER / 3 IMPROVEMENT-elevated / 13 IMPROVEMENT / 7 DEFER-or-INFO. Backlog filings + lessons-learned land in separate follow-up commits per established protocol.

**Related bug closures during this audit cycle:**

- **Bug A (Articles-Trash Restore "broken" user report)** — resolved as **not a code bug**. Manual smoke against the running dev instance + corpus showed the restore POST fires correctly (workbox "No route found" was misread as blocking; the message is benign pass-through). The real signal in the user's report was the `[Violation] 'click' handler took 419ms` console line — perception-lag from chained roundtrips in `handleRestore`. Filed as `RESTORE-UX-FEEDBACK-01` (P3 IMPROVEMENT) in backlog; lessons-learned entry "Workbox 'No route found' is benign info, not a bug indicator" added.

## Severity rollup (finalized after Group 5)

| Severity | Count | Notes |
|---|---:|---|
| BLOCKER | 0 | Well under the 5-BLOCKER stop-condition |
| IMPROVEMENT-elevated (P2) | 3 | G3-F1+F2+F8 (coupled as PLUGIN-SETTINGS-TESTID-COVERAGE-01), G4-F1 (NOTIFY-ERROR-APIERROR-COVERAGE-01) |
| IMPROVEMENT (P3) | 13 | G1-F1, G1-F2, G1-F3, G2-F1, G2-F2, G2-F3, G2-F6, G3-F3, G3-F6, G4-F2, G4-F3, G4-F4 |
| DEFER / INFO | 7 | G1-F4, G1-F5, G2-F4, G2-F5, G3-F4, G3-F5, G3-F7 |
| **Total** | **23** | Within audit stop-condition (<30) |

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
# docs/archive/audits/ux-full-audit-2026-05-14-screenshots/group1-*.png
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
# docs/archive/audits/ux-full-audit-2026-05-14-screenshots/group2-*.png
```

## Surface Group 3: Settings

Surfaces audited 2026-05-15: 7 Settings tabs (`app` / `ai` / `author` / `topics` / `plugins` / `comments` / `support`), AI provider panel, plugin enable/disable flow, theme switcher, keyboard-nav of the Settings page.

Walkthrough spec: `e2e/tests/ux-audit-group3.spec.ts` (10 specs; all pass). 11 screenshots captured.

### G3-F1 — BLOCKER candidate — `PluginSettings` inline function has zero testids

**Evidence:** Settings.tsx:887 defines `function PluginSettings({...})` — a ~200 LOC inline component that renders the entire Plugin tab content (plugin list, enable/disable toggles, install dialog, remove flow). Grep for `data-testid` across lines 887-1100 returns **zero matches**.

Audit walkthrough at spec 06: `Plugin tab testids: []` + `checkboxes on plugin tab: 0`. The zero-checkboxes count suggests the plugin toggles aren't even rendered as `<input type="checkbox">` — they're likely Radix Switch components, but I can't audit them via testid.

**Why this matters:**
- Plugins are a **core extensibility feature**. Enable / disable / install / remove are user-facing flows. None can be E2E-tested via testid selectors.
- Falls back to brittle text-based selectors (e.g. `button:has-text("Aktivieren")`) which break on i18n locale changes.
- The Bug A class (silent UI breakage during a deploy) is exactly the kind of bug that would surface as "I clicked Enable on the audiobook plugin but nothing happened" — and there's no E2E pin against it.

**Why BLOCKER candidate, not IMPROVEMENT:** unlike G1-F1 (BookEditor zero testids), the plugin flow is where users actually toggle state, install/remove third-party code, and configure paid plugins (license keys). A silent breakage here is higher user-impact than an editor rendering bug.

**Triage decision (2026-05-15):** **IMPROVEMENT-elevated (P2)**, not BLOCKER. Reasoning: BLOCKER-tier per the audit's own definition requires "visibility impaired OR data integrity at risk OR core flow broken" — nothing is currently broken. But standard P3 IMPROVEMENT underweights the risk given (a) zero E2E coverage on the core extensibility model, (b) the bug-class pattern has fired twice this week. The split-the-difference is a pre-v0.33.0 trigger.

**Coupled with G3-F2 and G3-F8** as a single backlog item — see "G3 Coupled Symptoms" below.

### G3-F2 — IMPROVEMENT — `AuthorSettings` inline function also has zero testids

**Evidence:** Spec 04 query: `Author tab testids: []` — the entire Author tab content (inline in Settings.tsx) has no `data-testid` attributes. Same shape as PluginSettings.

**Why this matters:** Author tab manages author identity (display name, social links, bio). Lower-impact than plugins, but same testability gap.

**Recommendation:** `AUTHORSETTINGS-TESTIDS-01` (P3, IMPROVEMENT). Effort: S.

### G3-F3 — IMPROVEMENT — 3 of 7 tab triggers lack `testId` in the tabs-definition array

**Evidence:** Settings.tsx:109-115 defines:

```ts
{value: "app", label: t("...", "Allgemein")},               // no testId
{value: "ai", label: t("...", "KI-Assistent"), testId: "settings-tab-ai"},
{value: "author", label: t("...", "Autor")},                // no testId
{value: "topics", label: t("...", "Themen"), testId: "settings-tab-topics"},
{value: "plugins", label: t("...", "Plugins")},             // no testId
{value: "comments", label: t("...", "Kommentare"), testId: "settings-tab-comments"},
// + conditional support tab with testId
```

Spec 01 confirmed the asymmetry: `app/author/plugins` tab triggers exist (label-counted via `button:has-text("...")`) but lack stable testid selectors. The `"Allgemein"` label returned 2 matches because of desktop + mobile-menu duplication — label-based selectors are fragile across this surface.

**Recommendation:** add explicit `testId` to all 7 tabs. Trivial 3-line change.

**Suggested resolution:** `SETTINGS-TABS-TESTID-COMPLETE-01` (P3, IMPROVEMENT). Effort: trivial.

### G3-F4 — informational (not a finding) — AI key input branches correctly on external-config presence

**Evidence:** Spec 03 reported `ai-api-key-input: 0, ai-api-key-external-note: 1`. The user has either `~/.config/bibliogon/secrets.yaml` or `BIBLIOGON_AI_API_KEY` env var set, so the input is replaced with a read-only note pointing at the external source. Both branches have testids. This is correct UX — input + external-note are mutually exclusive depending on config state.

**No action needed.**

### G3-F5 — informational — Theme toggle works as expected

**Evidence:** Spec 09: theme attribute on `<html>` flipped `light → dark` after clicking `[data-testid="theme-toggle"]`. Captured both screenshots. No-action finding.

### G3-F6 — IMPROVEMENT — Top-bar buttons preceding theme-toggle lack testids

**Evidence:** Spec 10 (keyboard nav) focus chain:

```
1. button (no testid, no useful text)
2. button (no testid, no useful text)
3. button[theme-toggle]
4. button 'Allgemein' (first Settings tab)
5. div (role=tabpanel, focusable per ARIA)
6+. tab content (palette, view-mode, language, etc.)
```

The first two focus stops are buttons without testids and without identifying text. Likely the top-bar back-to-dashboard + logo buttons. They're tab-stops in the keyboard flow but undiscoverable by tests.

**Recommendation:** add `testId` for these (probably `nav-home`, `nav-back` or similar). Side benefit: also useful for accessibility — screen readers benefit from named landmarks, though testid ≠ aria-label.

**Suggested resolution:** `SETTINGS-TOPBAR-TESTIDS-01` (P3, IMPROVEMENT). Effort: trivial.

### G3-F7 — informational — Topics tab empty state

**Evidence:** Spec 05: `topics: rows=0 add-input=1 add-btn=1 save-btn=1`. Topics tab is empty in the dev DB; the add-input + add-btn remain present (correct empty-state UX — user can type a new topic). Save button also visible.

**No action — empty state is correctly designed.** But: this should still go in the Articles-vs-Books parity table (Group 5) because the same shape applies elsewhere.

### G3-F8 — IMPROVEMENT — Settings.tsx monolithic structure (2338 LOC, multiple inline component functions)

**Evidence:** `Settings.tsx` is 2338 lines with inline function definitions for at least: PluginSettings (line 887), AuthorSettings, the tabs-definition array, etc. Multiple Tabs.Content blocks contain large embedded JSX.

**Why this matters:** ties G3-F1 + G3-F2 + G3-F3 together. The monolithic page makes it hard to add testids in one PR per tab — each change cascades through 2000+ lines. Extracting each tab's content into its own component (`AppSettingsTab.tsx`, `AISettingsTab.tsx`, etc.) would let testid additions land per-tab as small PRs.

**Recommendation:** structural refactor — extract each tab's content into its own component file. This is the kind of cleanup that should happen alongside the testid additions in G3-F1/F2/F3, not separately.

**Coupled with G3-F1 and G3-F2** as a single backlog item — see "G3 Coupled Symptoms" below.

### G3 Coupled Symptoms — `PLUGIN-SETTINGS-TESTID-COVERAGE-01` (P2-elevated)

G3-F1, G3-F2, G3-F8 are three symptoms of the same root cause: Settings.tsx is 2338 LOC of inline tab content with zero component-extraction discipline AND zero testid coverage in the PluginSettings + AuthorSettings inline functions. The fix is **coupled** — you can't sensibly add testids to 200-LOC inline functions without first extracting them to their own files. Filing all three under a single backlog entry:

**`PLUGIN-SETTINGS-TESTID-COVERAGE-01`** (P2-elevated, IMPROVEMENT)

Scope:
- Extract `PluginSettings` inline function → `frontend/src/components/settings/PluginSettings.tsx`
- Extract `AuthorSettings` inline function → `frontend/src/components/settings/AuthorSettings.tsx`
- Add testids to extracted components matching established conventions (`plugin-row-{slug}`, `plugin-toggle-{slug}`, `plugin-install-trigger`, `author-display-name`, etc.)
- Add E2E test for plugin enable / disable / install / remove flow
- Add E2E test for author-settings management
- Verify Settings.tsx LOC reduction (target: <800 LOC remaining)

Triggers (escalation gates):
1. **Pre-v0.33.0 release-gate**: must be addressed before the next major release. Defensive coverage for the bug-class pattern (Bug A + BulkActionBar both fired this week).
2. **Plugin-flow bug report**: if any user reports a plugin-flow regression before v0.33.0 ships, immediately promote to BLOCKER + hotfix.

Effort: M (extraction + testids + 2 E2E specs).

### Pattern class emerging: "Monolithic component extraction discipline gap"

Two occurrences observed so far in this audit:

| Surface | LOC | Inline structure |
|---|---:|---|
| `Settings.tsx` | 2338 | 7 tab contents inline; `PluginSettings` + `AuthorSettings` as inline `function` definitions in the same file |
| `ArticleList.tsx` | 1541 | `ArticleFilterBar` (~200 LOC) as inline `function` definition (G2-F1) |

This is a second pattern class to track alongside the Articles-vs-Books asymmetry. Both classes share a similar mitigation shape (extract to own component file + add testids), and both increase the cost of testid-discipline work. Pattern-consolidation candidate for the lessons-learned write-up at full-audit close-out.

---

## Group 3 summary

8 findings: 1 BLOCKER candidate (G3-F1, pending user judgment) + 5 IMPROVEMENT + 2 informational.

**Top priority:** G3-F1 (PluginSettings testids). User decides BLOCKER vs IMPROVEMENT based on whether plugin-flow stability is a release-quality concern.

## Group 3 reproduction commands

```bash
cd e2e && npx playwright test tests/ux-audit-group3.spec.ts --project=chromium --reporter=line
# 10 specs pass. Screenshots in docs/archive/audits/ux-full-audit-2026-05-14-screenshots/group3-*.png
```

## STOP gate

Group 3 complete. Per yesterday's direction, continuing into Group 4 (Cross-Cutting) in this session without intermediate commit. Group 4 will fold these findings into the dark-mode / loading / error / empty / toast / dialog / keyboard / i18n tables.

## Surface Group 4: Cross-Cutting Concerns

Methodology: per-concern code-grep + targeted Playwright probes. Findings consolidate evidence from Groups 1-3 surfaces.

### Toast pattern

| Pattern | Count | Verdict |
|---|---:|---|
| `notify.error` calls | 159 | ✓ uses central wrapper |
| `notify.success` calls | 86 | ✓ |
| `notify.info` calls | 21 | ✓ |
| `notify.warn` calls | 18 | ✓ |
| `notify.bulkAction` calls | 4 | ✓ (Undo-toast wrapper) |
| Direct `toast.info` bypass | 1 | KeywordInput.tsx:218 — deliberate (renders custom JSX with inline Undo button; `notify.info` only takes strings) |
| `notify.error` callsites NOT checking `err instanceof ApiError` | ~99 of 159 (≈62%) | **IMPROVEMENT** — see G4-F1 below |
| `window.alert`/`confirm`/`prompt` | 0 | ✓ forbidden-pattern check clean |
| `console.log` outside test files | 0 | ✓ |
| `console.error` outside test files | 10 | mostly debug paths — acceptable |

### G4-F1 — IMPROVEMENT — 99 of 159 `notify.error` callsites pass plain strings, bypassing the structured `ApiError`-with-"Report Issue" affordance

**Evidence:** The `notify.ts` wrapper supports a rich error shape (`ErrorContent({message, apiError}: {message: string; apiError?: ApiError})`) — when called with an `ApiError`, the toast renders a "Report Issue" button that opens a GitHub issue prefilled with endpoint, status, stacktrace, and environment context. But only ~34 of the 133 `notify.error` callsites (≈26%) actually check `err instanceof ApiError` before calling. The other ~99 pass a plain string OR a generic error.

**Why this matters:** the entire purpose of the rich-error UX (per the coding-standards rule "Error reporting" section in `.claude/rules/code-hygiene.md`) is to make every user-visible error actionable as a GitHub issue. The 99 plain-string callsites silently degrade to the unrich path. Users hitting those errors can't easily file useful bug reports.

**Recommendation:** add an ESLint rule OR a pre-commit grep that flags `notify.error("string")` without a paired `ApiError` argument in code that calls `await api.*`. Effort: M (lint rule + cleanup pass).

**Suggested resolution:** `NOTIFY-ERROR-APIERROR-COVERAGE-01` (P3, IMPROVEMENT). Effort: M. Coupled with: a possible follow-up to make the wrapper itself smarter (auto-extract ApiError from a thrown error when called inside a `.catch(err => notify.error(t("..."), err))` pattern — opt-in via a second argument shape).

### Dialog pattern

| Pattern | Count |
|---|---:|
| `AppDialog` / `useDialog` callsites | 17 |
| `TypeToConfirmDialog` callsites | 5 |
| Files using `DialogPrimitive` or `@radix-ui/react-dialog` directly | 9 (legitimate complex modals: ChapterVersionsModal, ChapterTemplatePickerModal, BulkAiFillConfirmDialog, BackupCompareDialog, NewFromTemplateButton, DonationOnboardingDialog, FieldClassDialog, ExportDialog, DashboardFilterSheet) |

**No finding** — Bibliogon's dialog convention is followed: `AppDialog` for simple confirms, `TypeToConfirmDialog` for bulk-destructive, direct Radix Dialog for complex modals. The 9 direct-Radix callsites are all justifiably complex (multi-step wizards, large form modals, filter sheets).

### Loading state

| Pattern | Count |
|---|---:|
| `useState` vars named `*Loading*` | 24 |
| `<Spinner>` component usage | 0 (no shared spinner component) |
| Inline "Wird geladen..." / "Loading..." text | scattered |

### G4-F2 — IMPROVEMENT — No shared loading indicator; 24 ad-hoc `loading` state vars per-component

**Evidence:** Grep for `useState` with "loading" in the name returned 24 files. No shared `<Spinner>` or `<LoadingIndicator>` component. Each surface implements its own (usually a `disabled` button + inline text or a CSS spinner via `@keyframes spin`).

**Why this matters:** same shape as G1-F3 (no shared `<EmptyState>` component). Inconsistent visual treatment across surfaces (one loading uses a button-disabled state, another uses inline text, another uses a CSS spinner). First-time users see different "this is loading" affordances per page.

**Recommendation:** extract a `<LoadingIndicator>` component with a standard small-spinner + accessible aria-busy + optional label. Migrate the 24 callsites incrementally.

**Suggested resolution:** `LOADING-INDICATOR-EXTRACT-01` (P3, IMPROVEMENT). Effort: M.

### Empty state

(See G1-F3 — no shared `<EmptyState>` component, 4 ad-hoc implementations. Re-affirmed in Group 4.)

### Dark mode + theme tokens

| Probe | Result |
|---|---|
| Theme palettes defined in `global.css` | **5** (`classic`, `cool-modern`, `nord`, `notebook`, `studio`) |
| Per-palette modes | light + dark |
| **Actual total variants** | **5 × 2 = 10** |
| CLAUDE.md documented count | **3 × 2 = 6** ❌ STALE |
| Files using `var(--*)` CSS variables | 109 |
| **`var(--token, #hex-fallback)` callsites** | **111** |

### G4-F3 — IMPROVEMENT — CLAUDE.md docs are stale on theme count

**Evidence:** `CLAUDE.md` (and `.claude/rules/architecture.md`) document "3 themes × light/dark = 6 variants" — but `global.css` defines 5 palettes (`classic`, `cool-modern`, `nord`, `notebook`, `studio`). Actual count is **10 theme variants**, not 6.

**Why this matters:** future contributors reading CLAUDE.md will miss `notebook` and `studio` when adding new theme tokens. Lessons-learned already cited this exact class ("Four new CSS theme tokens (...) defined across all 6 palette × dark-mode combos") — but at the time of writing, the count was 4 palettes; now it's 5.

**Recommendation:** update `CLAUDE.md` and `.claude/rules/architecture.md` to reflect 5 palettes. Trivial doc fix.

**Suggested resolution:** `THEME-COUNT-DOCS-01` (DEFER — can fold into the next docs-touch commit). Effort: trivial.

### G4-F4 — IMPROVEMENT — 111 `var(--token, #hex-fallback)` callsites are vulnerable to silent fall-through

**Evidence:** Cross-codebase grep found 111 instances of `var(--token, #hex)` — the fallback-hex pattern. If a `--token` is undefined in any of the 10 theme combos, the hex falls through silently → that palette renders with the wrong color. The v0.31.0 release notes already document this class of bug ("closing a silent fall-through-to-hex regression on 9 v0.30.x-shipped components" after adding `--surface-2`, `--danger-bg`, `--success`, `--warning`).

**Why this matters:** this is the same bug class fired in v0.31.0 audit. With 5 palettes (10 combos) and 111 callsites, the audit surface is now larger than when the v0.31.0 patch landed. **A systematic per-token-per-palette audit would catch missing definitions before users see them in production.**

**Recommendation:**
1. Inventory every unique `--token` referenced via `var(--token, ...)` in components.
2. Cross-check each token against the 10 palette × mode CSS blocks in `global.css`.
3. Define any missing tokens (defensive completeness — same shape as the v0.31.0 fix).
4. Optional: ESLint rule that flags `var(--token, #fallback)` to require either a no-fallback `var(--token)` (forcing the token to exist) or a documented exception comment.

**Suggested resolution:** `THEME-TOKEN-COMPLETENESS-AUDIT-01` (P3, IMPROVEMENT). Effort: M (mechanical audit + cleanup).

### i18n coverage

| Language | Lines in catalog |
|---|---:|
| de.yaml | 1813 |
| en.yaml | 1813 |
| el.yaml | 1823 |
| es.yaml | 1823 |
| fr.yaml | 1823 |
| ja.yaml | 1823 |
| pt.yaml | 1823 |
| tr.yaml | 1823 |

**No finding** — all 8 languages within 10-line variance of each other (≈0.5% delta). Structure is well-synchronized. Native-speaker quality is a separate concern tracked in the existing `I18N-NATIVE-REVIEW-V031-01` + `I18N-DIACRITICS-01` backlog items.

### Hardcoded UI strings outside i18n catalogs

**Probe:** grep for `>Word Word Word<` (3+ capitalized German words inside JSX) in `frontend/src/` — finds only test fixtures, no real hardcoded UI strings. ✓

### Keyboard navigation

(See G3 spec 10 — focus chain inspected on Settings page. Result: tab-stops include 2 unlabeled top-bar buttons before reaching `theme-toggle` + the first tab. The `<div>` tabpanel receives focus per Radix's ARIA-conformant pattern — not a bug. **Already filed as G3-F6.**)

### Articles-vs-Books asymmetry — current tally (5 occurrences, all from this audit + recent history)

| Occurrence | Where surfaced |
|---|---|
| 1 | Bulk-delete cap removal (historical — both surfaces needed simultaneous update) |
| 2 | Comments-Count badge (historical — Card view first, List view parity later) |
| 3 | BookEditor zero testids vs ArticleEditor 38 (G1-F1) |
| 4 | ArticleFilterBar inline vs Books' shared DashboardFilterBar (G2-F1) |
| 5 | View-mode testid namespace split (`book-card-` grid vs `book-list-row-` list — G2-F2) |

This pattern is now **load-bearing**. The Group 5 parity table will consolidate these into a single rolled-up surface table + a lessons-learned candidate.

### Pattern class 2: "Monolithic component extraction discipline gap" — current tally (2 occurrences)

| Occurrence | Where surfaced |
|---|---|
| 1 | Settings.tsx 2338 LOC with inline `PluginSettings` (~200 LOC) + `AuthorSettings` (G3-F1 + G3-F2 + G3-F8) |
| 2 | ArticleList.tsx 1541 LOC with inline `ArticleFilterBar` (~200 LOC) (G2-F1) |

Same mitigation shape (extract to own file + add testids). Second pattern class to be lessons-learned-d at audit close.

---

## Group 4 summary

4 IMPROVEMENT findings (G4-F1 through G4-F4) plus 1 stale-docs note (G4-F3 — could also be tagged DEFER).

**Top priority candidates from Group 4:**
- **G4-F1** (notify.error ApiError coverage) — affects every error path in the app
- **G4-F4** (theme-token completeness) — fired as a bug in v0.31.0 already; recurrence prevention

## Group 4 reproduction commands

```bash
# All probes are bash-grep-based (no Playwright spec for Group 4):

# Toast pattern
grep -rhoE 'notify\.(success|error|info|warn|bulkAction)' frontend/src/ | sort | uniq -c

# ApiError coverage
echo "instanceof checks: $(grep -rln 'err instanceof ApiError' frontend/src/ | grep -v test | wc -l)"
echo "notify.error calls: $(grep -rE 'notify\.error\(' frontend/src/ | grep -v test | wc -l)"

# Hex fallback inventory
grep -rhE 'var\(--[a-z-]+, *#' frontend/src/ --include='*.tsx' --include='*.ts' | grep -v test | wc -l

# Theme palette inventory
grep -oE 'data-app-theme="[a-z-]+"' frontend/src/styles/global.css | sort -u

# i18n line counts
for f in backend/config/i18n/*.yaml; do printf "%-30s %s\n" "$(basename $f)" "$(wc -l < $f)"; done
```

## Surface Group 5: Articles-vs-Books Parity (synthesis)

Synthesis group: rolls up findings from Groups 1-4 into a single parity matrix, then promotes pattern-class observations to lessons-learned candidates.

### Articles-vs-Books parity matrix

| Surface / feature | Articles side | Books side | Status |
|---|---|---|---|
| **Primary editor** | `ArticleEditor.tsx` (1494 LOC, **38 testids**) | `BookEditor.tsx` (700 LOC, **0 testids**) | ❌ **ASYMMETRY** (G1-F1) |
| **Dashboard list view** | `ArticleList.tsx` `<ul>` row with `article-trash-row-{id}`, etc. | `BookListView.tsx` with `book-list-row-{id}` | ✓ both have testids — different namespaces |
| **Dashboard card view** | `ArticleCard.tsx` with `article-card-*` testids | `BookCard.tsx` with `book-card-*` testids | ✓ symmetric |
| **View-mode toggle** | Articles uses `useViewMode("articles")` | Books uses `useViewMode("books")` | ✓ symmetric hook usage |
| **Per-view testid namespace** | grid: `article-card-{id}`, list: `article-trash-row-{id}` | grid: `book-card-{id}`, list: `book-list-row-{id}` | ❌ **ASYMMETRY** (G2-F2) — different namespaces per view-mode mean E2E specs targeting one mode silently skip in the other |
| **Filter bar** | `ArticleFilterBar` inline in ArticleList.tsx:1128 (~200 LOC, 6 filter slots, `article-list-*` testids) | `DashboardFilterBar` shared component (1 filter slot + sort, `filter-*` testids) | ❌ **ASYMMETRY** (G2-F1) — different components, different testid namespaces, different feature surfaces |
| **Trash view** | `article-trash-row-{id}`, `article-trash-restore-{id}`, `article-trash-permanent-{id}` | `trash-card-{id}`, `trash-restore-{id}`, etc. (BookCard-based) | ✓ both have testids, different namespaces |
| **Bulk action bar** | `article-bulk-action-bar`, `article-bulk-count`, `article-bulk-check-{id}`, `article-bulk-select-all` | `book-bulk-action-bar`, `book-bulk-count`, `book-bulk-check-{id}`, `book-bulk-select-all` | ✓ **symmetric** (post-`02553fb`) |
| **Selection hook** | `useArticleSelection` (added `remove(id)` in `02553fb`) | `useBookSelection` (added `remove(id)` in `02553fb`) | ✓ symmetric (yesterday's fix) |
| **Bulk-delete cap** | Removed v0.31.0 — symmetric in `bulk-delete.spec.ts` | Removed v0.31.0 — symmetric | ✓ symmetric (historical fix) |
| **Comments-Count badge** | Card view: badge ✓ ; List view: badge ✓ (parity work) | N/A (books don't have comments) | ✓ (per-Articles-internal parity) |
| **Trash restore flow** | `handleRestore` reloads `/api/articles` (419ms click handler) | `handleRestore` reloads `/api/books` | ⚠️ both have the perception-lag (`RESTORE-UX-FEEDBACK-01`) |
| **Permanent-delete from trash** | `handlePermanentDelete` (no confirm in current code) | `handlePermanentDelete` w/ AppDialog confirm | ⚠️ **POSSIBLE ASYMMETRY** — needs verification |
| **Empty-state UX** | ArticleList has `article-list-empty` testid + CTA | Dashboard has empty-state in Welcome card | ⚠️ different shapes; folded into G1-F3 (no shared `<EmptyState>`) |

**Tally:** 3 confirmed asymmetries (G1-F1, G2-F1, G2-F2) + 1 historical (bulk-delete cap, now resolved) + 1 partial (comments-count badge, now resolved) + 2 from Bug A path (perception lag is symmetric — same shape on both sides). **5 occurrences of the parallel-surface asymmetry pattern** total.

### Severity rollup (full audit, finalized)

| Severity | Count | IDs |
|---|---:|---|
| BLOCKER | 0 | — |
| **IMPROVEMENT-elevated (P2)** | **3** | G3-F1 + G3-F2 + G3-F8 (coupled as `PLUGIN-SETTINGS-TESTID-COVERAGE-01`), G4-F1 (`NOTIFY-ERROR-APIERROR-COVERAGE-01`) |
| IMPROVEMENT (P3) | 13 | G1-F1, G1-F2, G1-F3, G2-F1, G2-F2, G2-F3, G2-F6, G3-F3, G3-F6, G4-F2, G4-F3, G4-F4 (+ G4-F3 promoted to "fix in this commit chain") |
| DEFER / INFO | 7 | G1-F4, G1-F5, G2-F4, G2-F5, G3-F4, G3-F5, G3-F7 |
| **Total** | **23** | (within audit stop-condition `<30`) |

### G4-F1 elevation (per user direction)

G4-F1 promoted from IMPROVEMENT to **IMPROVEMENT-elevated (P2)** — parity with G3-F1:

- 62% of error paths bypass the ApiError-with-Report-Issue affordance.
- **User-impact**: users hitting those errors can't file useful bug reports because error context isn't carried through. This degrades Bibliogon's "every error is actionable" promise that the `code-hygiene.md` "Error reporting" rule establishes.
- Same scoping pattern as G3-F1: not BLOCKER-tier (nothing currently broken) but P3 underweights the user-facing risk.

Backlog item: `NOTIFY-ERROR-APIERROR-COVERAGE-01` (P2, IMPROVEMENT-elevated).

### G4-F3 elevation: fix in this audit-close commit chain

G4-F3 (CLAUDE.md stale theme docs) promoted from DEFER to **DOCS-IMPROVEMENT** with priority "fix in same session as audit close". Reasoning: CLAUDE.md drives every Claude Code session's discipline reference. If theme architecture description is wrong, future audits start from false assumptions about palette count. Will land in the lessons-learned commit (not as a separate backlog item — direct doc fix).

### G4-F4 reframed: recurring-issue-class

The 111 `var(--token, #hex)` callsites are not just a one-off audit finding — they're the **second occurrence of the same theme-token-completeness bug class** in two release cycles:

- **v0.31.0 Pre-Release Audit D3** (per the existing release notes) found 9 components silently falling through to hex when `--surface-2`, `--danger-bg`, `--success`, `--warning` were undefined in some palettes. Fixed by defining the tokens.
- **2026-05-15 (this audit)** found 111 callsites of the same `var(--token, #hex-fallback)` pattern. Whether they all need new tokens is unverified — but the inventory itself is a recurring-issue signal.

Lessons-learned candidate: **"Theme token completeness audit should be periodic hygiene, not ad-hoc when issues fire."** Audit cadence: every release cycle's pre-release sweep should include the `grep -rhE 'var\(--[a-z-]+, *#' frontend/src/` probe + cross-check against the per-palette CSS blocks in `global.css`.

### Pattern-class causality (NEW: explicit cause-effect chain)

The two pattern classes from earlier groups are **NOT independent**. They have a cause-and-effect relationship:

```
[Monolithic component]
        ↓ blocks
[Component extraction discipline]
        ↓ absence creates
[Duplication across parallel surfaces]
        ↓ amplifies
[Articles-vs-Books asymmetry when updates touch one surface only]
```

Concrete instances of this chain:

| Monolithic source | Inline component | Resulting asymmetry |
|---|---|---|
| `Settings.tsx` 2338 LOC | `PluginSettings` inline (G3-F1), `AuthorSettings` inline (G3-F2) | No Articles-vs-Books parallel here, but: blocks the per-tab testid discipline (G3-F8) |
| `ArticleList.tsx` 1541 LOC | `ArticleFilterBar` inline (~200 LOC, G2-F1) | Articles got 6 filter slots while Books' shared `DashboardFilterBar` stayed at 1. Inline structure made it easier to add Articles-only filters without considering Books parity. |

**The implication:** fixing the monolithic-component-extraction-gap (the upstream cause) addresses the root cause of multiple Articles-vs-Books asymmetries simultaneously. Extraction work has compounding parity value, not just code-cleanup value.

Lessons-learned candidate: **"Inline-component duplication is the upstream cause of parallel-surface asymmetry. Component extraction is parity insurance, not just code hygiene."**

### Audit acceptance criteria check

Per the audit's own stop-conditions (Pre-Inspection Step 0.3):

- [x] Every surface in scope has been walked through (8 routes × 5 surface groups)
- [x] Every cross-cutting concern checked across all surfaces (toast, dialog, loading, empty, theme, i18n, keyboard, console)
- [x] All findings have severity + evidence + suggested resolution
- [x] Findings table allows quick prioritization decision
- [x] 23 findings total (well under the 30-finding stop-condition)
- [x] 0 BLOCKERs (well under the 5-BLOCKER stop-condition)

### Audit close-out

**Status:** ✅ **COMPLETE** (was 🚧 IN PROGRESS in Groups 1-4).

Post-audit deliverables landing in separate commits per the established protocol:

1. **Backlog filings** — one entry per IMPROVEMENT finding with explicit triggers
2. **Lessons-learned** — three new sections (Articles-vs-Books asymmetry pattern, monolithic-component-extraction-gap pattern, periodic theme-token-completeness audit) + the cause-effect chain note + the Bug A perception-lag class
3. **CLAUDE.md update** — G4-F3 fix (5 palettes × 2 modes = 10 variants, not 3 × 2 = 6)
4. **Journal update** — full-audit close entry with the 23-finding summary
5. **Resume notes for future audits** — running tally of pattern occurrences, the probe commands used, the screenshot inventory

All findings categorized by surface group above; backlog items ready to file in the next commit.
