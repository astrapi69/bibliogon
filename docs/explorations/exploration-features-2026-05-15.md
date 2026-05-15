# Bibliogon Feature Exploration - 2026-05-15

Strategic exploration of 10 proposed features for Bibliogon
post-v0.32.0. Each feature evaluated against user-value,
implementation-complexity, dependency-on-existing-architecture,
and strategic-fit.

Decision-support document. NOT a commit-plan. User picks which
features to develop into Pre-Inspection-Prompts.

---

## Feature Inventory

10 features across 4 categories:

| # | Feature | Category | Complexity | User-Value |
|---|---------|----------|------------|------------|
| 1 | Writing Goals + Progress Tracking | Author-Workflow | M | High |
| 2 | Distraction-Free Writing Mode | Author-Workflow | S | Medium |
| 3 | Reading-Time Estimation | Author-Workflow | XS | Low-Medium |
| 4 | Character/Setting Database Plugin | Fiction-Workshop | XL | High for Fiction |
| 5 | Outline/Structure View | Fiction-Workshop | L | High for Fiction |
| 6 | KDP Publishing Workflow | Publishing | XL | High |
| 7 | Multi-Language-Book Workflow | Publishing | XL | Medium-High |
| 8 | DOCX-Manuscript Export | Publishing | S | Medium |
| 9 | Article-to-Book Conversion | Bibliogon-Specific | M | High (immediate) |
| 10 | Backup-Comparison/Diff-View | Bibliogon-Specific | M | Medium |

Complexity scale: XS (1-3 commits), S (3-5), M (6-10),
L (11-15), XL (16+)

---

## Detail: Each Feature

### 1. Writing Goals + Progress Tracking

**What it does:**
- Daily word-count goal (configurable per user, e.g. 500/day)
- Streak counter (consecutive days hitting goal)
- Per-chapter word-counts visible in BookEditor
- Visual progress widget on dashboard

**User-flow:**
- User sets goal in Settings → Author tab
- Dashboard shows "Today: 347/500 words" with progress bar
- Streak shown when ≥3 consecutive days
- BookEditor sidebar shows current-chapter word-count plus
  total-book word-count

**Implementation:**
- New DB: WritingSession table (date, words_written, user_id)
  OR aggregate from Article/Book/Chapter updated_at + content
  diff
- Backend: GET /api/stats/daily-progress endpoint
- Frontend: WordCountWidget component + Settings panel
- Uses existing TipTap word-count from Editor

**Pros:**
- Classic author-tool feature (Scrivener has it, Ulysses has it)
- Reinforces daily writing habit
- Visible momentum-tracker

**Cons:**
- Real word-count from TipTap-JSON requires careful counting
  logic (especially for diffs between sessions)
- "Streak" can feel oppressive for some authors
- Backend storage decision: persistent vs computed-on-demand

**Strategic fit:** High - aligns with Bibliogon's
self-publishing-author audience. Daily-writing-habit is core
author workflow.

**Dependencies:** none, builds on existing TipTap + Article/Book
infrastructure

**Recommended priority if chosen:** P3 (nice quality-of-life)

---

### 2. Distraction-Free Writing Mode

**What it does:**
- Vollbild-Editor ohne Sidebars
- Optional Pomodoro-Timer integriert (25min/5min cycles)
- Hotkey to enter/exit (F11 typical)
- Auto-save during mode

**User-flow:**
- User clicks "Focus Mode" button in editor toolbar
- Editor expands to full viewport, hides sidebars + toolbar
- Pomodoro shows in corner if enabled
- Esc or F11 exits

**Implementation:**
- New state in editor: focus-mode boolean
- CSS transitions for sidebar hide/show
- Optional PomodoroTimer component (timer state, audio cue
  for transitions)
- Toolbar button + hotkey handler

**Pros:**
- Low complexity (mostly CSS state-change)
- Direct productivity feature
- Pomodoro is established author-tool pattern

**Cons:**
- May conflict with other Bibliogon panels (AI-Template,
  Comments, etc.) - need clean hide/show
- Pomodoro adds notification complexity (audio? browser-
  permission? settings?)

**Strategic fit:** Medium - useful but not unique. Standard
feature in author-tools, doesn't differentiate Bibliogon.

**Dependencies:** existing Editor.tsx + Toolbar.tsx

**Recommended priority if chosen:** P4 (good-to-have)

---

### 3. Reading-Time Estimation

**What it does:**
- "This chapter takes 8 minutes to read"
- "This article: 12 min read"
- Per-Book aggregate: "Total: 4h 23min"
- Standard 250 words/minute (configurable)

**User-flow:**
- Estimate appears in article/chapter header next to word-count
- Aggregate in book metadata view

**Implementation:**
- Pure computation: word-count / 250 = minutes
- Utility function reading-time.ts
- Display in existing components
- Settings field for words-per-minute customization

**Pros:**
- Trivial implementation (XS)
- Reader-facing value (useful for Authors to know)
- Standard publishing-tool feature (Medium shows it)

**Cons:**
- Low marginal value (word-count is already shown)
- "Reading time" varies wildly per content type (technical
  vs narrative)

**Strategic fit:** Low-Medium - quick win but not transformative

**Dependencies:** none, pure utility

**Recommended priority if chosen:** P4 (quick polish)

---

### 4. Character/Setting Database Plugin

**What it does:**
- Plugin-based database for fiction-writing entities
- Tables for: Characters, Settings (Locations), Plot-Points,
  Items, Lore
- Per-entity rich-text descriptions with photos
- @-Mention syntax in editor: "@John walks into @Tavern"
- Auto-linking creates cross-references
- AI-Templates can populate entity sheets (e.g. "Character
  Profile Template" generates traits, backstory, motivations)

**User-flow:**
- User opens BookEditor for SciFi project
- New sidebar tab: "Story Bible"
- Browse Characters, Settings, etc. in tabs
- Click "+ Character" → AI-Template option appears
- In Chapter editor, @-trigger autocompletes character names
- Click on a @-mention navigates to entity page

**Implementation:**
- New plugin: bibliogon-plugin-story-bible
- DB: Character, Setting, PlotPoint, Item, Lore tables
  (per-book scoped)
- TipTap extension: mention-extension for @-syntax
- Backend: CRUD endpoints per entity type
- Frontend: StoryBibleSidebar component, EntityEditor pages,
  cross-reference rendering
- AI-Template integration: entity-specific prompts

**Pros:**
- Transformative for fiction-writing (Aster has SciFi
  + Kinderbuch + Comics projects)
- Differentiates Bibliogon from generic writing tools
- Plugin architecture means it's optional (non-fiction
  authors don't see it)
- Showcases plugin extensibility

**Cons:**
- Substantial implementation (XL = 16+ commits)
- New TipTap extension is non-trivial
- Cross-reference rendering performance with many entities
- Plugin lifecycle complexity

**Strategic fit:** Very High for Aster's projects specifically.
Multi-genre author with multiple fiction projects is exactly
the user-persona that needs this. Plus showcases plugin model.

**Dependencies:** plugin-architecture, TipTap extensions,
AI-Templates system

**Recommended priority if chosen:** P2 (strategic, but plan
multi-session)

---

### 5. Outline/Structure View

**What it does:**
- Visual outline of book chapters (collapsible tree)
- Drag-reorder chapters via outline
- Beat-Sheet templates (Save the Cat, Hero's Journey, Three-Act)
- Per-Beat-Sheet structure-checkpoint validation
- "Show me which beats are missing" view

**User-flow:**
- BookEditor sidebar: "Outline" tab
- Tree shows chapters in order
- Drag a chapter to reorder
- Click "Apply Template: Three-Act" → adds expected beats as
  checklist items
- Each beat-sheet item: link to chapter that fulfills it OR
  "Empty - add chapter for this beat"

**Implementation:**
- New component: BookOutlineView with drag-tree
- Beat-Sheet templates as JSON/YAML config
- Backend: chapter-reorder endpoint, beat-mapping storage
- TipTap not directly affected
- Could integrate with AI-Templates (generate chapters for
  empty beats)

**Pros:**
- High value for plot-focused fiction-authors
- Beat-sheets are popular industry tool (Save the Cat
  bestseller)
- Visual restructuring without scrolling through chapters

**Cons:**
- Substantial UI work (drag-tree, beat-templates, mapping-UI)
- Beat-sheet "philosophy" varies per author - prescriptive
  feel may turn off some users
- Less universal than story-bible (only plot-driven fiction
  needs it)

**Strategic fit:** High for plot-focused fiction. Combined
with Story-Bible (#4), creates a powerful fiction-workshop.

**Dependencies:** Book + Chapter models, existing drag-libraries

**Recommended priority if chosen:** P3 (depends on user
preference for plot-structuring vs character-driven writing)

---

### 6. KDP Publishing Workflow (K-01 through K-04)

**What it does:**
- End-to-end Amazon KDP publishing pipeline
- Front-Matter generation (copyright, ISBN-page, etc.)
- KDP-specific metadata wizard (BISAC categories, keywords)
- Pricing strategy (royalty calculations, region pricing)
- ARC (Advance Reader Copy) management
- Pre-launch checklist (categories selected, description
  written, cover uploaded, etc.)

**User-flow:**
- Book-Editor → "KDP Publishing" tab
- Step-by-step wizard for first-time launch
- Checklist with required + optional steps
- Each step links to relevant editor section
- Final step: export package ready for KDP upload

**Implementation:**
- Plugin: bibliogon-plugin-kdp (referenced in roadmap)
- Backend: KDPMetadata model, validation rules
- Frontend: KDPDashboard, wizard components
- DOCX/PDF export with KDP-specific formatting
- BISAC code database
- KDP-pricing-rules logic

**Pros:**
- Hits Aster's primary use-case (KDP self-publishing)
- High strategic differentiation (most writing tools don't
  cover KDP-specifics)
- Plugin model means it's optional

**Cons:**
- Substantial (XL = 16+ commits)
- KDP requirements change over time (maintenance burden)
- Region-specific complexities (US tax forms, EU VAT)
- Requires deep KDP knowledge for correctness

**Strategic fit:** Highest possible for Aster. Bibliogon's
KDP-Niche is explicitly targeted. This is the "marquee
feature" that makes Bibliogon a KDP-specific tool.

**Dependencies:** Book + Chapter models, plugin-architecture,
DOCX/PDF export

**Recommended priority if chosen:** P1 if focusing on
publishing-workflow, OR P3 if doing fiction-workshop first

---

### 7. Multi-Language-Book Workflow

**What it does:**
- Same book in multiple languages with sync between translations
- Side-by-side editor view (original + translation)
- Mark-translation-needed when source updates
- AI-translation suggestion (uses existing AI providers)
- Per-language metadata (BISAC categories vary by market)

**User-flow:**
- Original book in German exists
- User clicks "Add Translation" → English
- Side-by-side editor: German left, English right
- AI-Suggest button per paragraph generates translation
  draft
- User edits AI-output, marks as approved
- When German changes, English-version shows "out of sync"
  badge per chapter

**Implementation:**
- DB: TranslationGroup table linking Books in different
  languages
- Backend: translation-sync endpoints, status tracking
- Frontend: side-by-side editor (complex), translation-status
  dashboard
- AI integration for draft generation
- Existing translation-plugin extended

**Pros:**
- Aster targets German-speaking authors with KDP audience
  globally - multi-language is real need
- AI-translation is mature tech (good outputs from current
  LLMs)
- Differentiation in author-tool market

**Cons:**
- Substantial implementation (XL)
- Side-by-side editor UX is non-trivial
- Translation-quality requires human review (AI is start
  not end)
- Sync-tracking semantics across formats is complex

**Strategic fit:** Medium-High. Aligns with Aster's
German-author target plus KDP-global ambitions. But complex
to deliver well.

**Dependencies:** existing translation-plugin, AI-providers,
Book model

**Recommended priority if chosen:** P2 if German-author
audience is primary, P3 otherwise

---

### 8. DOCX-Manuscript Export

**What it does:**
- Classic manuscript-format DOCX export
- Standard layout: Times New Roman 12pt, double-spaced,
  1-inch margins, Chapter breaks on new pages
- Title page with author info, contact, word-count
- Page numbers + header (Last-Name / Title / Page)
- For Beta-Readers + Traditional Submissions

**User-flow:**
- Book-Editor → Export → "Manuscript DOCX"
- Quick options: Beta-Reader format vs Submission format
- Download immediate

**Implementation:**
- Extend existing Pandoc export pipeline
- Manuscript-template stylesheet
- Pandoc supports DOCX with custom reference-doc
- Frontend: dropdown option in export-dialog

**Pros:**
- Low complexity (S = 3-5 commits)
- Real use-case for authors (Beta-Reader workflow)
- Builds on existing infrastructure

**Cons:**
- Pandoc DOCX-templates can be finicky
- Submission requirements vary by publisher (less standard)

**Strategic fit:** Medium - useful complement to KDP-focused
publishing. Some authors submit to traditional first.

**Dependencies:** existing Pandoc + export-plugin

**Recommended priority if chosen:** P3 (quick win)

---

### 9. Article-to-Book Conversion (DETAILED PROMPT ALREADY EXISTS)

**What it does:**
- Bulk-select Articles → Wizard → Compile to Book with
  Chapters
- Front/Back-Matter optional
- Sort strategies + drag-reorder

**User-flow:**
(See prompt-article-to-book-conversion.md)

**Implementation:**
12-18 commits, 1-2 sessions

**Pros:**
- Immediate value for Aster's 201-Article corpus
- Multiple potential books from existing data:
  - Living Health series
  - Bibliogon development diary
  - From Theory to Practice
  - Phylax philosophical articles
  - Steuern-Optimierung German articles
- Uses existing Article + Book + Chapter infrastructure
- Foundation for future "Series Management"

**Cons:**
- New Wizard UX (multi-step modal)
- Decoupled-Lifecycles decision needs clear documentation

**Strategic fit:** Highest immediate value. Production-ready
content awaits compilation.

**Dependencies:** Articles + Books + Bulk-Selection-Pattern

**Status:** Prompt-Ready at prompt-article-to-book-conversion.md

---

### 10. Backup-Comparison/Diff-View

**What it does:**
- Visual diff between two backup-snapshots
- "What changed since last week?"
- Per-Article diff (added/removed/modified)
- Per-Book diff (chapter changes)
- Per-Settings diff (configuration drift)

**User-flow:**
- Backup-Section in Settings
- "Compare Snapshots" → pick two backups
- Diff-view: tree of changes, expand to see content-diffs
- Optional: restore-from-diff (selective rollback)

**Implementation:**
- Backend: backup-diff endpoint (uses existing backup
  infrastructure)
- Frontend: DiffView component with tree-navigation
- Restore-selective semantics

**Pros:**
- Audit-Trail value (when did I change this?)
- Recovery value (oops, I deleted - what changed?)
- Builds on existing backup feature

**Cons:**
- Backup-diff semantics: byte-diff is noisy, structural-diff
  is harder
- Selective-restore is complex feature on top
- UX for nested diffs (Article → Chapter → Paragraph)

**Strategic fit:** Medium - useful safety feature but not
transformative. Already have backups, this is just
visualization.

**Dependencies:** existing backup-system (V-01)

**Recommended priority if chosen:** P3 (after V-02 is
formally scoped)

---

## Strategic Bundles

Feature combinations that compound value:

### Bundle A: Fiction-Workshop Suite
- #4 Character/Setting DB
- #5 Outline/Structure View
- (Optional) #1 Writing Goals

Combined: Bibliogon becomes premier fiction-author tool.
Plot-structure + character-database + daily-momentum tracking.

Effort: ~30 commits across 3-4 sessions.
Strategic-Fit: High for Aster's fiction projects.

### Bundle B: KDP Publishing Pipeline
- #6 KDP Publishing Workflow
- #7 Multi-Language Workflow
- (Optional) #8 DOCX Manuscript

Combined: End-to-end self-publishing pipeline. Compile
Bibliogon-Content directly to Amazon-ready packages in
multiple languages.

Effort: ~40 commits across 4-5 sessions.
Strategic-Fit: Highest for Bibliogon's stated target (KDP-Niche).

### Bundle C: Author Productivity Daily-Drivers
- #1 Writing Goals
- #2 Distraction-Free Mode
- #3 Reading-Time Estimation
- (Optional) #9 Article-to-Book

Combined: Daily author workflow improvements. Less ambitious
but immediate utility.

Effort: ~15 commits across 1-2 sessions.
Strategic-Fit: Medium - polish features, not transformative.

### Bundle D: Quick Wins (1-2 sessions)
- #9 Article-to-Book Conversion (prompt-ready)
- #8 DOCX Manuscript Export
- #3 Reading-Time Estimation

Combined: Concrete, deliverable value. Each ships standalone.

Effort: ~15-20 commits across 2 sessions.
Strategic-Fit: High pragmatic value, low strategic risk.

---

## My Recommendation

If forced to pick ONE feature to develop next: **#9 Article-to-Book Conversion**.

Reasoning:
- Prompt is already written (lowest friction to start)
- Immediate concrete value (compile your 201 Articles into
  multiple books)
- Uses existing infrastructure (no new architecture)
- Foundation for future content-compilation features
- Delivers real Bibliogon-as-KDP-tool experience for Aster

If forced to pick a BUNDLE: **Bundle D (Quick Wins)**.

Reasoning:
- Each feature ships standalone (incremental value)
- Total effort is 1-2 weeks
- Real productivity improvements for daily use
- Defers high-complexity decisions (Fiction-Workshop,
  KDP-Pipeline) until value is proven

If forced to pick STRATEGIC direction: **Bundle B (KDP Publishing)**.

Reasoning:
- Aligns with Bibliogon's stated target market
- Highest differentiation in author-tool space
- KDP-Specifics are technical moats (not easily replicated)
- Long-term: this is what Bibliogon BECOMES

But: Bundle B is multi-month. Quick Wins first might be wiser
to maintain momentum and avoid premature optimization on
strategic direction.

---

## What to Do With This Document

This is a decision-support tool, not a commit-plan.

Options for next steps:
1. Pick feature(s) to develop into Pre-Inspection-Prompts
2. Pick bundle to schedule across multiple sessions
3. Defer all and add to backlog for future strategic review
4. Use this as conversation-starter for refining requirements

Each feature's Pre-Inspection-Prompt should be written when
implementation is imminent, not now. Pre-Inspections go stale
if too far ahead of execution.

---

## Backlog Filing

Should any of these features become formal backlog items?

If user wants explicit tracking without imminent execution:
- Each feature gets P-level + Trigger-Language
- Higher P-levels for strategic-fit features
- P5 with vague trigger "when prioritized in future cycle"
  for low-priority items

But: 10 backlog items added at once would clutter the
already-43-item backlog. Recommendation: file only the
1-3 features user actually plans to develop in next 2-3
months. Others stay in this exploration document as
deferred possibilities.

---

Document prepared 2026-05-15 as decision-support after
v0.31.0/v0.32.0 release cycle. Author-Workflow features (#1-3)
plus Article-to-Book (#9) are most immediately actionable.
Fiction-Workshop and KDP-Publishing are strategic multi-session
commitments.
