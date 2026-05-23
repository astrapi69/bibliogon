# Session journal — 2026-05-07 — v0.30.0 release

Cut v0.30.0. Minor SemVer bump. The release covers 28 commits
since v0.29.0 (the bulk of which landed in the post-v0.29.0
docs+i18n session and the EL/ES/FR i18n self-validation
corrections that immediately followed).

The session also covered two pre-release housekeeping items
ahead of the cut: a dependency currency sweep and a
retrospective document.

## 1. Dependency sweep (3 commits)

- Original prompt: "Proceed with the dependency sweep first."
- Goal: pull patch + minor + low-risk minor dependency bumps
  per the documented release-cycle cadence; defer majors per
  the "major bumps get their own dedicated session" rule.
- Result:
  - `a7cee7d` backend + 10 plugins: fastapi 0.135 → 0.136
    lock-step across 11 pyprojects, uvicorn 0.44 → 0.46,
    python-multipart 0.0.26 → 0.0.27, ruamel-yaml 0.18 →
    0.19; in-range patches via `poetry update` for pydantic /
    pydantic-core / gitpython / ruff.
  - `0a9cfd3` frontend (lockfile-only): dompurify, jsdom,
    lucide-react, react, react-dom, react-router-dom, vite,
    xstate.
  - `08a47ab` launcher (lockfile-only): pyinstaller 6.19 →
    6.20.
  - Deferred majors documented inline in each commit message:
    cryptography 46 → 48, elevenlabs 0.2 → 2.x (DEP-05),
    mypy 1.20 → 2.0, pillow 11 → 12 in launcher,
    `@types/node` ^24 → ^25, `@vitejs/plugin-react` 5 → 6,
    all `@tiptap/*` 2.27 → 3.22 (DEP-02 blocked).

## 2. Pre-v0.30.0 retrospective

- Goal: reflection-not-action document covering the v0.27.0
  → HEAD period before v0.30.0 locks it in.
- Result: `docs/journal/retrospective-pre-v0.30.0.md` (commit
  `c378d19`). 6 sections: what shipped / what worked / what
  struggled / what changed in approach / open patterns to
  watch / concrete commitments. Five commitments each with
  what / why / how-enforced / failure-mode-if-abandoned.
- Most uncomfortable finding surfaced: `mkdocs build --strict`
  does not actually fail on orphan pages (the "not included
  in nav configuration" message is INFO-level, so `--strict`
  ignores it). Two pages slipped past `--strict` for two
  release cycles before the docs+i18n drift audit caught
  them. Commitment recorded to extend the verify chain with
  a `grep -v` filter on the build output.

## 3. v0.30.0 release cut

- Original prompt: "yes ready for release v0.30.0, follow the
  release flow we defined".
- Goal: cut v0.30.0 per release-workflow.md with the
  MANDATORY pre-tag verify chain green.
- Result:
  - State capture: 28 commits since v0.29.0; 57 files
    (+3889/-787); current version 0.29.0.
  - SemVer: minor bump v0.29.0 → v0.30.0. The
    `BIBLIOGON_DB_PATH` removal in step 3 of DEP-DBPATH-01
    is breaking-style, but with a 2-release deprecation
    runway (v0.27.0 warning + v0.28.0 precedence flip),
    so it sits under "Action required" rather than
    triggering a major bump per the 0.x-phase convention
    in release-workflow.md.
  - CHANGELOG entry written (Bibliogon house style, prose
    paragraphs with bold headers); per-release notes file at
    `changelog/releases/v0.30.0.md`.
  - Version bump: hand-edited `backend/pyproject.toml`,
    propagated by `make sync-versions` (15 files: frontend
    package.json, launcher pyproject + spec plist +
    `__init__.py`, 10 plugin pyprojects, install.sh +
    install.ps1 regenerated from templates).
  - Verification: `make sync-versions-check` clean,
    `verify_version_pins.sh 0.30.0` clean.
  - Pre-tag verify chain: `make test` green (backend
    1298+1 skipped, frontend 712, plugins green), `tsc
    --noEmit` clean, `ruff check app/` + `mypy app/`
    clean, `pre-commit run --all-files` clean,
    `playwright --project=smoke` 189 passed + 2 flakes
    (retried clean in isolation: keywords-editor and
    import-flows; v0.30.0 changes do not touch those
    code paths; effective 191/191), launcher pyinstaller
    smoke build clean.
  - Tag: `be4b6f3 chore(release): bump version to v0.30.0`
    + `git tag -a v0.30.0` + push main + push tag.
  - GitHub release: `gh release create v0.30.0
    --notes-file changelog/releases/v0.30.0.md`.
    Published at
    https://github.com/astrapi69/bibliogon/releases/tag/v0.30.0.

## 4. Post-release documentation

- `CLAUDE.md`: Version line rewritten to summarize v0.30.0
  scope (8-language launcher i18n, DEP-DBPATH cycle close,
  5 new help pages, plugin dev guide refresh, pre-release
  dep sweep, retro).
- `docs/ROADMAP.md`: Last updated 2026-05-07 (v0.30.0 cut);
  Latest release line rewritten.
- `docs/backlog.md`: Last updated note rewritten; Current
  version 0.29.0 → 0.30.0.
- `docs/roadmap-archive/2026-05.md`: new "Archived
  2026-05-07 (v0.30.0 release)" section above the existing
  step-3 + post-release-docs entries summarizing the
  release scope, verify-chain results, backlog deltas, and
  GitHub release URL.
- `docs/journal/chat-journal-session-2026-05-07-v0.30.0.md`:
  this file.

Final commit: `docs: post-release documentation for v0.30.0`.

## Summary

- Tag: v0.30.0 live at
  https://github.com/astrapi69/bibliogon/releases/tag/v0.30.0
- Commits since v0.29.0: 28 feature/dep commits + 1 release
  commit + 1 post-release docs commit (this) = 30 commits
  for the v0.29.0 → v0.30.0 cycle.
- Main release commit: `be4b6f3 chore(release): bump version
  to v0.30.0`.
- Test counts: backend 1278 → 1299 (+21); frontend 688 →
  712 (+24); launcher 147 → 196 (+49: i18n parity
  dominates); smoke 188 → 191 (+3 from bulk-export). 117
  new tests for the v0.27.0 → v0.30.0 period.
- Pre-tag chain: all gates green on first run except 2
  smoke flakes (keywords-editor, import-flows) which
  retried clean. The chain held its no-mechanical-CI-gate
  regression streak that has been intact since the
  v0.26.0..v0.26.3 hotfix cluster.

## Followups surfaced (from the retrospective + the release)

- TipTap 3 (DEP-02): fourth release with the upstream wait
  unaddressed. Next re-audit 2026-06-02. Path B
  (`prosemirror-search` adapter, ~50-80 LOC) available on
  explicit user authorization.
- D-06-VALIDATION-01: cross-platform installer scripts shipped
  in v0.28.0 still un-validated on a fresh macOS user account
  / fresh Windows 11 install. Trigger: first user report or
  access to a clean test machine.
- LAUNCHER-I18N-NATIVE-REVIEW-01 (new in this cycle): pt /
  tr / ja launcher catalogs ship with `_meta.review_status`
  markers awaiting native-speaker validation. 3-month
  threshold (2026-08-07) per the retro for explicit
  decision: drop-the-marker (accept as canonical) vs.
  continue-waiting.
- mkdocs `--strict` orphan-page gate: retro-surfaced. The
  build log "not included in nav" message is INFO-level,
  so `--strict` ignores it. Commitment recorded; one-line
  `grep -v` filter to be added to the docs/build target
  in the next docs-touching commit.
