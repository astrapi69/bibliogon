# Bibliogon Backlog

Latest release: v0.43.0 (2026-06-01) — see [ROADMAP.md](ROADMAP.md) and [changelog/releases/v0.43.0.md](../changelog/releases/v0.43.0.md).

Last updated: 2026-06-01 (Scrivener Ergonomie-Cluster SHIPPED — all 4 P2 items (COMPOSITION-DISTRACTION-FREE-MODE-01, CHAPTER-STATUS-LABELS-01, WRITING-GOALS-PROGRESS-TRACKING-01, CHAPTER-OUTLINER-VIEW-01) implemented in order + archived to 2026-06.md; backend pytest 2485 / Vitest 2593 green. The full Scrivener P3 cluster SHIPPED 2026-06-01 (CHAPTER-SNAPSHOTS-01, DOCX-IMPORT-01 closed-by-discovery, WRITING-HISTORY-STATS-01) + a P0 ALEMBIC-UPGRADE-CHAIN-FIX (the `alembic upgrade head` chain was broken at a6e7f8a9b0c1; fixed + regression-gated), all archived to 2026-06.md. STORY-BIBLE-RELATIONSHIP-GRAPH-01 (P2) SHIPPED 2026-06-01 (interactive @xyflow/react graph: nodes/edges, create/delete, detail panel + nav, position persistence + PNG export; archived to 2026-06.md). The P4 (CHAPTER-COLLECTIONS-01, SCRIVENER-PROJECT-IMPORT-01, CHAPTER-SYNOPSIS-NOTES-01) Scrivener items remain open. Earlier 2026-06-01: v0.43.0 release cut — Story Bible integration depth: prose Storyboard, entity relationships + Arc-View lines, @-mention autocomplete, auto-detect. Closed 3 of the 4 P4 Story Bible follow-ups -> archived to 2026-06.md; re-scoped STORY-BIBLE-INTEGRATION-DOCS-01; filed COMPONENT-CONSISTENCY-TAIL-01.)
Previous: 2026-05-27 (Settings-Completeness audit close — all 4 nice-to-haves shipped on user-directive instead of filed. PICTURE-BOOK-PDF-DEFAULTS-SETTINGS-01 (P3) shipped at ``0a28934``; KDP-DEFAULT-MARKETPLACE-01 (P5) at ``186f1af``; CONFIRMATION-SKIP-MODE-01 (P5) at ``90e89fc``. Date-locale bug already shipped at ``56a23ef``. The 3 newly-filed backlog items archived to docs/archive/roadmap/2026-05.md the same day. P3=17, P5=12, Total active 57.)
Previous: 2026-05-27 (Settings-Completeness audit closure — 3 new backlog filings from the audit: PICTURE-BOOK-PDF-DEFAULTS-SETTINGS-01 (P3, RCU 2-key pattern for picture-book PDF format + bleed defaults), KDP-DEFAULT-MARKETPLACE-01 (P5, trigger-gated), CONFIRMATION-SKIP-MODE-01 (P5, trigger-gated). Date-locale bug (8 surfaces, hardcoded ``"de-DE"`` + binary-locale ternary) shipped as fix(i18n) commit ``56a23ef`` with the new ``formatLocaleDate`` shared helper. Page-size adjudication: left as-is (inline dropdown persists globally is correct). P3=18, P5=14, Total active 60.)
Previous: 2026-05-27 (3 P5-bodied items moved from P3 to P5 section — PICTURE-BOOK-STORYBOARD-OPERATIONS-01, STORYBOARD-MOOD-FREE-PICKER-01, STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01. Mis-location flagged by the prior handover audit; all 3 carry P5 body tags and should sit in the P5 section per the tier convention. P3=17, P5=12, Total active 57.)
Previous: 2026-05-27 (PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01 CLOSED — active text-conversion at PageEditor.handleChangeLayout (commit ``5d87560``). Trigger: user-authorized backlog re-sync; shipped as smallest-scope P3 ahead of v0.39.0 release. Vitest 2186→2190 (+4 PageEditor cases).)
Previous: 2026-05-27 (SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01 CLOSED — stale filing; full scope already shipped under SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 in v0.38.0. Surfaced by backlog re-sync audit after two consecutive prompt-collisions with archived work.)
Previous: 2026-05-26 (HELP-DOCS-V0.37.0-GAPS-01 CLOSED — extended to also cover v0.38.0 Settings-UX overhaul; 6 help topics × DE + EN = 12 Markdown pages + 5 Playwright-generated screenshots in default theme (warm-literary light, 1280×800). New manual-only ``screenshots`` Playwright project. Pages: settings/sidebar, editor/display-settings, editor/word-wrap, books/repository-url, dashboard/pagination, dashboard/trash-and-restore. _meta.yaml gained a new top-level "Dashboard" group + 5 child entries. ``make verify-docs-discipline`` green.)
Previous: 2026-05-26 (v0.38.0 RELEASED — Settings-UX overhaul; 30 commits since v0.37.0 across SETT-PHASE-1 (7 quick wins) + SETT-PHASE-2 (Allgemein tab split) + SETT-PHASE-3 (Toggle component + migration) + SETT-AUTHORS consolidation + SETT-L-1 (horizontal tabs → left sidebar) + Article Dashboard nav-jump fix + pre-existing test flake fix. Backend pytest 2269 (no change); Vitest 2063 → 2080 (+17); i18n parity 51/51 (75/75 keys); npm audit 0 high/critical.)
Previous: 2026-05-26 (SETT-AUTHORS-TAB-CONSOLIDATION-01 CLOSED — 2-commit ship of the Autor + Autoren-Datenbank consolidation into a single Autoren tab. AuthorSettings + AuthorsDatabase mount as stacked sections inside the new ``AutorenSettings`` wrapper; LEGACY_TAB_REDIRECTS map preserves ``?tab=author`` + ``?tab=authors_database`` deep-links. Tab count 14 → 13. Vitest 2062 → 2063 (+1); i18n parity 75/75; tsc clean.)
Previous: 2026-05-26 (SETT-PHASE-3-TOGGLE-COMPONENT-01 CLOSED — 4-commit ship of the shared Toggle composition component + 5-site migration.)
Previous: 2026-05-26 (SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01 CLOSED — 5-commit ship of the Settings UX Phase 2 Allgemein-tab split. Tab count 12 → 14.)
Previous: 2026-05-26 (SETT-PHASE-1-QUICK-WINS-01 CLOSED — 9-commit ship of the Settings UX Phase 1 quick-win bundle.)
Previous: 2026-05-25 (v0.37.0 RELEASED — 53 commits since v0.36.0 across two batches: (1) accessibility WCAG 2.1 AA audit + Danger Zone reset + bulk-restore parity + Medium-import progress polish; (2) Dashboard pagination + Book.repository_url + editor display settings + docs/archive/ restructure + ROADMAP refresh + stale-doc hygiene. Backend pytest 2214 → 2269 (+55); Vitest 1986 → 2037 (+51); i18n 75/75.)
Previous: 2026-05-25 DASHBOARD-PAGINATION-LOAD-MORE-01 / BOOK-REPOSITORY-URL-FIELD-01 / EDITOR-DISPLAY-SETTINGS-01 / COMMENTS-ADMIN-PAGINATION-01 CLOSED via the v0.37.0 release cycle.
Previous: 2026-05-23 ACCESSIBILITY-AUDIT-WCAG-AA-01 + DANGER-ZONE-RESET-EVERYTHING-01 + BULK-RESTORE-PARITY-01 CLOSED via 7+5+2-commit ships across v0.37.0.
Current version: v0.37.0
Open tasks: 57 active (P3=17 + P4=28 + P5=12; P0=P1=P2=0) + 2 BLOCKED-on-upstream entries
Archive: [docs/archive/roadmap/backlog-recently-closed-2026-05-02.md](archive/roadmap/backlog-recently-closed-2026-05-02.md)

Living backlog. Daily-planning view of ROADMAP work. ROADMAP stays
the canonical theme tracker; this file is forward-looking only.

This file lists ONLY open tasks. Closed tasks live in the archive
files; do not re-add closed entries here. If a closed task needs
to come back, create a new ID.

Tasks are sorted by priority tier (P0 most urgent, P5 most
speculative). BLOCKED-on-upstream pointers + non-task waiting
items live in their own section between P5 and the archive link.
Within each tier, smaller-scope and unblocking items come first,
with alphabetical-by-ID as final tiebreaker.

The 5 entries in "ROADMAP cross-reference" below are pointers to
ROADMAP entries; their canonical description lives there. The
backlog is a working list of pointers, not a duplicate definition
store.

---

## ROADMAP cross-reference (curated planning view)

- **AR-01 validation log** — see ROADMAP > P3.
- **DEP-02** (TipTap 3) — see ROADMAP > Blocked / Upstream Wait.
- **DEP-05** (elevenlabs 2.x) — see ROADMAP > Blocked / Upstream Wait.

---

## P0 - Deadline / Blocker / Security

(none)

---

## P1 - Architecture / Hygiene Debt

(none)

---

## P2 - High-Value User Features

(none)

---

## P3 - Infrastructure / Quality

The Scrivener analysis P3 cluster (items 5-7) is fully shipped +
archived to 2026-06.md: CHAPTER-SNAPSHOTS-01, DOCX-IMPORT-01
(closed-by-discovery), WRITING-HISTORY-STATS-01.

- **BOOK-TYPE-CARD-COMPONENT-EXTRACT-01** (P3, RCU pre-
  registered, filed 2026-05-23 from GETSTARTED-MULTIBOOK-
  TYPES-UPDATE-01 C5 close per Q4 adjudication): the
  GetStarted.tsx `BOOK_TYPE_CARDS` inline config + its 3-card
  grid rendering are the first instance of a "book-type card"
  pattern. RCU 2-surface threshold says: extract when a 2nd
  consumer lands, NOT speculatively.

  ### Likely 2nd surfaces

  - **Dashboard CreateBookModal pre-step**: before opening
    the modal, picture-book and comic-book creation could
    show a 3-card picker (instead of the current split-
    button + dropdown). The cards' shape would be identical
    to GetStarted's.
  - **Settings > Author Profile > "Default book type"**: a
    visual picker for the user's preferred default.
  - **Help docs**: per-book-type landing pages could share
    the card visual as a navigation tile.

  ### Pre-registered

  This filing exists so the next contributor who lands a 2nd
  consumer sees the RCU extraction triggered + already-
  scoped. No code yet; trigger fires when 2nd site is
  ready to ship.

  ### Cross-references

  BOOK-TYPES-SSOT-YAML-01 closed 2026-05-24 (commits
  `d2dcd8e..c68ec21`). When the card-component extract
  fires (3rd surface trigger), the shared component reads
  per-type metadata from useBookTypes() — the registry is
  already in place; this extract just consolidates the
  card-shape duplication once a 3rd surface lands.

  ### Trigger audit 2026-05-25 (NOT MET)

  Pre-Coding-Reality-Check ran when this entry came up in
  the backlog queue post-DASHBOARD-PAGINATION-LOAD-MORE-01
  close. Grep-verified consumer count: **1** (only
  `frontend/src/pages/GetStarted.tsx:262-278` renders the
  book-type card grid; reads from `useBookTypes()` since
  BOOK-TYPES-SSOT-YAML-01 C5).

  Each "Likely 2nd surface" candidate re-checked, none
  landed:

  - Dashboard `CreateBookModal` pre-step: still uses the
    split-button + dropdown chooser; no 3-card picker.
  - Settings > Author Profile > "Default book type": no
    such field exists in code or settings YAML
    (`default_book_type` grep returns zero matches).
  - Help docs per-book-type landing pages: no such
    structure in `docs/help/`.

  Item correctly deferred per its own deferral language
  ("extract when a 2nd consumer lands, NOT speculatively").
  Trigger unchanged; this annotation documents that the
  audit was performed so the NEXT contributor knows the
  state is fresh and can re-skip without re-running the
  same audit.

- **KDP-WIZARD-RESUME-AT-STEP-01** (P3, FEATURE-REFINEMENT,
  filed 2026-05-22 from KDP-PUBLISHING-WIZARD-01-PHASE-2 C10
  close): true "resume at last visited step" for the KDP
  Publishing Wizard. C10 ships partial-persistence: the
  wizard's pricing + ARC choices auto-save and rehydrate on
  reopen, but the wizard always RESTARTS at the metadata step
  (re-validating against the current book). True resume-at-
  step would require server-stored validation results so the
  machine can skip past metadata + cover when the book hasn't
  changed.

  ### Trigger

  - User explicitly requests "wizard remembers where I was" as
    a real workflow need (e.g. "I keep re-validating metadata
    every time I open the wizard; that's annoying").
  - OR the metadata + cover validation API calls measurably
    slow down opening the wizard (currently sub-second).

  ### Scope

  - Server-side: store validation results (or a verifiable
    hash of the book's metadata-relevant fields at last
    validation) on the publishing-state row. Compare on
    wizard mount; if unchanged, skip metadata + cover steps.
  - Machine: add a synthetic `RESUME_AT` event that jumps to
    a deferred target based on the persisted
    `launch_checklist_state.wizard_step`. C10 already saves
    this field; today it's unused on read.
  - Conflict-resolution interaction (C11 banner): banner
    fires when `book.updated_at > state.updated_at`; on
    banner-visible, resume-at-step force-restarts at
    metadata regardless of the saved last_step. C11 already
    handles the timestamp comparison; resume-at-step
    extends it.

  ### Why deferred

  v1 simplicity — the partial-persistence ships a working
  user experience without the verification-result-storage
  complexity. Real demand would surface "this is annoying"
  feedback; without that signal, the simpler restart-at-
  metadata model is more honest about what the wizard
  actually re-checks.

  ### Trigger audit 2026-05-25 (NOT MET)

  Pre-Coding-Reality-Check ran when this entry came up in
  the backlog queue post-BOOK-TYPE-CARD-COMPONENT-EXTRACT-01
  audit. Both triggers verified absent:

  - **No user feedback** about "wizard re-validates every
    time" annoyance. Grep of `docs/journal/` for
    "wizard.*annoying" / "resume.*wizard" / "wizard.*remember"
    returns zero matches.
  - **No measured perf regression**. Grep of `docs/journal/`
    for "wizard.*slow" / "wizard.*perf" / "wizard.*latency"
    returns zero matches. Validation calls remain sub-second
    per the original filing.

  Code-state confirmed unchanged from the filing:
  `KdpPublishingWizard.tsx:170-172` writes
  `launch_checklist_state.wizard_step` on every auto-save
  but no mount-side reader consumes it (grep verified).
  The C10 partial-persistence shape is intact; resume-at-
  step infrastructure remains a green-field add when a
  trigger fires.

  Item correctly deferred per its own "Real demand would
  surface 'this is annoying' feedback" language. Trigger
  unchanged; this annotation documents that the audit was
  performed so the NEXT contributor knows the state is
  fresh and can re-skip without re-running the same audit.

- **MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01** (P3, filed
  2026-05-20 from the re-prioritization audit Q6 adjudication
  / β-path).

  ### Deferred 2026-05-22

  User-adjudicated to defer until a real user-pull signal lands.
  Rationale: no Bibliogon mobile app exists; no user has
  requested mobile sync; the Comics-Foundation-Trigger-Gate is
  technically met but no user demand justifies the strategic
  attention. Re-evaluate when mobile access becomes a real user
  request (e.g. an issue filed asking for phone-side
  Capture-Review-Surface, OR Aster explicitly schedules a
  mobile-app session). Until then the exploration doc stays as
  the load-bearing tracker; this triage item parks at P3 with
  no trigger fired.

  ### Scope

  Triage the open exploration doc at
  ``docs/explorations/exploration-bibliogon-mobile-selective-sync.md``
  (filed 2026-05-20 by Strategic-Advisor; status "Open
  exploration; not yet decisions").

  The exploration adapts adaptive-learner Phase 13 (PWA/Dexie
  phone + FastAPI/SQLite desktop, Local-Sync via QR-pairing +
  AI-Assisted-Merge) to Bibliogon-specific constraints. Key
  constraint per the exploration: user selects which content
  (books / articles / chapters) goes mobile, NOT full-database
  sync. Phone is **Capture-and-Review-Surface**, not
  **Production-Surface** — Picture-Book layout, Comic panel-
  grid, KDP Wizard are desktop-primary.

  Triage produces per-phase backlog items (or alternative
  direction) based on user-strategic-decision. The exploration
  doc's 5-phase plan is a starting point; the triage may
  consolidate / split / re-scope phases based on adoption
  signal + constraint review.

  ### Q6 audit context (path-β rationale)

  Re-prioritization audit (2026-05-20) Q6 surfaced two paths:

  - **α**: file 5 individual phase-items
    (MOBILE-SYNC-PHASE-A-PWA-FOUNDATION-01,
    ...-PHASE-B-MOBILE-UI-01, ...-PHASE-C-SELECTIVE-SYNC-01,
    ...-PHASE-D-MERGE-01, ...-PHASE-E-POLISH-01)
  - **β**: single triage item that produces per-phase items
    later

  Adjudicated β. Reasoning: the exploration is "open
  exploration; not yet decisions" per the doc itself. Filing
  5 phase-items pre-empts the strategic decision the
  exploration is meant to surface. β preserves optionality
  and respects the exploration's status.

  ### Dependencies + trigger

  **Trigger**: Comics-Foundation work reaches a stable state
  where Mobile-Sync becomes a viable next-direction.
  Concretely: PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 (P1)
  ships first; comic-book authoring is unblocked; then
  Mobile-Sync exploration triage can proceed without
  competing for attention with active Comics work.

  **Comics-Foundation-Trigger-Gate**: explicit dependency.
  Don't run Mobile-Sync triage while Comics-Session-3 is in
  flight — splitting attention across two strategic
  directions risks shipping neither well (same reasoning as
  the original PB-PHASE4 / plugin-comics sequencing
  decision).

  ### Effort

  S-M (1 session, ~3-5 commits):

  1. Triage-doc commit: read the exploration, map its 5
     phases against current Bibliogon strategic-state, surface
     architecture decisions for Strategic-Advisor review.
  2. Per-phase item filings (variable count depending on
     triage outcome): each phase becomes its own backlog item
     with concrete trigger + scope + effort. Phases that
     consolidate become single items; phases that defer
     remain in the exploration doc only.
  3. Cross-reference + close: this triage item closes when
     the per-phase items are filed; the exploration doc
     gets a "Triage outcome" section referencing them.

  ### Cross-references

  - ``docs/explorations/exploration-bibliogon-mobile-selective-sync.md``
    (the exploration doc itself)
  - ``PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01`` (P1; the
    Comics-Foundation-Trigger-Gate prerequisite)
  - ``docs/audits/backlog-reprioritization-2026-05-20.md``
    Open Question Q6 (the audit context that filed this
    item)

  ### Status

  Pre-implementation triage required. Not P2 because no
  immediate user-pain-blocker; not P4 because the filed
  exploration deserves resolution. P3 captures "should
  triage when the gate fires."

- **MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01** (P3,
  filed 2026-05-20 during halted Comics-Session-2 cleanup):
  decide which recommendations from
  ``docs/explorations/exploration-multi-agent-gitflow-coordination.md``
  (filed by Strategic-Advisor 2026-05-20) to adopt as
  AI-workflow rules.

  ### Deferred 2026-05-22

  User-adjudicated to defer until the current single-agent CC
  workflow hits a real scaling limit. Rationale: the existing
  single-agent + manual Strategic-Advisor layer is productive
  (15+ commits/day demonstrated 2026-05-22; 7 backlog items
  closed in one session). Multi-agent coordination optimization
  is premature scope until the single-agent cadence breaks down
  AND the breakdown traces back to one of the 7 failure modes
  from the exploration doc (not just generic friction).
  Existing Lessons-Learned rules ("Multi-tool collaboration
  tracking", "Pre-Coding-Reality-Check") already encode the
  highest-value workflow-discipline pins; the exploration's
  remaining recommendations stay in the doc as candidates
  until a concrete failure-mode recurrence demands them.

  ### Evidence base

  Two concrete failure modes from the exploration doc fired
  during the 2026-05-20 work day:

  1. **Failure-Mode 6 (User-Mediated-Sync-Gap) + stale-state
     assumption.** Multiple times this session, my reports
     referenced "7 commits ahead of origin" based on a stale
     view of origin/main captured at session start. Between
     that capture and later reports, the parallel-CC agent
     had pushed the V060-adoption work. The stale view
     persisted across multiple reports because I never
     re-fetched. The user had to surface the discrepancy via
     "user reports V060 push happened yesterday".
     Strategic-Advisor's branch-state was invisible to me
     because I didn't re-check.

  2. **Failure-Mode 1 (cross-branch architecture decisions
     not coordinated)**. The halted Comics-Session-2's
     recursion-regression was initially mis-attributed to the
     V060 baseline. Bisect (filed under
     ``PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01``) showed
     V060 baseline is clean — the regression is in
     Comics-Session-2 C2 itself. Without the explicit
     bisect-isolation step, the wrong subsystem got fingered
     + a halt-plus-file order was issued for the wrong
     reason.

  3. **Undocumented Bibliogon convention surfaced**:
     single-router-per-plugin pattern (kinderbuch precedent).
     Comics-Session-2 original design specified 3 routers;
     the refactor restored the convention but cost a
     Stop-Condition-Trigger. Filed separately as the
     ``Single-Router-Per-Plugin Convention`` Lessons-Learned
     entry (this session).

  ### Decisions pending

  - Which Strategic-Advisor recommendations from the
    exploration doc to adopt as durable AI-workflow rules vs
    one-off discipline reminders?
  - Specifically: is the proposed "re-fetch + verify branch
    state at session start AND before any inter-session
    state claim" worth codifying in ``.claude/rules/ai-workflow.md``?
  - Is "Pre-Inspection-Pattern-Audit must explicitly grep
    existing plugin / module conventions before specifying
    new structure" a separate rule or an extension of the
    existing Pre-Coding-Reality-Check?
  - Coordinate with the sibling exploration
    ``exploration-bibliogon-mobile-selective-sync.md`` (also
    filed 2026-05-20 by Strategic-Advisor) if its
    recommendations overlap.

  Trigger: Strategic-Advisor schedules a review session OR
  next halted-Session retrospective surfaces a new instance
  of any of the 7 failure modes from the exploration. Effort:
  S-M (1-3 commits) — primarily docs / rule edits + a few
  workflow-discipline pins in ``.claude/rules/``.

- **REMINDER-PANEL-GENERIC-EXTRACTION-01** (P3, filed
  2026-05-18 from v0.35.1 donation tuning): extract a
  generic ``ReminderPanel`` component from the existing
  ``DonationReminderBanner``. Per the Recurring-
  Component-Unification Rule (formalised in
  ``.claude/rules/coding-standards.md`` 2026-05-19), a
  UI pattern shared across 2+ surfaces extracts NOW
  rather than after the 3-duplicate threshold. The
  donation banner is currently single-site; this filing
  pre-registers the extraction for the SECOND surface
  that needs the same shape.

  Likely future second-sites that would trigger the
  extraction:
  - **Update reminder**: "v0.36.0 is available — review
    changelog?". Same layout (icon + body + 2 buttons +
    close-X), same 90-day-style cooldown semantics,
    same App-level mount placement.
  - **Survey reminder**: "Help us improve Bibliogon —
    optional 2-minute survey?". Same shape.
  - **Backup reminder**: "It has been 30 days since
    your last backup. Run one now?". Same shape with
    a different cooldown.

  Scope when triggered:
  - Extract ``ReminderPanel`` to
    ``frontend/src/components/ReminderPanel.tsx`` with
    props: ``icon``, ``title?``, ``body``, ``primaryCta:
    {label, onClick} | {label, href, onClick?}``,
    ``secondaryDismissLabel``, ``onPrimary``,
    ``onDismiss``, ``aria-label``.
  - Refactor ``DonationReminderBanner`` to consume
    ``ReminderPanel`` (keeping the donation-specific
    schedule/cooldown logic outside the generic shell).
  - Migrate the SECOND site at the same time per the
    rule's "2-surfaces threshold + same-session
    migration" requirement.
  - i18n keys stay per-feature (donation strings stay
    under ``ui.donations.*``; update-reminder strings
    would live under ``ui.update_reminder.*``, etc.).
  - Vitest covering the ReminderPanel shape + per-
    feature wrappers.

  Trigger: the second feature that needs a reminder-
  shaped affordance lands. NOT speculative — wait for
  a real second-site.

  Effort estimate: 4-6 commits (extract + 2-site
  migration + Vitest + E2E + i18n + lessons-learned
  reference).

  Pairs with: ``RECURRING-COMPONENT-AUDIT-01``
  (frontend-wide audit, separate filing). This entry
  is the donation-specific component's planned
  extraction; the audit-01 entry is the broader sweep
  for ALL candidates.

  Closes prior P0-escalation thread (DONATION-
  REMINDER-PANEL-01): v0.35.1 tuned the existing
  Bibliogon donation infrastructure rather than
  building a new generic ReminderPanel; generic
  extraction defers here.

- **PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01** (P3, filed
  2026-05-18 from 4c-B-1 smoke Bug 3): allow per-character
  / per-span font overrides on a picture-book page.

  Current state (post-Bug-3): the Font dropdown applies
  the selected font to the ENTIRE document via an
  auto-select-all in the onChange handler. Picture-book
  convention is one page one consistent font, so this is
  the right MVP. A future "advanced" mode could surface
  a per-mark override (e.g. a quoted line in a different
  font, or a single onomatopoeia word in Comic Neue while
  the rest of the page uses Atkinson Hyperlegible).

  Scope: a toggle in Settings or a modifier-key behavior
  on the Font dropdown that lets the picker apply to the
  current selection ONLY (the original TipTap default
  behavior pre-Bug-3). The G4 PDF walker already supports
  per-mark fontFamily — only the editor's apply-scope
  needs the conditional branch.

  Trigger: explicit user request for per-mark font
  control on a picture-book page OR Comic-Foundation
  Session needs per-bubble font variation (each bubble
  could carry its own font without affecting other
  bubbles on the same page).

  Effort: 1-2 commits (toggle + branch in the onChange
  handler + Vitest pin + a help-doc note explaining
  when to use it).

- **PICTURE-BOOK-PDF-FRONT-MATTER-01** (P3): author-controlled
  front-matter pages (dedication / copyright / imprint) in
  the generated picture-book PDF. v0.35.0 MVP omits front-
  matter entirely (KDP auto-inserts a copyright line during
  print processing per the audit D5 finding); explicit
  authored front-matter is the next refinement. Scope:
  - Schema: new ``Book.picture_book_front_matter`` JSON column
    (or per-Book columns ``dedication``, ``copyright_notice``,
    ``imprint``) — design TBD at session-start.
  - Backend: generator inserts the front-matter pages BEFORE
    the cover page (or between cover + Page 1 — TBD).
  - UI: a dedicated section in the BookMetadataEditor's
    Design tab for the picture-book front-matter editor.
  - i18n + Vitest + Playwright.
  Trigger: user requests author-controlled front-matter OR
  Aster's second book needs an imprint page. Approx 5-7
  commits. Filed per audit D5 reservation at S6 close.

- **PICTURE-BOOK-KDP-SPECIFIC-FIELDS-01** (P3): add three KDP-
  specific metadata fields for picture-books (and likely future
  comic-books): `age_range` (e.g. "3-6", "4-8"), `page_count`
  (derived display from `len(pages)`, no schema change needed),
  and `print_format` (e.g. "square_8.5x8.5", "landscape_8.5x11").
  Surfaced during PB-PHASE4 Session 5 D5 sub-decision; deferred
  because (a) age_range + print_format require backend schema +
  Alembic migration outside the "expose existing fields" core
  ask of Session 5, (b) including them would push commit count
  beyond the stop-condition, (c) the user feedback was about
  Book-Metadata access for KDP publishing, not new KDP fields —
  closing the access gap was the primary win.
  Trigger: user-feedback that current Book-Metadata fields are
  insufficient for KDP picture-book publishing OR first KDP
  picture-book upload attempt reveals the field gap. NOT
  schedule-tied — concrete user-signal so the work lands when
  the gap is real.
  Scope:
    - `Book.age_range` column (nullable string, e.g. "3-6") +
      Pydantic schema + Alembic migration; UI surface on the
      General tab when `book_type === "picture_book"`.
    - `page_count` display-only (computed from `len(pages)`) on
      the General tab; no schema change.
    - `Book.print_format` column (enum-style string, e.g.
      "square_8.5x8.5") + Pydantic + Alembic + UI on the
      Publisher tab.
    - i18n for new labels across 8 catalogs (~6-9 keys).
    - Vitest for the field-rendering + persistence; E2E for the
      full edit-save-reload flow.
  Effort: 5-7 commits.
  Strategic note: when implementing, consider whether shared
  `book_type`-conditional fields make sense (e.g. age_range
  might apply to picture-books AND comic-books for children's
  segments) vs. separate `sub_type`-specific surfaces. Future
  comic-book editor likely has similar specific KDP needs
  (panel-count, page-count, format). One consistent shape
  reduces future drift.

- **LIST-VIEW-ROW-SHARED-EXTRACTION-01** (P3): extract a shared
  `<ListViewRow>` base component that `ArticleRow` and
  `BookListRow` can both consume.
  Trigger: a third instance of duplicate list-view-row code
  appears (e.g. a new Comments-Admin list view, or a Publications
  list view), OR a styling drift between Articles and Books list
  views surfaces in production.
  Scope: extract shared base component with selection + actions
  + content slots; migrate ArticleRow and BookListRow to consume
  it; preserve all existing testids; keep the per-row click
  guards (stopPropagation on checkbox/menu).
  Effort: 5-8 commits (substantial refactor).
  Deferred reason: not blocking the user-visible v0.33.0 Bug 2
  fix; would inflate that hotfix session. The current per-page
  list-row duplication is the price of the speed-of-fix tradeoff.

- **CONVERT-TO-BOOK-ASSET-CLONE-01** (P3): asset-clone walker
  for the article-to-book conversion feature.
  Trigger: first user report that book images break after they
  deleted a source article post-conversion.
  Scope: walk the source articles' `content_json`, find every
  `imageFigure` node, copy the referenced `ArticleAsset` files
  into a new `Asset` row scoped to the new book, rewrite the
  TipTap JSON `src` attribute from
  `/articles/{article_id}/assets/...` to
  `/books/{book_id}/assets/file/...`. Hook into the existing
  `POST /api/books/from-articles` endpoint so the clone happens
  in the same transaction as the chapter inserts (rollback
  semantics preserved). Plus an asset-cleanup branch in the
  book-delete handler that removes the cloned files (book
  assets are book-scoped so cascade-delete already handles the
  DB rows; the on-disk files need explicit cleanup).
  Effort: 2-3 commits (walker + endpoint integration + delete
  handler + tests).
  Defer reason: hypothetical until user-impact verified. The
  decoupled-lifecycle design assumes users do NOT delete source
  articles they've already converted; the help-doc workaround
  ("re-upload affected images via the Book editor") is
  acceptable while we have zero broken-image reports. Filed by
  Phase 1 Q9 deferral, 2026-05-15.

- **PGS-05-FU-01**: real-world unified-commit failure-mode tuning
  (only one of two subsystems active, partial-failure UX). Effort
  S; trigger by user report.

- **PLUGIN-COMICS-SESSION-3-EXTENDED-FEATURES-01** (P3, filed
  2026-05-20 from Comics-Session-2 close). Session-3 polish work
  on the ComicBookEditor surface. Per the original Comic-
  Foundation exploration (``docs/explorations/comic-foundation.md``)
  Session-3 scope:

  - **Drag-to-position** for bubbles within their panel
    (anchor.x_pct / anchor.y_pct via pointer events)
  - **Snap-to-grid** + **keyboard nudge** (arrow keys) for
    fine-positioning
  - **Per-bubble undo / redo** (separate from global undo)
  - **Reading direction** (LTR / RTL) toggle on the comic_book
    so right-to-left layouts (manga-style) get correct page-turn
    + bubble-traversal order
  - **z-order controls** (bring to front / send to back) for
    overlapping bubbles within a panel
  - **Panel gutter / spacing** controls in panel_config (already
    has a stub field; UI not yet exposed)
  - **TipTap-in-bubbles** (replacing the Q2 a plain-text default
    with rich-text — defer to v2 of this item, no demand signal
    yet)
  - **Full Playwright E2E coverage matrix** (Session-2 shipped 3
    smoke specs; Session-3 ships the long-suite full-regression)
  - **Auto-tail-direction nearest-edge picker** (Session 2's
    ``tail_direction="auto"`` currently gamma-shims to "S"; Session
    3 picks the panel-edge closest to the speaker)

  Effort: 8-12 commits across 1-2 sessions (audit-revised
  estimate 17-23 commits; see audit file).

  Trigger: Session-2 has shipped ✓, ``PLUGIN-COMICS-SESSION-3-
  PAGES-CRUD-01`` has shipped ✓, and at least one user-report
  hits one of the missing affordances.

  **BLOCKED-BY (filed 2026-05-20):**
  - ``PLUGIN-COMICS-PHASE-1-MULTI-PANEL-LAYOUTS-01`` (P1)
  - ``PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01`` (P2, filing TBD)

  Phase 1 + Phase 2 close the 4 user-findings surfaced
  2026-05-20 (multi-panel-bug + standard-layouts + panel-image-
  upload + LayoutConfigComicPanel). Phase 3 = this item ships
  AFTER Phase 1 + Phase 2. Q1-Q4 architecture decisions
  pre-audited at
  [docs/audits/extended-features-pre-inspection-2026-05-20.md](audits/extended-features-pre-inspection-2026-05-20.md).

- **MEDIUM-IMPORT-V2-02**: AI tag inference for imported articles.
  Medium's HTML export strips tags. v1 imports articles with an
  empty tag list and the user adds them manually. v2 should call
  the existing `backend/app/ai/` core module per imported article
  with title + first paragraph + body excerpt and propose 3-5
  tags, surfaced for review in the dry-run table from v01. Effort:
  S-M depending on tag-quality bar. Trigger: first user report
  asking for it OR v01 ships and the manual-tagging step is a
  visible bottleneck in feedback.

- **STORY-BIBLE-PLUGIN-01** (P3, STRATEGIC, filed 2026-05-19):
  per-book fiction-writing entity database (Characters, Settings,
  Plot-Points, Items, Lore). **Sessions 1 (backend) + 2 (frontend)
  shipped 2026-05-30** — plugin scaffold, core StoryEntity model +
  migration + SSoT registry, CRUD API, StoryBibleSidebar +
  StoryEntityEditor in BookEditor, per-type icons/colors, i18n
  (DE+EN real, 6 passthru), help docs (DE+EN). The remaining work
  (Session 3 relationship-graph + timeline, Session 4 @-mention
  TipTap extension, cross-book/series scope, i18n native review) is
  tracked in ROADMAP > P5 under `STORY-BIBLE-PLUGIN-01`.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/archive/roadmap/2026-05.md](archive/roadmap/2026-05.md).)

(PLUGIN-COMICS-E2E-SMOKE-01 CLOSED 2026-05-25; archive entry
in [docs/archive/roadmap/2026-05.md](archive/roadmap/2026-05.md).
The live-dev plugin-info-panel-renders + no-plugin-error
assertion landed as a 4th test in
``e2e/smoke/comic-book-editor.spec.ts``; the related stale
``version === "1.0.0"`` assertion in
``user-overlay-migration.spec.ts`` was bumped to ``/^1\./``
in the same session.)

- **GH-ACTIONS-PERIODIC-AUDIT-01**: recurring CI-hygiene audit
  for GitHub Actions version drift. The 2026-05-14 sweep
  found that within 6 months of GitHub's 2025-09-19 Node 20
  deprecation, EVERY standard action we use released a new
  major. The pattern (deprecation announcement → cascade of
  major bumps across actions/* + common third-parties) is
  predictable, not exceptional. Filing it explicitly prevents
  the "we should have checked sooner" surprise on the next
  cycle.
  Trigger: 3 months since the last full CI-hygiene audit
  (last: 2026-05-14 → next due 2026-08-14), OR any Node
  runtime / platform deprecation announcement from GitHub
  before then (subscribe-able via
  https://github.blog/changelog/?tag=actions).
  Scope: re-run the full audit per the methodology in
  `.claude/rules/lessons-learned.md` "External GitHub Action
  major-version drift" — specifically the **action.yml
  `runs.using:` read**, not release-note prose (per the trap
  documented in the same lesson). Includes the deferred
  `GH-ACTIONS-OPTIONAL-BUMPS-01` items if their triggers have
  fired by then.
  Effort: S-M depending on what's drifted. Filed by the
  2026-05-14 CI-hygiene session as the explicit
  next-touchpoint.

- **MEDIUM-COMMENT-MANUAL-ENTRY-01**: manual "Add
  comment" UI in the article editor that creates an
  ``ArticleComment`` with ``imported_from = "manual"``
  rather than ``"medium"``. The schema already supports
  this via the ``imported_from String(50)`` column; no
  migration needed. Trigger: user demand for capturing
  comments-on-my-articles in Bibliogon for archival.
  Surfaced 2026-05-12 after the user verified Medium's
  HTML export is "your data only" by design — replies
  others left on the user's articles are not included
  in the export, and Bibliogon cannot import what
  Medium doesn't expose. The manual-entry workflow is
  the only forward-compatible path to archive incoming
  comments. Scope hint: editor sidebar gains an "Add
  comment" button next to the existing
  ``ArticleCommentsPanel`` heading; on click opens a
  small modal collecting author + body_text +
  optional published_at + optional responds_to_url
  (the URL of the source thread the user is
  transcribing from). The ``responds_to_article_id``
  is pre-filled with the open article's id. Effort: S
  (one new component + one POST endpoint that the
  comments router currently lacks; the GET / DELETE
  paths exist already).

---

## P4 - Roadmap / Future Phases

Scrivener analysis items 8-10 (filed 2026-06-01 from
``docs/audits/scrivener-competitive-analysis-2026-06.md``):

- **CHAPTER-COLLECTIONS-01** (P4, FEATURE-REQUEST, filed 2026-06-01
  from the Scrivener analysis, top-10 #8): named, saved groups of
  chapters (Scrivener "Collections" parity).

  Scope:
  - Manual collections + saved-search ("smart") collections, e.g.
    "all scenes with Mara", "needs second pass".
  - Saved-search can build on the Story Bible entity filter (already
    answers "all chapters with entity X") + the
    CHAPTER-STATUS-LABELS-01 status/label filters.
  - A ``collections`` table for manual groups.

  Effort: M. Placement: Plugin or Core; leans on Story Bible +
  status/label. Value: Medium.

- **SCRIVENER-PROJECT-IMPORT-01** (P4, FEATURE-REQUEST, filed
  2026-06-01 from the Scrivener analysis, top-10 #9): import a
  ``.scriv`` project into a Bibliogon book (the single biggest lever
  for *converting* Scrivener users).

  Scope:
  - Parse the ``.scrivx`` XML index for binder structure; convert the
    per-document RTF -> TipTap via Pandoc.
  - Map binder -> chapters, synopses -> notes/synopsis,
    labels/status -> CHAPTER-STATUS-LABELS-01 fields, keywords ->
    tags/Story Bible entities.
  - Only valuable once CHAPTER-STATUS-LABELS-01 + synopsis fields
    exist (so imported metadata has a home).

  Effort: L. Placement: Plugin (``plugin-scrivener-import``). Value:
  Medium-High (migration).

- **CHAPTER-SYNOPSIS-NOTES-01** (P4, FEATURE-REQUEST, filed
  2026-06-01 from the Scrivener analysis, top-10 #10): a dedicated
  per-chapter synopsis field + project-level notes scratchpad.

  Scope:
  - Per-chapter synopsis (distinct from Storyboard ``notes``) with
    optional auto-generate from the first paragraph.
  - Project-level notes field on ``Book``.
  - Overlaps the existing Storyboard ``notes`` column — Pre-Inspection
    decides whether to reuse/extend ``notes`` or add a dedicated
    field.

  Effort: M. Placement: Core. Value: Medium.

- **STORY-BIBLE-INTEGRATION-DOCS-01** (P4, re-scoped 2026-06-01
  after v0.43.0 shipped the E2E prose-storyboard smoke + the
  three sibling feature items): the REMAINING comprehensive
  documentation for the Story Bible epic — help docs (DE+EN) for
  the Story Bible, Storyboard (all 3 book types), @-mention, Arc
  View + Continuity Checker, and the relationship editor; plus a
  full integrated-flow Playwright smoke (create book -> Storyboard
  -> sidebar -> drag character -> badge -> Arc View -> continuity
  warning -> @-mention -> export) and marketing screenshots. The
  v0.43.0 release shipped a focused `prose-storyboard.spec.ts`
  smoke + the CHANGELOG/README-level prose; the help-page set +
  screenshots (which need `_meta.yaml` nav + DE/EN parity + a
  running app) are the deferred remainder.

- **COMPONENT-CONSISTENCY-TAIL-01** (P3, filed 2026-06-01,
  deferred from the v0.43.0 execution session under budget): the
  remaining slices of the v0.42.0 component-consistency sweep,
  all ADVISORY (`make verify-components` exits 0). (a) remaining
  badge sites (PluginCard tier, comic/AI status chips) +
  Settings/GetStarted/MediumImportPage card surfaces -> global
  `.badge-*` / `.card`; (b) ~12 remaining inline checkboxes ->
  `Toggle` (accent already unified; structural only; respect the
  documented design-intent exemptions); (c) Toolbar stateful
  button system + inline-style inputs (PricingStep/ArcStep); (d)
  raw-Radix `Dialog` -> shared `AppDialog` (~32 sites). Group by
  component type; one commit per type. Fix any Playwright spec the
  migration breaks (fix the spec, not the migration).

- **SETT-M-2-PER-TAB-SUBSECTION-HEADERS-01** (P4, UX-POLISH,
  filed 2026-05-25 from Settings-page UX audit, deferred per
  user adjudication; **partial scope shipped 2026-05-26**): add
  explicit subsection headers within each Settings tab (e.g.
  "Anzeige" / "Speichern" / etc.) so the existing
  card-per-subsection pattern surfaces a named hierarchy.

  ### Partial-scope status (2026-05-26)

  SETT-QW-7 (commit `91704f6` + content commit `fd855ff`)
  shipped the new ``SectionHeader`` composition component +
  per-TAB descriptions across every Settings tab. That covers
  the "what does this tab do" cue at the top of each tab.

  Still pending: per-SUBSECTION-within-tab headers (the named
  ``subCardTitle`` style is already used in ErscheinungsbildSettings'
  ``Standard-Ansichten`` block; needs consistent application
  across the other tabs that have multiple logical sub-groups —
  Verhalten + AI + Audiobook + Backups + Erweitert).

  ### Why P4

  Lower impact than SETT-PHASE-1..3; the per-TAB layer is
  shipped, the per-subsection-within-tab layer is the natural
  next iteration.

  ### Trigger

  Either (a) a user report about in-tab findability friction;
  or (b) a natural session that touches multiple Settings
  sub-components for another reason.

  ### Effort

  2-3 commits (revised down from 3-4 since per-TAB scope is
  already done).

- **SETT-M-4-SETTINGS-SEARCH-01** (P4, FEATURE-REQUEST, filed
  2026-05-25 from Settings-page UX audit, deferred per user
  adjudication): search box above the Settings tab bar that
  live-filters tabs + within-tab cards by matching label +
  description text.

  ### Why P4

  At 11 tabs the current structure is navigable without search;
  a half-baked search (matches some controls but not others) is
  worse than no search.

  ### Trigger

  User complaint about findability OR Settings reaches 15+ tabs.

  ### Effort

  5 commits (search component + per-tab filter wiring + Vitest +
  Playwright + i18n).

- **BACKUP-DIFF-DEEP-VARIANTS-01** (P4, FEATURE-EXTENSION,
  filed 2026-05-19 from the
  ``docs/audits/exploration-features-2026-05-15-evaluation.md``
  triage of exploration feature #10): deep-variants of the
  existing Backup-Comparison surface. Two-backup file compare
  ships today via ``BackupCompareDialog`` (relocated to
  Settings -> Backups by ``BOOKDASHBOARD-CLEANUP-01``,
  2026-05-18). The exploration's per-Article / per-Settings /
  selective-restore variants are user-feedback-gated.

  Scope:
  - **Per-Article diff**: drill from a backup snapshot into the
    Article-level changes (added / removed / modified)
  - **Per-Settings diff**: configuration-drift view comparing
    plugin settings + app.yaml at two points in time
  - **Selective restore**: pick specific changes from a diff
    tree to roll back, leaving the rest untouched. Inverse of
    "full backup restore" - "I want THIS chapter from last
    week, but keep everything else current."

  Architecture-discipline notes (per audit
  Track C):
  - **Recurring-Component-Unification**: the entity-diff
    renderer needed for per-Article + per-Settings diffs is
    the same shape as ``BackupCompareDialog``'s existing
    per-field diff. Extract a reusable ``DiffRenderer``
    component in the same session that lands the second
    variant. The 2-surfaces threshold fires when the second
    deep-variant ships.
  - **Half-Wired risk for selective-restore**: shipping the
    diff-tree UI without the selective-restore execution path
    creates a half-wired feature (user sees changes, can
    select them, but the "Restore selected" button is greyed
    out). Pre-Inspection must confirm both halves ship
    together.

  Effort: M (per variant; ~3 variants = 9-12 commits total
  if all three land). Trigger:
  - **Granular-diff trigger**: user requests "what changed in
    THIS article between these two backups?" OR
    configuration-audit need surfaces
  - **Selective-restore trigger**: a user reports a partial-
    rollback need ("I lost just THIS chapter but everything
    else is fine") - rare, defer until reported

  Defer reason: zero current pain. Two-backup file compare
  covers the present use-cases. Variants are nice-to-have
  refinements that user feedback hasn't yet driven.

- **FULLSCREEN-PATTERN-RECONCILE-01** (P4, REFACTOR, filed
  2026-05-18 by the EDITOR-FULLSCREEN-NATIVE-01 closure):
  Bibliogon now has TWO distinct fullscreen patterns in
  production. They serve different use-cases and coexist
  deliberately per the F3 decision; this item tracks the
  future reconcile when a third surface emerges OR
  user-feedback identifies confusion.

  - **State-CSS app-internal pattern**:
    ``frontend/src/components/textarea/EnhancedTextarea.tsx``
    (lines 101-222). Grows the textarea wrapper to fill its
    parent (``width: 100%; height: 100%``); Escape exits.
    Browser chrome stays visible; the user remains in the
    app. Used by long-form textareas inside dialogs
    (BookMetadata description, backpage, etc.).
  - **Browser Fullscreen API pattern**:
    ``frontend/src/hooks/useFullscreenToggle.ts`` shipped
    2026-05-18. Calls
    ``document.documentElement.requestFullscreen()``; F11 /
    Escape / Ctrl+Shift+F all work; browser chrome hidden.
    Used by editor surfaces (Editor.tsx Toolbar, PageEditor,
    ComicBookEditor).

  Why they coexist today:
  - The textarea pattern is intentional for in-dialog editing
    where you DON'T want the whole window to fullscreen; the
    user is doing a quick metadata edit, not a writing
    session.
  - The hook pattern is intentional for editor surfaces where
    the user IS writing and wants maximum screen real estate.
  - Different semantics, different placements, both correct
    for their context.

  Reconcile-trigger conditions:
  - **2-surfaces rule** (Recurring-Component-Unification):
    fires when a third surface needs fullscreen. A
    distraction-free mode (per the original filing's
    scope-expansion candidate) would be the natural third
    surface. If that lands, extract a unified
    ``fullscreenStrategy: "browser" | "wrapper" |
    "distraction-free"`` API.
  - **User-feedback signal**: if users start confusing the
    two buttons (e.g. clicking EnhancedTextarea's fullscreen
    and expecting browser-chrome to hide, or vice versa),
    that's the trigger to either:
    a) Rename one to disambiguate (e.g.
       "Expand textarea" vs "Fullscreen window"), OR
    b) Migrate one pattern onto the other.

  Scope when triggered (estimated 2-4 commits):
  - Decide the unified API (a hook factory + per-surface
    config, OR two separate hooks with clear names)
  - Migrate the loser pattern OR rename to disambiguate
  - Vitest + E2E for the migrated/renamed surfaces
  - lessons-learned entry documenting the decision

  Defer reason: zero current pain. Both patterns work
  correctly in their contexts. Premature unification would
  force a one-size-fits-all UX that fits neither case.
  Trigger-gated per the 2026-05-19 Recurring-Component-
  Unification 2-surfaces threshold.

- **MYPY-V2-MIGRATION-01**: bump ``mypy`` from 1.20.2 to
  2.x. Major bump of the type checker. mypy 2.0 changed
  several inference defaults and dropped legacy
  behaviours; Bibliogon's existing
  ``[tool.mypy.overrides]`` blocks in ``backend/pyproject.toml``
  + the test-infrastructure-audit-added CI gate
  (``lint-and-type-check`` job) mean a 2.x bump that
  surfaces new errors would red-line CI immediately.
  Effort: M (re-run mypy, classify new errors, add
  overrides or fix source). Trigger: mypy 1.x reaches
  end-of-life status, OR ~6 months of latency pressure.
  Filed by dep-update audit 2026-05-12.

- **D-07**: Phase 2 follow-up — package-manager discoverability.
  After D-06 ships, submit a winget manifest to
  `microsoft/winget-pkgs` and create a Homebrew tap at
  `astrapi69/homebrew-bibliogon`. Effort: ~2 hours of
  implementation, plus reviewer latency (winget-pkgs PR review
  can take days to weeks; do NOT couple to D-06 release timing).
  Trigger: D-06 shipped + first real user feedback to confirm
  the wrappers actually work in the wild. Per discovery report,
  this expands discovery surface meaningfully without changing
  the underlying install path. See
  [docs/explorations/archive/installer-discovery-report.md](explorations/archive/installer-discovery-report.md).

- **AR-BULK-CROSSPAGE-SELECT-01**: cross-page Select-all for the
  bulk-export workflow. Articles dashboard does not paginate
  today, so "Select all = current page" is moot. When pagination
  lands (or articles count grows past comfortable scroll), Select-
  all needs to either select every filtered row across pages or
  surface an "X of N visible; select all N?" affordance. Effort:
  S once pagination exists. Trigger: pagination landing OR article
  counts complaint.

- **LAUNCHER-SELFREPLACE-01**: launcher binary self-replace.
  Currently the pre-install stale-target safeguard tells the
  user "download a newer launcher manually" and opens the
  GitHub release page. A real self-replace mechanism (download
  new binary, atomic replace, relaunch) would close that loop.
  Windows non-trivial: a running binary cannot replace itself
  directly; needs a helper script (e.g. spawn a `cmd.exe`
  background that waits for parent exit, copies new binary
  over old, relaunches). Linux/macOS simpler (`rename` + exec).
  Effort: 1-2 sessions. Defer: no concrete user demand and
  current safeguard already protects against installing a
  stale Bibliogon.

- **PLUGIN-DEV-SERVER-RESTART-HELPER-01**: neither the
  long-running ``make dev`` uvicorn process nor the
  ``make prod`` Docker image auto-detects when a plugin
  is added, installed, or uninstalled. Both surfaces are
  the same operational-gap class — a stale runtime
  diverging from the source tree's actual plugin set.
  Single P4 item covers both per the extend-rather-than-
  fragment Backlog-Hygiene discipline.

  **Surface A — `make dev` (dev-server stale): CLOSED 2026-05-20**
  by ``POST /api/admin/rediscover`` (commit ``b62c339``,
  V060-ADOPTION C4). Contributors adding a new plugin can hit
  the endpoint instead of restarting uvicorn; pluginforge
  v0.6.0's ``manager.rediscover()`` invalidates importlib +
  metadata caches and picks up the new entry point. Original
  filing's ``make dev-restart-on-plugin-change`` target is
  superseded — no Makefile work needed.

  **Surface B — `make prod` (Docker image stale):** the
  prod Docker image bakes the plugin set in at build
  time via the ``plugins/bibliogon-plugin-*`` glob in
  ``backend/Dockerfile`` (line 14 COPY + line 24 install
  loop). Once built, the running container's venv is
  frozen. ``docker compose restart`` re-launches the
  SAME image — no new plugins are picked up. Only a
  ``docker compose build`` reads the current source
  tree. Demonstrated 2026-05-18 during plugin-comics
  Session 1 smoke against ``localhost:7880``: image
  created 2026-05-06 (12 days stale relative to today's
  plugin-comics ship), 9 plugins in the container venv,
  comics absent, ``/api/comics/info`` 404'd. Fix: a
  ``make prod-rebuild-on-plugin-change`` target that
  inspects ``docker inspect astrapi69-backend
  --format='{{.Created}}'`` against the same pyproject
  mtimes; warn (or auto-rebuild) when a pyproject
  post-dates the image. Bonus: surface a clearer error
  in the frontend when ``/api/{plugin}/info`` 404's
  with text along the lines of "Plugin shipped in
  source but not in the running image; rebuild?".

  **Why one item instead of two:**
  - Both surfaces solve the same operational-gap class
    (stale runtime vs source tree).
  - Same mtime-comparison primitive serves both — only
    the "what does running" probe differs (lockfile of
    dev start vs ``docker inspect``).
  - Same Makefile-target shape (both are
    ``make <mode>-X-on-plugin-change`` aliases).
  - Single future-session can ship both targets +
    factor out the shared mtime helper.
  - Aligns with extend-rather-than-fragment from the
    backlog-hygiene discipline; sibling-item filing
    would force the future session to re-derive the
    shared design.

  Effort: M (one shared helper + 2 Makefile targets +
  optional frontend error-detection enhancement). Stop-
  condition: if the frontend error-detection enhancement
  exceeds 1 commit, surface as
  ``PLUGIN-RUNTIME-STALENESS-FRONTEND-DETECTION-01``.

  Trigger: plugin-development cadence increases, OR
  similar operational gap re-emerges, OR developer-
  onboarding feedback flags the gap, OR a Docker-prod
  user reports the same 404 class. Filed by plugin-
  comics Session 1 smoke 2026-05-18 (Surface A);
  extended same day to cover Surface B after live
  smoke against ``:7880`` reproduced the 404 in the
  Docker-prod surface.

- **MAKEFILE-VERIFY-PLUGIN-LOCKS-PARSE-01** (P4,
  TOOLING-INVESTIGATION, filed 2026-05-20 during V060
  PLUGINFORGE-V060-ADOPTION-01 step 1 lockfile sweep): GNU Make
  4.3 (German locale) fails to recognize ``verify-plugin-locks``
  as a target rule despite a syntactically clean declaration at
  Makefile line 462 + presence in the ``.PHONY`` list at line 14.
  ``awk`` reads the target header cleanly; ``make --debug=b
  verify-plugin-locks`` reports "Das Ziel ... existiert nicht.
  Das Ziel ... muss neu erzeugt werden" then "Keine Regel".

  Workaround during V060 was inlining the verify-plugin-locks
  recipe directly in bash (a 3-line for-loop over the 12
  plugins). Recipe at backlog-archive note for v0.7.0 adoption
  step 1; works fine — make-target parse is the only thing
  broken.

  Investigation steps for future fix:
  1. ``cat -A Makefile | sed -n '454,464p'`` — look for hidden
     characters or trailing-backslash continuations on line 460
     (``@echo "Re-locked $$(ls -d plugins/bibliogon-plugin-*/
     | wc -l) plugin(s)."``).
  2. ``make -p 2>&1 | grep -B 2 -A 2 "verify-plugin-locks"`` —
     see whether make recorded the rule at all.
  3. Move ``verify-plugin-locks`` higher in the file (above
     ``lock-all-plugins``) to test ordering hypothesis.
  4. Check whether the German locale ``LANG`` setting affects
     make's parser (unlikely but worth ruling out).

  Effort: S (~30 min once cause is identified). Trigger:
  next time a developer needs to run ``make verify-plugin-locks``
  AND has time to dig. Workaround works; no urgency.

- **NAVIGATION-ORIGIN-TRACKING-01** (P3): extract a `useBackNavigate`
  hook that encapsulates the `location.key === 'default'` fallback
  pattern, and migrate the current hardcoded `navigate(-1)` /
  `navigate('/')` sites to use it.
  Trigger: a fourth 'global' page (i.e. one reachable from both
  AD and BD) appears with a back-button, OR a contributor adds a
  new top-level page that needs origin-tracking.
  Scope: extract the helper into `frontend/src/hooks/`; refactor
  Settings, Help, GetStarted to call it; add Vitest for the
  helper. Drop-in replacement; no user-visible behavior change.
  Effort: 3-5 commits.
  Deferred reason: the current 3-page direct-`navigate(-1)` form
  is acceptable. Utility extraction adds value at scale (4+ sites),
  not at 3. Filed during the v0.33.0 Bug 1 hotfix where the
  pattern emerged across Settings + Help + GetStarted.

- **I18N-NATIVE-REVIEW-V031-01**: native-speaker review for the
  three v0.31.0 namespaces (``ai_template``, ``bulk_ai_fill``,
  ``comments``) that ship passthru-English in es / fr / el / pt /
  tr / ja. Each affected catalog carries a top-level ``_meta:``
  block with ``review_status``, ``translator``,
  ``translation_date``, ``reference_lang``, and the explicit
  ``pending_namespaces`` list.
  ``backend/config/i18n/REVIEW_STATUS.md`` documents the
  per-language status and the PR-based correction submission
  flow (parallel to the v0.30.0 launcher precedent in
  ``launcher/bibliogon_launcher/locales/REVIEW_STATUS.md``).
  Trigger: native-speaker contact for any of the six pending
  languages, OR pair with LAUNCHER-I18N-NATIVE-REVIEW-01's
  reviewer outreach.
  Filed by D3 pre-release UX audit 2026-05-12.

- **BACKUP-PROJECT-IMPORT-MUTMUT-01** (P4): add direct unit
  tests for the per-asset / per-chapter helpers in
  ``app/services/backup/project_import.py`` (34 no-tests
  mutmut entries 2026-05-14). The helpers are transitively
  covered by ``test_import_handler_wbt.py`` but mutmut's
  per-function visibility is exact-match. Effort: S.
  Filed by ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **BACKUP-SERIALIZER-MUTMUT-01** (P4): tighten the existing
  backup-roundtrip tests in ``test_backup_articles.py``,
  ``test_backup_import_revive.py``, ``test_backup_utils.py``
  to assert exact field presence on the serialized output
  (~162 surviving + 10 no-tests mutmut entries on
  ``backup.serializer`` 2026-05-14, mostly XX-wrap and
  case-flip on output-key strings). Tightening should kill
  the bulk in one pass. Effort: M. Filed by
  ``MUTMUT-EXPAND-SCOPE-01`` 2026-05-14 audit.

- **GIT-BACKUP-MUTMUT-01** (P4): triage the
  ``app/services/git_backup.py`` survivor pool (330
  survived + 57 no-tests; largest single-file pool in the
  services audit). Mix of cosmetic (git-config key
  strings, e.g. ``"user.name"`` / ``"user.email"``) and
  real (error-classification helpers with no direct
  coverage). Triage in its own session like the office +
  wbt audit. Effort: M. Filed by ``MUTMUT-EXPAND-SCOPE-01``
  2026-05-14 audit.

- **BIBLIOGON-DATA-FIX-FRAMEWORK-01**: refactor the six
  one-shot retro-fix scripts under `scripts/` into a generic
  framework. Existing scripts:
  `fix_medium_import_image_nodes.py`,
  `fix_medium_import_featured_images.py`,
  `fix_medium_import_truncation.py`,
  `fix_medium_import_language.py`,
  `fix_medium_import_seo.py`.
  They share a common shape:
  scope query (Article join ArticleImportSource), per-row
  predicate, per-row mutation, dry-run vs --apply, idempotent
  re-run reports zero changes. The same pattern is the
  obvious target for any future Bibliogon data-fix work
  (book imports, asset migrations, etc.). Effort: M (extract
  base class + per-fix subclass + tests). Defer until a
  fifth one-shot is needed; ship the four as one-shots first
  so the abstraction is informed by real cases. Trigger: 5th
  one-shot OR a new contributor needs to write one.

- **D-06-VALIDATION-01**: fresh-machine validation of the
  v0.28.0 cross-platform installer scripts (`install.command`,
  `install.ps1`, `install.cmd`). The scripts shipped unsigned
  per launch decision and were not exercised on a fresh macOS
  user account or fresh Windows 11 install before tagging.
  Trigger: first user report OR access to a clean test machine.
  Effort: S (run each wrapper, capture any Gatekeeper /
  SmartScreen / ExecutionPolicy edge cases). Folds into the
  next point release.

- **AR-BULK-SERIES-HIERARCHY-01**: parent/child series for the
  bulk-export filter. The 2026-05-06 bulk-export ship landed
  series as a flat free-string field on Article (mirrors
  `Book.series`). Hierarchical series ("Cosmos > Astrophysics >
  Stars") was deferred because no user has asked for it and a
  Series model + M2M migration is a multi-session investment.
  Trigger: first concrete user request for sub-series. Effort:
  1-2 sessions for the model + migration + filter UI nesting.
  See `docs/help/{en,de}/articles/bulk-export.md` "Series" note.

- **I18N-DIACRITICS-01**: auto-translated non-DE i18n YAMLs (es,
  pt, tr, possibly fr) ship with inconsistent diacritic coverage —
  some entries use proper Unicode (`géneros`, `Décroissant`,
  `gêneros`), others ASCII-substitute (`Titulo`, `Baslik`). Found
  in Test Phase Session 3 (2026-04-28) cross-language audit while
  fixing DE umlauts. Severity: Medium (readable but inconsistent +
  non-native). Effort: M per language. Cause: `AUTO_TRANSLATED.md`
  banner in `backend/config/i18n/` indicates DeepL/LMStudio passes
  with mixed quality. Fix: re-run translation with current DE
  source as canonical (DE was just cleaned up of all ASCII
  substitutes), human-review each for native diacritic use. Defer
  until DE i18n stable + a native speaker is available per
  language for review.

- **PLUGIN-METADATA-I18N-PARITY-01** (P4, Plugin-
  Infrastructure, filed 2026-05-18 from plugin metadata
  pattern audit Sub-finding A.2): i18n coverage across
  ``backend/config/plugins/<name>.yaml`` is wildly
  uneven. Bringing every plugin to 8-language parity
  (de, en, es, fr, el, pt, tr, ja) — matching the
  comics + medium-import + git-sync precedent — closes
  the silent-feature-invisibility for non-de/non-en
  users.

  Current state (verified 2026-05-18 against audit
  Table A.1):

  | Plugin | display_name langs | description langs |
  |---|---|---|
  | audiobook | 5 (de, en, es, fr, el) | 5 |
  | comics | 8 ✓ | 8 ✓ |
  | export | 4 (de, en, es, fr) | 2 (de, en) |
  | getstarted | 2 (de, en) | 2 |
  | git-sync | 8 ✓ (shipped today in d825bbf) | 8 ✓ |
  | grammar | 2 (de, en) | 2 |
  | help | 2 (de, en) | 2 |
  | kdp | 5 (de, en, es, fr, el) | 5 |
  | kinderbuch | 5 | 5 |
  | medium-import | 8 ✓ (merged today in d08c1fd) | 8 ✓ |
  | ms-tools | 2 (de, en) | 2 |
  | translation | 2 (de, en) | 2 |

  Gap = 9 plugins need extending. Scope:
  - audiobook, kdp, kinderbuch: from 5 to 8 (+3 langs
    each)
  - export: from 4 to 8 for display_name, from 2 to 8
    for description (+4/+6)
  - getstarted, grammar, help, ms-tools, translation:
    from 2 to 8 (+6 each)

  Effort: M. The translations should match the existing
  i18n catalog convention from the umlauts-discipline
  lessons-learned rule — REAL diacritics (umlauts in
  de + ES; cedillas in fr; tildes in es + pt), NOT
  ASCII transliterations. Worth running the existing
  ``scripts/find_umlaut_candidates.py`` against the
  output to verify.

  Trigger: next plugin-metadata sweep, OR a non-de/
  non-en user reports raw-slug display in Settings UI,
  OR opportunistic as part of plugin-specific work
  (e.g. while editing export plugin's settings yaml,
  also extend its i18n coverage).

  Pairs with: today's i18n drift catches via the
  deduplication commit d08c1fd (which surfaced + kept
  the umlaut-correct strings while discarding ASCII
  transliterations in 3 plugin yamls). The umlauts-
  discipline rule fires during translation authoring.

  Filed by plugin metadata pattern audit 2026-05-18.

- **CONVERT-TO-BOOK-REVERSE-LINK-01** (P5): restore the
  `preserve_article_id_metadata` setting that Phase 1 dropped
  to satisfy the "kwargs without behaviour are forbidden"
  rule.
  Trigger: user requests a reverse-link or provenance feature
  for converted books, OR a "pull updates from source articles"
  affordance.
  Scope: add a nullable `Chapter.source_article_id` column
  (FK with `ondelete='SET NULL'` so deleting a source article
  surfaces the broken link instead of cascading the chapter
  away). Alembic revision populates as `NULL` for every
  pre-existing chapter (data not retained from past
  conversions). Re-introduce the
  `BookFromArticlesChapterSettings.preserve_article_id_metadata`
  field with a non-trivial behaviour test (per the
  lessons-learned "End-to-end behavior tests are not
  'kwarg passes through' tests"). Wire the wizard's Step 4 to
  expose the toggle. Use cases this unlocks: "show me which
  articles built this book" (Book-Editor sidebar), "update this
  chapter from its source article" (manual sync action),
  "find books that include this article" (Article-Editor
  sidebar).
  Effort: 3-5 commits (migration + schema + endpoint +
  wizard wiring + Book/Article-Editor surfaces + tests).
  Defer reason: speculative until user reports needing
  provenance. The current decoupled-lifecycle design is
  intentional; a reverse-link is opt-in and orthogonal to
  the v1 wizard flow. Filed by Phase 1 implementation
  decision, 2026-05-15.

- **CONVERT-TO-BOOK-CHAPTER-TYPE-DETECTION-01** (P5):
  smart `chapter_type` assignment for the article-to-book
  conversion. Phase 1 defaults every converted chapter to
  `chapter`; the user retypes via the Book-Editor sidebar
  after conversion.
  Trigger: user requests smart-typing during conversion, OR
  a pattern emerges across multiple bug reports of
  "manuscripta export treated my introduction as a regular
  chapter".
  Scope: heuristic in the wizard's Step 4 (or the backend
  endpoint) that maps common article-title patterns to
  `chapter_type` overrides. Candidate mappings (informed by
  the 209-article Medium corpus): `^introduction|intro$|^getting started` ->
  `introduction`; `^epilogue|conclusion|wrap[- ]?up$` ->
  `epilogue`; `^appendix` -> `appendix`;
  `^acknowledgments?` -> `acknowledgments`. The wizard's
  review step shows the planned mapping with per-row
  override before submit. Backend stays the same; the
  payload's `chapter_settings` block grows a
  `per_article_chapter_types: dict[str, ChapterType]`.
  Effort: 2-3 commits (heuristic + wizard surface + tests).
  Defer reason: ChapterType is reversible per-row in the
  Book-Editor at zero friction (3 clicks); the v1 default
  is the safer floor (no false-positive auto-types breaking
  manuscripta export). Filed by Phase 1 Q17 deferral,
  2026-05-15.

- **GH-ACTIONS-OPTIONAL-BUMPS-01**: two optional standard-action
  bumps deferred from the 2026-05-14 CI-hygiene full audit
  (neither blocks Node-24 coverage; both are already on Node 24
  at the v5 pin):
  - ``actions/checkout`` v5 → v6: v6 introduces "persist creds
    to a separate file" (security improvement for jobs that
    checkout multiple repos in the same runner). No-op for
    single-checkout jobs, which is most of our workflows.
  - ``actions/setup-node`` v5 → v6: v6 narrows automatic
    caching from "any package manager" to "npm only".
    `frontend/package.json` does not declare a `packageManager`
    field, so the auto-caching path is dormant either way.
  Trigger: next periodic CI-hygiene audit (~2-3 months from
  2026-05-14), OR a specific need surfaces (e.g. credential
  isolation becomes relevant for a security review, or the
  frontend starts using npm via the auto-cache path). Effort:
  S per bump (single sed + commit each). Filed by the 2026-05-14
  full-audit session.

- **COMMENTS-COUNT-PERF-01**: switch
  ``Article.comments_count`` from a ``len()``-on-relationship
  property to a JOIN-counted subquery against
  ``article_comments``. Trigger: per-article comment counts
  routinely above ~50, where SQLAlchemy materialising every
  row just to count it becomes wasteful. Today the property
  ships with a ``len()`` over the relationship list filtered
  by ``deleted_at IS NULL``; acceptable while typical counts
  stay 0-5. The subquery rewrite is a drop-in replacement on
  the model side; no schema change, no API change. Filed
  alongside MEDIUM-COMMENTS-UI-01 commit 1.

- **TESTCLIENT-HARMONIZE-01**: harmonise the 89 backend
  ``TestClient`` instantiation sites onto the lifespan-aware
  fixture pattern. Test-infrastructure audit 2026-05-12
  finding 0.4: 23 files use module-level
  ``client = TestClient(app)`` (no ``with``, so the FastAPI
  lifespan never fires and plugin routes are not mounted),
  34 files use the fixture-with-``with`` pattern correctly,
  3 files use inline-per-test. The lessons-learned rule
  "Tests must run through ``with TestClient(app) as c:``"
  documents the lifespan requirement but the heterogeneity
  persists. Trigger: a real "plugin route returns 404 in
  test" surprise from a no-lifespan file, OR a session
  dedicated to test-fixture cleanup. Refactor blast radius:
  large (89 sites, hidden state risks from shared
  session-scope clients). Filed by test-infrastructure
  audit 2026-05-12.

- **AR-BULK-ASYNC-PROGRESS-01**: async bulk export with progress
  UI for selections >50 articles. The 2026-05-06 ship runs the
  request synchronously with a 180s server-side Pandoc timeout,
  which is fine for the typical workflow (<50 articles). For
  larger combined PDF runs the user sees a frozen browser tab
  until completion. Future work: convert to the async-job pattern
  used by audiobook export (background worker + SSE progress
  stream + persisted artifact). Effort: 1-2 sessions. Trigger:
  first user report of perceived hang, OR a real-world selection
  that exceeds 180s.

- **LAUNCHER-I18N-NATIVE-REVIEW-01**: native-speaker review for
  the three pending-review launcher i18n catalogs (pt, tr, ja)
  shipped in v0.30.0. Each catalog carries a
  `_meta.review_status: "pending native speaker"` block;
  `launcher/bibliogon_launcher/locales/REVIEW_STATUS.md`
  documents the per-language status and the PR-based
  correction submission flow. The
  `test_pending_review_catalogs_carry_marker` parity test
  enforces the marker contract, and `test_user_validated_*`
  enforces that markers are removed in the same change that
  promotes a language to validated. Trigger: native-speaker
  contact for any of pt/tr/ja, or a user-reported correction
  PR. Effort: S per language for an experienced reviewer
  (95 keys, mostly mechanical drift detection).
  - **Public surface:** GitHub issue
    [#18](https://github.com/astrapi69/bibliogon/issues/18)
    is the call-for-reviewers, labeled `help wanted` +
    `good first issue` + `documentation`. A passing-by
    pt / tr / ja speaker can find it without grepping the
    repo. Corrections land via PR per the flow in
    REVIEW_STATUS.md.
  - **Decision threshold:** 2026-08-07 (3 months after the
    v0.30.0 release). At that point an explicit decision
    lands on each marker: drop-the-marker (accept as
    canonical, with or without a review having happened),
    or continue-waiting. The threshold is also documented
    as a watch-list item in the v0.30.0 retrospective.

- **BISAC-DATABASE-LOOKUP-01** (P5): bundle the BISAC subject
  headings catalog with autocomplete + validation against real
  codes (vs. the current Bug-9 MVP's free-text + 9-char
  alphanumeric format check).
  Trigger: Bibliogon obtains a BISG license, OR a user requests
  autocomplete strongly enough to justify the license cost
  (~$590/year for the under-$1M-revenue tier as of 2026-05).
  Scope: ship the BISAC catalog as a JSON / SQLite resource
  inside the KDP plugin (or a new lightweight ``plugin-bisac``
  if licensing requires a separation), wire an autocomplete
  combobox into the BookMetadataEditor Marketing tab, replace
  the format-only validator with code-existence validation,
  surface the human-readable subject heading next to the code
  in the UI.
  Defer reason: BISG license terms are incompatible with
  Bibliogon's local-first + donation-based model in the v0.33.0
  state. The free-text + format-validation MVP (Bug 9 D3) is
  sufficient for the current user base — KDP best practice is
  ≤ 3 codes per book, and the format check catches the most
  common typo class (transposed letter / digit). Filed during
  the Bug 8 + Bug 9 Pre-Inspection so the deferred
  enhancement-path is visible if the licensing landscape
  shifts.

---

## P5 - Speculative / Nice-to-have

- **FRONTEND-LINT-FORMAT-SETUP-01** (P5, filed 2026-05-30):
  the frontend Prettier/ESLint path is not operative in the
  current checkout — no `.prettierrc` resolves (default Prettier
  flags committed files, which use 4-space/double-quote), and
  ESLint 9+ finds no `eslint.config.js`. Not urgent: the real
  quality gates (`tsc --noEmit`, Vitest, `make verify-theme`)
  cover correctness + theming, and the backend pre-commit hooks
  (ruff) are unaffected. Quick-fix when someone wants frontend
  format enforcement back: add a `.prettierrc` matching the
  existing style (or reformat once to a chosen standard) + a
  flat `eslint.config.js`, then wire both into pre-commit.

- **PICTURE-BOOK-STORYBOARD-OPERATIONS-01** (P5,
  trigger-gated, filed 2026-05-27 from the closure of
  `PICTURE-BOOK-STORYBOARD-VIEW-01`): page-operations
  follow-up for the Storyboard view. Closes the
  original Session 1 backlog's "Deferred to a later
  session" half:

  - Add-page-in-between (insert at a specific
    position; backend endpoint + UI affordance)
  - Duplicate page (clone with new id, append after
    source, all annotations copied)
  - Split page (decision needed: what does split mean
    for an atomic image+text picture-book page?)
  - Merge pages (decision needed: which page's image
    + layout wins?)
  - Print storyboard (PDF / print stylesheet for the
    annotated grid)
  - Auto-update `act_group` when a card is dragged
    across visual group boundaries (currently the
    drag reorders position only; the page snaps back
    to its own group on next render)

  Trigger: user requests one of these operations
  during real Picture-Book authoring, OR multiple
  picture-book authors report friction in workflows
  that the existing reorder + annotation + click-to-
  navigate flow can't cover.

  Out of scope (filed separately): tree-view /
  branching, beat-sheet templates, character-
  tracking, plot-threads.

- **STORYBOARD-MOOD-FREE-PICKER-01** (P5,
  trigger-gated, filed 2026-05-27): free-hex color
  picker for `page.mood_color`. Session 2 C3 shipped
  10 preset swatches that cover the typical
  picture-book emotional range without adding a
  dependency. Free-picker would extend the palette
  to arbitrary hex codes.

  Trigger: user requests a custom color OR a real
  picture-book context surfaces a mood the 10
  presets can't approximate.

  Implementation note: native `<input type="color">`
  is the dependency-free baseline; a Radix Color
  primitive would be the upgraded path if Radix
  ships one in a future release.

- **STORYBOARD-DRAG-CROSS-GROUP-ACT-UPDATE-01**
  (P5, trigger-gated, filed 2026-05-27): when a
  Storyboard card is dragged across a visual
  act-group boundary, auto-update the dropped
  page's `act_group` to match the destination
  group. Currently drag reorders position only;
  act_group is set via the inline label.

  Trigger: user reports the snap-back behaviour as
  confusing during real picture-book authoring.

  Implementation requires detecting the target
  group from the drop neighbour's `act_group` value
  and bundling the act_group update into the same
  reorder save (currently two separate API surfaces).

- **SETT-L-2-FULL-RESPONSIVE-AND-SEARCH-01** (P5, REFACTOR,
  filed 2026-05-25 from Settings-page UX audit, deferred per
  user adjudication): full responsive Settings redesign that
  combines SETT-L-1 + SETT-M-4 + URL-based deep-link per-
  section. Single XL session.

  ### Trigger

  Only if both SETT-L-1 + SETT-M-4 land separately + user
  pulls for the combined experience. Otherwise stays
  speculative.

  ### Effort

  12-15 commits (XL session).

- **WIZARD-SHELL-IMPORT-VARIANT-01** (P5, RCU pre-
  registered, filed 2026-05-24 from WIZARD-SHELL-
  COMPONENT-EXTRACT-01 C4 close per Pre-Coding-Reality-
  Check Option-A adjudication): ImportWizardModal
  ([frontend/src/components/import-wizard/ImportWizardModal.tsx](frontend/src/components/import-wizard/ImportWizardModal.tsx))
  carries a wizard-shape variant that the 2026-05-24
  WizardShell extraction deliberately left out:
  className-based dialog styling (not inline) + 900px
  width (not 640px) + text-only step indicator ("Step
  X of 4", not dot-row) + per-step navigation buttons
  inside each step component (not in shell) + a
  WizardErrorBoundary wrapper around the body. The
  divergence is documented as intentional asymmetry
  in the file's header docstring.

  ### Trigger

  A 2nd wizard surface lands matching the ImportWizard
  shape — same 5 properties (className styling + ~900px
  + text indicator + per-step nav + ErrorBoundary).
  Most likely surfaces:

  - A "bulk-export wizard" if multi-format export ever
    grows beyond the current dropdown picker.
  - A "git-publish wizard" if the existing git-sync
    plugin grows a multi-step setup flow.
  - A "library-migration wizard" for moving content
    between Bibliogon installations.

  ### Pre-registered shape

  Extract a sibling `WizardShellWide` (or
  `WizardShellText`) component co-located with
  `WizardShell.tsx`. Same testid-namespace context
  pattern; different default dimensions + indicator
  shape + nav-slot policy. Both shells could share a
  common `WizardDialogChrome` primitive if a third
  variant ever lands.

  ### Cross-references

  Original audit deliverable:
  ``docs/audits/recurring-component-audit-2026-05-21.md``
  (counted ImportWizardModal as a 3rd RCU site;
  Pre-Coding-Reality-Check during the 2026-05-24
  implementation session reclassified it as a separate
  shape per the "Audit-Methodology: design-intent-axis
  as 5th-Axis or Override-Filter" lessons-learned
  rule).

  Same RCU-pre-registration pattern as
  ``METADATA-BUTTON-COMPONENT-EXTRACT-01`` (below) and
  ``BOOK-TYPE-CARD-COMPONENT-EXTRACT-01`` (P3) — both
  RCU 2-site filings that defer extraction to a 3rd-
  surface trigger.

- **METADATA-BUTTON-COMPONENT-EXTRACT-01** (P5, RCU pre-
  registered, filed 2026-05-24 from COMIC-BOOK-EDITOR-
  METADATA-BUTTON-01 C4 close per Q6 adjudication):
  PageEditor's "Open book metadata" button
  ([frontend/src/components/PageEditor.tsx:225-244](frontend/src/components/PageEditor.tsx#L225-L244))
  and ComicBookEditor's "Buch-Metadaten öffnen" button
  ([frontend/src/components/ComicBookEditor.tsx](frontend/src/components/ComicBookEditor.tsx))
  shipped 2026-05-24 are 2 surfaces of the same shape
  (~19-line button, 1 prop: ``onClick``, FileText icon).
  RCU 2-site threshold fires; extraction deferred to P5
  per Q2 cost-benefit adjudication — 19-line button + 1
  prop doesn't justify the extraction overhead until a
  3rd consumer lands.

  ### Likely 3rd surfaces

  - **Article editor**: if a future feature surfaces
    article-level metadata editing on the same swap
    pattern, this would be the natural extraction
    trigger.
  - **Project editor / Series editor**: hypothetical
    future editors for non-Book entities that need to
    swap into a metadata view.

  ### Pre-registered shape

  When the 3rd consumer lands, the component:
  - Takes ``onClick: () => void`` (required) +
    optional ``label?: string`` (default i18n key) +
    optional ``testidPrefix?: string`` for per-surface
    testid namespacing (precedent: RichTextEditor's
    testidNamespace, PageThumbnails' testidNamespace
    from the MULTI-PAGE-NAVIGATION-01 RCU adoption).
  - Lives at ``frontend/src/components/MetadataButton.tsx``
  - Same icon + className discipline (FileText +
    `metadataBtn` CSS class)

  ### Trigger

  3rd consumer landing OR a deliberate RCU hygiene
  session that batches small-component extractions.

  ### Cross-references

  Same pattern as
  ``BOOK-TYPE-CARD-COMPONENT-EXTRACT-01`` (P3, RCU pre-
  registered) — both are RCU 2-site filings that
  defer extraction to a 3rd-surface trigger.

- **PLUGIN-PYDANTIC-COORDINATED-BUMP-01**: realign
  plugin Pydantic versions with the backend. Audit
  2026-05-12 found 9 of 11 plugins still at pydantic
  2.12.5 while backend is at 2.13.3 (now 2.13.4 after
  the medium-import plugin's lock got re-resolved
  during the audit). Not a runtime conflict (both 2.x
  compatible), just a "plugins lag backend" doc
  finding. The naive fix (``make lock-all-plugins``)
  is a no-op when nothing in plugin pyprojects
  changed; ``poetry update`` (bare) per plugin pulls
  the latest pydantic BUT also surfaces high-risk
  transitives like starlette 1.0 via fastapi 0.136.1.
  Mandatory: per-plugin ``poetry update pydantic
  pydantic-core`` (allowlist subset, NOT bare). 11
  plugins × 2 packages = 11 commits or one bundled
  commit. Trigger: ANY of (a) plugin CI fails due to
  pydantic version drift, (b) a backend feature needs
  a pydantic 2.13+ API that plugins also need, (c) a
  coordinated dep-update session is planned (where
  starlette + FastAPI + Pydantic bump together as a
  unit). Filed by dep-update audit 2026-05-12 Phase 3.

- **WALKER-HYPOTHESIS-01**: introduce Hypothesis
  property-based tests for the Medium-import walker
  (``plugins/bibliogon-plugin-medium-import/bibliogon_medium_import/walker.py``).
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Hypothesis option): zero ``@given`` usages today; the
  walker's example-based + regression-pin coverage is
  adequate. Candidate invariants if promoted:
  ``imageFigure`` count equals source ``<img>`` count;
  body-text length never changes more than 1% across
  re-parses; ``ParsedPost.is_comment`` is stable across
  whitespace-only HTML variations. Trigger: a third
  walker bug class slips through example-based tests
  (already had two: ``find`` vs ``find_all``,
  ``imageFigure`` vs ``image``). Effort: M, payoff
  dependent on bug rate. Filed by test-infrastructure
  audit 2026-05-12.

- **TESTCONTAINERS-EVAL-01**: evaluate Postgres-via-
  Testcontainers for backend integration tests.
  Test-infrastructure audit 2026-05-12 finding 0.7
  (Testcontainers option): Bibliogon ships SQLite as
  default and intended production DB (CLAUDE.md); no bug
  history of SQLite-vs-Postgres divergence; adopting
  Testcontainers would add 5-30s startup per CI run for
  zero documented payoff. Trigger: production-DB
  migration to Postgres, OR a documented SQLite-vs-Postgres
  divergence bug surfaces in production. Filed by
  test-infrastructure audit 2026-05-12.

- **LAUNCHER-MACOS-UNIVERSAL2-01** (P5, was part of D-02 follow-ups
  before Q5 split 2026-05-20): build a macOS universal2 binary
  (Intel x86_64 + Apple Silicon arm64) for the launcher rather
  than the current arm64-only artefact. Trigger: first Intel-Mac
  user report OR Apple Silicon migration becomes complete enough
  that universal2 is the table-stakes default. Effort: M
  (PyInstaller config + cross-arch CI matrix + smoke per arch).

- **LAUNCHER-CODE-SIGNING-01** (P5, was part of D-02 follow-ups
  before Q5 split 2026-05-20): Apple Developer ID code signing
  + notarization for the macOS launcher binary, plus Windows
  Authenticode signing for the .exe. Closes the Gatekeeper +
  SmartScreen warnings that current unsigned builds trigger.
  Trigger: substantial install-friction signal from end users OR
  paid Developer ID becomes available. Effort: M (signing
  certs + CI integration + notarization wait-loop + smoke on
  fresh OS install).

- **USESELECTION-RESPLIT-IF-DIVERGENCE-MATERIALIZES-01** (P5,
  filed 2026-05-23 from user-adjudication of RCU audit candidate
  #1 permanent-defer). Re-evaluate the useSelection<T>() generic-
  hook extraction if/when any of the 3 selection hooks
  (``useArticleSelection``, ``useBookSelection``,
  ``useCommentSelection``) develops entity-specific divergence
  beyond the current byte-identical baseline. The audit's
  permanent-defer (commit ``c1083bc``) is conditional on the
  documented design-intent rationale at
  ``frontend/src/components/useBookSelection.ts:7-10`` staying
  true — *"Kept as a separate hook (rather than a generic
  `useSelection`) so that future per-entity divergence (e.g.
  books-only constraints around audiobook job state) lands in
  one place without a cross-entity refactor."*

  Trigger: ANY of the 3 hooks diverges from the byte-identical
  baseline. Concrete examples: books-only ``selectVisible(ids)``
  variant for audiobook batch operations; articles-only
  selection-filter for publication-state; comments-only
  selection-mode for moderation. ANY one of these means the
  per-entity divergence the original author anticipated has
  materialized.

  Action when trigger fires: do NOT extract immediately. First
  run the design-intent-axis override-filter check per the
  2026-05-23 Lessons-Learned filing
  (``.claude/rules/lessons-learned.md`` §"Audit-Methodology:
  design-intent-axis as 5th-Axis or Override-Filter"). If the
  rationale at useBookSelection.ts:7-10 still applies, defer
  again. If divergence has invalidated the rationale (e.g.
  the divergence forced the doc-comment to be rewritten or
  removed), proceed with extraction per RCU canonical pattern.

  References:
  - ``docs/audits/recurring-component-audit-2026-05-21.md``
    footnote 1 (PERMANENT-DEFER-DESIGN-INTENT-HONORED, 2026-05-23)
  - ``.claude/rules/lessons-learned.md`` §"Audit-Methodology:
    design-intent-axis as 5th-Axis or Override-Filter"
    (filed 2026-05-23, commit ``563f298``)
  - Commit ``c1083bc`` (adjudication ship)

  Why P5: speculative (no concrete trigger yet); audit-doc IS
  the load-bearing tracker for the deferral; this backlog entry
  exists primarily to ensure that IF the trigger ever fires,
  the action-protocol (override-filter check first) is visible
  at the planning-time horizon, not buried inside an audit doc.

---

## Blocked / Upstream Wait

Items waiting on external triggers. Re-audit monthly via
`make check-blockers`. Do not attempt to advance these without an
unblock signal. ROADMAP entries (DEP-02, DEP-05, DEP-09, SEC-01)
are listed in the cross-reference at the top of this file; the
table below covers backlog-only waiting items + a quick-poll
summary.

| Item | Blocked on | Unblock condition |
|------|-----------|-------------------|
| DEP-02 (TipTap 3) | Upstream npm publish of `@sereneinserenade/tiptap-search-and-replace@0.2.0` | npm publish (default); path B (`prosemirror-search` adapter ~50-80 LOC) available on explicit go-ahead |
| DEP-05 (elevenlabs 2.x) | Real paid-API verification (substantial 0.2.27 -> 2.45.0 jump, careful audit required) | Schedule a dedicated audiobook test session with a live ElevenLabs key |
| PGS-04-FU-01 | First user report of cross-language structural divergence | User report |
| STARLETTE-V1-AWAIT-FASTAPI-01 | FastAPI release pinning `starlette = ">=1.0"` (not just relaxing the upper bound) | FastAPI release; full scope below |
| CLICK-V8-3-AWAIT-GTTS-01 | gtts opens its click upper bound to `<9` or `<8.4` | gtts release; full scope below |
| Manual launcher smoke tests (#2/#3/#4) | Real hardware (Windows / macOS / Linux) availability | Hardware access |
| Manual content-safety smoke (#8 Part 2 beforeunload) | Aster's local browser | Manual run |
| Manual UI smoke (#5) | Aster's local browser | Manual run |

### Backlog-only blocked items — full scope

ROADMAP-tracked blocked items (DEP-02, DEP-05) have their full
bodies in ROADMAP; the table above is sufficient for them. The
following entries are backlog-only (no ROADMAP entry) and so
their full descriptions live here.

- **STARLETTE-V1-AWAIT-FASTAPI-01** (BLOCKED, upstream):
  bump ``starlette`` from 0.46.2 to 1.0.0 across the
  backend + 11 plugins. Blocked on FastAPI shipping a
  release whose upper-bound for starlette opens to
  ``>=1.0``. Surfaced during the dep-update audit
  2026-05-12 Phase 3: ``poetry update`` (bare) on a
  plugin pulled starlette 1.0.0 because fastapi 0.136.1
  apparently relaxed its starlette range. We reverted
  that plugin's lock; the starlette 1.0 upgrade is a
  cross-surface coordinated bump (FastAPI + Starlette +
  all 11 plugins + backend, all at once) and should not
  ship piecemeal. Trigger: FastAPI ships a release that
  pins ``starlette = ">=1.0"`` as its lower bound (not
  just relaxes the upper bound), making the bump a
  forced upgrade. Filed by dep-update audit 2026-05-12.

- **CLICK-V8-3-AWAIT-GTTS-01** (BLOCKED, upstream):
  bump ``click`` from 8.1.8 to 8.3.3 in the backend
  (and transitively across plugins). Blocked on gtts
  (Google Text-to-Speech) opening its pin
  ``click >=7.1,<8.2``. Used by the audiobook plugin's
  TTS adapter path. Trigger: gtts releases a version
  that opens its click upper bound to ``<9`` or
  ``<8.4``. Filed by dep-update audit 2026-05-12
  Phase 4.5 (click was in the medium-risk batch but
  poetry refused to move it due to the upstream pin).

---

## Maintenance / hygiene

Recurring upkeep, low priority but worth scheduling:

- **Test count verification** before any release. Run the
  per-plugin iteration from `ai-workflow.md` "Numeric claims
  verification". Don't grep.
- **`poetry show --outdated` + `npm outdated`** before each
  release per release-workflow.md Step 4b.
- **`npm audit --audit-level=high`** monthly (next: 2026-06-02).
- **Help docs review**: every shipped feature must update
  `help.yaml` and the help/{lang}/ pages. Audit on each release.
- **ROADMAP cleanup**: refresh the header line + "next active
  theme" sentence on each release. Move any item shipped outside
  its theme back into the right theme entry.
- **Dependency currency** per `lessons-learned.md`: only stable
  releases, no beta/RC/alpha. 2-week soak for new majors.
- **Systematic audit pass** quarterly (per
  `ai-workflow.md` "Test coverage audits → When to run"). The
  drop-in prompt lives at
  [.claude/prompts/audit.md](../.claude/prompts/audit.md);
  paste into a fresh Claude Code session at the repo root. It
  triages against documented standards in 4 sections (Test
  Validity / Code Quality / Infrastructure / Documentation)
  and is read-only — no code is modified.

---

## How to use this file

- Pick from the highest non-empty tier when starting a session
  and there's no user-driven priority override; consult ROADMAP
  for the canonical task description on cross-referenced items.
- When a session defers a sub-item, add it under the matching
  tier with a `*-FU-NN` ID and one-line "why deferred".
- When an item ships, **delete the row** from this file. The
  CHANGELOG / ROADMAP archive records the history; the backlog
  is forward-looking only.
- When the top tier changes, re-rank explicitly in this file
  before starting work, not implicitly during a session.
- Don't grow past 50 items. If it grows, split by category into
  themed files (`docs/backlog/dependencies.md`, etc.).
