# Next Session Resume Prompt (2026-05-24)

Fresh CC session. Resume work per
[session-handoff-2026-05-24-next-resume.md](session-handoff-2026-05-24-next-resume.md).

Paste the block below verbatim into the new CC session.

```text
Resume from the 2026-05-22 close. The full KDP Publishing
Wizard shipped (Phase 1 + Phase 2, 22 commits across 3 CC
sessions); HEAD = 817b7df. Plus 4-commit COMIC-BOOK-EDITOR-
METADATA-BUTTON-01 ship plus 1-commit RECURRING-COMPONENT-
AUDIT-01 housekeeping close. 29 commits today total.

State of play:
- HEAD = 817b7df, working tree clean, parity with origin/main.
- Backend pytest: 2181 passed.
- Frontend Vitest: 1940 passed.
- i18n parity: 75/75 across 8 catalogs.
- Playwright specs: 60 in e2e/smoke/.
- Backlog: P0=0, P1=0, P2=0 (empty first time), P3=37, P4=27,
  P5=7, BLOCKED=2.

Closures (2026-05-22):
- COMIC-BOOK-EDITOR-METADATA-BUTTON-01 (P1)
- RECURRING-COMPONENT-AUDIT-01 (housekeeping)
- KDP-PUBLISHING-WIZARD-01 Phase 1 (MVP)
- KDP-PUBLISHING-WIZARD-01-PHASE-2 (P2 STRATEGIC)
- KDP-WIZARD-XSTATE-MIGRATION-01 (P3 ARCHITECTURE-DEBT)

Filings opened (2026-05-22):
- WIZARD-SHELL-COMPONENT-EXTRACT-01 (P3, RCU 3-site, trigger
  condition NOW MET)
- KDP-WIZARD-RESUME-AT-STEP-01 (P3, true resume-at-step
  requires server-stored validation results)
- KDP-WIZARD-RESUME-BADGE-01 (P3, BookMetadataEditor badge)
- METADATA-BUTTON-COMPONENT-EXTRACT-01 (P5, RCU pre-reg)
- KDP-PRICING-PRECISE-FILE-SIZE-01 (P5, precise file-size)
- ARC-MAILTO-LINK-01 (P5, polish for outbound email)

The full handover is at
docs/journal/session-handoff-2026-05-24-next-resume.md — read
that first.

Quick start:
1. git status                    (verify clean, HEAD=817b7df)
2. git log origin/main --oneline -10
3. cat docs/journal/session-handoff-2026-05-24-next-resume.md
4. Tell me which path you'd take.

Top three candidates:

1. WIZARD-SHELL-COMPONENT-EXTRACT-01 (P3, RCU 3-site, trigger
   met): extract a shared WizardShell from
   ConvertToBookWizard + ImportWizardModal +
   KdpPublishingWizard (Dialog-Chrome, Step-Indicator,
   Nav-Buttons, testid-namespace wiring). M-effort (4-7
   commits, 1 session). Natural follow-up to the KDP arc.

2. PAGES-DELETE-EDITOR-UI-01 (P3, Half-Wired-Lifecycle-
   Cascade): page-delete UI missing in both PageEditor +
   ComicBookEditor; backend supports it; affordance just
   needs to be exposed in PageThumbnails. S-effort (3-5
   commits).

3. BOOK-TYPES-SSOT-YAML-01 (P3, IMPROVEMENT, trigger-gated):
   book-type metadata SSoT across 5+ scattered surfaces.
   Trigger: 3rd surface needs it (currently at 5; 6th
   would fire). M-effort (6-10 commits).

Plus: user may want to shift to non-Bibliogon work
(adaptive-learner, PluginForge, creative projects). P2 is
empty; no continuation forced.

Active disciplines (carry forward from prior session):
- Plain `git status` before every commit (no path filter)
- Explicit-paths-only `git add` (no `-A`, no `.`, no
  directory-as-path; Multi-Tool-Coordination addendum
  2026-05-23)
- Atomic-green-per-commit-delta (pytest 2181 / Vitest 1940
  baselines hold or grow)
- Pre-Coding-Reality-Check at boundaries (re-grep immediate
  touch-surface before keystroke; STOP on architectural
  conflict)
- Push autonomously after atomic-green commits (2026-05-21
  discipline change)
- Half-Wired-Prevention-Check at integration milestones
- `ls docs/architecture/` + grep component-class keyword
  during Pre-Inspection's component-audit track (2026-05-22
  LL entry)
- Option C discipline (single-instance observation, not
  pattern-yet): XState machine states reflect current
  reality, not planned future — add states alongside their
  UI

Don't overscope. Prefer one clean close over two half-done.
If you pick WIZARD-SHELL-COMPONENT-EXTRACT-01, lead with a
Pre-Inspection (read-only) before any code — same shape as
the KDP Phase 1 + Phase 2 sessions.

User-Direction-Override always overrides Strategic-Advisor
recommendation.
```

---

## Recovery checklist (if state-divergence)

If `git status` or `git log` shows divergence from the
expected `817b7df` HEAD:

1. `git fetch origin` + `git log origin/main..HEAD` — confirm
   no unpushed commits.
2. If `origin/main` advanced past `817b7df`, read the new
   commits' messages to understand what shipped overnight.
3. Re-run test baselines (`make test` + Playwright smoke)
   before adopting any state-as-baseline.
4. If the divergence is non-trivial: STOP, surface the
   divergence + the new state, ask for direction.

---

## End-of-session

Session-end-report per established convention:

- SHA range (`{start}..{end}`)
- Test deltas (pytest / Vitest / i18n)
- Closures (backlog items closed this session)
- Filings (new backlog items opened)
- LL additions if any (single-instance observations vs
  pattern promotions)
- Next-substantial-candidates (1-3 ranked)

Push autonomously after atomic-green commits. Surface only on
Stop-Conditions or substantial architecture decisions.
