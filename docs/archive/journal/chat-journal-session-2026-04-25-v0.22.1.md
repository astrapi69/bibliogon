# Session Journal - 2026-04-25 (v0.22.1)

Patch release on top of v0.22.0. Not a single-thread session — this
is the trailing settle-day for everything that landed across the
post-CIO cycle: textarea polish, error dialog, missing tts_speed
migration, multi-book BGB, sticky-footer audit. Tag cut from main
HEAD after CI mypy fix.

## 1. Modal sticky-footer audit (13:35)

- Original prompt: "Audit all modals, identify which need the fix,
  apply consistently. 3-5 atomic commits, 2-4 hours."
- Goal: extend the wizard sticky-footer pattern (commit 7dd6ddc)
  to every modal in the codebase where action buttons can scroll
  out of view.
- Result: 13 modals audited; categorized A (1 already done) / B
  (7 needed work) / C (4 short-content, no fix) / D (1 different
  pattern).
- 5 of the 7 Cat-B modals share `.dialog-content-wide` +
  `.dialog-footer` so a single global CSS rule fixed them at
  once: ChapterTemplatePicker, CreateBook, ErrorReport, Export,
  SaveAsTemplate.
- BackupCompareDialog: lifted result-state buttons out of the
  scroll container with inline sticky.
- GitBackupDialog: action buttons live inline per section, but
  the X close button in the header was scrolling away with the
  85vh content. Made the header sticky.
- Regression test against global.css text pins both the new
  scoped rule and the absence of sticky on the base
  `.dialog-footer` (so AppDialog and the regen sub-modal don't
  gain a top border).
- Commits: b545cf2, 39e3daa, dd15980

## 2. v0.22.1 release prep (15:42)

- 22 commits accumulated since v0.22.0 across the cycle.
- Patch release per SemVer: critical fix (tts_speed migration
  for users on the alembic-upgrade path), no breaking changes,
  several feat: commits but all backward-compatible.
- CHANGELOG entry split: Fixed (5) / Added (5) / Changed (2).
- "Action required" section in the release notes spells out
  `alembic upgrade head` for users who reached v0.22.0 without
  a fresh install.
- Version bumped in: backend/pyproject.toml, frontend/package.json,
  frontend/package-lock.json, backend/app/main.py (FastAPI title),
  install.sh, CLAUDE.md.

## 3. Pre-commit caught duplicate i18n keys (15:53)

- 2 duplicate keys per file across all 8 langs, introduced by
  the error-step work in commit e022c51:
  `error_retry` (line 1078 vs 1151) and
  `error_cancelled_server_side` (line 1071 vs 1151).
- PyYAML last-wins so the runtime was already using the second
  (better, accented) translation. Pre-commit's check-yaml uses
  ruamel which forbids duplicates.
- Resolution: drop the older entry, keep the better one. For
  fr+el `error_retry` the original was correct typographically
  (no accent), so the original was kept and the line-1151 dup
  removed; for `error_cancelled_server_side` the new entry was
  the better translation, so the older was removed.
- Commit: 6e7b274 (release commit, bundled fixup with the bumps)

## 4. CI mypy red after release commit (16:05)

- mypy: `app/routers/import_orchestrator.py:371: error:
  "ImportPlugin" has no attribute "execute_multi"`.
- Local pre-commit doesn't run mypy by default. CI runs it.
- Cause: `execute_multi` is an opt-in extension method on the
  ImportPlugin protocol (only multi-book handlers like .bgb
  implement it). The call site has a `hasattr(plugin,
  "execute_multi")` guard at runtime, but mypy can't follow
  conditional protocol attrs.
- Fix: `# type: ignore[attr-defined]` on the call line with a
  comment explaining the optional-protocol pattern.
- Adding `execute_multi` to the protocol would force every
  handler to implement it, defeating the opt-in design.
- Commit: 4a7d7c4

## 5. Tag retag + GitHub release published (16:11)

- v0.22.1 tag was cut at 6e7b274 (the broken-mypy commit). After
  the fix landed at 4a7d7c4, deleted + recreated the tag at HEAD
  via `git tag -d` + `git push origin :refs/tags/v0.22.1`. The
  tag had not been published as a release yet, so this was safe.
- GitHub release: https://github.com/astrapi69/bibliogon/releases/tag/v0.22.1
- Notes-file: CHANGELOG-v0.22.1.md.

## Stats

- 22 commits in v0.22.0..v0.22.1.
- Backend: 997 passing, 1 skipped (no count change vs v0.22.0).
- Frontend: 595 passing (up from 592 — +3 for the global.css
  sticky-footer regression test).
- Plugins: untouched in this cycle.
- Smoke + tsc + ruff + mypy + ruff format + pre-commit: all green.

## Lessons recorded

No new lessons-learned.md entries this cycle — every issue that
came up was already covered by an existing rule (caveman-mode,
release-cycle-dependency-review, etc.). The mypy/protocol
opt-in pattern is documented inline at the call site.
