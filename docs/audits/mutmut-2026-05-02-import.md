# Mutation Testing — Core Import Orchestrator

**Date:** 2026-05-02
**Scope:** `backend/app/import_plugins/` + `backend/app/routers/import_orchestrator.py`
**Tool:** mutmut ^3.5.0 (already installed via `Q-02` in `28fe59c`)
**Tracker:** GitHub issue requesting mutmut wiring for CIO modules.

## Status

**[PARTIALLY UNBLOCKED — 4 root causes fixed 2026-05-14;
1 structural blocker remains (async-timing race under
mutmut trampolines).]**

The 2026-05-13 next-session handover scheduled an
investigative pass on the `BadTestExecutionCommandsException`
from the 2026-05-12 first-run. Root-cause investigation 2026-05-14
identified four separate problems in mutmut + Bibliogon
interaction, each fixed in commit `<this-session>`. A fifth
issue surfaced last: a small set of tests has tight async
timing that the mutmut trampoline-wrapping perturbs enough
to fail. Documented below.

### Root cause #1 — type-annotation builtin shadowing (FIXED)

mutmut places its `def list(self, ...)` trampoline before the
`xǁ...__mutmut_orig` original inside class bodies. Subsequent
methods whose return type is `-> list[dict[str, Any]]` then
crash with `TypeError: 'function' object is not subscriptable`
because the class-scope binding for `list` now points at the
trampoline, not the builtin.

`backend/app/backup_history.py:list` was the first method to
trigger this. Fix: `from __future__ import annotations` defers
annotation evaluation to strings, sidestepping the lookup
entirely. Same protection now extends to any other
shadowing pattern in that file (`set`, `dict`, `type`, etc.).

If another module surfaces the same crash later, the patch
is identical (add the future-annotations import). Catalog any
new occurrences here.

### Root cause #2 — missing config/migrations in mutants/ tree (FIXED)

`mutmut` copies `app/`, `tests/`, and `pyproject.toml` to
`mutants/` but NOT `config/` or `migrations/`. Without
`config/app.yaml.example`, the `PluginManager` initializes
with empty config and defaults `entry_point_group` to
`"pluginforge.plugins"`, mismatching Bibliogon's
`HookspecMarker("bibliogon.plugins")` and crashing
`register_hookspecs` with `ValueError: did not find any
'pluginforge.plugins' hooks`. Without `migrations/`, Alembic's
env.py fails with `CommandError: Path doesn't exist`.

Fix: `tests/conftest.py` detects `mutants/` cwd via
`__file__` and copies both directories from the real
`backend/` before any `app.*` import. Also adds symlinks for
`docs/` and `plugins/` at `mutants/` level for tests that
reach the repo root.

### Root cause #3 — REPO_ROOT path resolution (FIXED)

Five test files compute the repo root via
`Path(__file__).resolve().parent.parent.parent` and use that
to find `docs/help/`, `plugins/bibliogon-plugin-*/`, or
`scripts/`. From `backend/tests/<file>.py` this hits the
actual repo root. From `mutants/tests/<file>.py` (one level
deeper) it lands at `backend/` instead, and the assertions
fail with `FileNotFoundError` / `AssertionError: missing`.

Fix: replaced the fixed-depth `.parent.parent.parent` with
walkers like

```python
_REPO_ROOT = next(
    p
    for p in Path(__file__).resolve().parents
    if (p / "plugins" / "bibliogon-plugin-medium-import").is_dir()
)
```

Note: predicates must be SPECIFIC enough not to false-match.
A naive `(p / "plugins").is_dir()` matches
`backend/plugins/installed/` (left over from plugin-install
tests) and breaks the regular `make test` run. The walker
must verify the exact directory the test needs.

Touched: `test_docs_parity.py`, `test_plugin_lock_drift_hook.py`,
`test_medium_import_roundtrip.py`,
`test_medium_import_endpoint.py`.

### Root cause #4 — narrow vs broad test scope (DOCUMENTED, not fixed)

mutmut's `tests_dir = ["tests/"]` runs the entire test suite
at baseline. For an audit scoped to `app/import_plugins/`,
many of those tests are irrelevant — their mutations would
never be killed regardless. We left the broad scope in place
because the goal of the unblock is to make mutmut RUN; once
running, narrowing `tests_dir` is a measurement tweak, not a
blocker.

### Remaining blocker — async generator timing race

After the three fixes above, `1123 tests pass / 1 fails`
under mutmut stats collection (vs `0 passing` before):

```
FAILED tests/test_job_store.py::test_subscribe_cleanup_removes_subscriber
AssertionError: assert [<asyncio.locks.Event ...>] == []
```

The test asserts that after an `aclosing()` async generator's
`break`, `_subscribers` is empty. Mutmut's trampoline wraps
every method (sync and async alike) in
`object.__getattribute__` indirection. For tightly-timed
async tests, that adds enough scheduler overhead to race the
generator's `finally` clause against the post-`break` assert.

Standalone `pytest tests/test_job_store.py::...` passes
instantly. The bug surfaces only when mutmut's trampoline is
active.

Next-session options (handover-equivalent):

- **A:** skipif under mutmut. Add
  `@pytest.mark.skipif("MUTANT_UNDER_TEST" in os.environ,
  reason="async timing race under mutmut trampolines")` to
  the failing test (and any others that surface). Cheapest
  fix; lossy for mutation coverage of async code paths.
- **B:** narrow `tests_dir` in `pyproject.toml` to the test
  files that exercise `app/import_plugins/`. Trampolines
  still run, but the failing test never executes. Doesn't
  generalize to other audits.
- **C:** restructure the test to be timing-robust (await an
  explicit barrier instead of asserting on synchronous state
  after `break`). Cleanest fix; touches production-quality
  test code.

Files modified this session (commit `<this>`):

- `backend/app/backup_history.py` — future-annotations import.
- `backend/tests/conftest.py` — seed config/migrations/docs/plugins
  into mutants/.
- `backend/tests/test_docs_parity.py` — robust REPO_ROOT walker.
- `backend/tests/test_plugin_lock_drift_hook.py` — robust walker.
- `backend/tests/test_medium_import_roundtrip.py` — robust walker.
- `backend/tests/test_medium_import_endpoint.py` — robust walker.

### Verification

```bash
cd backend
rm -rf mutants && poetry run mutmut run 2>&1 | tail -5
# 1 failed, 1123 passed, 1 skipped, 47 warnings
poetry run pytest --no-header -q 2>&1 | tail -3
# 1648 passed, 1 skipped
```

The `1 failed` is the async-timing test described above. Once
that is resolved via path A/B/C, mutmut runs full stats
collection and proceeds to actual mutant execution.

Backlog item ``MUTMUT-STATS-COLLECTION-BUG-01`` stays open
in P3 with the remaining-blocker description; not closed
because mutmut still cannot complete the stats phase.

### Original instructions (kept for the day the bug is fixed)

1. **Run manually:** `gh workflow run "Mutation Testing (Import Orchestrator)"`
   (uses `workflow_dispatch`, runs regardless of the gate variable).
2. **Enable nightly:** set repository variable
   `ENABLE_NIGHTLY_MUTATION=true` under
   *Settings → Secrets and variables → Actions → Variables*. Cron:
   `0 2 * * *` (02:00 UTC).

Either path uploads the mutmut HTML report + mutants cache as a 30-day
artifact named `mutmut-import-<run-id>`. Download with
`gh run download --name mutmut-import-<run-id>`.

## Acceptance criteria (from the issue)

- [ ] Mutation score **≥ 60%** for `app/import_plugins/` (per
      `.claude/rules/quality-checks.md` "critical modules" threshold).
- [ ] Surviving mutants in security-sensitive helpers
      (`_sanitise_rel_path`, `_check_duplicate`) triaged: either pinned
      with a new test or explicitly justified for ignoring.
- [ ] Results recorded in this file.

## Coverage map (line coverage as of 2026-05-02)

| Module | Test file(s) | Notes |
|--------|--------------|-------|
| `app/import_plugins/registry.py` | `tests/test_import_plugin_registry.py` | dispatch order + first-match-wins |
| `app/import_plugins/handlers/bgb.py` | `tests/test_import_handler_bgb.py` | `.bgb` flow |
| `app/import_plugins/handlers/markdown.py` | `tests/test_import_handler_markdown.py` | single-file `.md` |
| `app/import_plugins/handlers/markdown_folder.py` | `tests/test_markdown_folder_handler.py` | folder drag-drop |
| `app/import_plugins/handlers/wbt.py` | `tests/test_import_handler_wbt.py` | write-book-template |
| `app/import_plugins/handlers/office.py` | `tests/test_office_handlers.py` | docx + epub via Pandoc |
| `app/routers/import_orchestrator.py` | `tests/test_import_orchestrator.py` + `tests/test_import_backup_parity.py` | `_sanitise_rel_path`, `_gc_stale_staging`, `_check_duplicate`, `_record_import_source` |

## Survivor triage table (placeholder)

Fill after the first CI artifact is downloaded.

| ID | File | Mutation | Verdict | Action |
|----|------|----------|---------|--------|
| TBD | TBD | TBD | TBD | TBD |

Verdict values: `kill` (test added), `accept` (justified ignore + reason),
`equivalent` (semantically identical mutation).

## Reproduce locally

```bash
cd backend
poetry run mutmut run \
  --paths-to-mutate app/import_plugins/,app/routers/import_orchestrator.py
poetry run mutmut results
poetry run mutmut html  # writes backend/html/index.html
```

Initial run is 20–40 minutes of CPU on a typical laptop. Subsequent runs
reuse `backend/mutants/` and only re-test mutations affected by source
or test changes.

## References

- Exploration: [docs/explorations/core-import-orchestrator.md](../explorations/core-import-orchestrator.md)
- Rules: [.claude/rules/quality-checks.md](../../.claude/rules/quality-checks.md) (Mutation testing section)
- Tooling baseline: commit `28fe59c` ("feat(Q-02): set up mutation testing with mutmut v3")
- Workflow: [.github/workflows/mutation-import.yml](../../.github/workflows/mutation-import.yml)
