# Session handover — v0.35.0 release-cut sequence (2026-05-18)

Updates the prior 2026-05-17 handoff with the new
coordination directive: four work-streams ship together in
v0.35.0, gated by per-session user manual-smoke.

The 2026-05-17 doc described the state right after PB-PHASE4
Session 4c-A close (19-commit local stack, not pushed). Since
then v0.34.0 + v0.34.1 shipped, the picture-book stack closed,
Async-Import work landed, and the parallel session shipped
several picture-book Session 6 commits + a Recurring-Component
Unification rule.

This doc is the focused next-action gate.

---

## The v0.35.0 sequence (user directive)

```
1. Session 4c-B (Picture-Book Editor TipTap + Tier-Properties)
2. Async-Import Phase 3 (i18n + Playwright)
3. AUTHOR-SELECT-INPUT-EXTRACT-01
   + RECURRING-COMPONENT-AUDIT-01 (coordinated session)
4. v0.35.0 release cut
```

**Discipline**: user runs manual smoke after each session
close before authorizing the next. All four work-streams
ship together as v0.35.0.

---

## Status per stream

### Stream 1 — Session 4c-B (Picture-Book TipTap + Tier-Properties)

Parallel-session territory. Latest visible on `main`:
- `49510d0` fix(create-book-modal): Authors-DB datalist
- `2c5e60f` feat(book-metadata): Design-tab Export-PDF button
- `bd2b878` feat(i18n): page_editor + metadata Export-PDF labels
- `49f6af2` feat(page-editor): Export PDF button
- `43f305d` feat(plugin-export): embed PDF metadata
- `9f4b44e` feat(plugin-export): book_type dispatch + PB PDF helpers

Status (best guess from log; verify with the parallel
session): Session 6 PDF Export is shipping in pieces.
Whether Session 4c-B (TipTap + Tier-Properties extended
speech-bubble props) has STARTED is unclear from `git
log` alone — backlog entry
`PICTURE-BOOK-SPEECH-BUBBLE-EXTENDED-PROPERTIES-01`
(filed Session 4c) is the gated item; check whether it's
been promoted out of P3 yet.

### Stream 2 — Async-Import (this session's work) — **DONE**

| Phase | Commit | Scope |
|---|---|---|
| 1 — Backend | `fa0369e` | async endpoint, SSE events, cooperative cancel, +14 tests |
| 2 — Frontend | `c380cc2` | context, API methods, progress UI, state-machine swap, +22 tests |
| 3 — Playwright + i18n | `8595053` + `bd2b878` (bundled) | 4-test smoke + 8-catalog native translations |
| Follow-up — Interface Sync | `cb7edc5` | Surface v0.31.0 comment-routing in TS interface + Result UI + 8-catalog i18n + Vitest |

All four commits pushed to `origin/main`. Total test delta:
- Backend: +14 (medium-import async + result endpoint)
- Frontend Vitest: +26 (4 medium-import files + result component)
- Playwright: 1 new + 1 reframed

**Awaiting user manual-smoke before Stream 3 starts.**

### Stream 3 — AUTHOR-SELECT-INPUT-EXTRACT-01 + RECURRING-COMPONENT-AUDIT-01 (coordinated)

Not started. Backlog entries:
- `AUTHOR-DATALIST-EXTEND-EDITORS-01` (P3) — extend the
  Bug 8 Phase 2 Wizard Author-Dropdown pattern to the 3
  remaining surfaces (ArticleEditor, BookEditor,
  BookEditor backpage). The user may have a separate
  `AUTHOR-SELECT-INPUT-EXTRACT-01` for the extraction
  pre-step (see parallel session's recent
  `49510d0` CreateBookModal fix which already brought
  the pattern into Modal scope — likely the trigger).
- `RECURRING-COMPONENT-AUDIT-01` — not in the backlog as
  I last read it; likely a new entry the parallel session
  filed alongside `f06ae35` (the rules update that added
  the Recurring-Component Unification Rule + Pre-Inspection
  step). Confirm with parallel session.

Coordinated session means both items land together so the
AUTHOR-SELECT-INPUT extraction informs the recurring-
component audit's view of the codebase.

### Stream 4 — v0.35.0 release cut

Gated on Streams 1 + 2 + 3 all closed + user manual-smoke
on the bundle. Follows release-workflow.md.

---

## Repo state at handoff

- Branch: `main`
- Last commit on origin: `cb7edc5` (this session, just pushed)
- Working tree: clean (per `git status -sb`)
- Local in sync with `origin/main`
- All tests green at last full run:
  - Backend pytest: 1906 passed, 1 skipped (recall: that
    was AFTER Phase 1 of async-import; the +3 result-
    endpoint tests landed in Phase 2 so the latest run
    sits at ~1909. Re-run before Stream 3 to be sure.)
  - Frontend Vitest: 1452 passed / 123 files
  - tsc --noEmit: clean
  - Playwright `--list`: 4 medium-import tests recognised

---

## Open backlog items in the medium-import family

After this session's closures, the only remaining filed
item in the medium-import family was
`MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01` which just
shipped in `cb7edc5`. No further deferred follow-ups in
this feature group.

Two pre-existing P2 items unrelated to this work-stream:
- `MEDIUM-IMPORT-V2-02` (AI tag inference) — awaits user
  signal that manual tagging is a real bottleneck.

Three archival items the user may want to close:
- `MEDIUM-IMPORT-V2-01` should be archived to
  `docs/roadmap-archive/2026-05.md` per continuous-archival
  rule. Was filed pre-Phase-1; now done.
- `ASYNC-IMPORT-PROGRESS-01` — same.
- `MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01` — same.

All three can be archived in a single commit when the user
or parallel session next touches backlog hygiene.

---

## Shared-working-tree hygiene (lessons-learned candidate)

During this session, the parallel session bundled my
staged-but-uncommitted YAML edits into their commit
`bd2b878` (the commit message describes only their
Export-PDF labels feature, but the actual diff includes
my async-progress i18n keys). Functionally correct,
commit-message-mismatched.

Mitigation pattern used throughout my own commits:
`git commit -- <specific paths>` to scope the commit to
exactly my files, leaving other staged content alone.
The parallel session didn't use this pattern.

Worth filing as a lessons-learned ("Shared-working-tree
commit bundling") on the next docs touch. Not blocking
anything.

---

## What to do at next session start

1. **If the next session is Stream 3** (coordinated
   AUTHOR-SELECT + RECURRING-COMPONENT-AUDIT):
   - User has authorized after Stream 2 manual-smoke.
   - Read `docs/backlog.md` for the two backlog entries.
   - Run a Pre-Inspection that surveys: the extraction
     surface (CreateBookModal post-`49510d0` is the
     model; the 3 remaining author-input sites are the
     targets) + the Recurring-Component Unification rule
     in `.claude/rules/architecture.md` (added by parallel
     session in `f06ae35`).
   - Wait for design Q&A approval before any code.

2. **If Stream 1 (PB-PHASE4 Session 4c-B) is still in
   flight** by the parallel session: do nothing until
   user signals.

3. **Stream 4 (v0.35.0 release cut)**: don't initiate.
   Follows release-workflow.md, user-triggered.

---

## Stop-conditions

- Do NOT push beyond `cb7edc5` until next user
  authorization.
- Do NOT touch picture-book / BookMetadataEditor /
  PageEditor surfaces — parallel session's territory.
- Do NOT initiate v0.35.0 release-cut without explicit
  user trigger ("release new version" per
  release-workflow.md).
