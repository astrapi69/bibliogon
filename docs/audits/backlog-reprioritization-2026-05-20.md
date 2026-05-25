# Backlog Re-Prioritization Audit - 2026-05-20

**Methodology:** 4-Axes scoring (A1 User-Visible-Impact, A2
Foundation-Impact, A3 Strategic-Alignment, A4 Effort-Discounted-
Value). Total = sum 4-20. Tier-map: 17-20 P1, 13-16 P2, 9-12 P3,
5-8 P4, 4 P5. Override: A2=5 (blocks 3+ items OR upstream-
blocker) auto-promotes to P1.

**Source:** `docs/backlog.md` at commit `80399cd` (origin/main
HEAD).

**Prior-audit check:** no prior systematic re-prioritization
found. Recent backlog commits (`80399cd`, `d4608af`, `e159604`)
are filing / closing work, not re-prioritization. Safe to proceed.

**Total active items audited:** 67 (P1=1, P2=5, P3=37, P4=8,
P5=16). Plus 2 BLOCKED entries excluded from re-prioritization
per the methodology (their tier is fixed by external-trigger
semantics).

---

## Summary Statistics

| Metric | Count |
|---|---|
| Items with priority CHANGE proposed | 24 |
| Items with priority UNCHANGED | 39 |
| New P1 items (was P2-P5) | 1 |
| Promoted (1+ tier up) | 7 |
| Demoted (1+ tier down) | 17 |
| Archive candidates (orphan / shipped / duplicate) | 4 |

**Headline:** the backlog is roughly correctly tiered, but P5
contains several items whose effort-discounted-value is high
enough they belong in P3-P4 (e.g. `KDP-CATEGORIES-WIRE`,
`MEDIUM-COMMENT-MANUAL-ENTRY`). P3 contains several legacy items
whose strategic relevance has faded and which should sink to P4.
Three items are orphans (shipped work that the closing commit
left in the active list) and one is a P5 duplicate of shipped
work.

---

## Top-10 Action List

Items most worth doing next, ranked by Total Score (with the A2=5
Foundation override applied for #1):

| # | Item ID | Old Pri | New Pri | Score | Why now |
|---|---|---|---|---|---|
| 1 | PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 | P1 | **P1** | 17 | Foundation-blocker. Blocks clean backend sweep + Comics-Session-3 + Mobile-Sync. PluginForge agent has the brief; fix-path (a) is small (1-3 commits) but on PluginForge's side. |
| 2 | PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 | P2 | **P1** | 16 | Closes the half-wired ComicBookEditor (degraded "no pages yet" state today). Path A (relax kinderbuch gate) is 2-4 commits. Direct user-visible win. |
| 3 | RECURRING-COMPONENT-AUDIT-01 | P3 | **P2** | 13 | Foundation for 4+ downstream extractions (AUTHOR-SELECT, LIST-VIEW-ROW, REMINDER-PANEL, ARTICLEFILTERBAR). Audit itself is 1-2 hours; payoff compounds. Read-only deliverable. |
| 4 | AUTHOR-DATALIST-EXTEND-EDITORS-01 / AUTHOR-SELECT-INPUT-EXTRACT-01 (pair) | P3 | P3 | 12 | RCU rule's canonical first-application. ~7 commits coordinated. Pairs with #3 (audit feeds component spec). |
| 5 | KDP-PUBLISHING-WIZARD-01 | P2 | **P2** | 12 | Major end-user workflow (closes K-03+K-04). XL effort (16+ commits) hurts the score; strategic value justifies P2 retention. |
| 6 | GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 | P3 | **P2** | 12 | New-user critical: onboarding still references 2 book types when 3 exist. Cheap-ish (3-4 commits). Pairs with #2 once page-CRUD ships so the demo lands on a working comic editor. |
| 7 | KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01 | P5 | **P3** | 12 | Single commit. Backend endpoint already live + pinned; only frontend wiring missing. Pairs with #5 (KDP-Wizard's category step). Surprising-high score. |
| 8 | MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01 | P3 | P3 | 12 | 1-3 commits, primarily docs/rule edits. Concrete two-failure-mode evidence base; codify the lesson while it's fresh. |
| 9 | PLUGIN-VERSION-GATING-ENABLE-01 | P3 | P3 | 12 | 1 commit. Closes V060 adoption tail-end. Release-hardening before v1.0. Strategic-alignment is medium because no plugin currently fails the gate. |
| 10 | PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 | P3 | P3 | 12 | Subject to verification (see Open Question Q1) — may already be shipped per v0.35.0 changelog "Picture-Book TipTap rich-text editing". If still open: substantial Phase 4 follow-up; if shipped: archive. |

---

## Cluster Identification

Items that share architectural coupling, code-paths, or
dependency-graph and would ship together for less total effort
than independently:

### Cluster A: PluginForge 0.8.0 + Comics-Session-3 unblock

- `PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01` (P1)
- `PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01` (P2 -> P1 recommended)

The recursion fix unblocks all backend TestClient-surface growth.
Comics-Session-3 PAGES-CRUD adds ~5 new endpoints + ~10 new
TestClient-using tests which would otherwise compound the
cascade further. Shipping PAGES-CRUD on top of the recursion fix
keeps the cumulative baseline at-or-below the current 20+13.
**Recommended sequence:** PluginForge 0.8.0 ships first
(externally), then PAGES-CRUD lands in Bibliogon.

### Cluster B: RCU canonical first-application

- `RECURRING-COMPONENT-AUDIT-01` (P3 -> P2 recommended)
- `AUTHOR-SELECT-INPUT-EXTRACT-01` + `AUTHOR-DATALIST-EXTEND-EDITORS-01` (pair, P3)
- `LIST-VIEW-ROW-SHARED-EXTRACTION-01` (P3)
- `REMINDER-PANEL-GENERIC-EXTRACTION-01` (P3, deferred-until-2nd-site)
- `ARTICLEFILTERBAR-EXTRACT-01` (referenced in audit body, NOT a top-level backlog ID — see Open Question Q4)
- `PLUGIN-SETTINGS-TESTID-COVERAGE-01` (referenced in audit body, NOT a top-level backlog ID — see Open Question Q4)

The audit deliverable (Cluster B's first commit) feeds the
component specs for the AUTHOR pair + LIST-VIEW-ROW. The two
sub-bullets in the audit body (`ARTICLEFILTERBAR-EXTRACT-01` +
`PLUGIN-SETTINGS-TESTID-COVERAGE-01`) appear to be either
already-shipped or under-filed — needs reconciliation. **Recommended sequence:** audit
first (own session), then AUTHOR-pair, then LIST-VIEW-ROW, then
the remaining candidates triaged from the audit's findings.

### Cluster C: KDP-Publishing-Wizard preparation

- `KDP-PUBLISHING-WIZARD-01` (P2)
- `KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01` (P5 -> P3 recommended)
- `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01` (P3, picture-book-specific KDP polish)
- `BISAC-DATABASE-LOOKUP-01` (P5 -> P4 recommended, license-gated)

Three pre-Wizard pieces should ship before the Wizard XL session
starts. KDP-CATEGORIES-WIRE is the canonical first-piece (single
commit, backend already live). PICTURE-BOOK-KDP-SPECIFIC-FIELDS
is opportunistic. BISAC requires license adjudication and is
P4-defer until that decision.

### Cluster D: Phase 4 picture-book polish (deferred / opportunistic)

- `PICTURE-BOOK-PDF-FRONT-MATTER-01` (P3)
- `PICTURE-BOOK-TEXT-CONFIGURATION-01` (P3) — *verify against v0.35.0 ship*
- `PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01` (P3)
- `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` (P3)
- `PICTURE-BOOK-STORYBOARD-VIEW-01` (P3, substantial 10-15 commits)
- `PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01` (P3, also in Cluster C)

Picture-Book Phase 4 closed in v0.35.0. Remaining items are
either polish or new feature surfaces (Storyboard is its own
session). **Recommended sequence:** trigger-driven, not
schedule-driven. Storyboard is its own dedicated session if it
ships at all.

### Cluster E: Mutmut survivor-pool triages

- `BACKUP-PROJECT-IMPORT-MUTMUT-01` (P3 section, body says P5; recommend P4)
- `BACKUP-SERIALIZER-MUTMUT-01` (P3 section, body says P5; recommend P4)
- `GIT-BACKUP-MUTMUT-01` (P3 section, body says P5; recommend P4)

Same audit-style work + same skill set + cumulative gain.
**Recommended:** one dedicated mutmut-triage session covering
all three pools. Currently scattered across body-priority-vs-
section-tier inconsistency (see Open Question Q3).

### Cluster F: CI / dependency hygiene

- `GH-ACTIONS-PERIODIC-AUDIT-01` (P5 -> P3 recommended; concrete trigger 2026-08-14)
- `GH-ACTIONS-OPTIONAL-BUMPS-01` (P5 -> P4 recommended; co-ships with the audit)
- `MYPY-V2-MIGRATION-01` (P4)
- `PLUGIN-PYDANTIC-COORDINATED-BUMP-01` (P5)

Quarterly hygiene cycle. Audit fires 2026-08-14 per its trigger;
optional-bumps + mypy co-ship if their conditions hold.

### Cluster G: V060 adoption tail-end

- `PLUGIN-VERSION-GATING-ENABLE-01` (P3)
- `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01` (P3)

Both are 1-3 commit docs/wiring items that close the V060 +
Comics-Session-2 retrospective discipline. **Recommended:** one
half-day session covering both.

---

## Full Re-Prioritization Table

Scoring legend: A1 user-impact, A2 foundation-impact, A3
strategic-alignment, A4 effort-discounted-value. Score = sum.
NewPri reflects the score, with Foundation-override applied
where A2=5.

| Item ID | Old | A1 | A2 | A3 | A4 | Total | New | Δ | Notes |
|---|---|---|---|---|---|---|---|---|---|
| PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01 | P1 | 3 | 5 | 5 | 4 | 17 | **P1** | = | Foundation-blocker override. |
| PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 | P2 | 4 | 4 | 4 | 4 | 16 | **P1** | ↑ | Closes ComicBookEditor's "no pages" half-wired state. |
| RECURRING-COMPONENT-AUDIT-01 | P3 | 1 | 4 | 3 | 5 | 13 | **P2** | ↑ | Foundation for 4+ extractions; tiny effort. |
| AUTHOR-DATALIST-EXTEND-EDITORS-01 / AUTHOR-SELECT-INPUT-EXTRACT-01 | P3 | 3 | 3 | 3 | 3 | 12 | P3 | = | Paired filing; ships together. Canonical RCU first-application. |
| KDP-PUBLISHING-WIZARD-01 | P2 | 5 | 2 | 4 | 1 | 12 | **P2** | = | XL effort drags score; strategic value retains P2. |
| GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 | P3 | 4 | 2 | 3 | 3 | 12 | **P2** | ↑ | New-user critical; cheap-ish; pairs with Comics-S3-PAGES-CRUD. |
| KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01 | P5 | 3 | 1 | 3 | 5 | 12 | **P3** | ↑↑ | 1 commit; backend already live; KDP-Wizard prep. |
| MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01 | P3 | 1 | 3 | 3 | 5 | 12 | P3 | = | 1-3 commits primarily docs; codify while fresh. |
| PLUGIN-VERSION-GATING-ENABLE-01 | P3 | 2 | 2 | 3 | 5 | 12 | P3 | = | 1 commit; V060 tail-end. |
| PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01 | P3 | 4 | 2 | 3 | 3 | 12 | P3 | = | **VERIFY** against v0.35.0 ship (Open Q1). |
| WRITING-GOALS-PROGRESS-TRACKING-01 | P3 | 4 | 1 | 3 | 3 | 11 | P3 | = | New user feature; 6-10 commits. |
| EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 | P3 | 3 | 1 | 2 | 4 | 10 | P3 | = | Minor friction; 1-2 commits. |
| CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01 | P3 | 3 | 1 | 2 | 4 | 10 | P3 | = | UX bug; 2-3 commits. |
| PICTURE-BOOK-PDF-FRONT-MATTER-01 | P3 | 3 | 1 | 3 | 3 | 10 | P3 | = | Phase 4 follow-up; KDP-quality. |
| PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01 | P3 | 2 | 1 | 2 | 5 | 10 | P3 | = | Data-hygiene; 1 commit. |
| PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01 | P3 | 3 | 1 | 3 | 3 | 10 | P3 | = | Cluster C piece. |
| PICTURE-BOOK-STORYBOARD-VIEW-01 | P3 | 4 | 1 | 3 | 2 | 10 | P3 | = | Substantial 10-15 commits. |
| CONVERT-TO-BOOK-ASSET-CLONE-01 | P3 | 3 | 1 | 2 | 4 | 10 | P3 | = | Asset-clone walker; 2-3 commits. |
| REMINDER-PANEL-GENERIC-EXTRACTION-01 | P3 | 1 | 3 | 2 | 3 | 9 | P3 | = | Pre-registered; waits for 2nd surface. |
| PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01 | P3 | 2 | 1 | 2 | 4 | 9 | P3 | = | Advanced mode; 1-2 commits. |
| PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 | P3 | 3 | 1 | 2 | 3 | 9 | P3 | = | **VERIFY** against v0.35.0 (Open Q1). |
| PICTURE-BOOK-TEXT-CONFIGURATION-01 | P3 | 3 | 1 | 2 | 3 | 9 | P3 | = | **VERIFY** against v0.35.0 (Open Q1). |
| LIST-VIEW-ROW-SHARED-EXTRACTION-01 | P3 | 1 | 3 | 2 | 3 | 9 | P3 | = | RCU candidate. |
| SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01 | P3 | 3 | 1 | 2 | 3 | 9 | P3 | = | UX friction; 4-6 commits. |
| PLUGIN-COMICS-MAKEFILE-INTEGRATION-01 | P3 | 1 | 1 | 2 | 5 | 9 | P3 | = | Dev tooling; 15-30 min. |
| PGS-05-FU-01 | P3 | 2 | 1 | 1 | 5 | 9 | P3 | = | Edge-case fix; S effort. |
| PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01 | P2* | 3 | 1 | 3 | 2 | 9 | **P3** | ↓ | *Body says P3; section P2. Inconsistency (Open Q2). 8-12 commits. |
| MEDIUM-IMPORT-V2-02 | P2 | 3 | 1 | 2 | 3 | 9 | **P3** | ↓ | AI tag inference; mature subsystem. |
| STORY-BIBLE-PLUGIN-01 | P2 | 4 | 1 | 3 | 1 | 9 | **P3** | ↓ | XL 16+ commits; demand uncertain. |
| MEDIUM-COMMENT-MANUAL-ENTRY-01 | P5 | 3 | 1 | 1 | 4 | 9 | **P3** | ↑↑ | Single commit; user-visible affordance. |
| MEDIUM-IMPORT-EXCERPT-AUTOFILL-01 | P5 | 2 | 1 | 1 | 5 | 9 | **P3** | ↑↑ | Small; mirror existing seo_description default. |
| GH-ACTIONS-PERIODIC-AUDIT-01 | P5 | 1 | 2 | 2 | 4 | 9 | **P3** | ↑↑ | Concrete trigger date 2026-08-14. |
| PLUGIN-COMICS-E2E-SMOKE-01 | P4 | 1 | 2 | 2 | 4 | 9 | **P3** | ↑ | 30-60 min; catches operational bugs. |
| MAKEFILE-VERIFY-PLUGIN-LOCKS-PARSE-01 | P3 | 1 | 1 | 1 | 5 | 8 | **P4** | ↓ | Dev tooling; workaround exists. |
| BIBLIOGON-DATA-FIX-FRAMEWORK-01 | P3 | 1 | 2 | 2 | 3 | 8 | **P4** | ↓ | Foundation for 5+ one-shots; wait for 5th. |
| D-06-VALIDATION-01 | P3 | 2 | 1 | 1 | 4 | 8 | **P4** | ↓ | Installer validation; no current signal. |
| AR-BULK-SERIES-HIERARCHY-01 | P3 | 3 | 1 | 2 | 2 | 8 | **P4** | ↓ | 1-2 sessions; no user request. |
| COMMENTS-ADMIN-PAGINATION-01 | P3 | 2 | 1 | 1 | 4 | 8 | **P4** | ↓ | Fine at current scale; defer until >200 comments. |
| BACKUP-PROJECT-IMPORT-MUTMUT-01 | P3* | 1 | 1 | 1 | 5 | 8 | **P4** | ↓ | *Body says P5. Cluster E. |
| PLUGIN-METADATA-I18N-PARITY-01 | P3 | 3 | 1 | 2 | 2 | 8 | **P4** | ↓ | 9 plugins × 6 langs; M effort. |
| CONVERT-TO-BOOK-REVERSE-LINK-01 | P5 | 2 | 1 | 1 | 4 | 8 | **P4** | ↑ | 3-5 commits; speculative until user signal. |
| CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01 | P5 | 2 | 1 | 1 | 4 | 8 | **P4** | ↑ | 2-3 commits; speculative. |
| GH-ACTIONS-OPTIONAL-BUMPS-01 | P5 | 1 | 1 | 1 | 5 | 8 | **P4** | ↑ | Co-ships with periodic audit. |
| AR-BULK-CROSSPAGE-SELECT-01 | P4 | 2 | 1 | 1 | 4 | 8 | P4 | = | Awaits pagination. |
| D-07 | P4 | 2 | 1 | 1 | 4 | 8 | P4 | = | Post-D-06 follow-up. |
| BISAC-DATABASE-LOOKUP-01 | P5 | 3 | 1 | 2 | 2 | 8 | **P4** | ↑ | License-gated. |
| TESTCLIENT-HARMONIZE-01 | P5 | 1 | 3 | 2 | 2 | 8 | **P4** | ↑ | 89 sites; large blast. |
| AR-BULK-ASYNC-PROGRESS-01 | P5 | 3 | 1 | 2 | 2 | 8 | **P4** | ↑ | 1-2 sessions; user-report-gated. |
| NAVIGATION-ORIGIN-TRACKING-01 | P3 | 1 | 1 | 1 | 4 | 7 | **P4** | ↓ | Helper extraction; 3 sites only today. |
| BACKUP-SERIALIZER-MUTMUT-01 | P3* | 1 | 1 | 1 | 4 | 7 | **P4** | ↓ | *Body says P5. Cluster E. |
| FULLSCREEN-PATTERN-RECONCILE-01 | P4 | 1 | 1 | 1 | 4 | 7 | P4 | = | Trigger-gated. |
| I18N-NATIVE-REVIEW-V031-01 | P3 | 2 | 1 | 1 | 3 | 7 | **P4** | ↓ | Native-speaker wait. |
| PLUGIN-DEV-SERVER-RESTART-HELPER-01 | P4 | 1 | 1 | 2 | 3 | 7 | P4 | = | Surface A closed; Surface B remains. |
| LAUNCHER-I18N-NATIVE-REVIEW-01 | P5 | 2 | 1 | 1 | 3 | 7 | **P4** | ↑ | Native-speaker wait; PR-flow live. |
| COMMENTS-COUNT-PERF-01 | P5 | 1 | 1 | 1 | 4 | 7 | **P4** | ↑ | Drop-in; trigger >50 comments per article. |
| GIT-BACKUP-MUTMUT-01 | P3* | 1 | 1 | 1 | 3 | 6 | **P4** | ↓ | *Body says P5. Cluster E. |
| I18N-DIACRITICS-01 | P3 | 2 | 1 | 1 | 2 | 6 | **P4** | ↓ | Awaits native-speaker per language. |
| BACKUP-DIFF-DEEP-VARIANTS-01 | P4 | 2 | 1 | 1 | 2 | 6 | P4 | = | 9-12 commits across 3 variants. |
| MYPY-V2-MIGRATION-01 | P4 | 1 | 1 | 1 | 3 | 6 | P4 | = | Trigger: mypy 1.x EOL. |
| LAUNCHER-SELFREPLACE-01 | P4 | 2 | 1 | 1 | 2 | 6 | P4 | = | 1-2 sessions; non-trivial Windows path. |
| D-02 follow-ups | P5 | 2 | 1 | 1 | 2 | 6 | P5 | = | Format-inconsistency: not a proper ID (Open Q5). macOS universal2 + signing. |
| PLUGIN-PYDANTIC-COORDINATED-BUMP-01 | P5 | 1 | 1 | 1 | 3 | 6 | P5 | = | Plugin lag-behind backend; not a real bug. |
| WALKER-HYPOTHESIS-01 | P5 | 1 | 1 | 1 | 3 | 6 | P5 | = | Hypothesis-based testing exploration. |
| TESTCONTAINERS-EVAL-01 | P5 | 1 | 1 | 1 | 2 | 5 | P5 | = | Postgres-via-Testcontainers exploration. |

### Items kept at their tier through the override

All P5-tier items kept at P5 share Total <= 6 AND no A2 high
signal. They are correctly speculative.

### Archive candidates (4 items)

Items where the work has effectively shipped but the backlog
entry was not closed:

| Item ID | Why archive | Action |
|---|---|---|
| `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01` | Body opens with "Sessions 1+2 SHIPPED 2026-05-20". Session 3 is filed as 2 separate IDs (`PAGES-CRUD-01` + `EXTENDED-FEATURES-01`). The tracker has done its job. | Move to `docs/archive/roadmap/2026-05.md` Comics-Session-2 close section. |
| `COMIC-BOOK-PLUGIN-01` (P5) | Duplicate of `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`. Body describes building the plugin that shipped Sessions 1+2. | Move to archive same date. |
| `PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01` (P3) | SVG-tail primitive shipped in Comics-Session-2 C4 (`b652942` BubbleTail.tsx). Picture-book single-bubble side never adopted (Q3 decision in Comic-Foundation: picture-book does NOT reuse). | Move to archive. The follow-up "picture-book single-bubble adopts the primitive" would be a NEW filing if a real user request lands. |
| (optional) Three 4c-B items (`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`, `PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`, `PICTURE-BOOK-TEXT-CONFIGURATION-01`) | v0.35.0 changelog claims "Picture-Book TipTap rich-text editing — RichTextEditor wrapper for the 3 unbounded layouts" + tier-property work. Status unclear. | **DO NOT archive without user confirmation**. See Open Question Q1. |

---

## Open Questions for Strategic-Advisor / User

These need adjudication before the audit's recommendations land
in `docs/backlog.md`:

### Q1. Are the 4c-B picture-book items already shipped or still open?

`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`,
`PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01`,
`PICTURE-BOOK-TEXT-CONFIGURATION-01` all describe "scheduled 4c-B
session" work. The v0.35.0 changelog
(`docs/CHANGELOG.md` lines 65-216) describes:

- *"Picture-Book TipTap rich-text editing — RichTextEditor
  wrapper for the 3 unbounded layouts (image_top_text_bottom,
  image_left_text_right, text_only) with D1 MVP extension set"*
- *"Speech-bubble polish — full 9-position anchor grid"* +
  `bubble_width` + `bubble_height` + tier-property work

This sounds like at least D1 (MVP TipTap) + tier-property
extended work shipped. Possibly the three backlog items are
PARTIALLY closed (D1 shipped, full-scope deferred) OR fully
closed (just not archived).

**Action needed:** user confirms shipping status. If shipped:
archive (decrements active count by 3). If partial: rewrite the
3 entries to reflect remaining scope.

### Q2. Body-priority vs section-tier inconsistencies

Four items are in the wrong section:

| Item | Section tier | Body says | Recommend |
|---|---|---|---|
| `PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01` | P2 | P3 | Move to P3 section (audit re-scoring confirms P3). |
| `BACKUP-PROJECT-IMPORT-MUTMUT-01` | P3 | P5 | Move to P4 section per audit (P4 = better tier than P5; both worse than P3). |
| `BACKUP-SERIALIZER-MUTMUT-01` | P3 | P5 | Same — P4. |
| `GIT-BACKUP-MUTMUT-01` | P3 | P5 | Same — P4. |

**Action needed:** user confirms; if approved, the
`docs/backlog.md` follow-up commit relocates these 4 items to
correct sections.

### Q3. Strategic direction for v0.36.0 release

The backlog has 49+ commits since v0.35.1 per the brief context.
v0.36.0 is implicit but unscheduled. The Top-10 above prioritizes
audit + small-scope items; if v0.36.0 is targeted for a specific
date, that may force re-ordering (e.g. defer KDP-Wizard XL work
in favor of cluster G's V060-tail-end items).

**Action needed:** user confirms whether v0.36.0 has a target
date (and whether the audit-feeding items qualify as part of
that release).

### Q4. ARTICLEFILTERBAR-EXTRACT-01 + PLUGIN-SETTINGS-TESTID-COVERAGE-01

Both are referenced in `RECURRING-COMPONENT-AUDIT-01`'s body as
"known candidates at filing time" but neither appears as a
top-level `**ITEM-ID**` entry in the backlog. They may be:

- **Sub-items not yet promoted to top-level** (filed via the
  audit's candidate list, awaiting promotion when the audit
  ships)
- **Already shipped** — the audit note says
  `PLUGIN-SETTINGS-TESTID-COVERAGE-01` shipped 2026-05-15 (see
  `SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`'s body)
- **Implicit in `LIST-VIEW-ROW-SHARED-EXTRACTION-01`** which is
  a different filing for similar work

**Action needed:** confirm shipping status of
`PLUGIN-SETTINGS-TESTID-COVERAGE-01`; clarify
`ARTICLEFILTERBAR-EXTRACT-01` filing intent.

### Q5. "D-02 follow-ups" item format

Line 2456 of `docs/backlog.md` is
`- **D-02 follow-ups**: macOS Intel universal2 build + code
signing.` — the `**`-wrapped content is "D-02 follow-ups" with
a space, which breaks the `[A-Z][A-Z0-9-]+` ID pattern used
throughout the rest of the backlog. It also lacks a `(P5,
...)` priority annotation in the body.

**Action needed:** rewrite as a proper ID (e.g.
`D-02-FOLLOWUPS-01` or split into
`LAUNCHER-MACOS-UNIVERSAL2-01` + `LAUNCHER-CODE-SIGNING-01`) so
parsers don't trip on it.

### Q6. Mobile-Sync strategic direction

The audit-context references `docs/explorations/exploration-
bibliogon-mobile-selective-sync.md` (filed 2026-05-20 by
Strategic-Advisor) and Mobile-Sync-Phase-D is mentioned twice in
the `PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01` body. No
top-level Mobile-Sync backlog item exists yet.

**Action needed:** confirm whether Mobile-Sync is a near-term
direction (affects A3 scoring of items that compose with
sync-route-density) OR purely exploratory. If near-term, file
`MOBILE-SYNC-PHASE-A-01` (P3) as a placeholder so the route-
density implications are tracked.

### Q7. Picture-Book Phase 4 polish bundling

Cluster D (Phase 4 picture-book polish) contains 5-6 trigger-
gated items. Should they:

- (a) **Bundle into a single "Phase 4 polish" session** when any
  one trigger fires (cheaper per item, risks scope creep)
- (b) **Ship individually as triggers fire** (atomic per item,
  but each session re-derives picture-book context)
- (c) **Defer until v0.36.x is well past v0.35.x** (let Phase 4
  marinate before adding more)

**Action needed:** user picks strategy; affects per-item A3
scoring.

---

## Methodology Limitations

Where the 4-Axes scoring fell short:

1. **A1 (User-Visible-Impact) is unmeasured.** Bibliogon has no
   user-demand telemetry and few user reports surface in the
   backlog. A1 scoring is the auditor's judgment based on what
   the item *would* improve if users hit it, not what users
   actually hit. Items with `trigger: first user report` are
   harder to score on A1 because the user-impact is
   speculative-until-real.

2. **A3 (Strategic-Alignment) collapses multiple directions.**
   "Strategic" here means "aligns with next-quarter work" but
   Bibliogon has multiple parallel directions (Picture-Book
   polish, plugin-comics maturity, KDP-Wizard, Mobile-Sync
   exploration, Story-Bible exploration, PluginForge 0.8.0 ship).
   An item that aligns with one direction may be tangential to
   others. The audit picked the dominant alignment per item; a
   different strategic emphasis would re-score several.

3. **A4 (Effort-Discounted-Value) is a poor proxy for ROI.**
   Effort estimates in the backlog are author estimates without
   calibration history. An item marked "S (1 commit)" may
   surface dependencies that grow it to M; an item marked
   "XL (16+ commits)" may compress via clever extraction.
   Real-world: the C7 of Comics-Session-2 was "1 commit" planned
   and shipped as 1 commit + 1033 LOC change; KDP-Wizard's
   16-commit estimate is plausible but unverified.

4. **Foundation-override (A2=5) is binary.** The override
   automatically lifts items to P1. Only one item (the recursion
   regression) qualifies. A more nuanced foundation-axis would
   distinguish "blocks 1 specific item" (A2=4) from "blocks the
   whole next-major-feature" (A2=5) more cleanly. The current
   binary works for this audit.

5. **Coupling between items isn't scored.** Cluster B (RCU
   extractions) would compound efficiency if shipped as a
   coordinated multi-session arc; the audit scores each item
   independently. The cluster recommendations partially close
   this gap but the totals don't reflect it.

6. **Trigger-driven items are underrated.** Many items carry
   `Trigger: first user report` — their value is real but
   conditional. A user-report can fire tomorrow, in 6 months, or
   never. The audit scored them on hypothetical-when-triggered
   value; they may deserve a separate "trigger-gated" bucket
   rather than P3/P4/P5 tier placement.

7. **Bibliogon's broader "no work for hypothetical future
   requirements" rule** (from `CLAUDE.md` system prompt) cuts
   against many P3-P5 speculative items being worth keeping at
   all. The audit kept items as filed rather than aggressively
   archiving; archive-aggressiveness is a separate session
   discipline.

---

## Stop Conditions That Did NOT Fire

- **Backlog item-count math:** filed 67 active items per top-of-
  file ("66 active P2..P5" + 1 P1 = 67). Audit counted 67 IDs.
  Match.
- **Half-Wired-Trash-Lifecycle violations:** no items shipped
  without their deferred-tracker. The 4 archive candidates are
  the inverse (work shipped without backlog closing); not a
  half-wired-trash violation but worth surfacing.
- **Duplicate items:** `COMIC-BOOK-PLUGIN-01` (P5) is functionally
  a duplicate of `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`.
  Surfaced in Archive Candidates.
- **Backlog format-inconsistency that blocks parsing:** parser
  needed a small tweak for "D-02 follow-ups" but did not block.
  Body-vs-section priority mismatches captured in Open Q2 but
  did not block scoring.

---

## Phase Status After Ship

| Item | Status |
|---|---|
| Backlog re-prioritization audit | shipped as read-only document |
| `docs/backlog.md` | unchanged (audit is recommendation, not application) |
| Top-10 next-substantial-session candidates | identified |
| Archive candidates | identified (3 confirmed, 3 contingent on Open Q1) |
| Strategic-Direction open questions | 7 surfaced |
| Mismatched-priority items | 4 surfaced |

---

## References

- `docs/backlog.md` at commit `80399cd` (source)
- `docs/archive/roadmap/2026-05.md` (archive precedent)
- `docs/explorations/` (exploration docs; Mobile-Sync +
  Multi-Agent-Coordination filed 2026-05-20)
- `docs/CHANGELOG.md` v0.35.0 entry (used to verify Q1 scope)
- 2026-05-19 V060 adoption arc commits (`1678b5c..e159604`)
- 2026-05-20 Comics-Session-2 arc commits (`c080974..80399cd`)
- `.claude/rules/ai-workflow.md` "ROADMAP priority tiers"
  (canonical tier semantics)
- `.claude/rules/lessons-learned.md` "Half-Wired-Trash-Lifecycle"
  (deferred-tracker discipline)
- `.claude/rules/lessons-learned.md` "Numeric claims verification"
  (per-tier awk count verification)

---

## Next Step

User reviews audit:

1. **Accept the top-10 + cluster recommendations**: no `docs/
   backlog.md` rewrite needed if the priorities stay as-filed but
   the user uses the audit to inform next-session selection.
2. **Apply the re-prioritization**: follow-up session edits
   `docs/backlog.md` to move items across tiers per the
   recommendations + resolve Open Questions Q1-Q7.
3. **Archive only**: limited application — apply the 3 confirmed
   archive candidates + leave priorities as-filed.
4. **Reject**: no action; audit is informational.

Either way, this commit is DOCS-only; no follow-up code change is
implicit.

End of audit.
