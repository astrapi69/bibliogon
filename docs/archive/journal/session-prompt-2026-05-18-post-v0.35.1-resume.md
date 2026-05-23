# Session resume prompt — post-v0.35.1 (2026-05-18)

Paste the prompt block below into the new session.

---

```
We just shipped v0.35.0 (Picture-Book TipTap + 5 OFL fonts +
PDF export + release-automation pipeline first-cut) and
v0.35.1 (donation-visibility fast-follow patch) in the same
day. Both tagged + published to GitHub. mainline is clean.

Read first:
- docs/journal/session-handoff-2026-05-18-post-v0.35.1.md
  (full state at session close: pending streams, multi-tool
  collaboration state, lessons-learned added today, heads-up
  for next session)

Discipline reminders in effect:
- Atomic-green commits (Vitest + tsc + relevant backend
  pytest must stay green per commit).
- No automation code without explicit user GO.
- Pre-Inspection STOP gate before any non-trivial new work.
- Per-commit stop-condition at ~5-9 commits per session;
  surface + propose split when approaching the limit.
- Recurring-Component Unification Rule (2-surfaces threshold
  for UI patterns; .claude/rules/coding-standards.md).
- Multi-tool collaboration: planning workspace + execution
  workspace can drift; ALWAYS run a status re-sync (git log,
  grep) before accepting a plan that references "pending"
  items.
- NEW (filed 2026-05-18): Exploration docs need a Pre-audit
  section before any architecture proposal. The Comic-
  Foundation reframe is the canonical incident
  (.claude/rules/lessons-learned.md).
- NEW (filed 2026-05-18 as memory): Smoke findings default
  to direct-action (fix in current session) unless user
  explicitly defers
  (memory/feedback_smoke_findings_default_action.md).

Current state:
- Latest tag: v0.35.1 (LIVE on GitHub)
- HEAD on origin/main: d6352b8 (Comic-Foundation reframe)
- Working tree: clean except 1 untracked parallel-agent
  file (docs/explorations/bibliogon-comic-foundation-
  exploration.md — needs user decision)
- Backlog count: 53 active (P2..P5) + 4 BLOCKED-on-upstream

Pending streams (in rough leverage order):

1. **4c-B-2 Tier-Property work** — PICTURE-BOOK-SPEECH-
   BUBBLE-EXTENDED-PROPERTIES-01 + PICTURE-BOOK-OVERLAY-
   TEXT-TIER-PROPERTIES-01. Per the Comic-Foundation
   reframe scope-anticipate decision: ships per-bubble
   shape `layout_config.bubbles[0].{properties}` for
   forward compatibility with future plugin-comics.
   Pre-Inspection done in earlier session; needs
   re-anchoring against the new per-bubble shape.

2. **Backlog hygiene quick-win** — PICTURE-BOOK-PAGE-
   TEXT-TIPTAP-INTEGRATION-01 stub may still be in active
   backlog despite being closed by 4c-B-1 Finding G1-G5.
   Audit + archive if so.

3. **4c-B-1-DOCS** — user-facing help-doc coverage for
   the entire Picture-Book feature stream (Picture-Book,
   fonts, PDF export, Authors-Database, Categories+BISAC,
   async medium-import). 0 pages exist. Step 4c
   documentation sweep was proposed but deferred from
   v0.35.0.

4. **AUTHOR-SELECT-INPUT-EXTRACT + RECURRING-COMPONENT-
   AUDIT** — Recurring-Component Unification Rule's
   canonical first application + frontend-wide audit
   for follow-up extractions.

5. **plugin-comics work** — TRIGGER-GATED. Waits on
   Picture-Book Phase 4 fully closed OR explicit user-
   go-ahead. See docs/explorations/comic-foundation.md
   for the 16-22-commit multi-session roadmap (4 sessions).

User decision needed before starting:
- Which stream to pick first?
- Plus what about the untracked
  bibliogon-comic-foundation-exploration.md file —
  delete it (parallel-agent's leftover from before the
  user's `b of course` filename choice), or keep + commit?

Start by:
1. Reading the handover doc end-to-end.
2. Running `git log --oneline -15` to confirm
   origin/main state.
3. Asking the user: "Which pending stream do you want
   to pick up? Plus what about the untracked
   bibliogon-comic-foundation-exploration.md file?"
```

---

## Notes for the resumer

- The handover doc is the ground truth for state. The
  prompt above is a launchpad, not a summary.
- Today's session was unusually broad (two releases +
  audit + reframe in one day). The discipline reminders
  in the handover doc capture what got learned. Apply
  them.
- If the user picks 4c-B-2 first, the key Pre-audit
  step is: verify the per-bubble shape decision from
  the Comic-Foundation reframe (commit `d6352b8`) is
  the canonical scope. The 4c-B-2 backlog entry was
  written BEFORE that decision and uses the flat shape
  by default. Update the 4c-B-2 scope to match the
  per-bubble shape during Pre-Inspection.
- If the user picks the untracked file path: the
  multi-tool collaboration discipline says surface + ask,
  don't unilaterally delete. The user's `b of course`
  decision earlier today implies they want the canonical
  naming, but they didn't EXPLICITLY say "delete the
  other file". Ask.
