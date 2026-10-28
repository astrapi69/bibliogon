# Lessons learned: Backend, data and configuration

Alembic, data dirs and test isolation, config overlays, plugins, backup.

Index of every entry: `.claude/rules/lessons-learned.md`. Moved here from that file unchanged (#1141).

## Alembic `fileConfig` silences every existing logger

`migrations/env.py` is generated from Alembic's template, which calls `fileConfig(config.config_file_name)` unconditionally. Two side effects burn time on the day your INFO logs stop appearing:

1. **`disable_existing_loggers=True` is the default.** Every `logging.Logger` created BEFORE `init_db()` (in our app: at least `app.main`'s module-level logger) is disabled. Subsequent `logger.info(...)` calls drop to the floor.
2. **The root logger level is reset** to whatever `[logger_root] level = ...` says in `alembic.ini` (`WARNING` in this repo). So even fresh loggers created after the call inherit the lower level.

**Symptom**: you see `Starting Bibliogon` (logged before `init_db()`), then alembic's own setup messages, then your subsequent INFO lines silently disappear. Plugin loading still WORKS — routes mount, the app responds — but the audit trail is dark. Burned several debugging hours on the v0.30.0+ medium-import session by treating "no plugin loading log = plugin not loading" as a true causal link.

**Fix**: in `migrations/env.py`, gate the `fileConfig` call so it only fires when the FastAPI app has not already configured logging:

```python
import logging
from logging.config import fileConfig
...
if config.config_file_name is not None and not logging.getLogger().handlers:
    fileConfig(config.config_file_name, disable_existing_loggers=False)
```

The standalone `alembic` CLI invokes env.py before any handler is attached (`logging.getLogger().handlers` is empty), so the guard preserves the documented CLI behaviour. Embedded use through `init_db()` runs under the FastAPI/uvicorn handler stack and skips the call.

**Generalises to**: any library that ships an env.py-style hook calling `fileConfig`/`dictConfig` at import time. Wrap the call in a "have handlers already?" check whenever the same module is imported in two contexts (CLI vs. embedded).

## Plugin settings YAML lives in `backend/config/plugins/`, not in the plugin's own directory

PluginForge reads each plugin's settings from the backend-wide `config_dir`, configured in `app.yaml` as `plugins.config_dir: config/plugins`. So the canonical path for a plugin's settings file is:

```
backend/config/plugins/{plugin_slug}.yaml
```

NOT `plugins/bibliogon-plugin-{slug}/config/{slug}.yaml`. The latter is fine for shipping the file inside the plugin's distributable ZIP, but at runtime PluginForge looks ONLY in the backend's config_dir.

**Symptom**: the plugin loads and activates, but `self._settings = self.config.get("settings", {})` returns an empty dict. User-visible settings silently fall back to in-code defaults; the YAML you wrote is never read. The startup log shows it as a single DEBUG line:

```
DEBUG  pluginforge.config: Config file not found, using empty defaults:
       backend/config/plugins/{slug}.yaml
```

That line has appeared in the wild for one shipped-without-defaults plugin (`medium-import` v1) and would have for any future plugin that follows the same wrong-place template.

**Mitigation**: when scaffolding a new plugin, drop the settings YAML directly into `backend/config/plugins/`. Mirror it inside the plugin's own `config/` only if the plugin's ZIP target needs it.

## Alembic migration + fresh test DB

- For every new Alembic migration that touches `books` (or another core table) via `ALTER TABLE`: the file `backend/bibliogon.db` MUST be deleted before the next `make test`. Otherwise you get `sqlite3.OperationalError: duplicate column name: ...`.
- Reason: `backend/tests/conftest.py` calls `Base.metadata.create_all(engine)` before every test and creates the tables with the NEW schema. At the same time the on-disk DB still has `alembic_version` pinned to the old revision. `TestClient(app)` triggers the lifespan `init_db()`, which runs `upgrade head` when tables + `alembic_version` both exist - which tries to add the new column via ALTER TABLE a second time and crashes.
- Permanent fix: `rm backend/bibliogon.db` after `git pull` with a new migration, then `make test`. `init_db()` now sees no tables, runs `create_all` + `stamp head`, and subsequent test runs pass because `alembic_version` is already at the new head.
- The clean solution would be a real in-memory test DB setup (e.g. via a `BIBLIOGON_TEST=1` env var) that skips `init_db()` in test mode - does not exist yet.

## Config migration (bool -> enum)

- When a boolean setting is extended to an enum with more options (e.g. audiobook `merge: true|false` -> `merge: separate|merged|both`): ALWAYS introduce a `normalize_*` function that silently translates old bool values (True -> "merged", False -> "separate") and maps unknown/None values to the default.
- Reason: user configs in YAML, backups (.bgb) and DB columns still contain old bool values. A hard schema validation would break existing installations. The default in the Pydantic schema is not checked for migration by the type system.
- In practice: the normalization MUST happen on both the backend (generator/service layer) AND the frontend (state init from settings), so both sides share the same migration rules. Otherwise old configs show the wrong default in the UI.
- Tests: one explicit migration test per bool value, plus pass-through for all enum values, plus default for None/unknown.

## Async in the FastAPI lifespan

- Inside the `async def lifespan(app)` handler the uvicorn event loop is already running. `asyncio.new_event_loop()` + `loop.run_until_complete(...)` is forbidden there and crashes with "Cannot run the event loop while another loop is running".
- When a helper like `sync_edge_tts_voices` needs to run a coroutine during startup: make the function `async` and `await` it in the lifespan, do NOT build your own loop.
- Symptoms when done wrong: `RuntimeWarning: coroutine '...' was never awaited` plus the loop conflict ERROR in the startup log.
- Other callers of the same function (CLI targets in the Makefile, sync FastAPI endpoints) have to follow along: `asyncio.run(...)` in the CLI, `async def` + `await` in endpoints.

## Deployment

- Default port: 7880 (not 8080, too often taken).
- /api/test/reset ONLY in debug mode (BIBLIOGON_DEBUG=true).
- CORS configurable via BIBLIOGON_CORS_ORIGINS (not hardcoded).
- SQLite path configurable with Docker volume persistence.
- BIBLIOGON_SECRET_KEY is auto-generated by start.sh when not set.
- Non-root user in the Dockerfile.

## Licensing

### license_tier attribute
- PluginForge's BasePlugin is an external PyPI package - do NOT modify. Instead set `license_tier` as a class attribute directly on the plugin classes.
- `_check_license` in main.py reads `getattr(plugin, "license_tier", "core")` - the default is "core" (backward-compatible).

### Trial keys
- Trial keys use `plugin="*"` as a wildcard in the payload. `LicensePayload.matches_plugin()` must treat `"*"` explicitly as match-all.
- Trial keys are stored under the key `"*"` in `licenses.json`, not under the plugin name.
- Expiry: always use `date.today()` (UTC), not `datetime.now()`. `date.fromisoformat()` expects the "YYYY-MM-DD" format.
- `_check_license` must check both the per-plugin key and the wildcard key (fallback chain).

### Settings UI
- The `discoveredPlugins` API delivers `license_tier` and `has_license` per plugin. Currently all plugins are free (`license_tier = "core"`). The Licenses tab has been removed from Settings.

## Code structure

### Avoid God Methods
- Route handlers longer than 50 lines must be decomposed.
- Typical symptom: if/elif cascades for different formats/types in one handler.
- Solution: ExportContext dataclass + one function per format group + testable helper functions.
- Every extracted function must be testable without reconstructing the whole request context.
- See coding-standards.md "Function design" for the correct pattern.

### Testability as a design criterion
- If a function is hard to test (lots of mocking needed), that is a signal of bad design.
- Service functions must have no FastAPI dependencies (no Request, no Response, no Depends).
- Helper functions (validate_format, build_filename, detect_manual_toc) must be callable with simple parameters.
- Data classes (dataclass, TypedDict) instead of loose dicts for context between functions.

### Error-handling mistakes we made
- HTTPException thrown directly from services. Makes services untestable without a FastAPI context. Solution: our own exception hierarchy (BibliogonError).
- Bare `except Exception: pass` in plugin code. Errors vanish silently. Solution: catch specific exceptions, at least log them.
- External tool errors (Pandoc subprocess.CalledProcessError) passed up unwrapped. The user sees a cryptic error message. Solution: ExternalServiceError with a clear service name.
- Frontend: API calls without catch. User clicks "Export" and nothing happens. Solution: always try/catch with toast feedback and finally for the loading state.

### Error reporting rules
- Error details must make a GitHub Issue directly actionable, without follow-up questions.
- Chain: BibliogonError (detail + str(e)) -> API response (detail + traceback in debug mode) -> frontend ApiError -> toast with "Report issue" button -> GitHub Issue (title, stacktrace, browser, app version).
- EVERY except block MUST call logger.error() with exc_info=True.
- EVERY except block MUST include str(e) in the BibliogonError subclass (NOT HTTPException).
- EVERY frontend catch block MUST call toast.error() with the ApiError object, NOT just with a string.
- Generic error messages like "Export failed" or "Import failed" without details are FORBIDDEN. They make GitHub Issues worthless.
- File upload functions (fetch instead of request()) must throw ApiError on failure, not Error.
- The global exception handler in main.py logs every unhandled error with its stacktrace.
- In debug mode the backend response includes the stacktrace (for the "Report issue" button).

## Plugin settings: visible or INTERNAL, never hidden

Plugin settings are either UI-visible (user-relevant) or marked `# INTERNAL` (YAML-only). Hidden active settings that influence user behavior are a bug, because the user has no way to change the behavior without a YAML editor and repo access.

Dead settings (in the YAML but not read by the code) are just as bad: they are a lie to the user. When refactoring a plugin, always check whether old YAML fields are still consumed before leaving them in place.

Generic plugin settings panel on the frontend: renders booleans as a checkbox, numbers as a number input, strings as a text input, arrays as an OrderedListEditor, objects as a JSON textarea with an "Advanced" hint. Rendering a boolean as a text input (`value="true"`) is a UX bug because the user cannot tell it is a switch.

Configuration values that vary between books MUST live on the Book model, NOT in the plugin YAML. Plugin YAML is plugin-global and applies to all books at once - anyone who needs per-book granularity adds a column (see the pattern on `Book.audiobook_overwrite_existing`).

## Diagnostic features must fail open

- Diagnostic and convenience features should fail open. A feature that prevents bad behavior (double-launch, stale cache, etc.) must not block the application's primary function when it fails. Crashing the app because a convenience check crashed is always worse than silently skipping the convenience check.
- Concrete example: the launcher's lockfile check (`another_instance_alive`) crashed with `TypeError: argument of type 'NoneType' is not iterable` because `tasklist` returned `stdout=None` on a Windows locale edge case. This prevented every user from starting the launcher at all. The fix: wrap in try/except that fails open (log warning, proceed).
- This applies beyond lockfiles. Any startup check, guard, or health probe that gates the main application flow should be wrapped so that a failure in the check degrades gracefully rather than killing the app.

- Shallow clone update trap: `git clone --depth 1 --branch v0.7.0` creates a repo where `origin/main` does not exist as a remote ref. A later `git fetch origin` does not fix this because the fetch refspec was configured for the tag, not for branch tracking. `git checkout -B main origin/main` then fails with "pathspec 'main' did not match". The fix is to not try to update shallow clones in place at all. Delete and re-clone (backing up .env first) is the only reliable cross-platform approach. Surgical git state repair across shallow clone versions, platforms, and git implementations is a losing battle.

## Filesystem isolation: production data lives outside the project tree

Production Bibliogon data NEVER lives in the project tree. All paths resolve via `app.paths` helpers (`get_data_dir`, `get_config_dir`, `get_cache_dir`, `get_upload_dir`, `get_db_path`) which use platformdirs (XDG-conformant) by default and respect a `BIBLIOGON_DATA_DIR` (etc.) env-var override. Resolution is **always** via fresh function calls, never via frozen module-level imports.

Default locations (Phase 2 swap, 2026-05-04):

- Linux/macOS: `~/.local/share/bibliogon/`
- Windows: `%LOCALAPPDATA%\bibliogon\`
- Tests: a `tmp_path_factory`-managed dir, set by `backend/tests/conftest.py` before any `app.*` import
- Docker: `/app/data/` via `BIBLIOGON_DATA_DIR=/app/data` in compose, mounted as the named `bibliogon-data` volume

Three layers of protection prevent test runs from touching production data:

1. **Production marker file**. Production directories contain a `.bibliogon-production` marker (written by the FastAPI lifespan via `app.paths.mark_data_dir_as_production`). If tests ever see one, the entire run aborts with `pytest.exit(returncode=2)`.
2. **Test conftest sets `BIBLIOGON_DATA_DIR`** to a tmp dir before any `app.*` import. The autouse session fixture also asserts the resolved path looks like a tmp location.
3. **All path access via helpers**, never via CWD-relative `Path("foo")` and never via frozen module-level imports.

**Forbidden patterns:**

- `UPLOAD_DIR = Path("uploads")` at module top level
- `from app.routers.assets import UPLOAD_DIR` (frozen import)
- `Path("data") / "X"` anywhere in production code

**Required pattern:**

- `upload_dir = get_upload_dir()` inside the function that uses it.

If `make test` aborts with exit code 2, check what path was mounted via `BIBLIOGON_DATA_DIR`. NEVER delete the marker just to make the test pass; investigate why a test pointed at production. Origin: April 2026 data-loss incident — DB tripwire landed in `a4cf7cf`, filesystem tripwire + paths.py in the same period.

### Phase 2 migration

Users with v0.25.0-and-earlier data in the project tree (`backend/bibliogon.db`, `backend/uploads/`) get auto-migrated on first start after the platformdirs swap. Helper: `app.data_dir_migration.migrate_data_dir_if_needed`, run from the FastAPI lifespan BEFORE `init_db()`. Properties:

- Idempotent (`.migration-complete` marker short-circuits)
- Fail-loud on conflict (RuntimeError if both legacy and target hold the same item; silent merge would corrupt data)
- Breadcrumb at old paths (`.migrated-YYYY-MM-DD` file beside each moved item)
- Skipped in test mode (`BIBLIOGON_TEST=1`)

Rule: when adding a new persistent path under `get_data_dir()`, also add it to `_legacy_paths()` in `data_dir_migration.py` if a v0.25.0-and-earlier code path could have written to a different location. Otherwise users lose data on the next upgrade.

## User-overlay merge semantics + migration discipline for config-version changes

When a config-overlay system uses "lists replace, dicts deep-
merge" semantics (the broadly-correct default for letting users
fully override specific values without losing other defaults),
**list-shaped fields that grow over a release lifecycle silently
filter out their new additions for upgrading users**. The fix is
NOT to change the merge semantics globally — that breaks the
contract for users who deliberately curated a shorter list. The
fix is a STARTUP-TIME MIGRATION that augments the user-overlay's
copy of the list with project-tree additions, respecting any
explicit opt-out signal.

### Concrete incident (2026-05-18, USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01)

Bibliogon's `backend/config/app.yaml` ships with a
`plugins.enabled` list that grew from 11 → 12 entries when
plugin-comics landed in v0.35.1. Existing users had a stale
user-overlay at `~/.local/share/bibliogon/config/app.yaml` (or
`/app/data/config/app.yaml` in the Docker prod named volume)
written under the v0.35.0 schema with 11 entries. The
`deep_merge` (lists replace) silently took the user-overlay's
11-entry list, filtered comics out, and the running backend's
plugin manager never activated it. Symptom: `/api/comics/info`
returned HTTP 404 against the live backend even though pytest
with TestClient passed (because pytest's `conftest.py` sets
`BIBLIOGON_DATA_DIR` to a fresh tmpdir, so no user-overlay
file existed during tests → migration was trivially no-op,
merge fell through to the full project list → comics activated).

### Pattern

For any list-shaped configuration value that:

1. ships with a project-tree default,
2. can be overridden by a user-overlay,
3. **grows** over the application's release lifecycle (new
   plugins, new endpoints, new feature-flags, new keyboard
   shortcuts, etc.),
4. has an explicit OPT-OUT mechanism (e.g. a sibling `disabled`
   list, or a `null` / `false` value for individual entries):

ship a **detect-and-append migration helper** that runs at
application startup. The helper:

- reads the project-tree's list AND the user-overlay's list,
- computes the set difference (project minus user, minus
  explicit-opt-out),
- if non-empty, atomically appends the new entries to the
  user-overlay's list and writes it back,
- logs the migration (per-name) at INFO level,
- refreshes any module-level snapshots that depend on the
  merged config,
- is **idempotent**: a second run with no diff is a no-op
  + no disk write.

### Test palette for this pattern (3 tiers)

Each tier catches a different class of regression. Ship ALL
THREE per the same commit that lands the migration code:

1. **Unit tests** for the migration helper as a pure function.
   Seed project + user inputs, assert the returned tuple +
   the disk state. Cover the canonical paths (append, in-sync
   no-op, opt-out respected, malformed-input graceful-no-op,
   idempotent second run, fresh-install no-op).
2. **Integration test** via TestClient + lifespan. Seed a
   stale user-overlay file in the conftest's data dir, refresh
   the application's startup snapshot, boot the app, assert
   the migration ran by checking BOTH the disk state AND the
   plugin/config-manager's internal state (NOT the HTTP layer
   — see below for the FastAPI route-mount-stickiness
   caveat).
3. **Live-dev E2E smoke** via Playwright (or curl-against-
   running-server). Seeds a stale user-overlay on the real
   filesystem, restarts the dev server, asserts the
   feature-that-was-silently-invisible is now reachable.
   Sister to PLUGIN-COMICS-E2E-SMOKE-01.

### FastAPI route-mount stickiness — DON'T assert via HTTP

FastAPI's `app.include_router(...)` is **one-directional**.
There's no `app.exclude_router(...)`. Once a plugin's router
is mounted in one TestClient lifespan, it stays mounted for
the entire pytest session — even after `manager.deactivate_all()`
runs at shutdown. Consequence: a test that asserts "comics
plugin opt-out works because /api/comics/info returns 404"
will FAIL falsely if a prior test in the same session
activated comics + mounted its router.

For the lifespan integration tests, assert on:
- `manager.get_active_plugins()` set (the manager-level
  contract — does pluginforge's `filter_plugins` include this
  plugin?)
- `manager._app_config["plugins"]["enabled"]` + `disabled`
  contents (does the merged config reflect the user-overlay?)
- the disk state of the user-overlay file (did the migration
  persist correctly?)

Reserve HTTP-layer assertions for tests that POSITIVELY
exercise the route (after activation), NOT for tests that
verify opt-out (where the route's persistence from prior
mounts will confound the test).

### Sync the manager AFTER the migration writes

The same lifespan ordering bug bit twice during this work:

1. The plugin manager is initialized at module-import time
   with a cached `_app_config` snapshot.
2. The first `_sync_manager_with_overlay()` runs at module-
   import time. At that moment, the user-overlay file may not
   exist yet (fresh install).
3. The migration runs INSIDE the lifespan, AFTER module-
   import. It writes to the user-overlay file.
4. **Without a second `_sync_manager_with_overlay()` call
   AFTER the migration**, the manager's `_app_config` still
   has the pre-migration view. `discover_plugins()` reads
   `_app_config` and filters per the stale list.

The fix is a SECOND sync immediately after the migration
helper runs, unconditional (covers both the migration-wrote
and migration-no-op cases; the second case is cheap because
the overlay didn't change).

### Why "change the merge semantics globally" is wrong

The instinct is to make `plugins.enabled` a UNION (project ∪
user). Don't. Today's contract — "user-overlay enabled list
replaces the project-tree's" — lets a user deliberately curate
a SHORTER list and have ONLY those plugins active. Changing
the merge silently expands their list every release. The
migration is the right shape because it's a one-time-per-
new-plugin event that respects the user's explicit opt-out
signal.

### Why "one-shot CLI" is wrong

A `bibliogon plugins sync-enabled` command works, but the
user discovers the bug FIRST (the 404, the missing feature),
THEN reads the release note that mentions the CLI. The
startup-time migration closes the loop without user
intervention. Reserve the CLI shape for migrations that
require user input or are too risky to auto-apply.

### When this rule fires

Any future config-version change that adds a new entry to a
list-shaped field with the "lists replace" merge contract.
Concrete candidates already in Bibliogon's config:

- `plugins.enabled` — closed by this incident's fix.
- `plugins.disabled` — same shape; the migration as written
  doesn't touch disabled. A user pre-emptively opting out of
  a not-yet-shipped plugin would be unusual but conceivable;
  the disabled-list-additions case has no observed need yet.
- `ui.themes` — currently project-tree only; if user-overlay
  customization ever lands, the same pattern applies.
- `donations.channels` — project-tree only today; same.

When adding a new list-shaped config field that may grow
across releases, walk this rule and decide whether a
migration helper is needed at design time, NOT at first-bug
time.

### Cross-references

- `backend/app/config_overlay.py::migrate_user_overlay_enabled_list`
  — the canonical implementation.
- `backend/tests/test_config_overlay.py` — 9 unit cases.
- `backend/tests/test_user_overlay_migration_lifespan.py` —
  4 integration cases.
- `e2e/smoke/user-overlay-migration.spec.ts` — live-dev smoke.
- `docs/archive/roadmap/2026-05.md` —
  "Archived 2026-05-18 (USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01)"
  for the close-out artifact.

## Single-Router-Per-Plugin convention

Filed 2026-05-20 from the halted Comics-Session-2 Pre-Inspection.
Bibliogon plugins MUST return ONE FastAPI router from
``BasePlugin.get_routes()``, NOT a list of separate sibling
routers. Nesting via ``router.include_router(sub_router)`` is the
right shape for plugins that need multiple route namespaces.

### Concrete instance

Comics-Session-2's original C2 design specified three sibling
routers returned from ``ComicsPlugin.get_routes()``:

- ``info_router`` (prefix ``/comics``) — Session-1's
  ``GET /info``
- ``panels_router`` (prefix ``/books``) — Session-2 panel CRUD
- ``bubbles_router`` (prefix ``/books``) — Session-2 bubble CRUD

The full backend pytest sweep failed with
``RecursionError: maximum recursion depth exceeded`` during
``TestClient.wait_startup``. Refactoring to a SINGLE
``info_router`` that internally calls
``include_router(panels_router)`` + ``include_router(bubbles_router)``
restored most of the sweep (recovered 14 of 27 failures and 154
of 167 errors). The remaining failures were the
``PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01`` underlying issue,
which is a separate filing — but the three-router shape made
the regression visible 14x sooner.

### Why this is the right convention

1. **Per-lifespan FastAPI route registration is one-directional**
   (per the existing "FastAPI route-mount stickiness" rule in
   this file). Each plugin's get_routes() result is mounted via
   ``app.include_router(...)`` PER ROUTER returned. Plugin
   deactivation logs the deactivation but the FastAPI app
   retains the routes. ``N routers × M test lifespans`` is the
   per-router multiplier; reducing N to 1 cuts the accumulated
   route-registry state by Nx.

2. **Kinderbuch precedent** — the canonical picture-book plugin
   ships ONE router (``pages.py``'s router; the plugin's
   ``get_routes()`` returns ``[router]``). 11 other shipped
   plugins follow the same shape. Comics was the outlier in
   specifying three.

3. **Sub-routers nest cleanly** via FastAPI's
   ``include_router``. Each sub-router carries its own prefix +
   tags + dependencies; the top-level router stays composable
   without flattening.

### Mitigation rule for Pre-Inspection

When specifying new plugin route structure, Pre-Inspection MUST
include an explicit Pattern-Audit step:

```bash
# Grep existing plugin patterns BEFORE specifying the new one.
for plug in plugins/bibliogon-plugin-*/; do
  name=$(basename "$plug" | sed 's/bibliogon-plugin-//')
  echo "--- $name ---"
  grep -nE 'get_routes|return\s*\[' \
    "$plug"/bibliogon_*/plugin.py 2>/dev/null | head -5
done
```

If the existing convention is "1 router per plugin", new
plugins MUST follow it. Deviating requires explicit user
adjudication BEFORE the Pre-Inspection commits to a design.

### Generalises to

- New plugin authors' first-instinct "I have 3 logical
  namespaces so I'll return 3 routers" — wrong; nest them.
- Architectural-decision documents specifying plugin structure
  without grepping existing plugins for conventions — wrong;
  Pattern-Audit step is mandatory.
- Any time a Pre-Inspection notes "matches the kinderbuch
  pattern" or "follows existing convention" without an explicit
  grep step — surface the grep result, don't trust prose
  references.

### Concrete artifact

- Refactor commit: ``2ffaed8`` (Comics-Session-2 C2 — restored
  single-router shape during the same commit that introduced
  the issue, after the failed sweep surfaced it).
- Backlog filing: ``PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01``
  (P1) — the underlying state-accumulation bug that the
  three-router shape exposed.

### Pairs with

- "FastAPI route-mount stickiness — DON'T assert via HTTP"
  (this file) — explains the per-lifespan accumulation that
  makes the N-router shape problematic.
- "Pre-Coding-Reality-Check: re-audit at the keystroke, not
  just the audit" (this file) — Pattern-Audit step would have
  caught this BEFORE the C2 commit, not during it.
- ``coding-standards.md`` Recurring-Component-Unification Rule
  — same family of "look at what already exists before adding
  parallel shapes" discipline.

## CRUD shipping: List endpoint is non-optional

Filed 2026-05-20 from Comics-Session-2 C6
Pre-Coding-Reality-Check surfacing.

Comics-Session-2 C2 (commit ``2ffaed8``) shipped bubble-CRUD as
**Create + Update + Delete** with NO **List** endpoint. The gap
was invisible during C2's own test sweep — the 8 dispatch tests
that exercise the routes all targeted Create / Update / Delete
paths; List was never called because no test needed it. Three
commits later (C6, this session), the frontend full editor's
``ComicPanelGrid`` needed a way to populate
``panelBubblesMap`` and the gap surfaced as the **first
integration-issue stop-condition** in the C6 Pre-Coding-Reality-
Check.

### Rule

When shipping a "CRUD" set of endpoints, **List is mandatory**,
even when the immediate consumer is a frontend that doesn't yet
exist. The acronym is not a buffet — "CUD" is purgatory waiting
to surface (per the existing "Half-wired feature lifecycle"
rule).

Concrete: any commit subject of the form
``feat(X): N CRUD endpoints + tests`` MUST register all four
verbs (Create, Read-list, Update, Delete) on its primary
resource. Read-by-id can be deferred when ergonomic — usually
inferable from a per-resource patch round-trip — but Read-list
is the load-bearing one a consumer needs to populate any UI
that displays the resource set.

### Detection during Pre-Inspection

When the next session's editor / page / dashboard / consumer-of-
the-resource starts, the **Pre-Coding-Reality-Check MUST grep
the existing routes for a list endpoint** before assuming the
read path is wired. Recipe:

```bash
# For a resource shipped at /api/.../{resource}:
grep -rn '@router\.\(get\|post\|patch\|delete\)' \
  plugins/<plugin>/ backend/app/routers/ \
  --include='*.py' | grep <resource>
```

If only ``@router.post``, ``@router.patch``, and
``@router.delete`` show up — surface as Half-Wired-Lifecycle
closure before the consumer ships. The C6 Pre-Coding-Reality-
Check caught this same-session and added the missing List
endpoint atomically.

### Concrete artefact

- Gap: C2 (commit ``2ffaed8``) shipped 3 of 4 verbs for
  ``comic_bubbles``
- Surface: C6 Pre-Coding-Reality-Check (this session)
- Fix: ``GET /api/books/{book_id}/comic-panels/{panel_id}/bubbles``
  added in C6 commit ``a33baf3`` with 4 paired pytest cases
  (``TestComicBubbleList``) covering empty-state, position-
  ordered, 400-on-non-comic-book, and 404-on-unknown-panel.

### Pairs with

- "Half-wired feature lifecycle" (this file) — same family.
  The CRUD-missing-List shape is a special case of state-write-
  without-state-consumer where the consumer is a future UI that
  hasn't shipped yet.
- "Pre-Coding-Reality-Check: re-audit at the keystroke" (this
  file) — the discipline that catches this specific class.
- "Pre-Inspection MUST audit all callers of a touched endpoint"
  (this file) — producer-side analogue to caller-coverage.

## A security property that only holds while an optional plugin is enabled is not held

Filed 2026-10-09 (#988), found while writing the regression pin rather than the fix.

Imported HTML lands in `Chapter.content` as HTML and stays HTML until someone
opens and saves the chapter in the editor (#787). The first four end-to-end
tests for the style filter went GREEN before the filter existed - the stored
chapter carried no `style` attribute at all. The reason is three layers away
from the import path: ms-tools' `content_pre_import` hook calls its sanitizer,
whose `_strip_style_attributes` removes EVERY style attribute as part of a
Word-cruft cleanup. The attribute was gone before `md_to_html` ever saw it.

That stripping is real and it is load-bearing in practice, but it holds only
while:

- the ms-tools plugin is in `plugins.enabled`,
- its `auto_sanitize_on_import` setting is true (it defaults to true, and the
  Settings UI can turn it off), and
- the hook does not raise (`sanitize_import_markdown` logs and returns the
  original content on any exception).

Each of those is a legitimate user configuration. With the plugin off, the
imported `position: fixed` and `background-image: url(https://…)` were in the
stored chapter on every one of the four paths - which is what the reds showed
once the test stubbed the hook to the identity.

### The rule

When a test for a security property passes before the fix, do not conclude the
property holds. Find WHAT makes it pass, and ask whether that thing is part of
the contract or a side effect. A side effect in an optional, user-disablable,
fail-open component is not a control: it is a coincidence that currently has
the same shape as one. The control belongs in the core path, where no setting
can switch it off; the side effect may stay as the broader cleanup it was
written to be.

Concretely, the test must be written against the configuration the finding is
about. Stubbing the optional layer out is not weakening the test - it is the
only way the test observes the layer it claims to cover. State the reason at
the stub, or the next reader removes it as noise.

### Corollary for a filter written as a regex over an attribute value

Both bypasses below were in the first draft of the same filter and neither was
caught by the four end-to-end tests, because python-markdown passes raw HTML
through verbatim and the attribute simply did not match:

- `(?P<quote>["'])(?P<value>[^"']*)(?P=quote)` excludes BOTH quotes from the
  value, so `style="font-family: 'Arial'; position: fixed"` does not match at
  all - and an attribute that does not match is an attribute that ships
  unfiltered. Make the value class quote-type-specific: `"([^"]*)"` or
  `'([^']*)'`.
- HTML allows an unquoted value. `style=position:fixed` is valid markup and
  needs its own alternative (`[^\s>"']+`), re-emitted quoted.

A filter that fails open on an input it does not recognise inverts the usual
"diagnostic features must fail open" rule. For a security filter the default
is the opposite: if the shape is unfamiliar, it must still be handled, and the
test set needs one case per accepted shape - not one case per shape you
happened to write first.

## A write path that enumerates fields diverges from the read path that does not

Filed 2026-10-10 from #1076 and #1078, found an hour apart in the same
audit and sharing one shape: the thing that READS an entity takes the whole
row, the thing that WRITES it names the fields one by one, and the list goes
stale silently because nothing compares the two.

**#1076, at the API boundary.** `ArticleOut` and `BookOut` returned
`featured_image_prompt`, `inline_image_prompts`, `cover_image_prompt` and
`chapter_summaries`; `ArticleUpdate` and `BookUpdate` never listed them.
Pydantic's default `extra="ignore"` makes that silent in the worst way - the
PATCH returns 200 and writes nothing. Two AI endpoints wrote the columns by
mutating the ORM row directly, so the columns looked alive.

**#1078, at the restore boundary.** The client backup exports the whole row
(`BackupBook.book` is a `Book`), and `bookCreateFrom` restores ten fields of
fifty-two. Every ISBN, every ASIN, the whole KDP marketing block and the
entire audiobook configuration are in the bundle and dropped on the way back
in.

### Why neither was caught

In both cases a test existed and passed, because it tested the fields the
list already had. The backup case is sharper: `backup-roundtrip.spec.ts` DOES
assert `isbn_ebook` and `keywords` survive - against `/api/backup/export`,
the BACKEND path, which is introspection-driven and therefore complete. The
client path has its own gate, `backup-acceptance.spec.ts`, whose header
promises to "verify EVERY entity is back" and which does exactly that, by
entity. Not one of the dropped fields is set before its export, so not one
can be missed after its import.

So the rule is not "write more field assertions". It is:

- **Compare key SETS, not values.** A test that asserts `title`, `author`
  and `keywords` survived grows stale the day column fifty-three lands. A
  test that takes a fully-populated row, round-trips it, and compares
  `Object.keys` minus a named drop-list covers every future column on the
  day it is added. The drop-list is the only thing a new column can require
  a human to touch, and only when the column is genuinely derived.
- **Prefer a key-drop to a key-list wherever the shapes are meant to
  match.** `Omit<Book, "id" | "created_at" | ...>` says what must NOT travel
  and lets everything else through; `Pick` says what may, and silently keeps
  saying it after the entity has moved on. This is the same reasoning the
  backend's `.bgb` `serialize_row` / `restore_row` already followed, which
  is why the backend path has none of these holes.
- **When one layer enumerates and another does not, measure the gap rather
  than assuming it.** Twelve lines of Python comparing `BookOut`'s fields to
  `BookUpdate`'s turned "are there other missing columns?" from a worry into
  a list: after #1076 the answer is `id`, `book_type`, `created_at`,
  `updated_at` - all deliberate. The same measurement is worth running
  whenever a new `*Out` / `*Update` pair or a new restore path appears.

### Detection

```bash
# API: fields a read model exposes that its update model will not accept.
python3 - <<'PY'
import re, pathlib
s = pathlib.Path("backend/app/schemas/__init__.py").read_text()
def fields(name):
    m = re.search(rf"^class {name}\(BaseModel\):\n(.*?)(?=^class )", s, re.S | re.M)
    return re.findall(r"^    ([a-z_][a-z0-9_]*)\s*:", m.group(1), re.M)
for out, upd in (("BookOut", "BookUpdate"), ("ArticleOut", "ArticleUpdate")):
    print(out, "->", upd, ":", [f for f in fields(out) if f not in fields(upd)])
PY
```

Every name that comes back is either derived (correct, and belongs in a
documented drop-list) or a column the API can show and not change. There is
no third category.
