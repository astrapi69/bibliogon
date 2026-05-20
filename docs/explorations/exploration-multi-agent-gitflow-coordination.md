# Exploration: Multi-Agent CC Coordination via Gitflow

**Date:** 2026-05-20
**Status:** Open exploration; not yet decisions

## Pre-audit

This exploration was prompted by an incident on 2026-05-20: Strategic-Advisor reflexively flagged Multi-Tool-Tracking-Drift when c080974 (Comics-Session-2 C1) plus untracked files appeared in working tree authored by a different CC agent than the V060-closing agent. User clarified: "wir können ein neuen branch erstellen und dort den anderen agenten laufen lassen, das haben wir ständig gemacht, nennt sich gitflow". The reflexive halt was wrong; gitflow-with-feature-branches is the established multi-agent coordination pattern in Bibliogon, not a tracking-drift situation.

This exploration formalizes the pattern, identifies failure modes that Strategic-Advisor should still respond to versus those it should not, and proposes refinements to the AI-workflow rules.

## The pattern as practiced

Multiple parallel CC-agents coordinate on substantial multi-track work via:

1. Each substantial track gets its own feature branch (e.g. `feature/comics-session-2`, `feature/v060-adoption`)
2. Each CC-agent operates on one feature branch at a time
3. Main stays as the integration point; feature branches merge in after ship
4. Working-tree state on a feature branch may show in-progress work (modified files, untracked files) that the operating agent is mid-implementing
5. Different agents on different branches do not see each other's working-tree state directly; coordination happens via merge-events on main plus user-mediated status sync
6. Strategic-Advisor (Claude in chat) coordinates user-level decisions plus formulates CC-prompts but does not operate on branches directly

## What this pattern solves

- Parallel substantial sessions without sequencing serialization
- Velocity-boundary expansion (user can run V060 + Comics-Session-2 + PluginForge-upgrade concurrently rather than sequentially)
- Isolation of in-progress work (a broken intermediate state in one feature branch does not block work on another)
- Clean merge-history (each feature branch lands as one coordinated arc on main)

## What this pattern does not solve

- Strategic-Advisor's lack of visibility into which agent is on which branch at any moment
- Sync between Strategic-Advisor's view of state plus actual branch-level reality
- Decisions that require cross-agent coordination (e.g. both agents touch the same plugin file from different branches)
- Memory persistence: Strategic-Advisor at session-start does not know which branches are active plus which agents are where

## Failure mode that triggered this exploration

Strategic-Advisor saw c080974 on local main plus interpreted that as Multi-Tool-Tracking-Drift because:

- The V060-CC-agent reported it had not made c080974
- Working-tree showed in-progress files (modified plus untracked) on a Comics-Session-2 surface
- Strategic-Advisor's mental model assumed single-agent-per-session

The actual reality: another CC-agent had branched off for Comics-Session-2 plus the work appeared on main via that agent's branch state (or was pre-merged or visible via different means; details out of scope here).

Strategic-Advisor's reflexive halt was wrong. The correct response would have been: "Multi-agent branch in progress; sync via user-mediated status if needed plus do not block."

## Failure modes that should still trigger Strategic-Advisor caution

Gitflow-with-feature-branches does not eliminate all coordination risks. Strategic-Advisor should still flag:

1. **Cross-branch file conflicts.** Two agents touching the same file on parallel branches will produce merge conflicts at integration time. Strategic-Advisor should flag if a CC-prompt is being formulated that touches a file the user mentions another agent is also touching.

2. **Convention drift across agents.** If one agent ships work that violates Bibliogon-Disziplinen (don't-push-unprompted, Audit-First, Half-Wired-Prevention) plus another agent is being briefed, Strategic-Advisor should reinforce conventions in the new prompt rather than assume convention-inheritance.

3. **Stale-state assumptions in cross-agent briefings.** If Strategic-Advisor formulates a prompt for Agent-B based on Agent-A's last-reported state, plus that state is potentially stale (Agent-A might have shipped more since), the briefing should include explicit state-verification step.

4. **Multi-branch architecture decisions.** If Agent-A made an architecture decision on branch-A plus Agent-B is making a related decision on branch-B without that context, Strategic-Advisor should surface the cross-branch coupling.

5. **Backlog-state divergence.** If both agents file backlog items in their respective branches, merge-time will produce conflicts. Strategic-Advisor should coordinate backlog-edits across branches.

6. **User-mediated sync gaps.** Strategic-Advisor sees only what user pastes from CC plus what's in memory. If user runs multiple CC-sessions plus selectively pastes from one, Strategic-Advisor's view is partial. Strategic-Advisor should flag this risk plus ask explicitly when sync seems incomplete.

## Open question: what does Strategic-Advisor do when state appears divergent?

Three approaches:

(α) **Halt by default plus ask.** Conservative; matches the 2026-05-20 incident behavior. Cost: Velocity-friction when divergence is intentional gitflow-state.

(β) **Assume gitflow-intentional by default plus continue.** Aggressive; matches what should have happened on 2026-05-20. Cost: misses real Multi-Tool-Tracking-Drift when it occurs.

(γ) **Ask before assuming, but in one short turn plus continue if gitflow confirmed.** Middle ground; one clarifying question ("is this a feature-branch from another agent or unexpected state?") with default-continue if user confirms gitflow.

Recommendation: γ. Strategic-Advisor's job is to surface uncertainty without forcing serial Velocity. One clarifying question is cheap; reflexive halt is expensive in established gitflow contexts.

## Open question: do we want explicit branch-state visibility for Strategic-Advisor?

Strategic-Advisor today knows nothing about branches unless user pastes. Two paths:

(α) **No structural change.** User-mediated sync continues. Strategic-Advisor asks when uncertain.

(β) **Session-start branch-state primer.** Each new Strategic-Advisor session opens with user pasting `git branch -av` plus active-CC-agent assignment. Adds friction to session-start; provides clean state-baseline.

(γ) **Lightweight in-conversation primer.** When Strategic-Advisor formulates a prompt or makes a decision that depends on branch-state, it asks for current branch-state then. On-demand rather than session-start.

Recommendation: γ. Avoids session-start friction; surfaces information when actually needed.

## Open question: how do agents discover each other's work?

In current pattern, agents do not discover each other directly. Three paths:

(α) **No discovery; user mediates fully.** Status reports from each agent flow through user; user merges insights manually.

(β) **Branch-aware status reports.** Each CC-prompt explicitly asks for "your branch, your last commit, your in-progress state" so Strategic-Advisor can build cross-agent view across multiple status reports.

(γ) **Cross-branch peek as part of audit.** During Pre-Inspection, agent runs `git log --all --oneline --max-count=10` to see what work exists on other branches; surfaces relevant ones in Pre-Inspection report.

Recommendation: γ plus β combined. Pre-Inspection includes cross-branch peek; status reports explicitly include branch-context.

## Proposed refinements to AI-workflow rules

If exploration converges on the above recommendations, formalize the following in `.claude/rules/ai-workflow.md`:

1. **Multi-Agent-Gitflow Pattern:** explicit documentation of feature-branch-per-agent coordination as the canonical pattern
2. **Strategic-Advisor-non-reflexive-halt rule:** divergent state on local main is gitflow-default until proven otherwise
3. **One-clarifying-question convention:** when state appears divergent, ask once plus continue if gitflow confirmed
4. **Branch-aware CC-prompts:** prompts explicitly ask agent to report branch context plus cross-branch awareness
5. **Cross-branch backlog-coordination:** if multiple agents file backlog items in parallel branches, designate one branch for backlog-canonical state or coordinate via user

## Decisions pending

This exploration surfaces six decisions; each can be made independently:

1. Confirm gitflow-with-feature-branches as canonical pattern (likely yes, already practiced)
2. Choose Strategic-Advisor divergent-state response (α halt / β assume-gitflow / γ ask-once)
3. Choose branch-state visibility (α user-mediated / β session-start primer / γ on-demand)
4. Choose cross-agent discovery (α user-only / β branch-aware-reports / γ cross-branch-peek-in-audit)
5. Decide whether to formalize as AI-workflow rule entries (likely yes if patterns clear)
6. Decide whether to file as backlog item (Pre-Inspection-Multi-Agent-Pattern-Documentation-01) or as direct AI-workflow rule entry

## Not in scope

- Tooling changes (e.g. git hooks for branch-state reporting)
- CC-internal coordination protocols (CC-to-CC communication; that is upstream CC tooling concern)
- Memory persistence across Strategic-Advisor sessions (separate concern, partially addressed by current memory system)
- Whether to migrate Bibliogon to a different branching model (gitflow is established; not under review)

## References

- 2026-05-20 incident transcript (Strategic-Advisor reflexive halt on c080974 plus working-tree state)
- `.claude/rules/ai-workflow.md` (current rules; target for refinement)
- `.claude/rules/lessons-learned.md` (Multi-Tool-Tracking-Drift entries; this exploration distinguishes drift from gitflow-divergence)
- Bibliogon backlog (potential filing site for follow-up items if decisions converge)
