# Next Session Kickoff Prompt — SETT-PHASE-1-QUICK-WINS-01

Copy-paste the block below into the new session as the first
message.

---

```
Resume work per
docs/journal/session-handoff-2026-05-26-settings-ux-phase-1.md.

## Session-start checklist (per .claude/rules/ai-workflow.md)

Run these in order before touching code:

1. git status — confirm clean tree.
2. git log --oneline -5 — confirm HEAD = 6bda82b OR later if
   parallel sessions pushed (per the Multi-Tool-Coordination
   re-sync rule; if HEAD has moved, surface what changed before
   proceeding).
3. git pull origin main — sync.
4. make test — establish baseline. Expected: backend 2269
   passed + 1 skipped, frontend Vitest 2037 passed (160 files),
   i18n parity 75/75. If anything drops to red, STOP and
   diagnose before starting Phase 1.
5. Read the handoff doc end-to-end:
   docs/journal/session-handoff-2026-05-26-settings-ux-phase-1.md
6. Read the backlog entries you'll act on:
   - docs/backlog.md SETT-PHASE-1-QUICK-WINS-01 (immediate)
   - docs/backlog.md SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01
     (for context — Phase 1 prepares Phase 2's tab split)
   - docs/backlog.md SETT-PHASE-3-TOGGLE-COMPONENT-01 (later)
7. Optional context: docs/journal/chat-journal-session-2026-05-25-v0.37.0.md
   for the full v0.37.0 release context including the
   Settings UX audit findings that produced the QW bundle.

## Task

Ship SETT-PHASE-1-QUICK-WINS-01 — 7 quick wins from the
Settings UX audit, bundled in a single session, ~9 commits.

**No scope changes** from the audit-adjudicated 7 items per
the v0.37.0 release-cycle adjudication. Items detailed in
the backlog entry; suggested commit sequence in the handoff
doc.

## Approach per item

For each QW item:

1. Pre-Coding-Reality-Check — grep the immediate touch-surface
   to confirm the audit's assumptions still hold. The audit ran
   2026-05-25; this session may run a day or more later. If
   anything has drifted (other sessions touched
   frontend/src/components/settings/...), surface what changed
   BEFORE writing code.
2. Make the change. Atomic commit per QW item. Plain git status
   before every commit. Explicit-paths-only staging.
3. Vitest + tsc clean per commit. Verify-docs-discipline + i18n
   parity at the end (not per commit).
4. The QW-7 per-section descriptions need i18n keys in 8
   catalogs.

## Commit cadence

Suggested:
- C1: SETT-QW-4 (section-title standardisation; lowest risk)
- C2: SETT-QW-5 (HelpText extraction + ~30-site migration)
- C3: SETT-QW-1 (dashboard-views sub-card grouping)
- C4: SETT-QW-2 (SshKeySection own-card wrapper)
- C5: SETT-QW-3 (Editor tab extraction) — touches Settings.tsx
  tab structure; New-hook-+-new-mock-key contract drift rule
  applies (any settings-page test mocking tab list needs the
  Editor tab added).
- C6: SETT-QW-6 (White-Label "Erweitert" clarity — implementer
  picks own-tab vs labeled-section at keystroke time per
  Pre-Inspection).
- C7: SETT-QW-7 (per-section descriptions + i18n keys × 8)
- C8: Playwright smoke covering the new tab + cleanup
  regressions
- C9: archive close-out
  (docs(backlog): close SETT-PHASE-1-QUICK-WINS-01 + archive)

If a QW item turns out to be larger than expected, split into
multiple commits. The 5-commit stop-condition is a guideline;
RCU extraction-plus-migration explicitly carves out a longer
commit chain per coding-standards.md.

## Active disciplines (must honor)

- Plain git status before every commit
- Explicit-paths-only staging
- Pre-Coding-Reality-Check at each commit
- Numeric-Claims-Verification (test counts, line-numbers)
- Half-Wired-Lifecycle Prevention (every state-write needs a
  consumer)
- Recurring-Component-Unification Rule (2-surfaces threshold;
  QW-5 HelpText is a 30-site extraction — clearly RCU-warranted)

## Stop conditions

- Touch-surface drift (audit's line numbers no longer match
  reality)
- Commit count crosses ~12 with QW items still unshipped
- Backend pytest / Vitest / tsc / pre-commit drops red and
  cause not immediately obvious
- User adjudicates a scope change

If a STOP fires: file a follow-up backlog item with remaining
QW items + halt reason; close the partial Phase 1 with what
shipped; surface to me.

## After Phase 1 closes

The next session begins SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01
(~4-5 commits, the post-Phase-1 ship per the 3-phase sequence
adjudicated mid-v0.37.0 release cycle).

Push autonomously after each green commit.
```

---

## Notes on this prompt

- The block above is **self-contained** — a fresh session can
  paste it as the first user message and execute without
  needing additional context.
- The session-start checklist is **mandatory**, not advisory.
- The "after Phase 1" pointer keeps the multi-phase sequence
  visible so the next-next session knows what's queued.
- The stop conditions are **load-bearing** — they exist to
  prevent the kind of mid-session scope drift that produces
  half-shipped Phase 1 + an unscoped Phase 2 follow-up.
