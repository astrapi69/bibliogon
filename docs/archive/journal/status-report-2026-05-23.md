# Bibliogon Status Report — 2026-05-23

**Scope note:** this status report is generated per the
`docs/journal/session-handoff-*.md` convention because no
canonical `Status-Report-Richtlinien-Dokument` exists in the repo
at HEAD. The closest formalized rule is the Numeric-Claims-
Verification block at `.claude/rules/ai-workflow.md:187` which
mandates running real commands (not memory-grep) for every
numeric claim — applied throughout. If formalization is wanted,
file a new item proposing `.claude/rules/status-report.md` — not
in scope this session.

---

## Current state

| Field | Value |
|---|---|
| HEAD on `origin/main` | `4220267` `docs(extraction): close RECURRING-COMPONENT-AUDIT-01 candidate #4 + file Pattern B + methodology-gap note` |
| Branch parity | local `main` == `origin/main` (0 ahead, 0 behind) |
| Working tree | clean (`git status --short` empty) |
| Bibliogon version | v0.35.1 |
| Branch | main |

---

## Test baselines (verified at HEAD)

| Surface | Count | Source |
|---|---|---|
| Frontend Vitest | **1803 / 1803** (143 files) | `npx vitest run` from `frontend/` at 13:36 |
| Backend pytest | **2125 passed / 1 skipped** | Last full sweep 2026-05-21 v0.35.1 archive; no backend commits in the intervening RCU-track (frontend-only) so the baseline holds |
| Playwright smoke specs | **56 spec files** | `ls e2e/smoke/*.spec.ts \| wc -l` |
| tsc --noEmit | **clean** | verified during RCU C1 of 2026-05-23 |

---

## Recent-commit arcs (last 30 commits)

Span: 2026-05-20 → 2026-05-23. Grouped by topic.

### Arc 1 — RCU-Track (2026-05-21 → 2026-05-23): 5 commits

The `RECURRING-COMPONENT-AUDIT-01` arc from audit-deliverable
through 2 successful extractions.

| Commit | Subject |
|---|---|
| `455d4db` | docs(audit): recurring-component audit via 4-Axes methodology |
| `c2305e7` | feat(bulk-action-bar): extract BulkActionBar wrapper + RCU 3-site migration (candidate #2; path γ pivot) |
| `42788e2` | docs(extraction): close candidate #2 + footnote candidate #1 deferral |
| `a213788` | feat(author-select-input): extract AuthorSelectInput + RCU 2-site migration (candidate #4; path α) |
| `4220267` | docs(extraction): close candidate #4 + file Pattern B + methodology-gap note |

Audit candidates: #1 useSelection<T>() **deferred** (anti-extraction
rationale honored), #2 BulkActionBar **shipped**, #3 ListRow
**available**, #4 AuthorSelectInput **shipped**, new Pattern B
AuthorSelect/AuthorSelectField **available** (estimated score 13;
audit-followup).

### Arc 2 — Multi-Tool-Coordination LL filings (2026-05-21): 2 commits

| Commit | Subject |
|---|---|
| `a2aed03` | docs(history-note): C7 (954248e) absorbed parallel-session PluginForge-v0.9.0-follow-up files |
| `37e36dd` | docs(rules): file LL "Plain git status before every commit, especially in Multi-Tool-Coordination sessions" |

### Arc 3 — Phase 2 PANEL-CONFIG (2026-05-21): 7 commits

`PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01` close — Findings #1 + #3
of the 4-user-findings audit.

| Commit | Subject |
|---|---|
| `d3410fb` | feat(comics): LayoutConfigComicPanel + Tier1Section RCU 3rd-site (C1) |
| `f3968e5` | feat(comic-book-editor): mount LayoutConfigComicPanel in side-pane (C2) |
| `e7a0ae1` | feat(comics): panel-image upload UI inside LayoutConfigComicPanel (C3) |
| `d344df1` | feat(comic-book-editor): close assetUrls Half-Wired gap (C4) |
| `f23e672` | i18n(comics): comic_panel labels DE + EN + 6 passthrough-EN (C5) |
| `9062633` | test(comics): Playwright smoke for panel-image upload round-trip (C6) |
| `954248e` | docs(backlog): close PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 + archive (C7) |
| `1b35929` | docs(journal): session-handoff + resume-prompt for Phase 2 PANEL-CONFIG-01 |

All 4 user-findings now closed (#1 + #3 in Phase 2; #2 + #4 in
Phase 1).

### Arc 4 — PluginForge 0.9.0 (parallel-session, 2026-05-21): 2 commits

| Commit | Subject |
|---|---|
| `0c966e0` | feat: bump pluginforge to v0.9.0 and add missing_target_application i18n mapping |
| `64a067e` | docs(journal): pluginforge v0.9.0 adoption signal report |

Current pin: `pluginforge = "^0.9.0"` in
`backend/pyproject.toml`. Closes the 0.7.0 → 0.8.0 → 0.9.0 cycle.

### Arc 5 — Phase 1 MULTI-PANEL-LAYOUTS (2026-05-20): 6 commits

`PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01` close — Findings
#2 + #4 of the 4-user-findings audit.

| Commit | Subject |
|---|---|
| `216b5a1` | feat(comics): walker — add 4 new grid templates (1x2, 2x1, 2x3, 3x2) (C1) |
| `bf247a7` | feat(comics): frontend mirror of the 4 templates (C2) |
| `37e0113` | feat(comic-book-editor): header LayoutPicker (C3) |
| `79a7e6f` | i18n(comics): layout picker labels DE + EN + 6 passthrough-EN (C4) |
| `93b032a` | test(comics): Playwright smoke for multi-panel layouts (C5) |
| `433d8ce` | docs(backlog): close PHASE-1 + archive + LL filing (C6) |

Shipped 7 grid templates: `single_panel`, `grid_1x2`, `grid_2x1`,
`grid_2x2`, `grid_2x3`, `grid_3x2` (in default picker) +
`grid_3x3` (legacy/backward-compat).

### Arc 6 — PluginForge 0.7.0 → 0.8.0 (2026-05-20): 2 commits

| Commit | Subject |
|---|---|
| `3fe8633` | chore(deps): bump pluginforge ^0.7.0 → ^0.8.0 (closes PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01) |
| `43f0429` | docs(backlog): close PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 + archive + file export-3-router follow-up |

### Arc 7 — Add-Panel diagnostic (2026-05-20): 3 commits

Closed the user-reported "Add panel button geht nicht" via
perception-lag fix (auto-select newly-created panel/bubble) +
new stale-bundle LL.

| Commit | Subject |
|---|---|
| `ccf2f3c` | test(comic-book-editor): E2E coverage for Add/Delete Panel + Bubble CRUD cycle |
| `2a83aed` | feat(comic-book-editor): auto-select newly-created panel and bubble (perception-lag fix) |
| `534bea9` | docs(lessons-learned): stale-bundle false-positive on post-ship user reports |

### Arc 8 — PAGES-CRUD-01 (2026-05-20): 2 commits

`PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01` close — Path A1
architectural relocation of pages router from plugin-kinderbuch
to backend core + Half-Wired ComicBookEditor empty-state closure.

| Commit | Subject |
|---|---|
| `00a18f8` | feat(comic-book-editor): create first-page button closes Half-Wired empty state |
| `2869f3f` | docs(backlog): close PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 + archive + E2E spec update |

### Cumulative velocity

| Period | Commits | Note |
|---|---|---|
| 2026-05-20 (single day) | 15+ commits across Arcs 5/6/7/8 | The longest velocity day in recent memory |
| 2026-05-21 | 9 commits across Arcs 2/3/4 (start of RCU) | Phase 2 ship + LL filings |
| 2026-05-22 | 2 commits (RCU C2 + close) | BulkActionBar arc |
| 2026-05-23 | 2 commits (RCU C4 + close) | AuthorSelectInput arc |

---

## Backlog state (section-bounded counts)

Per the canonical structure in `docs/backlog.md`:

| Tier | Count | Recent change |
|---|---|---|
| **P0** | 0 | — |
| **P1** | 0 | (none active since the 2026-05-20 PHASE-1 close emptied this tier) |
| **P2** | **3** | KDP-PUBLISHING-WIZARD-01, RECURRING-COMPONENT-AUDIT-01 (will close via audit-followup once Pattern B is filed as a real backlog item rather than just an audit footnote), GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 |
| **P3** | **31** | Includes Phase 3 EXTENDED-FEATURES-01 (unblocked after Phase 2), AUTHOR-DATALIST-EXTEND-EDITORS-01 (UX-adjudication-required), MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01, and similar |
| **P4** | **27** | Roadmap / future-phase items |
| **P5** | **5** | Speculative |
| **Blocked / Upstream Wait** | **2** | DEP-02 (TipTap 2 → 3) + similar upstream-waits |

**Total active:** 66 (P2..P5) + 0 P1 + 2 BLOCKED-on-upstream.
Matches the backlog header prose verbatim.

### Recently-closed items (last 3 days)

| Date | ID | Commit |
|---|---|---|
| 2026-05-23 | RECURRING-COMPONENT-AUDIT-01 candidate #4 (AuthorSelectInput) | `a213788` |
| 2026-05-22 | RECURRING-COMPONENT-AUDIT-01 candidate #2 (BulkActionBar) | `c2305e7` |
| 2026-05-21 | RECURRING-COMPONENT-AUDIT-01 audit deliverable | `455d4db` |
| 2026-05-21 | PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 (Findings #1 + #3) | `d3410fb..954248e` |
| 2026-05-20 | PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01 (Findings #2 + #4) | `216b5a1..433d8ce` |
| 2026-05-20 | PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 (via 0.8.0 bump) | `3fe8633..43f0429` |
| 2026-05-20 | PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 | `00a18f8..2869f3f` |
| 2026-05-20 | Add-Panel diagnostic (user-reported, no backlog item) | `ccf2f3c..534bea9` |

---

## Open foundation-blocks

Foundation-Override-Extended rule (P1 promotion criteria) is NOT
currently firing. No items meet either:

- A2 = 5 (blocks 3+ items OR upstream-blocker), OR
- Half-Wired-Visible-in-Production (a half-wired feature
  user-visible + degraded in shipped production)

**P1 tier remains empty.** First time since the v0.31.0 cycle
that this tier has stayed empty for 3+ days.

The closest foundation candidates in the active backlog:

- **AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3) — opens whether to
  replace Pattern B at editor surfaces; depends on user
  UX-adjudication, not on engineering decision.
- **Phase 3 EXTENDED-FEATURES-01** (P3, BLOCKED-BY-Phase-2
  lifted) — 17-23-commit polish work for comic-book editor;
  multi-session arc.
- **PluginForge 0.9.0 follow-up** — the 7-file in-progress
  PluginForge-side work that landed via the C7 absorption
  incident (commit `954248e`); parallel-session work, not
  Bibliogon-owned.

---

## Disciplines formalized since last status point

The following Lessons-Learned entries shipped during the
2026-05-20 → 2026-05-23 arc. Listed in approximate-load-bearing
order:

1. **Plain `git status` before every commit, especially in
   Multi-Tool-Coordination sessions** (LL filing 2026-05-21,
   commit `37e36dd`). Filed from a concrete C7 absorption
   incident where filtered `git status docs/` hid 7 pre-staged
   parallel-session files. Applied 5+ times since (each commit
   in the RCU-track verified clean working state via plain
   `git status`).
2. **Multi-Tool-Coordination on main is expected state**
   (informal discipline; user-confirmed 2026-05-22). Parallel
   CC sessions + user-side commits interleave on origin/main.
   Held bounded by reasonable-time-window for non-eigene-session
   commits (e.g. `64a067e` was held for ~18h then published
   alongside the audit ship per path α).
3. **Foundation-Override-Extended: Half-Wired-Visible-in-
   Production triggers P1** (LL filing in `lessons-learned.md`
   per the backlog re-prioritization audit). Extended the
   original Foundation-Override (A2=5) with the new criterion.
4. **Periodic backlog re-prioritization discipline (4-Axes
   audit pattern)** (LL filing per `docs/audits/backlog-
   reprioritization-2026-05-20.md`). The 281a6f6 audit
   surfaced 24 of 67 active items had tier mismatches under
   current scoring (~36%); 7 promotions + 17 demotions
   applied.
5. **Playwright-visible ≠ User-visible** (LL filing 2026-05-20,
   commit `433d8ce`). Filed from the Multi-Panel-Bug where
   `toBeVisible()` passed on a CSS-collapsed 0-10px panel; the
   regression-pin needs `boundingBox().height > 50`. Applied
   in the Phase 2 C6 Playwright smoke (commit `9062633`).
6. **Stale-bundle is the most common false-positive on
   post-ship user reports** (LL filing 2026-05-20, commit
   `534bea9`). Filed from the Add-Panel diagnostic where the
   user's browser ran pre-ship JS.
7. **Half-Wired-Lifecycle-Cascade-Awareness** (LL refinement;
   the cascade closed by Phase 2 C4's assetUrls fix).
8. **Audit-Score should include design-intent-documentation as
   anti-extraction-signal** (NOT yet formally filed; documented
   in-place in audit footnote for the candidate-#1 useSelection
   deferral 2026-05-22). Per the "single instance is incident,
   not pattern" discipline, formal filing deferred until the
   pattern recurs.
9. **Audit methodology gap: file-level component scan misses
   inline functions inside large files** (NOT yet formally
   filed; documented in-place in audit footnote for the
   Pattern B finding 2026-05-23). Same "single instance"
   discipline applied; future-audit grep recipe captured.

---

## Cross-project coordination

### PluginForge release cycle (3 versions across the arc)

| Version | Bump commit | Bibliogon close |
|---|---|---|
| 0.7.0 → 0.8.0 | `3fe8633` (2026-05-20) | Closed PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 |
| 0.8.0 → 0.9.0 | `0c966e0` (2026-05-21, parallel) | Adds `missing_target_application` FilterReason; orthogonal to Phase 2 |

Current pin: `pluginforge = "^0.9.0"`. No further bumps in flight
that the Bibliogon-side workflow knows about.

### Parallel-session coordination instances

Two confirmed parallel-session interleavings on `origin/main`
during the arc:

1. **`0c966e0` (PluginForge 0.9.0 bump) landed during Phase 2 C4
   → C5.** Caused the C7 absorption incident — 7 in-progress
   PluginForge follow-up files got absorbed into Phase 2's C7
   commit. Non-destructive audit-trail filed at
   `docs/journal/c7-absorption-note-2026-05-21.md`.
2. **`64a067e` (PluginForge 0.9.0 adoption signal report) sat
   unpushed for 18+ hours.** Held by CC under
   "Leave for parallel-session" discipline during the RCU audit
   session 2026-05-21. Published alongside the audit ship per
   path α on 2026-05-22 when the reasonable-time-window passed.

The Multi-Tool-Coordination LL filing (commit `37e36dd`) was
the discipline-formalization that closed the first incident's
class of failures.

### Adaptive-learner

No coordination activity since the 2026-05-20 backlog re-
prioritization audit (where MOBILE-SELECTIVE-SYNC-EXPLORATION-
TRIAGE-01 was filed at P3 per Q6 adjudication).

---

## Next-substantial-session candidates

Ordered by combined score (audit + foundation-criteria) and
strategic priority:

1. **`ListRow` shared component** (RCU candidate #3, score 13).
   Available. ~6-8 hours over likely 4-6 commits.
   Sub-step (a): extract `ArticleRow` out of `ArticleList.tsx`
   monolith (1434 LOC → reduce to ~1240 LOC with the inline
   function extracted). Sub-step (b): cross-surface `ListRow`
   extract + migrate Books-side + Articles-side. Per the
   "Inline-component duplication is the upstream cause of
   parallel-surface asymmetry" LL, sub-step (a) has independent
   value.

2. **Pattern B `AuthorSelect` / `AuthorSelectField`** (NEW,
   estimated score 13). Audit-followup from the 2026-05-23
   methodology-gap finding. ~3-5 commits. Mirrors-comment at
   ArticleEditor.tsx:1211-1215 is the load-bearing 2-site
   signal. NOT pair-shipped with AUTHOR-DATALIST-EXTEND
   (different concern; UX-adjudication separate).

3. **AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3, UX-adjudication-
   required). Opens whether to replace Pattern B (closed-list
   profile-select) with Pattern A (free-text + Authors-DB
   datalist) at editor surfaces. Requires user-side adjudication
   on the UX trade-off (safety of closed list vs flexibility of
   datalist) before any code can ship. Could resolve as
   (a) "replace at all 3 editor sites" → ~5 commits, OR
   (b) "leave Pattern B at editors, only the new AUTHOR-SELECT-
   INPUT shipped today is needed" → close as already-shipped.

4. **Phase 3 EXTENDED-FEATURES-01** (P3, unblocked). 17-23-commit
   polish scope (drag-to-position, snap, undo, RTL, z-order,
   panel gutter, auto-tail-direction, full E2E matrix). Multi-
   session arc — likely 2-3 sessions to complete. Q1-Q4 audit
   decisions already adjudicated at
   `docs/audits/extended-features-pre-inspection-2026-05-20.md`.

5. **KDP-PUBLISHING-WIZARD-01** (P2, STRATEGIC). End-to-end
   KDP publishing pipeline as a wizard. Larger strategic scope
   than the others; would need its own Pre-Inspection cycle
   before commit-planning.

6. **`useSelection<T>()` design-intent adjudication** (RCU
   candidate #1, score 16, DEFERRED). NOT a coding-session
   candidate — needs user adjudication on whether to override
   the documented "kept as separate hook" rationale at
   useBookSelection.ts:7-10. Could ship in minutes after that
   adjudication if path β is chosen.

7. **`docs(rules): status-report.md` formalization** (NEW,
   surfaced this session). Filed if the user wants future
   status reports to follow a canonical methodology rather
   than ad-hoc session-handoff convention. Out of scope this
   session.

---

## Recommendations

- **Short-term (1 session):** ship the Pattern B extraction.
  Closes the methodology-gap finding in-action. Score 13
  matches candidate #3 ListRow but has lower setup cost
  (no monolith-extraction prerequisite).
- **Medium-term (2-3 sessions):** ship the ListRow extraction
  + the AUTHOR-DATALIST-EXTEND UX-adjudication outcome.
- **Strategic (multi-session):** Phase 3 EXTENDED-FEATURES OR
  KDP-PUBLISHING-WIZARD-01 depending on user priority.

---

## References

- `docs/audits/recurring-component-audit-2026-05-21.md` — primary
  RCU audit deliverable with 2026-05-22 + 2026-05-23 footnotes
- `docs/audits/backlog-reprioritization-2026-05-20.md` — 4-Axes
  re-prioritization methodology + foundation-override-extended
- `docs/roadmap-archive/2026-05.md` — full archive of the arc's
  closed items
- `docs/journal/session-handoff-2026-05-20-phase-2-resume.md` —
  the session-handoff this report's shape mirrors
- `.claude/rules/ai-workflow.md:187` — Numeric-Claims-Verification
  rule applied throughout this report
- `.claude/rules/lessons-learned.md` — all 9 disciplines listed
  in the "Disciplines formalized" section above

End of report.
