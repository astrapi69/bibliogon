# Chat journal — session 2026-06-11

Release session for **v0.50.0** (the full-data backup + testing-infrastructure
release) plus the CCW handover for the feature-strategy integration (#63).

## 1. v0.50.0 smoke-gate fixes (#64, #65)

- Goal: clear the failures Aster's `npx playwright test --project=smoke` run left
  in `e2e/test-results`.
- Two final failures + rotating flakes diagnosed:
  - **settings-backups** `toHaveCount(2)` got 3 — real stale test: the #59/#60
    full-data JSON backup added a 3rd page-level `<input type=file>`. Fixed by
    scoping the locator to the Compare dialog (`role="dialog"`). (#64)
  - **chapter-reorder** keyboard-DnD — load-correlated @dnd-kit flake. Hardened:
    `toBeFocused()` before pickup + larger inter-key stabilisers. (#64)
  - **create-article `?type=`** — real intermittent product bug: a cold
    content-type registry made `requestedValid` false at first render, so the
    deep-linked type was dropped. Fixed by re-applying `requested` once the
    registry resolves. (#65)
  - **copy-toolbar** "Copy as plain text" — Radix-portal-under-load flake;
    hardened by waiting for the menu item before clicking. (#64)
- Commits: `fcf8792d`, `67f9598d`, `61e92745`.

## 2. CCW handover for feature-strategy (#63)

- The `@astrapi69/feature-strategy` integration was handed to CCW.
- `feature/feature-strategy-gating` pushed to origin (dep-install committed).
- Wrote `docs/journal/handover-feature-strategy-63.md`: branch state, verified
  `.d.ts` API, the locked architecture decisions (full centralization, AI
  key-aware, gate-vs-branch split, three-tier visibility), the 28 call-sites with
  three-bucket (gate/branch/infra) classification, the reactive-key gap, and the
  Step-3a deviations to verify. Commit `20ed271b`.

## 3. Completing v0.50.0 release prep + tag + publish

- `make release-test` surfaced two blockers the prior session's partial "local
  checks" had missed (it never ran the full gate):
  - `BackupsSettings.tsx:96` `notify.error` missing the caught-error 2nd arg
    (notify-error pre-commit hook). One-line fix. Commit `9b7a4aac`.
  - Five stale version headers (README, README-de, CLAUDE.md, ROADMAP, backlog)
    still at v0.49.0. Bumped; CLAUDE.md got a proper v0.50.0 block with v0.49.0
    demoted. Commit `269af7c2`.
- `make release-test` re-verified green (delta: verify-docs-completeness +
  pre-commit + docs-discipline; the rest was green and unaffected by docs edits).
- Full smoke gate at the tag commit: `SMOKE_EXIT=0`, 530 passed, 0 failed,
  3 skipped, 2 flaky-but-recovered (the known load-correlated Radix-portal tail
  the config's 1 retry absorbs).
- `make release-tag VERSION=0.50.0` (pre-push pre-commit green, main + tag
  pushed) and `make release-publish VERSION=0.50.0`.
- Release: https://github.com/astrapi69/bibliogon/releases/tag/v0.50.0

## Process notes

- The wrapper-exit-vs-real-exit trap recurred: backgrounded `make release-test`
  reported "exit 0" from the trailing `tail`, while the real gate had failed
  (`MAKE_EXIT=2`). Reading the appended `MAKE_EXIT` / log markers caught it both
  times — exactly the "piping a gate through tail masks exit code" lesson.
- `origin/main` advanced to the local commit chain without a push from this
  session (a parallel actor pushed) — the documented multi-tool-collaboration
  drift; verified true remote state with `git ls-remote` before acting.
- `feature/feature-strategy-gating` is CCW's; not touched here.

## Summary

- Commits this session (on main): `fcf8792d`, `67f9598d`, `61e92745`,
  `63bac0c1`, `9b7a4aac`, `20ed271b`, `9b7a4aac`-fix, `269af7c2`, + this
  post-release doc commit.
- Issues: #64 (smoke-gate fixes), #65 (create-article `?type=` race) closed;
  #63 (feature-strategy) handed to CCW, open.
- Gates: backend pytest 2578, Vitest 2974, tsc/ruff/mypy/pre-commit/verify-docs
  /verify-theme/launcher all green; smoke 530 passed / 0 failed.
- **v0.50.0 tagged + published.**
