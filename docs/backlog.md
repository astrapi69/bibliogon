# Bibliogon Backlog

Last updated: 2026-05-22 (RECURRING-COMPONENT-AUDIT-01 candidate #2 CLOSED via path γ pivot. BulkActionBar shell extracted in 1-commit c2305e7 — 3-site adapter-pattern (ArticleBulkActionBar + BookBulkActionBar + CommentBulkActionBar now render <BulkActionBar>{site-specific actions}</BulkActionBar>). Audit's candidate #1 useSelection<T>() (score 16) DEFERRED-PENDING-DESIGN-INTENT-ADJUDICATION when Pre-Coding-Reality-Check surfaced explicit anti-extraction rationale at useBookSelection.ts:7-10 ("Kept as a separate hook ... future per-entity divergence ... cross-entity refactor"); honored documented design-intent + pivoted to next-highest-without-anti-signal candidate. Frontend Vitest 1783 → 1792 (+9: +5 new BulkActionBar + 4 incidental); backend baseline 2125 unchanged. Methodology gap noted in audit footnote: future audits should grep doc-comments for anti-extraction-rationale markers. Candidates #3 ListRow (score 13) + #4 AuthorSelectInput (score 12) remain available for future sessions. Prior 2026-05-21 close: PLUGIN-COMICS-PHASE-2-PANEL-CONFIG-01 (all 4 user-findings resolved) + RECURRING-COMPONENT-AUDIT-01 audit deliverable shipped 455d4db.)
Current version: v0.35.1
Open tasks: 66 active (P2..P5) + 0 active P1 + 2 BLOCKED-on-upstream entries
Archive: [docs/roadmap-archive/backlog-recently-closed-2026-05-02.md](roadmap-archive/backlog-recently-closed-2026-05-02.md)

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

- **KDP-PUBLISHING-WIZARD-01** (P2, STRATEGIC, filed 2026-05-19
  from the
  ``docs/audits/exploration-features-2026-05-15-evaluation.md``
  triage of exploration feature #6): end-to-end KDP publishing
  pipeline as a wizard on top of the already-shipped plugin-kdp
  foundation. Closes the "K-03 + K-04" half of the original
  K-01..K-04 plan (K-01 metadata generation + K-02 cover
  validation are shipped; K-03 wizard + K-04 pricing/ARC/launch
  are this filing).

  Scope:
  - Step-by-step wizard for first-time KDP launch
  - Pre-launch checklist (categories selected, description
    written, cover uploaded, BISAC codes valid, ISBN/ASIN
    populated, etc.) - reads the existing metadata-checker
    output as the gating signal
  - Pricing strategy panel (KDP royalty calculations, region
    pricing for US / EU / UK / JP / IN)
  - ARC (Advance Reader Copy) management - track which
    reviewers received which version, capture review
    permalinks back into the book record
  - Final-step export-package generation (KDP-ready ZIP
    with manuscript + cover + metadata JSON)

  Architecture-discipline notes (per audit
  Track C):
  - **Half-Wired-Lifecycle Prevention**: shipping wizard steps
    without their export-pipeline consumers is the canonical
    write-without-reader trap. Per-step Pre-Inspection required
    when implementation starts: confirm the ARC list / pricing
    decisions / launch-checklist results all have actual
    consumers in the export package, not just UI surfaces.
  - **3-Source-Plugin-Metadata-Pattern**: plugin-kdp's
    ``backend/config/plugins/kdp.yaml`` will gain a
    ``settings.wizard:`` block; the bundled
    ``plugins/bibliogon-plugin-kdp/config/kdp.yaml`` must be
    regenerated via ``make build-zip`` per the canonical-vs-
    bundled rule.

  Effort: XL (16+ commits, multi-session). Trigger: when
  strategic-direction shifts toward KDP-publishing pipeline as
  the primary differentiator (per the exploration doc's
  Bundle B framing). Pairs with:
  ``KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01`` (P5, existing) -
  the wizard's category-picker step is the natural place to
  wire the existing /api/kdp/categories endpoint into the
  CategoryInput component.

- **GETSTARTED-MULTIBOOK-TYPES-UPDATE-01** (P2, DOC/ONBOARDING,
  filed 2026-05-18 from real-user-smoke + the Multi-Book-Type
  architecture work that landed across v0.34.0 + v0.35.0 +
  plugin-comics Foundation): the
  ``plugin-getstarted`` onboarding flow was built before
  Picture-Book and Comic-Book existed. It now needs to introduce
  all 3 book types currently available (prose, picture-book,
  comic-book — pending plugin-comics Session 1 close).

  Concrete gaps:
  1. Get-Started doesn't explain Prose vs Picture-Book vs
     Comic-Book differences
  2. Plus doesn't guide the user to the appropriate book
     type for their project
  3. Plus doesn't introduce new features that landed after
     the plugin was last touched (PDF Export, Categories +
     BISAC, picture-book layouts, RichTextEditor, etc.)

  Expected behavior:
  - Get-Started introduces 3 book types with use-case
    guidance ("write a novel? → Prose. Write a children's
    book? → Picture-Book. Write a comic? → Comic-Book")
  - Visual examples per book type (sample cover + one page
    rendered in the style of each)
  - Links to relevant help docs per book type
  - Matches existing plugin-getstarted UI patterns rather
    than introducing a new visual language

  Fix scope (estimated 3-4 commits):
  - Get-Started content rewrite (1-2 commits)
  - i18n in EN + DE per the existing exploration-doc
    pattern (NOT 8 catalogs — prose limited to EN + DE per
    the lessons-learned rule for onboarding/help docs)
  - Vitest for new screens
  - E2E Playwright for the full onboarding flow

  Scope-expansion candidates (consider one coordinated
  session):
  - v0.36.0 Doc-Sweep (the 4c-B-1-DOCS tentative session)
    could include the Get-Started update if both touch
    plugin-getstarted
  - Picture-Book + Comic-Book help-doc parity sweep can
    ride along if the Get-Started rewrite surfaces gaps

  Recurring-Component-Unification check: a "book-type card"
  component could be shared across Get-Started + Dashboard
  (the future CreateBookModal flow that picks book type
  before opening the wizard). If both surfaces converge on
  the same card shape, extract once. Filed as scope-
  expansion candidate, not a separate item.

  Single-Source-of-Truth check: the 3 book-type definitions
  (label, description, sample, help-doc link) should live in
  ONE config (e.g.
  ``backend/config/book-types.yaml`` or a Python module
  read by both the backend and the frontend onboarding) so
  adding a 4th book type later updates one file, not three.

  Half-Wired-Prevention check: onboarding must introduce
  ALL 3 book types when it ships — not 2 with comics "coming
  soon". Plugin-comics Session 1 needs to be closed before
  this work begins, OR the onboarding ships gated behind
  ``plugin-comics`` activation status with a fallback for
  the 2-book-type case.

  Trigger: 4c-B-1-DOCS coordinated session, OR separate
  onboarding-focused session once plugin-comics Session 1
  ships.

- **RECURRING-COMPONENT-AUDIT-01** (P3): frontend-wide audit
  for duplicate UI patterns (component shapes, hook
  compositions, styling clusters) that violate the new
  Recurring-Component Unification Rule (filed 2026-05-19 in
  ``.claude/rules/coding-standards.md``). The rule fires at
  2-surfaces threshold (stricter than the generic
  3-duplicates DRY rule); the codebase has accumulated
  multiple known candidates before the rule was formalised,
  so a one-time sweep is warranted.

  Known candidates at filing time (active as of 2026-05-20):
  - **AUTHOR-SELECT-INPUT-EXTRACT-01** (the rule's canonical
    first-application; closes together with
    ``AUTHOR-DATALIST-EXTEND-EDITORS-01``)
  - **LIST-VIEW-ROW-SHARED-EXTRACTION-01** (ArticleRow +
    BookListView row shape duplication)

  Closed candidates (moved to archive 2026-05-15):
  - ``ARTICLEFILTERBAR-EXTRACT-01`` — shipped 2026-05-15
  - ``PLUGIN-SETTINGS-TESTID-COVERAGE-01`` — shipped 2026-05-15

  Audit scope:
  1. **Component-shape sweep:** grep for distinctive JSX +
     prop combinations across ``frontend/src/components/``
     and ``frontend/src/pages/``. Recipes in coding-
     standards.md "Pre-Inspection for new UI components".
     Output: candidate list with file:line citations.
  2. **Hook-composition sweep:** identify hooks reused for
     similar purposes across 2+ surfaces (``useSelection``
     variants, ``useViewMode`` variants, etc.). Some
     already extracted (e.g. ``useTrashViewMode`` after
     Bug 3); the audit confirms no remaining duplicates.
  3. **Styling-cluster sweep:** grep for repeated
     className combinations across components. CSS module
     duplication is harder to detect mechanically; manual
     review of e.g. bulk-action-bar / filter-bar / toast-
     variant styling.
  4. **i18n key duplication:** secondary check — duplicate
     UI patterns often grow duplicate i18n keys (e.g.
     ``ui.create_book.author`` + ``ui.convert_to_book
     .metadata_author``). Worth surfacing during the
     extraction sessions for each candidate.

  Deliverable: audit doc at
  ``docs/audits/recurring-component-audit-YYYY-MM-DD.md``
  with categorised candidate list (HIGH / MEDIUM / LOW
  refactor value) + recommended ordering of extraction
  sessions. Each HIGH-value candidate gets its own backlog
  item (or extends an existing one) with the standard
  extraction-plus-migration session shape from coding-
  standards.md.

  Defer reason: the audit itself is read-only and would
  take 1-2 hours; the deliverable feeds N follow-up
  extraction sessions that each ship as their own focused
  work. Splitting audit-from-implementation matches the
  established "audit-first" Bibliogon discipline.

  Trigger: any time before v0.36.0 (extraction sessions
  can run in parallel with v0.35.0 PDF Export + S6
  closing). OR: a third recurring-component candidate
  surfaces in everyday work, prompting "audit all of them
  rather than chase individually".

  Pairs with: the remaining active component-extraction
  backlog items (``AUTHOR-SELECT-INPUT-EXTRACT-01`` +
  ``LIST-VIEW-ROW-SHARED-EXTRACTION-01``). Prior siblings
  ``ARTICLEFILTERBAR-EXTRACT-01`` +
  ``PLUGIN-SETTINGS-TESTID-COVERAGE-01`` shipped 2026-05-15
  and live in ``docs/roadmap-archive/2026-05.md``.

---

## P3 - Infrastructure / Quality

- **MOBILE-SELECTIVE-SYNC-EXPLORATION-TRIAGE-01** (P3, filed
  2026-05-20 from the re-prioritization audit Q6 adjudication
  / β-path).

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

- **PLUGIN-VERSION-GATING-ENABLE-01** (P3, OPT-IN-FEATURE,
  filed 2026-05-20 during V060 C3 β2 migration): enable
  ``min_app_version`` gating by passing ``app_version=__version__``
  to the ``PluginManager(...)`` ctor at
  [backend/app/main.py:308](../backend/app/main.py#L308).
  Currently the manager is constructed without ``app_version``,
  so pluginforge's ``_check_app_version`` skip-shortcuts when
  the host has not declared its version
  ([pluginforge/manager.py:522](file:///media/astrapi69/T7_Shield/dev/git/hub/pluginforge/pluginforge/manager.py#L522)).
  Class-attribute declarations on ``ComicsPlugin.min_app_version =
  "0.35.0"`` and ``KinderbuchPlugin.min_app_version = "0.9.0"``
  (from C3 commit ``997ca7d``) are documented but unenforced.

  Scope:
  - Add ``app_version=__version__`` to the
    ``PluginManager(...)`` ctor at main.py:308.
  - Audit current host version (0.35.1) against the 2 declared
    minimums: comics 0.35.0 (passes), kinderbuch 0.9.0 (passes).
    No first-party plugin fails the gate today.
  - Document the upgrade path: when Bibliogon bumps to 0.36.0,
    any plugin declaring ``min_app_version > 0.36.0`` would
    fail to activate. Release-workflow gate: confirm no plugin
    declarations exceed the target version before tagging.
  - Add 1 regression test pinning gating behavior (synthetic
    fixture plugin with ``min_app_version = "99.0.0"`` should
    surface ``filter_reason="incompatible_app_version"``).

  Architecture-discipline notes:
  - Pluginforge default ``app_version_severity="error"`` per
    Decision #4 — version mismatch refuses activation, doesn't
    warn. Severity is configurable per ctor kwarg.
  - Gating enable is a behavior change visible to operators
    (release-workflow gate point). Surface explicitly in the
    release CHANGELOG when shipped.

  Effort: S (1 commit). Trigger: next time a plugin needs to
  declare a real version requirement (e.g. depends on an
  API surface added in a specific Bibliogon release), OR as
  release-hardening work before v1.0.

- **WRITING-GOALS-PROGRESS-TRACKING-01** (P3, FEATURE-REQUEST,
  filed 2026-05-19 from the
  ``docs/audits/exploration-features-2026-05-15-evaluation.md``
  triage of exploration feature #1): classic author-tool daily-
  goal + streak + per-chapter word-count surface (Scrivener +
  Ulysses precedent).

  Scope:
  - Daily word-count goal, configurable per user (default 500)
  - Streak counter (consecutive days hitting goal)
  - Per-chapter word-count visible in BookEditor sidebar
  - Total-book word-count aggregate
  - Visual progress widget on the Dashboard
    ("Today: 347/500 words" with progress bar)
  - Settings entry under "Author" tab for goal configuration

  Architecture-discipline notes (per audit
  Track C):
  - **Single-Source-of-Truth**: per-session word-count storage
    decision is non-trivial. Two options:
    (a) DB ``WritingSession`` table with (date, words_written,
        user_id) rows - persistent SSoT, survives backup/
        restore, but adds a new DB migration.
    (b) Computed-on-demand from ``Article.updated_at`` +
        ``Book.updated_at`` + ``Chapter.updated_at`` diff
        windows - no new schema, but "did I write today?"
        becomes a derived query.
    Pre-Inspection should surface this as a STOP-gate
    decision before implementation. Recommend (a) for the
    audit-trail clarity and the future-feature value
    (per-day analytics, calendar view, streaks across
    machines).
  - **Reuses existing TipTap word-count infrastructure** via
    ``@tiptap/extension-character-count`` - no new word-
    counting logic needed at the editor layer.
  - **Recurring-Component-Unification check**: the
    ``WordCountWidget`` on Dashboard + the per-chapter count
    in BookEditor sidebar are two surfaces using the same
    progress-bar visual. Extract shared
    ``DailyGoalProgressBar`` in the same session per the
    2-surfaces rule.

  Effort: M (6-10 commits). Trigger: when daily-writing-habit
  reinforcement becomes a stated user need OR when the
  Dashboard real estate is reorganised and a progress widget
  fits naturally.

- **EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01** (P3, FEATURE-REQUEST,
  filed 2026-05-18 from real-user-smoke during Picture-Book +
  Article-conversion workflow): Alt+Z keyboard shortcut is not
  functional in any of Bibliogon's editor surfaces. User
  expectation matches the industry-standard convention from
  VS Code / Sublime / IntelliJ where Alt+Z toggles word-wrap.

  Affected surfaces:
  1. RichTextEditor wrapper (Picture-Book D6-C properties pane,
     ``frontend/src/components/RichTextEditor.tsx``)
  2. ArticleEditor (TipTap, ``pages/ArticleEditor.tsx``)
  3. BookEditor (TipTap, ``pages/BookEditor.tsx``)
  4. Markdown editor (if a separate surface — verify in
     Pre-Inspection)

  Expected behavior:
  - Alt+Z toggles a word-wrap mode on the active editor's
    content surface
  - Behaviour consistent across all 4 surfaces (one shared
    handler if extracted)
  - ``aria-keyshortcuts`` attribute on the editor root for
    a11y discovery
  - Per-user preference for word-wrap default (Settings, OR
    persist last toggle to localStorage)
  - Visual feedback (line wrap state change is its own signal,
    no toast needed)

  Fix scope (estimated 1-2 commits):
  - Add Alt+Z handler to RichTextEditor (the D6-C wrapper)
  - Plus Add handler to ArticleEditor + BookEditor (TipTap)
  - Plus add to Markdown editor if separate
  - Plus optional Settings preference for default state
  - Plus Vitest regression-pin for handler invocation
  - Plus aria-keyshortcuts attribute

  Pre-Inspection scope-expansion candidates: identify other
  industry-standard editor shortcuts currently missing
  (Ctrl+/ comment-toggle, Ctrl+D duplicate-line, Ctrl+Shift+K
  delete-line, etc.) — if multiple are missing, consider one
  coordinated keyboard-shortcuts session rather than 4
  single-shortcut sessions.

  Recurring-Component-Unification check: the 4 editor surfaces
  are exactly the kind of UI pattern (>2 sites with the same
  conceptual handler) that the 2026-05-19 rule fires on. If
  this lands as a real session, extract the handler as a
  shared hook (``useEditorShortcuts`` or similar) in the SAME
  session rather than adding 4 inline implementations. Tracked
  separately as ``KEYBOARD-SHORTCUTS-SHARED-EXTRACTION-01``
  (P3, scope-expansion candidate) if and when this lands.

  Trigger: separate Future-Session for editor keyboard-
  shortcuts polish, OR user follow-up if Alt+Z absence becomes
  a daily-use irritant.

- **CONVERT-TO-BOOK-WIZARD-LAYOUT-STABILITY-01** (P3, UX-BUG,
  filed 2026-05-18 from real-user-smoke during article-to-book
  conversion workflow): the ConvertToBookWizard dialog
  ([frontend/src/components/ConvertToBookWizard.tsx](../frontend/src/components/ConvertToBookWizard.tsx))
  has two distinct layout-instability bugs that break user
  muscle-memory and visual continuity across the wizard's
  steps.

  Concrete issues:
  1. **Dialog jumping**: dialog dimensions change between
     steps based on content amount. The visual jump breaks
     the impression of a stable container the user is
     navigating through.
  2. **Action-button position shift**: the final-step
     "Create Book" button appears in a different position
     than the "Weiter / Next" button on previous steps. The
     user's mouse / cursor / keyboard-Tab muscle-memory
     misses on the last click.

  Expected behavior:
  - Dialog dimensions stable across all wizard steps (set
    ``min-height`` and ``max-height`` constraints; pin the
    width with the existing CSS-Module pattern)
  - Action button (Weiter / Next / Create Book) sits in the
    same slot in the dialog footer across all steps — the
    label changes, the position does not
  - Matches the layout-stability pattern already in use by
    other Bibliogon dialogs (audit ``CreateBookModal``,
    ``ExportDialog``, ``ImportWizardModal`` for the
    canonical shape)

  Fix scope (estimated 2-3 commits):
  - Audit dialog-height behaviour per step + identify the
    fixed dimensions that fit all steps' content
  - CSS ``min-height`` + ``max-height`` constraint to
    prevent jumping (overflow-y: auto inside the content
    region for content that exceeds max-height)
  - Action-button consistent positioning: "Create Book"
    inherits the "Weiter" button slot in the dialog footer
  - Vitest regression-pin for dialog stability (rendered
    dimensions across steps within a tolerance band)
  - E2E Playwright pin walking all wizard steps + asserting
    the action-button data-testid resolves at the same
    bounding-box position

  Recurring-Component-Unification check: do
  ConvertToBookWizard + CreateBookModal + ImportWizardModal
  + ExportDialog + AppDialog share a dialog-stability
  pattern that could be extracted to a shared dialog shell?
  If yes, file separate
  ``DIALOG-SHELL-EXTRACTION-01`` (P3) per the 2-surface
  threshold rule. If no, the fix is wizard-local.

  Trigger: separate Future-Session for
  ConvertToBookWizard UX polish.

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

- **PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01** (P3):
  active conversion of ``page.text_content`` when the user
  switches a page's layout between a TipTap layout (JSON-
  serialized doc shape) and a Tier-Property layout (plain
  string shape). Currently (post-Session 4c-B-1 Fix C) a
  defensive read in PageCanvas + ``picture_book_pdf._render_page``
  unwraps any JSON-shaped text_content into plain text on
  display, so the user never sees raw JSON. But the DB shape
  remains "dirty" (a Tier-Property page may carry a JSON
  string in text_content from a prior TipTap session) until
  the next user edit overwrites it.

  Active-conversion proposal: on layout-switch in
  ``PageEditor.handleChangeLayout``, when transitioning FROM
  a TipTap layout TO a Tier-Property layout, also send
  ``text_content: <extracted-plain-text>`` in the same PATCH
  that flips the layout (alongside the existing
  ``layout_config: null`` purge from v0.34.0 Fix A).
  Symmetric direction (Tier-Property → TipTap) doesn't need
  active conversion because ``parseTextContentToJson`` already
  wraps plain text into a minimal TipTap doc on read.

  Scope: 1 small commit + Vitest pin (extends the existing
  layout-switch test in PageEditor.test.tsx). The defensive
  read stays in place as a belt-and-braces safety net for any
  pre-conversion dirty rows that exist in the wild.

  Trigger: a backend consumer that depends on
  ``text_content`` shape matching the layout type (e.g. a
  future export pipeline that requires "pure plain text for
  Tier-Property layouts"), OR an explicit data-hygiene sweep
  on existing books. Filed during the 4c-B-1 Fix C close-out
  (2026-05-19).

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

- **PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01** (P3): wire
  TipTap rich-text editing into picture-book page text regions
  (image_top_text_bottom + image_left_text_right + text_only).

  **Q1 status (2026-05-20 audit + adjudication):** D1 MVP
  shipped in v0.35.0 via 4c-B-1 (commits ``f17a93d``, ``ba91f59``,
  ``3fef46d``, ``a731c30``) — RichTextEditor wrapper for the 3
  unbounded layouts with the D1 MVP extension set (StarterKit +
  TextAlign + Underline + TextStyle + Color + FontFamily); 11-
  button RichTextToolbar in D6-C properties-pane placement.
  D2-D6 scope remains open: D2 storage-schema variants for
  rich-text vs plain-text per-layout; D3 toolbar-placement
  decisions for additional surfaces; D4 migration of legacy
  plain-string rows to TipTap JSON; D5 read-only PDF render
  consolidation; D6 editor-placement variants. Item KEPT active
  per Q1 KEEP-decision (Half-Wired-Discipline: archive-with-
  partial-scope-shipped produces latent-lost-work).

  Scope per the 4c-B Pre-Inspection (2026-05-17 discussion +
  queued 2026-05-18):
  - **Track A audit (Pre-Inspection step):** grep Bibliogon's
    existing TipTap-pattern across ArticleEditor + BookEditor
    chapter mode. Document Extensions configured, content
    storage shape, read-only render, Toolbar placement.
    Findings feed D1-D6.
  - **D1 — TipTap Extensions Configuration:** MVP set for
    picture-book pages (recommend: Bold + Italic + BulletList
    + OrderedList + Heading H1-H3 + TextAlign).
  - **D2 — Storage Schema:** ``Page.text_content`` as TipTap
    JSON for rich-text layouts vs. plain string for Tier-
    Property layouts (speech_bubble + image_full_text_overlay).
    Migration approach for existing rows.
  - **D3 — Toolbar Placement:** sticky vs floating-bubble-menu
    vs on-focus. Match Bibliogon's existing Editor pattern
    found in Track A.
  - **D4 — Migration Strategy:** existing plain-string
    ``Page.text_content`` rows wrapped in TipTap JSON for the
    rich-text layouts; backward-compatible read; idempotent
    SQL UPDATE on backend.
  - **D5 — read-only render:** PageCanvas needs to render the
    TipTap JSON for the rich-text layouts; existing components
    in ArticleEditor / chapter-editor provide the pattern.
  - **D6 — Editor placement:** in-PageCanvas vs adjacent panel.

  Pairs with: ``PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01``
  (same session per the user's 2026-05-18 confirmation).
  Per the Recurring-Component Unification Rule, ANY shared
  CollapsibleSection helper for the Tier-Property layouts
  gets extracted in the same session.

  Trigger: scheduled 4c-B session (post-S6 PDF Export close;
  before v0.36.0). Approx 6-9 commits if pure-TipTap. If
  bundled with the Tier-Property sibling: 10-13 commits;
  split per the stop-condition rule into 4c-B-1 + 4c-B-2.

- **PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01** (P3): apply
  the Tier-Property pattern (from
  ``PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01``) to the
  ``image_full_text_overlay`` text band — sibling to the bubble
  configurability work but for the overlay text region. ~10-12
  properties:
  - font-size + font-family + font-weight
  - text-color + text-align
  - background-color + opacity
  - width + height (the user's earlier scope-add for v0.34.0
    that deferred to this session)
  - line-height + padding

  Pairs with: ``PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01``
  (same session; the hybrid approach: TipTap for image_top /
  image_left / text_only; Tier-Property for speech_bubble +
  image_full_text_overlay per the user's 2026-05-18
  confirmation). Recurring-Component Unification Rule applies:
  shared ``CollapsibleSection`` helper extracted from the
  bubble work used here too. Possible further extraction:
  a ``<TierPropertiesEditor>`` parameterised by layout, if the
  Bubble + Overlay-Text shape converges enough.

  Trigger: scheduled 4c-B session (same as the TipTap-
  integration sibling). Approx 4-6 commits if standalone;
  bundled with TipTap-integration: 10-13 (split per stop-
  condition).

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

- **PICTURE-BOOK-STORYBOARD-VIEW-01** (P3, filed
  2026-05-18): storyboard view for Picture-Book
  authoring. Lets the author see the entire story-flow
  at a glance, drag-reorder pages, and manage the
  narrative arc across all pages with structure
  annotations. Substantial Author-Workflow improvement
  driven by the real KDP picture-book workflow (32 or
  40 pages industry standard — needs mental overview
  of pacing). Brainstorming captured here for future
  Pre-Inspection; no immediate action needed.

  Scope MVP (Picture-Book only initially):
  - Separate view alongside PageEditor (PageEditor
    stays the detail-work surface; Storyboard is the
    additional overview surface)
  - Entry-point: button in PageEditor header next to
    Metadata + Export-PDF buttons
  - Grid-view of all pages as thumbnails
  - Per-page summary (title + first line + layout
    preview)
  - Drag-reorder pages (reuse @dnd-kit pattern from
    the existing thumbnail sidebar)
  - Add-page-inbetween + duplicate-page + split-page
    + merge-pages operations

  Story-structure annotations (MVP):
  - Page-Notes field (author-memo, not user-visible
    in the rendered book)
  - Optional Story-Beat tag per page (Setup /
    Inciting / Rising / Climax / Falling /
    Resolution)
  - Optional Color-Coding for mood/tone
  - Optional Act/Chapter grouping

  Deferred to follow-up sessions:
  - Tree-View / Branching for Choose-Your-Adventure
  - Beat-Sheet templates (Save-the-Cat, Hero's
    Journey, etc.)
  - Character-Tracking across pages
  - Plot-Threads multi-storyline visualization
  - Print-Storyboard export
  - Multi-Book-Type migration (Comic + Prose)

  Schema implications (new optional columns on
  `Page` model, all nullable, backward-compat by
  default-NULL):
  - `notes` (text)
  - `story_beat` (enum)
  - `mood_color` (string)
  - `act_group` (string)
  - Alembic migration to add the columns
  - Existing pages: NULL across the board, no
    rendering impact

  Established disciplines to apply:
  - Single-Source-of-Truth: `page.position` already
    exists; Storyboard reuses the same field for
    ordering — no parallel ordering shape.
  - Recurring-Component-Unification: the
    PageThumbnail component is reusable between the
    existing thumbnail sidebar and the new
    Storyboard grid. Per the 2-surfaces rule in
    coding-standards.md, extract first + migrate
    both sites in the same session.
  - Future Comic-Plugin will reuse the Storyboard
    pattern (Multi-Book-Type migration target).

  Pairs with / cross-references:
  - `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`
    (multi-bubble + panel work, replaces the
    earlier "Comic-Foundation Session" framing
    that lived in picture-book; reframed
    2026-05-18 to plugin-comics scope)
  - `PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`
    (optional picture-book polish; SVG-tail
    primitive reusable in plugin-comics)
  - Candidate for a Combined-Storyboard-plus-
    plugin-comics-session sequencing if both
    land in the same v0.36.x cycle.

  Schema-Foundation-Pre-Commitment question for
  4c-B-2 Tier-Property scope: if Storyboard later
  needs Page-Notes + Story-Beat columns, should
  4c-B-2 add the Schema-Foundation now (NULL
  columns) so Storyboard ships frontend-only, OR
  should the Storyboard Session add them later
  alongside its own UI? CC decides whether to
  surface this in the 4c-B-2 Pre-Inspection or
  defer entirely.

  User-real-workflow rationale: KDP picture-books
  typically run 32 or 40 pages; the author needs a
  mental overview of pacing across all pages.
  Storyboard is the ideal surface for the
  outline/iteration phase. Matches the
  Real-Author-Workflow ("outline + storyboard
  first, then detail-work in PageEditor") that
  picture-book authors already follow in print.

  Trigger: post-v0.35.0 dedicated session OR user
  requests Storyboard during real Picture-Book
  authoring with existing Kinderbücher. Effort:
  10-15 commits (substantial session — schema
  migration + Storyboard component family +
  drag-reorder wiring + annotations panel +
  i18n × 8 + Vitest + E2E + help docs).

- **PICTURE-BOOK-TEXT-CONFIGURATION-01** (P3): ship Tier 1 +
  Tier 2 text-configuration properties across image-based
  layouts (parallel to the bubble extended-properties work
  in `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`).
  User-reported during Session 4c-A manual smoke: text
  typography is insufficient for picture-book context across
  image_left_text_right + image_top_text_bottom +
  image_full_text_overlay. User wants the same
  configurability pattern that the speech-bubble's Tier
  properties get.

  Proposed Tier 1 — Visual Style section (per layout):
  - `text_background_color` (color picker)
  - `text_padding` (slider)
  - `text_opacity` (slider 0.3-1.0)

  Proposed Tier 2 — Typography section (per layout):
  - `font_family` (dropdown of children-book-friendly fonts;
    reuse the same font catalog the speech-bubble item plans)
  - `font_size` (slider 10-32pt)
  - `font_weight` (dropdown: normal/bold)
  - `text_color` (color picker)
  - `text_align` (dropdown: left/center/right)
  - `line_height` (slider 1.2-2.0)

  Bug D scope-add covered by this item: `image_full_text_overlay`
  needs `text_container_width` + `text_container_height` sliders
  (text-region dimensions as % of canvas). Same Tier-Property
  pattern as the speech-bubble `bubble_width` + `bubble_height`
  filed under `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`.
  Bug B was closed by the CSS default change (image_fit cover)
  — Bug D's `width + height` configurability is the next
  refinement, NOT a regression of Bug B.

  UI pattern: collapsible-sections matching the speech-bubble
  item's pattern. The `<CollapsibleSection>` helper noted there
  is the natural reusable; this item is a primary motivator
  for extracting it. Three sections per text-region:
  Visual Style / Typography / Sizing (only on
  image_full_text_overlay).

  Schema extension: `layout_config` dict gains nested keys
  for text properties (`text_*` prefix to disambiguate from
  speech-bubble's bubble-level keys). Same JSON-as-Text
  column; same migration approach (NO data migration; defaults
  apply when keys absent).

  Trigger: scheduled 4c-B session covers BOTH this item AND
  `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01` in one
  Tier-Property-Pattern Application session OR user-feedback
  that the typography defaults are still poor after 4c-A
  push.
  Effort: 6-9 commits (Pre-Inspection +
  CollapsibleSection extraction + Visual Style section +
  Typography section + Sizing section for
  image_full_text_overlay + PageCanvas integration + i18n
  + Vitest + E2E + dispatcher updates in LayoutConfigImageRow).

  Strategic note: 4c-B Pre-Inspection should frame the
  session as "Tier-Property Pattern Application across
  Bubble + Text" — Bubble and Text share the
  Visual-Style + Typography spec almost 1:1. The reusable
  `<CollapsibleSection>` + a shared typography/visual-style
  control-kit drops total commit count below the naive
  Bubble + Text = 2 × spec sum. Surface during 4c-B
  Pre-Inspection whether to extract a single
  `<TierPropertiesEditor>` parameterized by layout.

  4c-B sub-item — `layout_config` namespace per layout
  (Fix B for Session 4c-A Bug A + Bug C): the current
  `Page.layout_config` is a single flat dict that
  accumulates keys from every layout the page has worn.
  v0.33.1 ships the conservative **Fix A** (purge
  `layout_config` to `null` on layout switch in
  `PageEditor.handleChangeLayout`), which trades
  per-layout-config-preservation for correctness. The
  follow-up Fix B namespaces the dict by layout:
  ```json
  {
    "speech_bubble": {"anchor_position": "...", "opacity": ...},
    "image_top_text_bottom": {"text_align": "...", ...},
    "image_full_text_overlay": {"text_position": "...", ...}
  }
  ```
  Per-layout configs survive a switch + return-to-previous;
  the renderer reads `layout_config[page.layout]` instead
  of `layout_config` directly. Migration: convert existing
  flat dicts into the active layout's namespace on first
  read (best-effort heuristic on existing key prefixes,
  e.g. `anchor_*` → `speech_bubble`, `text_*` →
  text-region layouts, `image_*` → image-region layouts).
  Schedule: bundle with 4c-B so the new typography keys
  land in the namespaced shape from day one rather than
  requiring a second migration. Tests must include a
  switch → switch-back assertion that prior config
  re-applies after returning to a layout.

  Pairs with: `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`
  (sibling), `PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01`
  (Tier 3 for bubble; no text equivalent yet).

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

- **SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01** (P3, IMPROVEMENT):
  Settings → "Allgemein" tab requires scroll to reach all
  settings below the initial three Kacheln/cards. Should be
  reorganized for better discoverability.

  Recommended approach (CC decides at implementation time):
  - Option B preferred: split "Allgemein" into multiple top-level
    tabs (consistent with the existing tab pattern, avoids
    tab-in-tab cognitive load).
  - Option A acceptable: sub-tabs within "Allgemein" if Option B's
    tab-bar becomes too wide.
  - Option C fallback: cards-layout optimization only
    (Collapsible-Sections, denser grid).

  Scope:
  - Audit current "Allgemein" tab structure (which settings are
    grouped there).
  - Decide grouping strategy: Erscheinung / Verhalten / Daten / etc.
  - Implementation: extract relevant settings into separate tab
    components OR sub-navigation.
  - i18n: new tab labels in 8 languages.
  - Tests: Vitest + E2E for navigation between new tabs.

  Effort estimate: 4-6 commits (substantial Settings refactor).

  Trigger: builds on the v0.33.0 Settings-monolith extraction work
  shipped 2026-05-15 (archived: ``PLUGIN-SETTINGS-TESTID-COVERAGE-01``,
  ``SETTINGS-INLINE-TABS-EXTRACT-01``, both in
  ``docs/roadmap-archive/2026-05.md``). Now that the per-tab
  components exist (AppSettings / AiAssistantSettings /
  TopicsSettings / PluginSettings / AuthorSettings), reorganization
  sits cleanly on top — no extraction prerequisite remaining.
  Trigger this item when a Settings-Polish-Session is convened OR a
  user complaint about Settings scroll friction surfaces.

  Defer reason:
  - Not user-blocking (existing scroll works, just friction).
  - Today's Sprint-Velocity is at the upper edge (23+ commits since
    v0.33.0); this is the 8th surface-pattern instance manual
    smoke-testing has surfaced.
  - Bug 4 (Comments-Admin restructure) + Kinderbuch test-discipline
    deliverables are this session's defined scope.

  Filed by Hotfix-Session 2026-05-16 evening (after Bug-4 ship)
  per user instruction.

- **AUTHOR-DATALIST-EXTEND-EDITORS-01** (P3): extend the Bug 8
  Phase 2 Wizard Author-Dropdown pattern (``<input>`` +
  ``<datalist>`` + "Add to Authors-Database" checkbox) to the
  remaining author input surfaces:
  - ``ArticleEditor.tsx`` author field
  - ``BookEditor.tsx`` author field
  - ``BookEditor.tsx`` backpage author-bio sidebar
  Trigger: user-feedback that one of those surfaces is friction
  to type into OR positive validation that the Wizard Author-
  Dropdown pattern works well in production. Bug 8 Phase 2
  deliberately ships the pattern on the Wizard ONLY (per D8 —
  the Wizard is the high-leverage surface because multi-article
  selection surfaces multiple authors at once; single-record
  editors get the pattern later).
  Scope: ~4-5 commits. Mirror the Wizard's
  ``computeAuthorSuggestions`` helper for each surface (the
  helper itself stays reusable; only the inputs change — for
  the Article/Book editor cases there's no multi-row selection,
  so the suggestion pool is just the global Authors-DB).
  Re-use the same Add-to-Authors-DB checkbox shape + the same
  ``api.authors.create`` call shape. Vitest + E2E for each
  surface.
  Defer reason: scope-control. The Wizard pattern is novel
  enough that shipping it to one surface and letting Aster
  validate the UX is the right next step before duplicating it
  across three more editor surfaces. Filed during the Bug 8
  Phase 2 close-out.

  **Update 2026-05-19 (post-CreateBookModal fix):** scope
  expanded to also include extraction of a shared
  ``AuthorSelectInput`` component — see the new sibling item
  ``AUTHOR-SELECT-INPUT-EXTRACT-01`` below. The two items
  should ship together in one coordinated session: the
  extraction lands first (audit-first across all 4+ usage
  sites, then build the component, then migrate each site
  in turn). At session close, BOTH items mark
  ``[x]``-complete simultaneously. Closes the
  Wizard+CreateBookModal duplication created by the
  2026-05-19 CreateBookModal fix.

- **AUTHOR-SELECT-INPUT-EXTRACT-01** (P3): extract the
  Author-Selection pattern (``<input>`` + ``<datalist>`` +
  "Add to Authors-Database" checkbox) into a shared
  ``AuthorSelectInput`` component, then migrate ALL usage
  sites in one coordinated session.

  Known usage sites at filing time (2026-05-19):
  - ``ConvertToBookWizard.tsx`` (Step-2 author field, with
    ``computeAuthorSuggestions(selectedArticles,
    globalAuthors)`` suggestion source)
  - ``CreateBookModal.tsx`` (author field, with
    ``authorChoices`` (user-identity) ∪ ``globalAuthors``
    suggestion source) — shipped 2026-05-19 as the
    pre-vs-post-AuthorsDB pattern bug fix
  - ``ArticleEditor.tsx`` (article author field, future
    AUTHOR-DATALIST-EXTEND-EDITORS-01 work)
  - ``BookEditor.tsx`` (book author field, same backlog
    item)
  - ``BookEditor.tsx`` backpage author-bio sidebar (same
    backlog item)

  **Audit-First requirement:** before extraction, grep the
  entire codebase for any other free-text author-input
  surface. Possible candidates: backup-import wizards,
  manuscript-template forms, future picture-book-specific
  metadata fields. The audit's findings determine the
  final API surface of ``AuthorSelectInput``.

  Component API (proposed; pending audit refinement):
  ```tsx
  interface AuthorSelectInputProps {
    value: string;
    onChange: (next: string) => void;
    suggestions: string[];  // pre-computed union, caller decides
    addToDbChecked: boolean;
    onAddToDbCheckedChange: (next: boolean) => void;
    addToDbVisible: boolean;  // caller computes from
                              // globalAuthors-vs-typed-name match
    testidNamespace: string;  // e.g. "create-book-author" /
                              // "convert-to-book-wizard-author"
    labelKey?: string;        // default "ui.shared.author"
    placeholderKey?: string;  // default "ui.shared.author_placeholder"
  }
  ```
  The caller stays responsible for:
  - Computing ``suggestions`` (different per surface:
    Wizard uses article-context-driven; modal uses
    user-identity-driven; editors use globalAuthors-only)
  - Computing ``addToDbVisible`` (typed name not in
    globalAuthors)
  - Calling ``api.authors.create`` on submit when
    ``addToDbChecked`` is true (the fail-soft pattern)

  The component just renders the shared visuals + emits
  the events.

  **Coordination:** ships AS A coordinated session that
  closes BOTH ``AUTHOR-SELECT-INPUT-EXTRACT-01`` AND
  ``AUTHOR-DATALIST-EXTEND-EDITORS-01`` simultaneously.
  Session shape:
  1. Audit grep (1 commit, docs-only)
  2. Component + Vitest (1 commit)
  3. Migrate ConvertToBookWizard (1 commit)
  4. Migrate CreateBookModal (1 commit)
  5. Migrate ArticleEditor (1 commit) — closes
     AUTHOR-DATALIST-EXTEND-EDITORS-01 partially
  6. Migrate BookEditor author + backpage_author_bio
     (1 commit) — closes AUTHOR-DATALIST-EXTEND-EDITORS-01
     fully
  7. Playwright smoke for all migrated surfaces (1 commit)

  ~7 commits total. Above 5-commit stop-threshold but
  acceptable because the extraction is intrinsically
  multi-site coordinated work; splitting it across
  multiple sessions would leave mixed-pattern state in
  the codebase between sessions.

  Trigger: AUTHOR-DATALIST-EXTEND-EDITORS-01 trigger fires
  (user feedback on editor friction OR positive Wizard
  validation), OR a fifth usage site appears in the audit.

  Original defer reason (2026-05-19 morning): coding-
  standards.md "Three duplicates: refactor immediately"
  threshold — at the CreateBookModal fix we were at TWO
  duplicates.

  **Updated 2026-05-19 afternoon (post Recurring-Component
  Unification Rule):** the new UI-specific rule has a
  STRICTER threshold of 2 surfaces, not 3. This item is
  now the canonical first-application of that rule — the
  earlier defer reason is superseded. Promote scheduling
  priority: this should ship as the NEXT extraction-plus-
  migration session after current in-flight work (Session
  6 PDF Export + v0.35.0 cut). The Pre-Inspection step in
  the new rule requires an audit-first commit before
  component construction, which fits naturally with the
  user-requested audit-first scope expansion captured in
  this entry.

  Pairs with: ``AUTHOR-DATALIST-EXTEND-EDITORS-01``
  (closes together) + ``RECURRING-COMPONENT-AUDIT-01``
  (broader frontend sweep that may surface additional
  related candidates).

- **PLUGIN-EXPORT-SINGLE-ROUTER-REFACTOR-01** (P3, filed
  2026-05-20 from the pluginforge 0.8.0 bump's deprecation
  warning). plugin-export's ``get_routes()`` returns 3 separate
  routers; pluginforge 0.8.0 logs a DeprecationWarning advising
  the Single-Router-Per-Plugin convention (one parent router with
  ``router.include_router(...)`` to nest sub-routers). Supported
  in 0.8.0 + 0.9.0; may become an error in 0.10.0.

  Scope: refactor
  ``plugins/bibliogon-plugin-export/bibliogon_export/plugin.py``
  to return a single parent router that nests the existing 3
  sub-routers via ``include_router``. Mirror the canonical shape
  already used by plugin-kinderbuch + plugin-comics. Update any
  per-plugin test fixtures that assert on the get_routes return
  shape. Verify no route-prefix or URL change post-refactor.

  Effort: S (1-2 commits).

  Trigger: any of (i) pluginforge 0.10.0 release approaching,
  (ii) any new plugin needs an export-plugin pattern as
  reference and the 3-router shape would propagate the
  anti-pattern, (iii) the deprecation warning becomes noisy
  enough to mask other test output.

  Cross-references:
  - `.claude/rules/lessons-learned.md` "Single-Router-Per-Plugin
    convention" (this filing is the concrete refactor work that
    rule's existence implies).
  - pluginforge 0.8.0 release notes (the deprecation source).

- **PLUGIN-COMICS-MAKEFILE-INTEGRATION-01** (P3, Plugin-
  Infrastructure, filed 2026-05-18 from plugin-comics
  Session 1 retrospective): plugin-comics shipped at
  Session 1 (commits ab9da0c / 5fdb786 / 84954a3) with
  the package + path-dep + CI matrix entries + i18n in
  place, but the repo-root ``Makefile`` was NOT updated.
  Half-Wired-Feature-Lifecycle Prevention rule applies:
  the developer-facing test surface is half-shipped
  (CI's per-plugin matrix runs comics, the per-developer
  ``make test-plugins`` does NOT).

  Verified gaps in [Makefile](../Makefile):
  - ``test-plugins`` aggregate (line 154): 10 plugin
    dependencies; ``test-plugin-comics`` absent.
  - ``test-coverage-plugins`` aggregate (line 222): 9
    plugin dependencies; ``test-coverage-plugin-comics``
    absent.
  - Per-plugin target ``test-plugin-comics``: missing.
  - Per-plugin target ``test-coverage-plugin-comics``:
    missing.
  - The MAKEFLAGS header (line 4) listing parallel-
    runnable plugin targets is also missing comics.

  Concrete fix (single commit):
  1. Add ``test-plugin-comics`` mirroring
     ``test-plugin-kinderbuch`` (lines 171-174) — ``cd``
     into the plugin dir + ``poetry env use python3.12
     -q 2>/dev/null; poetry run pytest tests/ -v``.
  2. Add ``test-coverage-plugin-comics`` mirroring
     ``test-coverage-plugin-kinderbuch`` (lines 244-247).
  3. Append ``test-plugin-comics`` to the ``test-plugins``
     dependency list (line 154).
  4. Append ``test-coverage-plugin-comics`` to
     ``test-coverage-plugins`` (line 222).
  5. Append ``test-plugin-comics`` to the MAKEFLAGS
     header at line 4 so parallel ``-j`` runs include it.
  6. Verify ``make test-plugins`` exits 0 with comics
     included (regression-pin).

  Effort: S (15-30 min — pure mechanical mirror of the
  kinderbuch pattern × 5 lines touched in Makefile).

  Pre-Inspection-Checklist update (proposed): when a
  new plugin ships, the Pre-Inspection MUST verify
  ALL integration surfaces — not just Python code +
  entry-points. Concrete checklist additions for
  future plugin-shipping Pre-Inspections:
  - ``backend/pyproject.toml`` path-dep ✓
  - ``backend/config/app.yaml.example`` enable-list ✓
  - ``backend/config/plugins/<name>.yaml`` defaults ✓
  - ``.github/workflows/ci.yml`` plugin-matrix entry ✓
  - ``.github/workflows/coverage.yml`` plugin-matrix
    entry ✓
  - ``Makefile``'s ``test-plugins`` aggregate ❌ MISSED
  - ``Makefile``'s ``test-coverage-plugins`` aggregate
    ❌ MISSED
  - ``Makefile`` per-plugin ``test-plugin-<name>`` target
    ❌ MISSED
  - ``Makefile`` per-plugin
    ``test-coverage-plugin-<name>`` target ❌ MISSED
  - i18n catalog entries × 8 ✓
  - At least one TestClient-tier integration test ✓
  - User-overlay enabled-list contains the new plugin
    (or merge semantics handle it) ❌ MISSED — added
    2026-05-18 after the plugin-comics 404 traced to
    a stale user-overlay (filed as
    ``USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01`` P2)

  The ❌-MISSED items above are exactly the gap this
  filing closes. Future plugin-shipping sessions should
  walk the full checklist explicitly at Pre-Inspection
  time, not just at retrospective time.

  Strategic note — broader pattern discovery: the audit
  for THIS filing surfaced TWO related drifts in the
  same Makefile (NOT in scope for this item, but worth
  recording so a future hygiene sweep can close them
  together):
  - ``medium-import``: NO Makefile targets at all (no
    ``test-plugin-medium-import``, no coverage target,
    not in the ``test-plugins`` aggregate). Predates
    today's Session 1 work; landed when medium-import
    shipped in v0.31.0+.
  - ``git-sync``: ``test-plugin-git-sync`` exists (line
    201) but ``test-coverage-plugin-git-sync`` does
    NOT, and it is absent from the
    ``test-coverage-plugins`` aggregate (line 222).

  If a P3 hygiene sweep wants to close ALL Makefile-
  integration gaps at once, extend the scope of this
  filing or open a sibling
  ``PLUGIN-MAKEFILE-INTEGRATION-AUDIT-01`` covering
  medium-import + git-sync + comics together. Filing
  comics-only here per the user's direction; the
  related drifts are surfaced for downstream triage.

  Trigger: separate future-session for plugin-comics
  infrastructure-completion, OR before plugin-comics
  Session 2 starts (so developers running ``make
  test-plugins`` locally exercise the comics path),
  OR a P3 Makefile-integration sweep picks up the
  full pattern.

  Pairs with: future Pre-Inspection-Checklist update
  living in ``.claude/rules/ai-workflow.md`` (proposed
  as part of this item's closure).

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

- **STORY-BIBLE-PLUGIN-01** (P3, STRATEGIC, filed 2026-05-19
  from the
  ``docs/audits/exploration-features-2026-05-15-evaluation.md``
  triage of exploration feature #4): plugin-based database for
  fiction-writing entities (Characters, Settings, Plot-Points,
  Items, Lore) with @-mention syntax in the editor for
  cross-references.

  Scope:
  - New plugin: ``bibliogon-plugin-story-bible``
  - DB: 5 entity types per-book-scoped (Character, Setting,
    PlotPoint, Item, Lore) with rich-text descriptions +
    optional photos
  - TipTap extension: ``@-mention`` syntax with autocomplete
    against existing entities
  - Click-on-mention navigates to entity page
  - AI-Template integration: per-entity-type prompts
    (Character Profile, Setting Description, Plot-Point
    structure)
  - StoryBibleSidebar component in BookEditor (gated on
    plugin activation)

  Architecture-discipline notes (per audit
  Track C):
  - **3-Source-Plugin-Metadata-Pattern**: full pattern applies.
    Canonical ``backend/config/plugins/story-bible.yaml`` (UI
    metadata + settings defaults) + ``plugin.py`` class attrs
    (identity + contract) + generated bundled YAML via
    ``make build-zip``.
  - **Recurring-Component-Unification**: 5 entity types x same
    CRUD pattern -> extract ``EntityCRUDView`` in the SAME
    session as the second entity type, NOT deferred. Per the
    2-surfaces rule.
  - **Single-Source-of-Truth**: cross-references between
    entities + chapters must derive from the entity's
    canonical record (DB row), not duplicate text into chapter
    content. The TipTap extension stores the entity ID; the
    editor renders the entity's current display-name on the
    fly.
  - **Half-Wired-Lifecycle Prevention**: the @-mention
    autocomplete (write surface) and the click-to-navigate
    affordance (read surface) MUST ship together. Half-wired
    risk: shipping autocomplete without click-navigate creates
    "I mentioned a character but can't get back to them"
    purgatory.

  Effort: XL (16+ commits, multi-session). Trigger: dedicated
  Story-Bible session when Aster's next fiction-project
  (SciFi continuation, new Kinderbuch series, comic) reaches
  the point where character/setting tracking becomes a real
  cognitive cost. Plugin model means non-fiction authors
  never see it.

- **PLUGIN-COMICS-E2E-SMOKE-01**: live-dev-server E2E
  Playwright spec for plugin-comics. Would have caught
  today's 404 BEFORE the user's manual smoke. Concrete
  scope: a spec under ``e2e/smoke/`` that creates a
  ``book_type = "comic_book"`` book, opens the editor,
  asserts the green plugin-info panel renders with
  ``name = "comics"`` + ``session = 1``, and asserts NO
  ``role="alert"`` plugin-unreachable error element
  appears. Effort: S (~30-60 min in advance, or natural
  fit at Session-2 landing). Strategic note: this is a
  broader pattern. Backend pytest with TestClient
  triggers a fresh FastAPI lifespan per session, so it
  masks an entire class of operational issues that
  long-running uvicorn surfaces — stale plugin
  discovery, env-var absence, filesystem state drift,
  cross-process cache poisoning. Filing under plugin-
  comics scope per the "single instance is incident,
  not pattern" discipline. If a SECOND plugin needs the
  same pattern, extract a shared
  ``LIVE-DEV-SMOKE-INFRASTRUCTURE-01`` (P4) per the
  Recurring-Component-Unification rule's 2-surfaces
  threshold — do NOT pre-emptively file the
  infrastructure item now. Trigger: plugin-comics
  Session 2 starts, OR another plugin needs live-dev
  E2E smoke (which would also trigger the
  infrastructure extraction). Filed by plugin-comics
  Session 1 smoke 2026-05-18.

(D-05 closed as won't-fix 2026-05-05; archived in
[docs/roadmap-archive/2026-05.md](roadmap-archive/2026-05.md).)

- **KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01** (P3, FEATURE):
  wire the ``CategoryInput`` component (Bug 9, free-text chips
  for ``Book.categories``) to the existing
  ``GET /api/kdp/categories`` endpoint so the 26-entry KDP
  catalog surfaces as a ``<datalist>`` autocomplete pool. The
  backend endpoint is already live and pinned by
  ``test_kdp_categories_returns_full_26_catalog``; the frontend
  ``CategoryInput`` accepts a ``suggestions`` prop that is
  currently passed as ``[]`` from
  ``BookMetadataEditor``. Wiring adds (a) an
  ``api.kdp.listCategories()`` method in
  ``frontend/src/api/client.ts``, (b) a one-shot fetch in
  ``BookMetadataEditor`` (cached for the editor lifetime —
  catalog is dictated by Amazon and won't change between mounts),
  (c) passing the result into the existing ``suggestions`` prop.
  Trigger: user requests autocomplete in the Categories field,
  OR Picture-Book authoring feedback that authors don't know
  KDP's canonical category names, OR
  ``RECURRING-COMPONENT-AUDIT-01`` flags this as a Pre-Inspection
  target.
  Effort: S (1 commit). Filed by KDP-CATEGORIES-CATALOG-SYNC-01
  (2026-05-18) — the JSDoc on ``CategoryInput.tsx`` previously
  referenced an ``api.kdp.listCategories()`` method that did not
  exist; the dead reference was removed in the same commit and
  this item tracks the legitimate wire-up that was implied.

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

- **MEDIUM-IMPORT-EXCERPT-AUTOFILL-01**: auto-populate
  ``Article.excerpt`` on Medium import, mirroring the existing
  seo_title / seo_description defaults shipped in commit
  ``2062393``. Trade-off: excerpt is conceptually similar to
  seo_description (both summarize the article), so duplicating
  the subtitle into both might feel redundant; alternatively,
  excerpt could derive from the first paragraph of body text
  with the existing heuristic-fallback rejection we applied to
  seo_description. No user complaint yet — the seo_description
  default covers the dashboard-tile use case. Promote to P2 if
  a user reports an empty-excerpt issue on imported articles.

---

## P4 - Roadmap / Future Phases

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
  [docs/explorations/installer-discovery-report.md](explorations/installer-discovery-report.md).

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

- **COMMENTS-ADMIN-PAGINATION-01** (P4, IMPROVEMENT): filed
  by UX-Full-Audit 2026-05-15 (G2-F3). Comments admin tab
  renders all comments in a single DOM table without
  pagination or virtualization. At current scale (49) it's
  fine; at 500+ comments the initial render and DOM weight
  will degrade. Add pagination OR virtualization OR a hard
  cap with "Show all" affordance. Effort: S-M. Trigger:
  first user >200 comments OR Settings sluggishness
  complaint.

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
