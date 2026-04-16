# Create docs/explorations/dependency-strategy.md

Context: The dependency audit revealed several deferred major 
migrations (React 19, TipTap 3, Vite 8, TypeScript 6, 
react-router-dom 7, elevenlabs SDK, pandas 3). Each is a strategic 
decision that should be documented, not just a line in a commit 
message.

Also: the pin decisions for TipTap community extensions need 
proper documentation so future sessions can understand the 
reasoning without re-discovering it.

## Document structure

```markdown
# Dependency Strategy

Status: Active maintenance document  
Last full review: YYYY-MM-DD  
Next review: YYYY-MM-DD (quarterly or at next major release)

## Purpose

This document tracks Bibliogon's strategic decisions about major 
dependency versions. It complements docs/ROADMAP.md (forward work) 
and lessons-learned.md (rules and patterns) by providing:

- Active evaluation of deferred major version bumps
- Decision history for pin choices
- Triggers for re-evaluation

## Policy

### Stability filter
- Only stable releases, never beta/RC/alpha
- Minimum 2 weeks since release for new major versions
- For LTS products (Node.js), prefer Active LTS over Current

### Release-cycle dependency review
Before cutting any release:
- Run `poetry show --outdated` in backend and each plugin
- Run `poetry show --outdated` in launcher
- Run `npm outdated` in frontend
- Apply routine bumps (patch + low-risk minor) as part of release prep
- Major bumps get dedicated sessions, not bundled with releases

### Pin rules
When pinning a dependency below latest, document in this file:
- Why pinned (concrete reason)
- Condition for unpinning (what must change)
- Review date (when to re-evaluate)

Pins without these three elements are technical debt.

## Deferred major migrations

### DEP-01: React 18 -> 19

- Current: React 18.3
- Latest stable: React 19.x
- Recommendation: DEFER
- Recommendation date: 2026-04-XX
- Re-evaluation trigger: [specific condition]

Benefits of upgrade:
[concrete list from audit]

Cost of upgrade:
[effort estimate, risk level, affected code areas]

Why deferred:
[concrete reasoning, not vague]

Re-evaluation conditions:
- [specific trigger 1]
- [specific trigger 2]

### DEP-02: TipTap 2 -> 3

[same structure]

Special notes on community extensions:
- @pentestpad/tiptap-extension-figure: status of v3 compat
- tiptap-footnotes: status of v3 compat
- Alternative extensions or fork strategy if compat lagging

### DEP-03: Vite 6 -> 8

[same structure]

Dependency chain note: Vite 8 may require React 19 first. 
Cross-reference DEP-01.

### DEP-04: TypeScript 5 -> 6

[same structure]

Dependency chain note: should follow Vite 8 migration. 
Cross-reference DEP-03.

### DEP-05: react-router-dom 6 -> 7

[same structure]

Note: v7 is a complete API rework (Remix-based). This is not a 
minor migration even by "major bump" standards.

### DEP-06: elevenlabs SDK 0.2 -> 2.x

[same structure]

Special consideration: needs testing with real ElevenLabs API 
during migration. Cannot be validated purely with mocks.

### DEP-07: pandas 2 -> 3

[same structure]

First audit step: verify actual pandas usage in the codebase. If 
usage is minimal, migration is low effort. If pandas is used 
extensively with DataFrame manipulations, effort increases.

## Active pins with expiration

### TipTap community extensions

- @pentestpad/tiptap-extension-figure pinned at 1.0.12
- tiptap-footnotes pinned at 2.0.4

Reason: both require @tiptap/core v2. Upgrading either to their 
latest requires TipTap v3 migration (see DEP-02).

Unpin condition: TipTap 2 -> 3 migration (DEP-02) is completed.
Review date: [date]

### [Other pins as they exist]

## Migration history

Chronological record of completed migrations.

### 2026-04-XX: Node.js 20 -> 22
- Reason: Node 20 approaching EOL, 22 is Active LTS
- Effort: small
- Issues encountered: [any]
- Commits: [list]

### 2026-04-XX: Python 3.11 -> 3.12
- Reason: routine maintenance, newer stable
- Effort: small
- Issues encountered: [any]
- Commits: [list]

### 2026-04-XX: manuscripta 0.7 -> 0.8 (PS-06)
- Reason: silent-image-drop bug fix, strict-images mode
- Effort: medium
- Issues encountered: required bibliogon-side fix for 
  html_to_markdown
- Commits: 82be282, e0f7a32, 5adf01e, e1e57cc, dfebfe8, 7a80462, 
  6a25a0f

### [Previous migrations as they exist]

## Review schedule

- At each release: routine bumps per release-cycle rule
- Quarterly: review this document, update re-evaluation triggers
- At major decisions: document here before committing

Specific next reviews:
- DEP-02 (TipTap): [date when community extensions might have 
  v3 compat, or a fixed review date]
- DEP-01 (React 19): [date]
- DEP-05 (react-router-dom): [date]
- ...
```

## Sources for content

Use the findings from the dependency audit you just produced for 
commit sequence 8:
- The categorized tables
- The risk assessment
- The deferred list

For TipTap specifically, research before writing:
- When TipTap v3 was released as stable
- TipTap team's v2 support commitment
- Current status of community extensions' v3 support
- Any notable v3 features that would benefit Bibliogon

For each deferred migration, fill in:
- Concrete benefits (not generic "improved performance")
- Concrete costs (actual file counts, test counts, effort estimate)
- Concrete re-evaluation triggers (not vague "when appropriate")

## Relationship to other docs

- **ROADMAP.md**: DEP items stay in this document, not roadmap. 
  Roadmap is for forward feature work.
- **lessons-learned.md**: rules about dependency discipline live 
  there, not here
- **CHANGELOG.md**: actual version bumps are recorded there
- **This document**: strategic decisions and deferred work

Cross-reference from other docs to this one where relevant:
- CLAUDE.md: brief mention that dependency decisions live in 
  docs/explorations/dependency-strategy.md
- release-workflow rule: reference for the release-cycle review step

## Commit plan

1. `docs(explorations): create dependency strategy document with 
    current state`
2. `docs: cross-reference dependency strategy from CLAUDE.md and 
    release-workflow rule`

This document is created in one commit, not incrementally. It is 
a complete snapshot as of the current audit.

## Maintenance

Once created, this document should be updated:
- When a DEP item is acted upon (implemented or officially 
  cancelled)
- When re-evaluation triggers fire
- When new deferred migrations accumulate
- At quarterly review (at minimum once per quarter)

Update with commit message pattern: 
`docs(explorations): [specific change to dependency strategy]`

Do NOT silently update. Each change is tracked in git history 
for decision audit trail.

## Design principle

This document is a **strategic decision log**, not a specification. 
The difference matters:

- A specification says "this is how it works"
- A strategic decision log says "this is why we chose X, and these 
  are the conditions that would make us reconsider"

When future sessions encounter a DEP-X question, they should read 
the relevant section and either:
1. Find that the deferral conditions still apply, action = wait
2. Find that a trigger has fired, action = re-evaluate with current 
   data and update the document
3. Find that circumstances have changed in ways not captured, 
   action = update the document to reflect new understanding

The document is wrong if it ossifies. It is correct if it evolves 
with project understanding.