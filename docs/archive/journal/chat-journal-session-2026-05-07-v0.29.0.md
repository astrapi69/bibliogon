# Session journal — 2026-05-07 — v0.29.0 release

Hygiene release. Audit-driven sweep that closed all five P1
coding-standards violations surfaced by a systematic audit at
HEAD `5671cde`, plus the deferred `@types/node` ^24 + tsconfig
ES2022 P2 follow-up that the audit's mechanical-cleanup commit
explicitly punted to a focused session. No user-facing behavior
change.

Most of the actual feature work for this release landed on `main`
between 2026-05-06 (post-v0.28.0 tag) and 2026-05-07 morning
across 11 commits. The release session itself was the cut: write
release notes, version bump + sync, run the mandatory pre-tag
chain, tag, push, GitHub release, post-release docs.

## 1. Release prep ({HH:MM ~09:14})

- Original prompt: "Cut v0.29.0 release. Per release-workflow.md,
  same pattern as v0.27.0 and v0.28.0."
- Goal: tag and ship v0.29.0 with the audit P1 cleanup + Vite 8 +
  uuid + tsconfig ES2022 work that had accumulated on main since
  v0.28.0.
- Result:
  - Captured state: 11 commits since v0.28.0; clean tree on main.
  - Baseline test counts: backend 1298, frontend 712 (+5 from
    v0.28.0's 707, all on the api.ai.testConnection() landing).
- Notes: no breaking changes, no env-var deprecations this cycle.
  Skipped the "Action required" section in the per-release notes
  per the user's brief.

## 2. Changelog drafted

- Goal: write the v0.29.0 entry in Bibliogon house style (prose
  with bold paragraph headers).
- Result:
  - `changelog/releases/v0.29.0.md` — full per-release notes
    with the static prerequisites template (Before you install /
    Download / Verifying downloads) plus the version-specific
    `What's new` body. Sections: Frontend toolchain modernized,
    Security hardening, Coding-standards cleanup (5 P1 audit
    findings closed), Toolchain alignment, Internal, Known
    limitations.
  - `docs/CHANGELOG.md` — same body, line-wrapped to ~64 cols
    matching the existing format. Inserted as the new top entry
    above the v0.28.0 section.
- Both files committed in `4a48263` (the version-bump commit).

## 3. Version bump + sync

- Hand-edit: `backend/pyproject.toml` 0.28.0 -> 0.29.0.
- `make sync-versions` propagated to 15 files: frontend
  package.json, launcher pyproject + spec plist + __init__.py,
  10 plugin pyprojects, install.sh + install.ps1 regenerated
  from templates.
- `make sync-versions-check` clean.
- `bash scripts/verify_version_pins.sh 0.29.0` clean (subsystem
  lock-step + no hardcoded literals in the "DO NOT EDIT" tier).

## 4. Mandatory pre-tag chain

All gates per release-workflow.md Step 5:

- `make test`: backend 1297 passed + 1 skipped, frontend 712
  passed.
- `cd frontend && npx tsc --noEmit`: clean (zero output).
- Vitest already covered by `make test`.
- `cd backend && poetry run ruff check app/`: All checks passed.
- `poetry run mypy app/`: Success: no issues found in 85 source
  files.
- `poetry run pre-commit run --all-files`: all hooks passed
  (trailing-whitespace, end-of-files, check-yaml, check-json,
  check-large-files, check-merge-conflicts, ruff legacy,
  ruff format, roadmap-archive-reminder).
- `npx playwright test --project=smoke` from `e2e/`: 190 passed,
  1 failed (`keywords-editor.spec.ts:72` double-click + Enter).
  Investigated: error context showed `addKeyword` had not yet
  rendered `keyword-chip-2` when the dblclick fired — page
  snapshot showed the dashboard fully loaded but the chip
  missing. Retried the single failing spec file in isolation:
  12/12 passed in 12.6s. Confirmed flake; v0.29.0 changes do
  not touch keywords-editor code paths. Effective smoke result:
  191/191.
- `cd launcher && poetry run pyinstaller bibliogon-launcher.spec
  --clean --noconfirm`: build complete; ELF binary at
  `launcher/dist/bibliogon-launcher`.

## 5. Tag and push

- Single commit `4a48263`: `chore(release): bump version to
  v0.29.0` (19 files, +212 / -18, including the new
  `changelog/releases/v0.29.0.md`).
- `git tag -a v0.29.0 -m "Release v0.29.0"` + `git push origin
  main` + `git push origin v0.29.0`. Pre-push hook ran
  `pre-commit --all-files` again as expected per
  CI-PRECOMMIT-HOOK-01; clean. Tag accepted by remote.

## 6. GitHub Release published

- `gh release create v0.29.0 --title "Bibliogon v0.29.0"
  --notes-file changelog/releases/v0.29.0.md`.
- URL: https://github.com/astrapi69/bibliogon/releases/tag/v0.29.0
- Launcher binaries are attached automatically by the
  `release: created` workflow gate (release-gate.yml +
  per-platform launcher build jobs).

## 7. Post-release documentation

- `docs/roadmap-archive/2026-05.md`: new `## Archived 2026-05-07`
  section above the existing 2026-05-06 entries. Single subsection
  `### v0.29.0 release — audit P1 cleanup + toolchain
  modernization` summarizing the five P1 closures, the toolchain
  alignment, the mechanical hygiene cleanup, the test-count
  delta, the smoke flake retry, and the GitHub release URL. No
  ROADMAP / backlog ID closures (the audit P1 cleanup was a
  direct sweep, not a tracked item; DEP-09 + SEC-01 were already
  archived 2026-05-06 because Vite 8 shipped on main between
  v0.28.0 and v0.29.0).
- `docs/ROADMAP.md`: `Last updated` 2026-05-06 -> 2026-05-07,
  `Latest release` line rewritten for v0.29.0.
- `docs/backlog.md`: `Last updated` line rewritten,
  `Current version` 0.28.0 -> 0.29.0.
- `CLAUDE.md`: `Version` line rewritten to summarize v0.29.0
  scope (audit P1 cleanup, Vite 8 + uuid, types-node + tsconfig).
- `docs/journal/chat-journal-session-2026-05-07-v0.29.0.md`:
  this file.

Final commit: `docs: post-release documentation for v0.29.0`.

## Summary

- Tag: v0.29.0 live at
  https://github.com/astrapi69/bibliogon/releases/tag/v0.29.0
- Commits since v0.28.0: 12 (11 feature commits on main +
  1 release commit `4a48263`).
- Main release commit: `4a48263 chore(release): bump version to
  v0.29.0`.
- Test counts: backend 1298 unchanged; frontend 707 -> 712 (+5);
  launcher 165 unchanged; smoke 191/191 (one flake retried
  clean).
- Pre-tag chain: all gates green on first run except the
  keywords-editor smoke flake which retried clean. Documented
  the flake in this journal so a recurrence (real regression vs.
  flake) can be discriminated.

## Followups surfaced (not done in this release)

- TipTap 3 (DEP-02) Path A vs Path B decision: still
  upstream-blocked on
  `@sereneinserenade/tiptap-search-and-replace@0.2.0`. Path A
  (default) is wait for the npm publish — next re-audit
  2026-06-02 via `make check-blockers`. Path B is the
  `prosemirror-search` adapter fallback (~50-80 LOC),
  available on demand and not yet authorized.
- D-06-VALIDATION-01: cross-platform installer scripts shipped
  with v0.28.0 are still un-validated on a fresh macOS user
  account or fresh Windows 11 install. Trigger: first user
  report or access to a clean test machine.
