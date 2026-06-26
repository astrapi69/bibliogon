# Multi-Agent Coordination — Pending Decisions

**Status:** awaiting Aster's adjudication.
**Backlog item:** `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01` (P2/P3).
**Source exploration:** [exploration-multi-agent-gitflow-coordination.md](../explorations/exploration-multi-agent-gitflow-coordination.md) (2026-05-20).

This brief turns the exploration's six open questions into decision-ready
form. Each point lists the context, the A/B/C options, a CC recommendation
with rationale, the impact of the choice, and the code/doc that changes if it
is adopted. The exploration uses α/β/γ for the option labels; the same options
are relabelled A/B/C here. Nothing here is committed behaviour yet — these are
proposals for Aster to confirm, alter, or reject.

The decisions are independent: any subset can be adopted. Recommended reading
order is top to bottom, because decisions 5 and 6 depend on the shape of 1–4.

---

## Decision 1 — Confirm gitflow-with-feature-branches as the canonical multi-agent pattern

**Context.** Multiple parallel CC agents already coordinate by giving each
substantial track its own feature branch (`feature/comics-session-2`,
`feature/v060-adoption`, …), with `develop` as the integration point and
`main` for releases. The 2026-05-20 incident — Strategic-Advisor reflexively
halted when a commit + in-progress working-tree files authored by a different
agent appeared — showed the pattern was being treated as an anomaly rather
than the established way of working. This decision simply ratifies the pattern
as canonical.

**Options.**
- **A — Ratify as canonical** (exploration's implicit default). Document
  feature-branch-per-agent as the named coordination pattern.
- **B — Keep ad-hoc.** Continue without naming it; rely on each session
  re-deriving the convention.
- **C — Adopt a stricter model.** Formal worktree-per-agent isolation (one git
  worktree per concurrent agent) rather than just branch-per-agent.

**CC recommendation: A**, with C's worktree isolation noted as the safer
mechanism where parallel agents touch overlapping files. Rationale: the pattern
is already practised and works; naming it removes the reflexive-halt failure
mode. Worktree isolation (C) is already the project's recorded preference for
*concurrent* agents (memory `feedback_parallel_session_shared_head`: parallel
sessions in the same checkout share HEAD and the working tree) — so A is the
policy and C is the mechanism, not competing options.

**Impact.** Low-risk, mostly documentation. Confirms current practice; unblocks
decisions 2–6, which all assume gitflow-as-canonical.

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — target for a "Multi-Agent-Gitflow Pattern" entry.
- [.claude/rules/coding-standards.md](../../.claude/rules/coding-standards.md) — "Git / Gitflow (#79)" section already defines the branch flow.
- `feedback_parallel_session_shared_head` + `feedback_multi_tool_collaboration` (auto-memory).
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) — "Multi-tool collaboration tracking", "Plain `git status` before every commit" (explicit-paths discipline).

---

## Decision 2 — Strategic-Advisor's response to apparently-divergent state

**Context.** When Strategic-Advisor (Claude in chat) sees state it did not
expect — a commit it did not author, in-progress files on an unfamiliar
surface — it must choose between blocking and continuing. On 2026-05-20 it
halted; that was wrong, because the state was intentional gitflow work from
another agent. But not all divergence is benign (a real tracking-drift or a
cross-branch conflict can look identical at first glance).

**Options.**
- **A — Halt by default and ask** (conservative; the 2026-05-20 behaviour).
  Cost: velocity friction whenever divergence is intentional.
- **B — Assume gitflow-intentional and continue** (aggressive; what *should*
  have happened on 2026-05-20). Cost: misses genuine tracking-drift.
- **C — Ask once, then continue if gitflow is confirmed** (middle ground). One
  short clarifying question ("is this a feature branch from another agent, or
  unexpected state?"); default-continue on confirmation.

**CC recommendation: C.** Rationale: one clarifying question is cheap; a
reflexive halt is expensive in an established gitflow context, and a blind
assume-continue (B) drops the one safety check that catches real drift. C keeps
the surface-uncertainty signal without forcing serial velocity.

**Impact.** Process-level; changes how Strategic-Advisor reacts in chat. Faster
parallel work than A, safer than B. No code change.

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — a "Strategic-Advisor non-reflexive-halt" + "one-clarifying-question" rule.
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) — "Multi-tool collaboration tracking: re-sync before accepting new orders" is the sibling discipline.

---

## Decision 3 — Branch-state visibility for Strategic-Advisor

**Context.** Strategic-Advisor today knows nothing about which agent is on
which branch unless the user pastes it. The question is whether to add a
structural primer.

**Options.**
- **A — No structural change.** User-mediated sync continues; Strategic-Advisor
  asks when uncertain.
- **B — Session-start primer.** Each new Strategic-Advisor session opens with
  the user pasting `git branch -av` + the active-agent assignment. Clean
  baseline; adds session-start friction every time.
- **C — On-demand primer.** Strategic-Advisor asks for current branch-state
  only when a prompt or decision actually depends on it. No session-start tax.

**CC recommendation: C.** Rationale: most chat turns do not depend on
branch-state; paying a session-start tax (B) for information rarely needed is
friction without payoff. On-demand surfaces it exactly when it matters. Pairs
naturally with decision 2's ask-once.

**Impact.** Process-level. C is near-zero overhead; B is predictable but
constant overhead. No code change.

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — "Session start" + the proposed branch-aware additions.

---

## Decision 4 — How agents discover each other's work

**Context.** In the current pattern, parallel agents do not discover each other
directly; coordination flows through the user. The question is whether to add a
discovery mechanism so an agent can see relevant in-flight work on other
branches before it starts.

**Options.**
- **A — No discovery; user mediates fully.** Status reports flow through the
  user, who merges insights manually.
- **B — Branch-aware status reports.** Every CC prompt asks the agent to report
  "your branch, your last commit, your in-progress state" so Strategic-Advisor
  can assemble a cross-agent view from multiple reports.
- **C — Cross-branch peek in Pre-Inspection.** During Pre-Inspection the agent
  runs `git log --all --oneline --max-count=10` (and `git branch -av`) to see
  what exists on other branches and surfaces anything relevant in its report.

**CC recommendation: C + B combined** (the exploration's recommendation).
Rationale: C gives the *acting* agent direct, low-cost awareness of sibling
work at the moment it audits (catching cross-branch file overlap before it
writes); B gives Strategic-Advisor the cross-agent view for prompt-formulation.
They cover different consumers and compose cleanly. C is the higher-value half
— it is a two-command addition to the existing Pre-Inspection step and directly
prevents the cross-branch-conflict failure mode.

**Impact.** C adds two read-only git commands to Pre-Inspection (negligible
cost, real conflict-avoidance value). B adds a sentence to the CC-prompt
template. Both are process-level; no code change. C must respect the
explicit-paths / parallel-session discipline already in lessons-learned (never
act on another branch's working tree).

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — "Pre-Inspection" additions + the CC-prompt template note.
- [.claude/rules/lessons-learned.md](../../.claude/rules/lessons-learned.md) — "Pre-Coding-Reality-Check", "Explicit-paths discipline", "Plain `git status` before every commit".

---

## Decision 5 — Whether to formalize the above as `ai-workflow.md` rule entries

**Context.** Decisions 1–4 describe behaviour. This decides whether that
behaviour becomes written rules (load-bearing, read by every agent) or stays as
exploration prose (advisory, easily missed).

**Options.**
- **A — Formalize as rule entries.** Add the confirmed decisions to
  `.claude/rules/ai-workflow.md` so every agent inherits them.
- **B — Leave as exploration prose.** Keep the guidance in the exploration doc
  only; agents read it on demand.
- **C — Formalize the stable subset only.** Promote the decisions that
  converged cleanly (likely 1, 2, 4-C); leave the rest as prose until they
  settle.

**CC recommendation: A**, scoped to whatever subset of 1–4 Aster confirms.
Rationale: behaviour that is not in `.claude/rules/` is behaviour that the next
fresh agent will not follow — the reflexive-halt incident is exactly what
happens when a convention lives only in someone's memory. The cost is a few
rule lines; the benefit is convention-inheritance across all future agents. C
is the fallback if any decision stays genuinely unsettled after adjudication.

**Impact.** Documentation. Rules in `ai-workflow.md` are read every session, so
this is the difference between "documented once" and "actually followed".

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md).
- Exploration's "Proposed refinements" (lines 101–110) lists the five candidate rule entries verbatim.

---

## Decision 6 — Filing: backlog item vs direct rule entry

**Context.** Closing this work can happen two ways: as a tracked backlog item
that schedules the rule-writing as its own task, or by editing the rule files
directly in the adjudication session.

**Options.**
- **A — Direct rule entry.** Once Aster picks options for 1–5, edit
  `ai-workflow.md` in the same session and close
  `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01`.
- **B — File a fresh implementation backlog item.** Keep the followup as
  "decisions made", open a new item for "write the rules", schedule separately.
- **C — Hybrid.** Make the edits directly (A) but record the adjudication
  outcome in this doc + the exploration's "Decisions pending" section so the
  rationale survives, then archive the followup.

**CC recommendation: C.** Rationale: the decisions are small and the rule edits
are mechanical once chosen, so deferring them to a separate item (B) only adds
tracking overhead. But the *rationale* for each choice is worth preserving
(future agents will ask "why ask-once and not halt?"), so record the outcome
here rather than just editing and forgetting (pure A). C matches the project's
continuous-archival discipline: close the followup in the same change that lands
the rules, with the audit trail intact.

**Impact.** Process-level. C closes the loop in one session while keeping the
decision record auditable. No code change.

**Relevant locations.**
- [.claude/rules/ai-workflow.md](../../.claude/rules/ai-workflow.md) — "Continuous-archival rule" + "ROADMAP priority tiers".
- [docs/backlog.md](../backlog.md) + [docs/ROADMAP.md](../ROADMAP.md) — where `MULTI-AGENT-COORDINATION-EXPLORATION-FOLLOWUP-01` lives.
- [docs/archive/roadmap/](../archive/roadmap/) — archive target on close.

---

## Summary table

| # | Decision | CC recommendation |
|---|----------|-------------------|
| 1 | Canonical multi-agent pattern | **A** ratify gitflow (C worktree isolation as the mechanism for overlapping work) |
| 2 | Divergent-state response | **C** ask once, then continue if gitflow confirmed |
| 3 | Branch-state visibility | **C** on-demand primer |
| 4 | Cross-agent discovery | **C + B** cross-branch peek in Pre-Inspection + branch-aware status reports |
| 5 | Formalize as rules | **A** (subset Aster confirms; C as fallback) |
| 6 | Filing | **C** direct edit + record outcome, then archive |

These recommendations are a coherent set: ratify the pattern (1), react to
divergence with one cheap question instead of a halt (2), surface branch-state
only when needed (3), let the acting agent peek across branches during its
audit (4), write the confirmed subset into the rules (5), and close the loop in
one auditable change (6).
