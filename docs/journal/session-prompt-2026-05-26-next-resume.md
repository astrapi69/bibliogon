# Next Session Resume Prompt

Fresh CC session. Resume work per
[docs/journal/session-handoff-2026-05-26-next-resume.md](session-handoff-2026-05-26-next-resume.md).

## Step 1: State Verification

```bash
git status
git log origin/main --oneline -10
```

Expected HEAD: `1205f74` or later. Clean working tree, parity
with origin/main.

Confirm test baselines still hold:

- Backend pytest: 2269
- Frontend Vitest: 2063
- i18n parity: 75/75

If divergence — STOP and surface for adjudication before
proceeding.

## Step 2: Read Handover

```bash
cat docs/journal/session-handoff-2026-05-26-next-resume.md
```

Highlights to extract:

- Backlog is fully trigger-gated (P0/P1/P2 = 0; P3 = 24 all
  gated; P4 = 29 deferred; P5 = 9 speculative; BLOCKED = 2)
- Settings UX overhaul complete (Phase 1 + Phase 2 + Phase 3 +
  Authors-Consolidation, all closed 2026-05-26)
- v0.37.0 released 2026-05-25
- Critical-constraints + active-disciplines section lists the
  ~12 most-load-bearing rules from `.claude/rules/lessons-learned.md`

## Step 3: User-Direction Required

Backlog is fully gated. No ungated items remain. User direction
required before substantial work begins. Candidates:

- **Picture-Book & Comics Optimization stack** (3 sibling P3
  items, multi-session)
- **Strategic new feature** (Story-Bible plugin, Writing-Goals
  tracking)
- **Help-docs catch-up** (`HELP-DOCS-V0.37.0-GAPS-01`, ~4-6
  commits)
- **Non-Bibliogon work** (adaptive-learner, PluginForge, BFREI,
  creative projects)
- **Override trigger-gates** on specific P3 items if user
  decides the gate criteria are overcautious

Wait for user direction. Do not pick a P3 item autonomously
unless explicitly told to.

## Step 4: Apply Active Disciplines

Per the handover's "Critical Constraints + Active Disciplines"
section. Most likely to fire:

- Plain `git status` before every commit
- Explicit-paths-only staging when parallel-session work in
  flight
- Pre-Coding-Reality-Check at every keystroke boundary
- End-to-end behaviour tests (not kwarg-passes-through)
- RCU 2-surface threshold + same-session migration
- Articles-vs-Books parallel-surface parity verification
- Half-wired-lifecycle audit when adding state-writes

## Step 5: Execute

Per direction. Atomic-green-per-commit-delta. Pre-Coding-
Reality-Check at boundaries. Push autonomously after atomic-
green commits. Surface only on Stop-Conditions or substantial-
architecture-decisions.

## Push Convention

CC pushes autonomously after atomic-green commits. The trigger
for surfacing back to the user is one of:

- Stop-Condition fires (state divergence, scope expansion,
  Multi-Tool-Coordination conflict)
- Substantial architecture decision requiring adjudication
- Session completion (end-of-session report)
- Pre-Inspection findings that change scope before
  implementation starts

## End-of-Session

Session-end-report per established convention:

- Summary table of commits with one-line per commit
- Test-signal delta (Vitest before → after, pytest if touched,
  i18n parity, tsc)
- Intentional decisions documented
- Cross-references to follow-up backlog items if any
- Next-session-direction hint or "session complete, no
  follow-up needed"
