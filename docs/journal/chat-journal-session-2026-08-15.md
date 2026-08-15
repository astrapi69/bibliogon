# Session journal - 2026-08-15

## Field bug: 502 on every request - data-dir migration boot crash-loop (#715)

- Original prompt: an auto-generated in-app bug report ("Konnte Artikelliste
  nicht laden", GET /api/articles -> 502, v0.59.0) pasted into the session.
- Triage path: 502 on ALL endpoints (incl. `/api/settings/app`) + earlier
  `Failed to fetch` = backend down behind a live proxy, not an articles bug.
  Local inspection found the `make dev` uvicorn reloader alive but port 8000
  unbound; the lifespan raised
  `RuntimeError: Cannot migrate plugins/installed: both legacy and target paths exist`.
- Root cause chain: `plugin_install.configure()` ran at module import and
  eagerly `mkdir`ed `<data_dir>/plugins/installed`; the data-dir migration ran
  later in the lifespan, saw legacy `backend/plugins/installed` content plus
  the just-created empty target dir, and treated it as a both-sides-have-data
  conflict. Deterministic crash-loop on every boot for any setup with legacy
  installed-plugin content and a fresh data dir.
- Data-loss scare resolved: the "working" morning session in the report had
  been served by the Playwright E2E backend (`/tmp/bibliogon-e2e-data/e2e.db`,
  port 8000); `~/.local/share/bibliogon` had never been populated on this
  machine. No user data lost.

### What shipped (PR #715, squash `c1ead8bc`)

1. **`data_dir_migration`** - empty dirs count as absent on both sides: an
   empty legacy dir has nothing to move, an empty target dir is removed before
   the move. Genuine both-have-content conflicts still fail loud. 3 new pytest
   regression cases (field case, conflict-still-raises, empty-legacy).
2. **`plugin_install.configure()`** - eager mkdir removed (all consumers guard
   for a missing dir; `_extract_plugin` creates on demand).
3. **`main._load_installed_plugins()`** - sys.path seeding now scans the
   canonical `get_installed_plugins_dir()` (data dir) with the legacy
   project-tree path as fallback; previously ZIP-installed plugins silently
   stopped loading after a successful migration.
4. **Makefile `dev`** - polls `/api/health` up to 30s and aborts with exit 1
   instead of printing "Backend ready." over a dead backend.
- Verification: `make test-backend` 2771 passed; the crash-looping live dev
  instance healed itself via `--reload` (migration moved the legacy
  `kinderbuch` plugin, planted the marker, health 200 through Vite).

## Branch sweep

- 188 provably merged remote branches deleted (103 tip-merged into develop,
  85 with a MERGED PR / squash-merged), verified against `gh pr list` state;
  62 local branches cleaned. Kept: `feature/ccw-ghpages-deploy` (37 unmerged
  commits), 2 old claude session branches with unmerged commits,
  `docs/explorations-status-audit-2026-06-17` (1 unmerged docs commit).

## Tooling

- **PR #716** (`9bd1d349`): `make pre-commit` target wrapping the all-files
  hook run - doubles as the auto-fix entry point (ruff --fix, ruff-format,
  whitespace, EOF).
- pre-commit hooks were not installed in this checkout (commits bypassed
  them; CI caught a ruff-format nit on #715). `pre-commit install` run;
  the same gap explains why the v0.59.0 release commit shipped plugin
  pyproject bumps without lock pairing.

## Release v0.60.0 (tagged + published 2026-08-15)

- The **boot-resilience + PWA-update-flow + release-automation** release;
  15 commits since v0.59.0. SemVer: minor (feat #697/#700).
- First release cut with the new orchestration (`release-prepare` /
  `release-finish` / `release-publish`, #686/#688). Notes at
  `changelog/releases/v0.60.0.md`; GitHub release
  https://github.com/astrapi69/bibliogon/releases/tag/v0.60.0.
- Gates: `make release-test` green (incl. theme 132 contrast checks +
  launcher PyInstaller build), `make release-build` green, Playwright smoke
  **614 passed / 0 failures** (2 flaky passed on retry, 2 skipped; includes
  the BACKUP-AKZEPTANZTEST cycle), static smoke 7 passed. Aster confirmed the
  tag gate in chat before `release-finish`.
- README (EN+DE) now documents the preview web app
  (astrapi69.github.io/bibliogon-preview/) - added pre-tag on user request.

### Deviations (documented per release-workflow "Note for Claude Code")

- **`plugin-lock-paired-with-pyproject` hook skipped for the prepare commit**,
  with evidence instead of trust: `make lock-all-plugins` re-locked all 13
  plugins and left 12 locks byte-identical (a version-field-only pyproject
  change does not affect the lock content-hash under Poetry 2.4); the one
  genuine drift it surfaced (git-sync's own path-dep version frozen at 0.35.1
  since ~v0.35) was fixed and staged in the same commit.
  `make verify-plugin-locks` green. The hook demands staging the lock, which
  is impossible when the re-locked file is byte-identical.
- **Step 4b routine dependency bumps deferred**: `make release-outdated`
  showed only within-major minors (vite 8.2.1, react 19.2.8, prettier 3.9.6,
  ...); not bundled into the release to keep it focused on the field fix.
  Majors remain tracked in ROADMAP "Blocked / Upstream Wait".
- **Step 9 Docker registry push**: not active in this project (launcher
  builds from the local repo); skipped as designed.

### Post-release state

- Launcher binary builds (Windows/macOS/Linux) + Pages/preview/docs deploys
  triggered automatically; release-gate ran on the tag.
- Next per priority: `GH-ACTIONS-PERIODIC-AUDIT-01` (quarterly CI audit,
  due 2026-08-14, now overdue) and the P2 tails (EVT-05/06, export-metadata
  consumers, multi-agent coordination decisions).
