# Chat journal — 2026-06-05 (documentation rule + v0.47.0 release)

## 1. Status correction — work already shipped

Session opened against prompts assuming the `/api` tail was still open and a
handover still needed writing. Verified the actual state first: the `/api` tail
was already closed (`41a5e745`..`bb9ffad1`, `guardedFetch()` egress + E2E
`route.abort('**/api/**')` gate) and a handover already existed. Surfaced the
correction rather than redoing the work (multi-tool drift discipline).

## 2. No-inline-comments documentation rule

- `aade1dbd` `docs(rules)` — added the "No inline comments — docstrings only"
  rule to `.claude/rules/code-hygiene.md` (Python Google-style + TSDoc examples,
  allowed/forbidden lists), replacing the older "comments explain WHY" guidance.
- `0428b727` `refactor` — cleaned up the Track A+B inline comments across 20
  files. Repetitive offline-gating comments deleted; genuine "why" moved into
  docstrings on `guardedFetch`, `makeQueueingStorage`, `updateApp`,
  `writingSessions.list`, `generate_settings`. Kept: Dexie schema-version note +
  section divider (existing convention / allowed exception), a pre-existing
  GetStarted `book_type` explanation, a `useOfflineFeatureGate` JSDoc usage
  example. tsc clean, Vitest 2715 green.

## 3. v0.47.0 release

- `417ef81e` handover updated for v0.47.0.
- `19da015f` version bump → 0.47.0 via `make sync-versions` (21 subsystems);
  `sync-versions-check` + `verify_version_pins.sh 0.47.0` clean.
- `d31da11f` CHANGELOG: `changelog/releases/v0.47.0.md` (full notes) +
  `docs/CHANGELOG.md`.
- `20d20300` version-header bump (README, README-de, CLAUDE.md summary,
  ROADMAP, backlog) — caught by `make release-test` (verify-docs-completeness
  FAIL on the stale v0.46.0 headers) before tagging.
- Release authorized by Aster ("continue with release in parallel" + "if
  something is not right we can make a patch"). Full `make release-test` gate
  green: backend pytest 2572 passed / 1 skipped, Vitest 2715, tsc, ruff, mypy,
  pre-commit, verify-docs-discipline, verify-docs-completeness, verify-plugin-locks,
  verify-theme (96 + 48 contrast checks), launcher PyInstaller build.
- `make release-tag VERSION=0.47.0` → tag `v0.47.0` pushed; `make release-publish`
  → GitHub Release published (not draft). Launcher builds (macOS/Windows/Linux),
  Release Gate, CI, Coverage, and GH-Pages deploy workflows triggered on the tag.

## Summary

Commits this session: 7 (`aade1dbd`, `0428b727`, `417ef81e`, `19da015f`,
`d31da11f`, `20d20300`, + this journal). Release v0.47.0 (full offline PWA + GH
Pages deploy split + menu/settings fixes + no-inline-comments rule) shipped.
Note: the offline E2E `route.abort` gate provides regression protection; a live
real-browser smoke run by Aster remains the post-release confirmation, with
patch-if-needed authorized.
