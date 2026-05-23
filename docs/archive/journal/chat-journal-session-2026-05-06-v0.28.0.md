# Chat journal — 2026-05-06 — v0.28.0

Same day as v0.27.0 ship. The five feat: commits from the
preceding session (`7595ee4`, `2b45654`, `ca83e8f`, `38af8a1`,
`ae76e12`) had been queued for the next minor cut; this session
runs the release.

## 1. Check-blockers application (12:53)

- Original prompt: "Update backlog + ROADMAP per check-blockers
  output. Two distinct changes: 1. DEP-09 + SEC-01: move from
  BLOCKED to active P3. ..."
- Optimized prompt: same shape; the user's instruction was
  already structured as a numbered list of edits.
- Goal: reflect that `vite-plugin-pwa@1.3.0` cleared the upstream
  block on both DEP-09 (Vite 8 upgrade) and SEC-01 (the
  `workbox-build` -> `@rollup/plugin-terser` ->
  `serialize-javascript` CVE chain). DEP-02 + DEP-05 keep
  blocking.
- Result: ROADMAP P3 grows from 2 to 4 items (DEP-09, SEC-01
  added with unblock note + caution); Blocked tier shrinks from
  4 to 2; backlog cross-reference echoes the new locations;
  Blocked table drops the two unblocked rows.
- Commit: `4f266b5`.

## 2. CI red on the chore commit (11:58 push, ~12:01 fail)

- Original prompt: "ci is red"
- Optimized prompt: "Find what failed on the push and fix it
  before tagging."
- Goal: identify the failure mode and decide whether it blocks
  v0.28.0.
- Investigation: `gh run view 25433870873 --log-failed` showed
  two `test_books_bulk_export.py::TestZipShape` cases failing
  with `FileNotFoundError: [Errno 2] No such file or directory:
  'pandoc'`. Pandoc is not installed on the GHA runner. The
  AR-BULK-BOOKS-PARITY-01 commit added two real-Pandoc tests; the
  guard inside them only caught the in-process 502 / 422 paths
  (`PandocError` / `MissingImagesError`), not the `FileNotFound`
  raised when the binary is missing entirely. Unhandled
  `FileNotFoundError` surfaces as a 500 and trips
  `assert resp.status_code == 200`.
- Fix pattern already in repo:
  `test_article_export.py` uses
  `PANDOC_AVAILABLE = shutil.which("pandoc") is not None` at
  module scope plus `@pytest.mark.skipif(not PANDOC_AVAILABLE,
  reason="pandoc binary not installed")` on the affected tests.
  Applied the same to `TestZipShape` (the validation +
  unknown-id classes don't invoke Pandoc; they keep running).
- Verified locally with `pytest tests/test_books_bulk_export.py
  -v`: 6 passed (Pandoc IS installed locally, so neither test
  was actually skipped here; CI will skip 2 of 1298 collected).
- Result: commit `d381e64`, push, CI run 25434409926 turned
  green at 2m05s.

## 3. v0.28.0 release flow (12:14)

- Original prompt: "Cut v0.28.0 release as you recommended.
  Per release-workflow.md: ..." with explicit instructions on
  CHANGELOG sections, Action-required wording, version-bump
  flow, mandatory pre-tag chain, and post-release archival
  steps.
- Optimized prompt: same shape; user-supplied. Useful that the
  prompt named the Action-required text up front.
- Goal: cut v0.28.0 with the five queued feat: commits + the CI
  test fix.
- Steps:
  1. Drafted `changelog/releases/v0.28.0.md` with the prerequisites
     + download blocks per the static template, then a What's
     new prose section per the v0.27.0 house style, an Internal
     section, Known limitations.
  2. Mirrored the entry into `docs/CHANGELOG.md` (the per-release
     file gets prerequisites/download; the CHANGELOG gets the
     same prose without those blocks).
  3. Hand-edited `backend/pyproject.toml` 0.27.0 -> 0.28.0.
  4. `make sync-versions` propagated to 15 files (14 pyproject /
     `__init__.py` / spec / package.json + `install.sh` +
     `install.ps1` regenerated from templates).
  5. `make sync-versions-check` and `verify_version_pins.sh
     0.28.0` both green.
  6. External-dep check: `manuscripta@0.9.0` and
     `pluginforge@0.5.0` are still the latest stable on PyPI;
     no manual bump needed.
  7. Mandatory pre-tag chain — all green:
     - `make test`: backend 1297 passed + 1 pre-existing skip;
       all plugin suites pass; frontend 707 passed.
     - `npx tsc --noEmit`: clean (no output).
     - `ruff check app/`: All checks passed.
     - `mypy app/`: Success: no issues found in 85 source files.
     - `pre-commit run --all-files`: every hook passed.
     - `npx playwright test --project=smoke`: 191 passed (2.4
       min).
     - `pyinstaller bibliogon-launcher.spec --clean --noconfirm`:
       built `dist/bibliogon-launcher` ELF binary.
  8. Commit `6073593` ("chore(release): bump version to v0.28.0";
     19 files, +259 / -18). Tag `v0.28.0`. Pushed main + tag —
     pre-push hook ran `pre-commit` clean before allowing the
     tag push.
  9. `gh release create v0.28.0 --title "Bibliogon v0.28.0"
     --notes-file changelog/releases/v0.28.0.md` — published at
     https://github.com/astrapi69/bibliogon/releases/tag/v0.28.0.

## 4. Post-release archival

- Five P3/P4 items moved from awaiting-archive to
  `docs/roadmap-archive/2026-05.md` under the existing
  `Archived 2026-05-06` section: DEP-DBPATH-01 step 2, D-06,
  AR-BULK-PLAYWRIGHT-SMOKE-01, LAUNCHER-I18N-EXTRACT-01,
  AR-BULK-BOOKS-PARITY-01.
- New entry captured: `D-06-VALIDATION-01` (P3) — fresh-machine
  validation of the unsigned installer scripts on macOS + Win
  11. Trigger: first user report or test machine access.
- Backlog header counts: 12 active -> 9 active; 2 BLOCKED
  unchanged.
- ROADMAP latest-release line updated to v0.28.0 with a one-
  line summary of the major content.
- CLAUDE.md Version block rewritten with the v0.28.0 summary.

## Summary

- Tag: v0.28.0 live at
  https://github.com/astrapi69/bibliogon/releases/tag/v0.28.0
- Commits in this session: `4f266b5` (chore: backlog unblock),
  `d381e64` (fix: CI pandoc skip), `6073593`
  (chore(release): bump). Plus the post-release docs commit at
  the end.
- Test counts at tag: backend 1298 (1297 pass + 1 skip locally;
  CI: 1296 pass + 2 pandoc skips + the same pre-existing skip).
  Frontend 707. Launcher 165. Smoke 191.
- Files touched in the release commit: 19 (+259 / -18).
- Pre-push hook validated end-to-end (second clean run since
  CI-PRECOMMIT-HOOK-01 shipped in v0.27.0).
- CI failure caught and fixed before tagging — the test that
  passed locally because of a pandoc binary on disk was the
  same shape as test_article_export's pre-existing skipif
  pattern; reusing it kept the diff small.
