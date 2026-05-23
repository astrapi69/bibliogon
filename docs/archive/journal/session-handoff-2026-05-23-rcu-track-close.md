# Session handover — RCU-Track close + next-session candidates (2026-05-23)

Handover for the next CC session. Today's RCU-Track work
(2026-05-22 + 2026-05-23) closed 4 of 5 audit candidates from
`RECURRING-COMPONENT-AUDIT-01` (3 shipped + 1 permanent-defer
adjudicated). Last remaining candidate is **#3 ListRow (score
13)** — the recommended next-substantial-session target.

Plus PluginForge v0.10.0 shipped today as a pure pin-bump
(zero migration target found in Bibliogon source).

Companion file:
[session-prompt-2026-05-23-rcu-track-close.md](session-prompt-2026-05-23-rcu-track-close.md)
(paste-ready for a fresh CC session).

---

## Current state

| Field | Value |
|---|---|
| HEAD on `origin/main` | `727e3e3` `docs(backlog): file USESELECTION-RESPLIT-IF-DIVERGENCE-MATERIALIZES-01 (P5)` |
| Branch parity | local `main` == `origin/main` (0 ahead, 0 behind) |
| Working tree | clean |
| Bibliogon version | v0.35.1 |
| Branch | main |

## Test baselines (verified at HEAD)

| Surface | Count | Source |
|---|---|---|
| Backend pytest | **2126 passed / 1 skipped** | full sweep 165s post-PluginForge-v0.10.0-bump |
| Frontend Vitest | **1815 / 1815** (144 files) | post-Pattern-B-extraction sweep |
| Playwright smoke specs | 56 spec files | `ls e2e/smoke/*.spec.ts \| wc -l` |
| tsc --noEmit | clean | |
| pluginforge pin | `^0.10.0` × 13 files | bumped this session (commit `7a00033`) |

---

## What shipped this work-day (2026-05-22 → 2026-05-23)

Single coherent arc across the RCU-Track + PluginForge-bump.
12 commits total over ~2 working days.

| Arc | Commits | Scope |
|---|---|---|
| 1. RCU #2 BulkActionBar (2026-05-22) | `c2305e7..42788e2` (2) | Shared shell + 3-site adapter migration (Article/Book/Comment); 5 new Vitest |
| 2. RCU #4 AuthorSelectInput (2026-05-23) | `a213788..4220267` (2) | Pattern A: input + datalist + Add-to-Authors-DB checkbox; 2-site migration (CreateBookModal + ConvertToBookWizard); 11 new Vitest; Pattern B surfaced via PCRC |
| 3. Task-overview status report (2026-05-23) | `77d1dc2` (1) | First-time generation per session-handoff convention; NCV applied; 35-item recently-closed window |
| 4. RCU audit-followup Pattern B (2026-05-23) | `11198a4..0840813` (2) | Pattern B: `<select>` + `<optgroup>` profile-select; ArticleEditor inline deleted + BookMetadataEditor adapter slimmed; 12 new Vitest; methodology-gap closed-in-action |
| 5. RCU #1 useSelection permanent-defer (2026-05-23) | `c1083bc..563f298` (2) | Audit-doc adjudication + new LL "Audit-Methodology: design-intent-axis as 5th-Axis or Override-Filter" |
| 6. Comprehensive task-overview (2026-05-23) | `d66ef0c` (1) | 304-LOC single-source-of-truth artifact catalogues all 6 task-source categories; 111 distinct tracked items |
| 7. PluginForge v0.10.0 (2026-05-23) | `7a00033` (1) | Pure pin-bump ^0.9.0 → ^0.10.0 × 13 files; no migration needed |
| 8. USESELECTION-RESPLIT P5 filing (2026-05-23) | `727e3e3` (1) | Trigger-gated backlog entry for the permanent-defer's split-back-out condition |

**Total today-arc footprint:** 12 commits. Backend baseline
held; frontend Vitest grew 1768 → 1803 → 1815 (+47 across the
RCU extractions, from candidate #2 + #4 + Pattern B).

---

## Cumulative RCU audit progress (final tally)

`RECURRING-COMPONENT-AUDIT-01` is now in a stable state:

| Candidate | Score | Status | Commit |
|---|---|---|---|
| #1 `useSelection<T>()` | 16 | **PERMANENT-DEFER** (design-intent honored) | adjudicated `c1083bc` |
| #2 `BulkActionBar` | 15 | SHIPPED 2026-05-22 | `c2305e7` |
| #3 `ListRow` | 13 | **AVAILABLE** ← next-session target | — |
| #4 `AuthorSelectInput` | 12 | SHIPPED 2026-05-23 | `a213788` |
| Pattern B `AuthorProfileSelect` | 13 (audit-followup) | SHIPPED 2026-05-23 | `11198a4` |

**4 of 5 candidates closed; 1 available; methodology-gap
resolved in-action.**

---

## Recommended next-substantial-session candidate

### Primary: RCU candidate #3 `ListRow` (score 13, ~6-8 hours)

Last remaining non-deferred audit candidate. Backlog ID:
`LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3).

**Scope (estimated 4-6 commits):**

1. **C1 — Extract `ArticleRow` from `ArticleList.tsx` monolith
   to its own file.** No behavior change. ArticleList.tsx
   shrinks 1434 LOC → ~1245 LOC (the inline function spans
   lines 1223-1412 = 190 LOC). New file at
   `frontend/src/components/articles/ArticleRow.tsx`. Existing
   inline tests would need to move to a new
   `ArticleRow.test.tsx` (currently the inline function has
   NO test consumers per audit Pre-Coding-Reality-Check —
   greppable via `grep -rn "article-list-row-" frontend/src/`).
   This sub-step has **independent value** per the
   "Inline-component duplication is the upstream cause of
   parallel-surface asymmetry" LL.

2. **C2 — Extract shared `ListRow` component.** Mirror the
   AuthorProfileSelect adapter-pattern from today:
   - Canonical `ListRow.tsx` shell with `testidPrefix`,
     selection-checkbox, click handler, menu-button slot
   - `ArticleRow` becomes a thin adapter passing article-
     specific renderers (no cover image; medium-published-date
     fallback)
   - `BookListRow` (already extracted) becomes an adapter
     passing book-specific renderers (cover thumbnail; plain
     updated_at)
   - Per-site i18n key prefixes + testid namespaces preserved

3. **C3 — Vitest** for the new shared `ListRow` + adapter
   pin tests. Existing BookListView.test (if any) + new
   ArticleRow.test preserved without rewrites.

4. **C4 — docs + archive + audit-footnote update.** Mark
   candidate #3 SHIPPED in the RCU audit footnote. Close
   `LIST-VIEW-ROW-SHARED-EXTRACTION-01` from active backlog +
   archive entry.

**Key audit findings (from 2026-05-21 audit doc):**

- ArticleRow: inline at `ArticleList.tsx:1223-1412` (190 LOC
  inside 1434-LOC monolith)
- BookListRow: already extracted at `BookListView.tsx:100-228`
  (128 LOC inside 229-LOC file)
- Signatures match structurally: `{item, onClick/onOpen,
  onDelete, onDeletePermanent, isSelected, onToggleSelect}`
- Variations: Book renders cover thumbnail; Article renders
  Medium-published-date fallback; different testid namespaces
  + className modules

**Comments NOT in this cluster.** `CommentsAdminSection`
renders `<tr>` rows in a `<table>` (verified at
`CommentsAdminSection.tsx:937`). Per audit's anti-pattern
section: out-of-scope for `ListRow`.

### Alternative paths

**(B) Phase 3 EXTENDED-FEATURES-01** (P3, BLOCKED-BY Phase 2
lifted 2026-05-21). 17-23-commit polish scope (drag-to-position,
snap, undo, RTL, z-order, panel gutter, auto-tail-direction,
full E2E matrix). Multi-session arc (likely 2-3 sessions).
Q1-Q4 audit decisions adjudicated at
`docs/audits/extended-features-pre-inspection-2026-05-20.md`.

**(C) KDP-PUBLISHING-WIZARD-01** (P2, STRATEGIC). End-to-end
KDP publishing pipeline as a wizard. Larger strategic scope;
would need its own Pre-Inspection cycle before commit planning.

**(D) AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3, Pending-UX-
Adjudication). Replaces Pattern B at editor surfaces with
Pattern A. UX trade-off — needs user decision before code
work begins.

**(E) Status quo / chunk-quiescence.** No work scheduled.
Useful if other priorities surface.

---

## Critical constraints (carry-forward)

1. **Plain `git status` before every commit** (LL 2026-05-21).
   Don't filter to a path; read the full index state.
2. **RCU canonical: extract + migrate in SAME commit**
   (`coding-standards.md` Recurring-Component-Unification Rule).
3. **Atomic-green-per-commit-delta** — backend baseline 2126
   + frontend 1815 must hold across each new commit.
4. **Audit-First / Pre-Coding-Reality-Check at the keystroke**
   — grep for anti-extraction-rationale + design-intent
   markers BEFORE writing any extraction code (now formalized
   as override-filter; see new LL 2026-05-23 "Audit-
   Methodology: design-intent-axis as 5th-Axis or Override-
   Filter").
5. **Numeric-Claims-Verification** — every count via real
   command; section-bounded sed for backlog tiers.
6. **Continuous-archival** — close items in the same commit
   that ships their work; closed items go to archive, NOT
   stay in backlog.
7. **Multi-Tool-Coordination on main is expected state** —
   parallel CC sessions + user-side commits interleave;
   "Leave for parallel-session" bounded by reasonable-time-
   window.
8. **Push autonomously** after atomic-green commits per
   2026-05-21 discipline-change; surface only on Stop-
   Conditions or completion.

---

## Open items / parallel-work / deferred

### Deferred (no action expected this session)

- **`useSelection<T>()`** — PERMANENT-DEFER per
  2026-05-23 adjudication. Trigger-gated as
  `USESELECTION-RESPLIT-IF-DIVERGENCE-MATERIALIZES-01`
  (P5). Action only if entity-specific divergence
  materializes.
- **`AUTHOR-DATALIST-EXTEND-EDITORS-01`** (P3) — pending UX-
  adjudication on whether to replace Pattern B
  (AuthorProfileSelect) with Pattern A (AuthorSelectInput) at
  editor surfaces.

### Backlog state

| Tier | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 3 |
| P3 | 31 |
| P4 | 27 |
| P5 | 6 (was 5; +1 USESELECTION-RESPLIT this session) |
| BLOCKED | 2 |
| **Total active** | **67** (matches header prose) |

P1 tier sustained empty since 2026-05-20 — first 4-day
empty stretch since v0.31.0 cycle.

### Cross-project state

- **PluginForge:** `^0.10.0` shipped this session; PHASE 1
  audit confirmed no migration target in Bibliogon source.
  Next bump (v0.11.0) will surface
  `PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01` (P3) as a hard
  deadline.
- **adaptive-learner:** no current coordination work;
  Mobile-Sync exploration tracked via
  `MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01` (P3).
- **manuscripta:** out-of-scope this session; pinned per
  release-workflow.md checklist.

---

## Files to read for next session

1. **This handover** + the companion resume prompt
2. **The comprehensive task-overview** —
   `docs/journal/task-overview-2026-05-23.md` (304 LOC; 111
   distinct tracked items catalogued)
3. **RCU audit deliverable** —
   `docs/audits/recurring-component-audit-2026-05-21.md`
   (now with 4 footnote updates through 2026-05-23)
4. **Today's status report** —
   `docs/journal/status-report-2026-05-23.md`
5. **Source files for the next-session ListRow target**:
   - `frontend/src/pages/ArticleList.tsx:1223-1412` (inline
     `ArticleRow` to extract)
   - `frontend/src/components/BookListView.tsx:100-228`
     (existing `BookListRow` — extraction precedent)
6. **Lessons-Learned new filings** —
   `.claude/rules/lessons-learned.md` §"Audit-Methodology:
   design-intent-axis as 5th-Axis or Override-Filter"
   (2026-05-23) + §"Plain `git status` before every commit"
   (2026-05-21)

---

## Session-end summary

| Item | Status |
|---|---|
| RCU candidate #2 BulkActionBar | SHIPPED 2026-05-22 |
| RCU candidate #4 AuthorSelectInput | SHIPPED 2026-05-23 |
| RCU audit-followup Pattern B AuthorProfileSelect | SHIPPED 2026-05-23 |
| RCU candidate #1 useSelection<T>() | PERMANENT-DEFER adjudicated |
| RCU candidate #3 ListRow | AVAILABLE (next-session target) |
| PluginForge v0.10.0 | SHIPPED 2026-05-23 |
| Comprehensive task-overview | SHIPPED 2026-05-23 |
| Working tree | clean |
| Branch parity | local == origin/main |
| Backend baseline | 2126 / 1 skipped |
| Frontend Vitest | 1815 / 1815 |
| Audit candidates remaining | #3 ListRow |
| Next-substantial-session candidate | **RCU candidate #3 `ListRow`** (primary) |

Bibliogon is in a stable state for the next session to start.
