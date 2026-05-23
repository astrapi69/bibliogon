# Session 2026-05-13 — PROD-WRITES-ARCHITECTURE-01

Post-handover follow-up after the v0.31.0 ship + 3 P3 closures.
The handover doc named PROD-WRITES-ARCHITECTURE-01 as one of two
top candidates ("clean refactor, 2-4 hours"); picked it because
the architecture was already defined (existing
`_load_app_config` merge mechanism + secrets-overlay precedent)
and the alternative (MUTMUT-STATS-COLLECTION-BUG-01) carried
rabbit-hole risk.

## 1. Baseline + scope (18:23)

- `make test` green: 1626 backend + 929 Vitest.
- Surveyed write sites: 10+ in `settings.py` (`_base_dir /
  "config" / "app.yaml"` + `.../plugins/{name}.yaml`), 4 in
  `plugin_install.py` (extracted `plugin.yaml` copy +
  `_enable_plugin_in_config` + uninstall mirror).
- Read pluginforge internals to understand
  `_config_dir`-relative loading; confirmed Bibliogon's
  PluginManager points at `backend/config/` for i18n + plugin
  configs. Plan: leave pluginforge integration unchanged, layer
  a user-overlay on top, sync `manager._app_config` after each
  write.

## 2. Design (18:38)

Settled on the simplest viable architecture that didn't require
moving i18n or subclassing PluginManager:

- Project layer: existing `backend/config/` (read-only at
  runtime).
- User-overlay layer: `get_data_dir() / "config"` (writable —
  same data-dir family as the v0.31.0 Phase 2 fixes for
  `backup_history.json` and `plugins/installed/`).
- Read: deep-merge project + user-overlay (lists replace, dicts
  merge — same semantics as the secrets-overlay).
- Write: target user-overlay ONLY.
- ruamel round-trip path (`load_*_for_edit`) preserves the
  `# INTERNAL` comments + quote styles the v0.27.x roundtrip
  regression-pin already protects.
- `manager._app_config` patched at startup and after every
  write so plugin discovery sees the merged view without a
  backend restart.

## 3. Implementation (19:00–19:10)

- New `backend/app/config_overlay.py`: 232 lines of merge
  helpers + ruamel-round-trip "load for edit" path + path
  isolation invariants. Tests-friendly: includes a
  `set_project_config_dir(...)` setter so per-test fixtures
  can collapse the two layers onto a single tmp dir.
- `backend/app/routers/settings.py` rewritten to use overlay
  helpers; removed unused `yaml` + `read_yaml_roundtrip` /
  `write_yaml_roundtrip` direct imports; added a
  `_refresh_manager_app_config()` helper that runs after every
  write.
- `backend/app/routers/plugin_install.py`: ZIP install copies
  `plugin.yaml` to overlay; `_enable_plugin_in_config` and
  uninstall paths mutate overlay; mirrors of
  `_refresh_manager_app_config()` in this module too.
- `backend/app/main.py`: `_load_app_config()` extended to a
  four-layer merge (project → user-overlay → secrets-override
  → env-vars); new module-level `_sync_manager_with_overlay()`
  patches `manager._app_config` immediately after construction
  so the very first `discover_plugins()` sees the user's prior
  Settings changes.

## 4. Tests (19:13)

- 22 new tests in `backend/tests/test_config_overlay.py` pin:
  merge precedence (user wins, lists replace), the
  "writes-never-touch-the-project-tree" invariant, comment-
  preserving round-trip, deletion + listing semantics,
  `get_user_config_dir()` re-resolving via `BIBLIOGON_DATA_DIR`.
- Updated test fixtures in `test_settings_api.py`,
  `test_plugin_install.py`, `test_ai_config_refresh.py`,
  `test_config_loader.py` to point both layers at
  `temp_base / "config"` via
  `config_overlay.set_project_config_dir` +
  `monkeypatch.setenv("BIBLIOGON_DATA_DIR", ...)`. The
  `test_config_loader.project_yaml` fixture in particular
  needed BIBLIOGON_DATA_DIR isolation — without it the
  user-overlay from earlier session-scope tests was leaking
  `ai.api_key = ""` and overriding the project's
  `from-project` seed.

## 5. Verification (19:14–19:16)

- `poetry run pytest`: 1648 backend (was 1626; +22 from new
  overlay tests), 1 skipped.
- `poetry run ruff check app/`: clean.
- `poetry run mypy app/`: clean (after adding
  `isinstance(loaded, dict)` narrowing on the
  `load_*_for_edit` returns).
- `poetry run pre-commit run --all-files`: clean
  (`ruff format` reformatted 2 files in the first pass; second
  pass clean).

## 6. Docs (19:17)

- `docs/roadmap-archive/2026-05.md`: full archive entry per
  the continuous-archival rule.
- `docs/backlog.md`: removed P3 entry + decremented open-task
  count (26 → 25).
- This journal entry.

## What changed in the user-visible behavior

In production Docker: nothing observable. The prod Dockerfile's
`USER bibliogon` + `chown -R bibliogon:bibliogon /app` makes
both `/app/config/` (legacy write target) and `/app/data/config/`
(new write target) writable. Reads still see the user's prior
settings via the merge layer.

In dev Docker (`./backend:/app` bind mount with host UID):
Settings UI changes + plugin install / uninstall now succeed
instead of crashing with PermissionError. Writes land in the
container user's writable `/app/data/config/` instead of the
read-only bind-mounted `/app/config/`.

On bare metal (no Docker): writes now land in
`~/.local/share/bibliogon/config/` on Linux / macOS or
`%LOCALAPPDATA%\bibliogon\config\` on Windows, instead of
`backend/config/`. Existing `backend/config/app.yaml` content
keeps working as the bottom layer of the merge; no data
migration on upgrade.

## End-of-session stats

- Commits: 1 (squashed).
- Tests: 1626 → 1648 backend (+22).
- Files added: `backend/app/config_overlay.py`,
  `backend/tests/test_config_overlay.py`,
  `docs/journal/chat-journal-session-2026-05-13-prod-writes.md`.
- Files modified: `backend/app/main.py`,
  `backend/app/routers/settings.py`,
  `backend/app/routers/plugin_install.py`, 4 test fixture
  files, `docs/backlog.md`,
  `docs/roadmap-archive/2026-05.md`.

## Remaining P3 after this close

`docs/backlog.md` P3 now lists 7 items (was 8):
`I18N-NATIVE-REVIEW-V031-01` (waits on native speakers),
`MUTMUT-STATS-COLLECTION-BUG-01` (investigative),
`BIBLIOGON-DATA-FIX-FRAMEWORK-01` (waits on 5th one-shot),
`D-06-VALIDATION-01`, `PGS-05-FU-01`,
`AR-BULK-SERIES-HIERARCHY-01`, `I18N-DIACRITICS-01`. ROADMAP
P3 still has its `AR-01 validation log` pointer.

Next session candidates: the same MUTMUT investigation the
handover called out, or wait-for-trigger on user-facing P2
items. None urgent.
