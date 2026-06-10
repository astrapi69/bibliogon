# Resume prompt — next session (2026-06-04)

Fresh CC session. Resume the v0.46.0 release from `main`.

```
git status
git log origin/main --oneline -8
cd frontend && npx tsc --noEmit && npm run test   # Vitest baseline ~2661
```

Full context: `docs/journal/session-handoff-2026-06-04-next-resume.md`.

## Where things stand

- **Dialog → Pages migration is COMPLETE** (C1–C12, PRs #20–#24 merged).
  8 dialogs → deep-linkable routes; editor `?chapter=` URL state; Tailwind
  v4 + shadcn foundation. Full route map + classification:
  `docs/architecture/dialog-to-pages-routes.md`.
- **v0.46.0 is PREPARED but NOT tagged.** Version bumped (0.45.0 →
  0.46.0), CHANGELOG + `changelog/releases/v0.46.0.md` + CLAUDE.md +
  README headers all written and committed. `make release-test` green.
- **Smoke: 449 passed, 0 failed, 1 flaky** (full `--project=smoke` run).
  All Dialog → Pages spec breakage fixed. The 1 flaky
  (`getstarted-multi-book-types.spec.ts:138`, comic_book sample) passes on
  retry; it's a pre-existing GetStarted render instability (NOT a
  migration regression).

## The STOP-gate

**Aster must run `cd e2e && npx playwright test --project=smoke` locally
and confirm 0 failures BEFORE the v0.46.0 tag is pushed.** CC must NOT
tag autonomously (release-workflow.md Pre-Release Gate).

## Direction

1. **Aster confirms smoke green in chat** → CC tags + publishes v0.46.0:
   - `make release-tag VERSION=0.46.0` (verifies pins, tags, pushes main +
     tag), then `make release-publish VERSION=0.46.0` (GitHub release from
     `changelog/releases/v0.46.0.md`).
   - Post-release: ROADMAP `[x]`, chat-journal release entry, push.
2. **Aster reports a smoke failure** → fix the spec (new route/page
   pattern) or the app, re-run smoke, repeat until green, then go to (1).

Optional follow-up (not release-blocking): stabilise the GetStarted
step-transition (the 1 flaky sample-button click) at the app level.
