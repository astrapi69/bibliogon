# Session handover — post-v0.35.1 state (2026-05-18)

Continuation handoff after the 2026-05-18 session that shipped
both v0.35.0 + v0.35.1 (two releases in one day), executed the
backlog consistency audit, and completed the Comic-Foundation
exploration reframe.

---

## Current published state

- **Latest release**: `v0.35.1`
  ([github.com/astrapi69/bibliogon/releases/tag/v0.35.1](https://github.com/astrapi69/bibliogon/releases/tag/v0.35.1))
- **Previous release**: `v0.35.0`
  ([github.com/astrapi69/bibliogon/releases/tag/v0.35.0](https://github.com/astrapi69/bibliogon/releases/tag/v0.35.0))
- **HEAD on `origin/main`**: `d6352b8` (Comic-Foundation
  reframe commit)
- **Working tree**: clean (one untracked parallel-agent file —
  see "Multi-tool" note below)

## Today's session at a glance

The session covered ~6 major work-streams in roughly this
order:

1. **4c-B-1 Picture-Book TipTap-Integration** — 9 commits
   (3 fix-findings A/B/C + Finding D ThemeToggle + Finding G1-G5
   font system). Closed the 4c-B-1 fix-track at exactly 9
   commits (upper bound of the 5-9 session stop-condition).
2. **3 manual-smoke direct-action fixes** — Bug 1 (bubble
   width/height + 9-anchor backend parity), Bug 2 (stronger
   separator via `--border-strong`), Bug 3 (font auto-select-
   all for document-wide font).
3. **v0.35.0 release cut** — first release through the new
   release-automation pipeline (Scopes 1-4 shipped in
   v0.35.0). 2 pre-commit hook failures surfaced + fixed
   pre-tag (notify-error coverage + theme-token
   completeness for `--text`). Tag + GitHub Release live.
4. **v0.35.1 fast-follow patch** — donation-visibility gap
   fix. Bibliogon's S-03 reminder banner had been
   functionally invisible to new users for ~30 days
   (90-day grace gate). 3 commits: grace bump 90 → 7 days,
   App-level mount (Dashboard-only → all pages), a11y
   (aria-live + Escape dismiss). Tag + GitHub Release live.
5. **Backlog consistency audit + sweep** — archived 2 CLOSED
   stubs + reclassified STARLETTE-V1 + CLICK-V8-3 from P5 to
   Blocked/Upstream Wait with full bodies under a new
   sub-section. Header counts refreshed.
6. **Mobile-strategy + Comic-Foundation exploration docs**
   — mobile-strategy filed (parallel-agent's DE/EN pair
   reduced to canonical EN-only `mobile-strategy.md`).
   Comic-Foundation stub written, critiqued (caught a
   foundational architectural conflict with existing
   `comic_book` book_type reservation), then reframed +
   rewritten to a proper 736-line exploration matching
   `children-book-plugin.md` depth. 2 picture-book backlog
   items archived; new `PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01`
   (P3, trigger-gated) filed.

---

## What's pending

### Picture-Book Phase 4 — still mid-flight

Per the v0.35.0 release notes "Deferred to v0.36.0" list, the
following Picture-Book Phase 4 items are NOT yet shipped:

- **`4c-B-2` Tier-Property work**: `PICTURE-BOOK-SPEECH-BUBBLE-
  EXTENDED-PROPERTIES-01` (P3) + `PICTURE-BOOK-OVERLAY-TEXT-
  TIER-PROPERTIES-01` (P3). **Note**: per the Comic-Foundation
  reframe, 4c-B-2 ships the per-bubble shape
  (`layout_config.bubbles[0].{properties}`) for scope-anticipate
  compatibility with future plugin-comics multi-bubble. Cost:
  ~30% scope expansion vs flat shape; benefit: zero migration
  when plugin-comics lands.
- **`PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-SHAPE-01`** (P3, Tier 3
  shape variants — oval / rectangle / cloud / explosion).
- **`PICTURE-BOOK-PDF-KDP-FORMATS-01`** (P3) — beyond v0.35.0
  MVP 8.5×8.5 square: 8×10, 8.5×11, landscape, etc.
- **`PICTURE-BOOK-PDF-BLEED-MARKS-01`** (P3) — KDP-quality
  bleed marks + crop marks for print-shop submission.
- **`PICTURE-BOOK-PDF-FRONT-MATTER-01`** (P3) — cover + title
  page authoring.
- **`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`** (P3) —
  closed by v0.35.0 Finding G1-G5; backlog stub still active.
  (Note: this entry should be archived per the
  continuous-archival rule — surfaced for next session's
  hygiene check.)
- **`PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01`** (P3) —
  active conversion of `page.text_content` on layout switch.
- **`PICTURE-BOOK-SPEECH-BUBBLE-TAIL-01`** (P3) — optional
  picture-book polish; reusable in plugin-comics.

### 4c-B-1-DOCS session — deferred from v0.35.0

User-facing help-doc coverage for the entire Picture-Book
feature stream (`docs/help/{en,de}/picture-books*.md`,
`fonts.md`, `pdf-export.md`, `authors-database.md`,
`categories-bisac.md`, async medium-import update). 0 pages
currently exist for these features. Step 4c documentation
sweep proposal also defers (see v0.35.0 audit findings).

### AUTHOR-SELECT-INPUT-EXTRACT + RECURRING-COMPONENT-AUDIT

Filed P3 items; the Recurring-Component Unification Rule's
canonical first application. Defers per v0.35.0 release notes.

### plugin-comics — trigger-gated

`PLUGIN-COMICS-FOUNDATION-SCAFFOLDING-01` (P3) waits on:
- Picture-Book Phase 4 fully closed, OR
- Explicit user-go-ahead.

See [`docs/explorations/comic-foundation.md`](../explorations/comic-foundation.md)
for the full 16-22-commit roadmap (4 sessions).

### Backlog hygiene observations

- **`PICTURE-BOOK-PAGE-TEXT-TIPTAP-INTEGRATION-01`** stub
  might be a candidate for archival in next session's
  hygiene pass — it was closed by 4c-B-1 Finding G1-G5
  but the active backlog entry didn't get retired.
- The current backlog count after today's work: **53
  active (P2..P5) + 4 BLOCKED-on-upstream entries**.

---

## Multi-tool collaboration state

Throughout today's session, parallel-agent activity showed up
multiple times in the working tree (per the existing
`feedback_multi_tool_collaboration.md` memory). Concrete
incidents:

1. **`f2bf80e`** (mid-session) — parallel agent filed an
   archival sweep for medium-import async-progress family.
   Already on `origin/main`; harmonized cleanly into my G3
   commit.
2. **Mobile-strategy doc** — parallel-agent dropped a DE/EN
   pair into the working tree; user later instructed reduction
   to canonical EN-only `mobile-strategy.md`.
3. **`docs/explorations/bibliogon-comic-foundation-exploration.md`**
   — still in the working tree as UNTRACKED at session close.
   Parallel agent used the user's INITIAL filename proposal
   before the user's subsequent `b of course` pick of the
   canonical `comic-foundation.md` naming. **Untracked, NOT
   staged**. Awaiting parallel-agent cleanup OR explicit
   user decision in next session.

Per the memory rule: do not silently delete parallel-agent
files. Surface for user decision.

---

## Lessons-learned added today

3 substantial additions to `.claude/rules/lessons-learned.md`:

1. **"Exploration docs need a Pre-audit section before any
   architecture proposal"** (filed in same commit as the
   Comic-Foundation reframe, `d6352b8`). Triggered by the
   2026-05-18 incident where the 95-line stub `comic-
   foundation.md` skipped the Pre-audit + proposed extending
   `speech_bubble` with multi-bubble array in conflict with
   the existing `book_type = "comic_book"` reservation.
   Includes a "Multi-tool collaboration amplifier" sub-section.

Plus the v0.35.0 release CHANGELOG cites 3 other lessons-
learned filed earlier:

2. **Recurring-Component Unification Rule** (in
   `coding-standards.md`, filed in `f06ae35`).
3. **Single-source-of-truth for cross-cutting concerns** (in
   `lessons-learned.md`).
4. **Half-wired-feature-lifecycle pattern** extended with
   4th instance (dead `kinderbuch.css`).

Plus 1 memory entry: `feedback_smoke_findings_default_action.md`
— "Smoke findings default to direct-action; defer only with
explicit user agreement." Filed mid-session after the 3
bug-fix sequence demonstrated the rule's value.

---

## Tag list (current state)

```
v0.35.1   ← latest published (donation-visibility fix)
v0.35.0   ← Picture-Book PDF + TipTap + 5 OFL fonts +
              release-automation pipeline first-cut
v0.34.1
v0.34.0
v0.33.0
...
```

`origin/main` is 1 commit ahead of `v0.35.1` (the Comic-
Foundation reframe + this handover). The mainline is clean.

---

## Heads-up for next session

1. **Backlog hygiene quick-win**: `PICTURE-BOOK-PAGE-TEXT-
   TIPTAP-INTEGRATION-01` was closed by Finding G1-G5 but its
   stub may still be in active backlog. Audit + archive if
   so.
2. **Mobile-strategy doc**: filed but UNREVIEWED for
   architectural Pre-audit (per the new lessons-learned rule).
   Apply the same Pre-audit lens before any mobile work
   begins.
3. **Comic-Foundation exploration**: now 736 lines + properly
   audited. The exploration doc is the spec — do NOT re-derive
   at plugin-comics Session 1 Pre-Inspection time. Read first.
4. **`bibliogon-comic-foundation-exploration.md` untracked
   file**: needs user-decision (likely just delete it as
   leftover parallel-agent work, but per discipline I left it
   for the user).

## How to resume in a new session

1. Read this handover doc + the resume prompt
   `docs/journal/session-prompt-2026-05-18-post-v0.35.1-resume.md`.
2. `git log --oneline -10` — verify mainline state vs
   `d6352b8`.
3. Decide stream: pick from the "What's pending" list above.
   Most likely candidates ordered by leverage:
   - **a. 4c-B-2 Tier-Property work** (per-bubble shape per
     Comic-Foundation scope-anticipate decision) — unblocks
     several picture-book items.
   - **b. Backlog hygiene quick-win**
     (`PAGE-TEXT-TIPTAP-INTEGRATION-01` archival sweep).
   - **c. 4c-B-1-DOCS** (user-facing help-docs for the
     Picture-Book feature stream).
   - **d. AUTHOR-SELECT-INPUT-EXTRACT + RECURRING-COMPONENT-
     AUDIT** (extraction-plus-migration session per the rule's
     2-surfaces threshold).
4. Apply Pre-audit discipline (per the new lessons-learned
   rule) before any architecture proposal.
5. Apply smoke-findings-default-action discipline (per the
   memory entry) — don't defer user-reported smoke findings
   without explicit confirmation.

## Discipline reminders in effect

- Atomic-green commits (Vitest + tsc + relevant backend
  pytest must stay green per commit).
- No automation code without explicit user GO.
- Pre-Inspection STOP gate before any non-trivial new work.
- Per-commit stop-condition at ~5-9 commits per session;
  surface + propose split when approaching the limit.
- Recurring-Component Unification Rule (2-surfaces threshold
  for UI patterns; codified in `.claude/rules/coding-standards.md`)
  — apply when 2nd surface needs an established pattern.
- Multi-tool collaboration: planning workspace and execution
  workspace can drift; ALWAYS run a status re-sync (git log,
  grep for mentioned features) before accepting a plan that
  references "pending" items.
- **NEW**: Exploration docs need a Pre-audit section before
  any architecture proposal. The Comic-Foundation reframe is
  the canonical incident.
- **NEW**: Smoke findings default to direct-action (fix in
  current session) unless user explicitly defers.

Per the user's working style:
- Strategic-Advisor (chat session) drafts specs; execution
  session (CC in Claude Code) implements. Each session runs
  its own audits independently.
- Manual smoke after each session before authorizing the
  next.
- User-smoke is the gate, not test-suite-green alone.
