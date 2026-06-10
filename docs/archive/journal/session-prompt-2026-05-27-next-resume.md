# Next Session Resume Prompt

Fresh CC session. Resume work per `docs/journal/session-handoff-2026-05-27-next-resume.md`.

## Step 1: State Verification

```bash
git status
git log origin/main --oneline -10
```

Expected: HEAD `08a6504`, clean working tree, parity with origin/main.

Plus confirm test baselines hold:
- Backend pytest: **2294 passed, 1 skipped**
- Frontend Vitest: **2186 passed** across 173 test files
- Plugin-export pytest: **321 collected** (whole suite)
- i18n parity: **75/75**
- Playwright smoke: **70 spec files / 372 tests**

## Step 2: Read Handover

```bash
cat docs/journal/session-handoff-2026-05-27-next-resume.md
```

The handover covers:
- 2026-05-27 session arc (Storyboard + Text-Stack, 32 commits, 4 P3 closures, 3 P5 follow-ups filed)
- Current backlog state (P0/P1/P2 = 0; 59 active items in P3+P4+P5; 2 blocked)
- Next-session candidates (all trigger-gated or strategic)
- Critical disciplines + key patterns validated today

## Step 3: User-Direction

**All remaining backlog items are trigger-gated or strategic.** User direction required before proceeding. Wait for direction.

If no preference surfaces, the handover recommends one of:

1. **`PICTURE-BOOK-FONT-PER-MARK-OVERRIDE-01`** (smallest scope, 1-2 commits) — quick transitional win.
2. **`STORY-BIBLE-PLUGIN-01` Pre-Inspection** — natural successor to the picture-book stack; XL strategic.
3. **`SETTINGS-ALLGEMEIN-TAB-REORGANIZATION-01`** — keeps Settings UX consistent with v0.38.0 sidebar work.

User-Direction-Override always overrides.

## Step 4: Apply Active Disciplines

Per the handover's "Critical Constraints + Active Disciplines" section. Most relevant for next session's likely shapes:

- Audit-First Pre-Inspection — STOP gate before any non-trivial code-write.
- Pre-Coding-Reality-Check at boundaries — re-grep the touch surface before each commit-plan step.
- Plain `git status` before every commit.
- Explicit-paths-only staging.
- Atomic-green per commit-delta (baselines: pytest 2294 / vitest 2186 / parity 75).
- Half-wired-prevention (writer + reader changes must ship atomically per Fix B precedent).
- Native HTML primitives over Radix for Vitest reliability where feasible.
- `mockClear` over `mockReset` for inter-test mock cleanup.
- Push autonomously after atomic-green commits.

## Step 5: Execute

Per user direction. Apply Pre-Coding-Reality-Check at boundaries. Push autonomously after atomic-green commits. Surface on Stop-Conditions or session completion.

## Push Convention

CC pushes autonomously after atomic-green. Surface ONLY on:
- Stop-Conditions (test red, audit-surfacing-architecture-decision, parallel-session-conflict)
- Substantial architecture decisions requiring user adjudication
- End-of-session summary

## End-of-Session

Session-end-report per established convention:
- Commits shipped (hash + subject)
- Test deltas
- Disciplines re-validated
- Pre-Coding-Reality-Check findings
- Backlog state changes
- Next session candidate
