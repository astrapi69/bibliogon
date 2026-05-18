# Resume prompt for a new session — v0.35.0 bundle continuation

Copy-paste the block below into the new session to resume.
The companion handover doc at
`docs/journal/session-handoff-2026-05-19-v0.35.0-bundle-state.md`
holds the full state; this prompt is the entry point.

---

## Prompt

```text
We are mid-flight on the v0.35.0 release bundle. The prior
session shipped Session 4c-B-1 (Picture-Book TipTap-
Integration foundation: 5 commits) plus 3 manual-smoke fix
commits. The branch is at origin/main; everything pushed.

Read first:
- docs/journal/session-handoff-2026-05-19-v0.35.0-bundle-state.md
  (full state of the 4-stream v0.35.0 bundle + the pending
  user re-smoke gate before 4c-B-2 starts)

Discipline reminders in effect:
- Atomic-green commits (Vitest + tsc + relevant backend
  pytest must stay green per commit).
- No automation code without explicit user GO.
- Pre-Inspection STOP gate before any non-trivial new work.
- Manual smoke after each (sub-)session close before the
  next starts.
- Per-commit stop-condition at ~5-9 commits per session;
  surface + propose split when approaching the limit.
- Recurring-Component Unification Rule (2-surfaces
  threshold for UI patterns; codified at f06ae35 in
  .claude/rules/coding-standards.md) — apply during
  4c-B-2's CollapsibleSection + Tier-Property work.
- Multi-tool collaboration: planning workspace and
  execution workspace can drift; ALWAYS run a status
  re-sync (git log, grep for mentioned features) before
  accepting a plan that references "pending" items.

Current gate:
The user owes a manual re-smoke of 3 fixes against the
4c-B-1 manual-smoke findings:
- Fix C bug (a731c30) — defensive plain-text extraction;
  the textarea on Tier-Property layouts must show plain
  text, NOT raw JSON, after the user switches a page from
  a TipTap layout. Same for the printed PDF.
- Fix A (ed87d50) — speech-bubble anchor grid now has 9
  selectable cells; 4 new positions (top-center, middle-
  left, middle-right, bottom-center) are clickable + have
  aria-labels.
- Fix B (a69a54d) — visual separator between image region
  and text region on image_top_text_bottom + image_left_
  text_right is more visible (border 14→25%, tint 5→10%).

If the user reports re-smoke green: proceed to Session
4c-B-2 (Tier-Property work — Pre-Inspection summary in the
handover doc; D5 sub-decision details + property lists
ready).

If the user reports new findings: each finding gets its
own Pre-Inspection STOP gate + user GO before code, per
the discipline.

Pending after 4c-B-2:
1. AUTHOR-SELECT-INPUT-EXTRACT-01 + RECURRING-COMPONENT-
   AUDIT-01 (coordinated extraction session)
2. v0.35.0 release cut (all 4 streams shipped)

Start by:
1. Reading the handover doc end-to-end.
2. Running `git log --oneline -15` to confirm origin/main
   state.
3. Asking the user: "Did the re-smoke of Fix C / A / B
   pass? Any new findings?"
```

---

## Why this resume shape

The new session needs three things to resume cleanly:

1. **State**: handover doc carries the full picture (sessions,
   commits, decisions, backlog).
2. **Discipline**: prompt-level reminders enforce the
   Pre-Inspection + atomic-green + multi-tool-tracking rules
   that this codebase requires.
3. **Gate**: explicit "ask the user about re-smoke before doing
   anything else" prevents the new session from accidentally
   starting 4c-B-2 while the smoke is still pending.

The prompt deliberately avoids embedding the full handover —
the new session reads the doc itself for state, which keeps the
prompt short and stable across future updates.

---

## Where to find things

- **State**: `docs/journal/session-handoff-2026-05-19-v0.35.0-bundle-state.md`
- **Coding standards + Recurring-Component Rule**:
  `.claude/rules/coding-standards.md`
- **Lessons-learned (4 new instances + 3 generalisations
  today)**: `.claude/rules/lessons-learned.md`
- **Release workflow + aggregate Makefile targets**:
  `.claude/rules/release-workflow.md`,
  `docs/development/release-automation.md`
- **Backlog (P3 items filed today, post-release work)**:
  `docs/backlog.md`
  - `PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01` (Option (b)
    active conversion sibling of today's defensive read)
  - `PICTURE-BOOK-PDF-TIPTAP-RENDER-01` (proper TipTap-to-HTML
    walker in PDF)
  - 5 P3 items filed in Session 6 Commit 8 (`9f7177f`)
- **v0.35.0 sequence**:
  `docs/journal/session-handoff-2026-05-18-v0.35.0-release-cut-sequence.md`
  (corrected at `2a970c0` to "alles vor release")
