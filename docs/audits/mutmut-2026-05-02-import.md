# Mutation Testing — Core Import Orchestrator

**Date:** 2026-05-02
**Scope:** `backend/app/import_plugins/` + `backend/app/routers/import_orchestrator.py`
**Tool:** mutmut ^3.5.0 (already installed via `Q-02` in `28fe59c`)
**Tracker:** GitHub issue requesting mutmut wiring for CIO modules.

## Status

**[BLOCKED — mutmut stats-collection fails on Bibliogon's
test harness, surfaced 2026-05-12.]**

The nightly workflow `.github/workflows/mutation-import.yml`
was wired on 2026-05-02 but never triggered manually. The
test-infrastructure audit (2026-05-12) ran the workflow via
`workflow_dispatch` for the first time. The job completed in
1m12s — too fast for a real mutation run — because mutmut
errored during its initial `run_stats_collection` phase:

```
mutmut.__main__.BadTestExecutionCommandsException:
Failed to run pytest with args:
['--rootdir=.', '--tb=native', '-x', '-q', 'tests/'].
```

**Reproducible locally:** ``cd backend && poetry run mutmut run``
fails with the same exception. Crucially, running the exact
pytest invocation manually
(``poetry run pytest --rootdir=. --tb=native -x -q tests/``)
succeeds with 1601 passed / 1 skipped / 2:26. So the failure
is inside mutmut's stats-collection plugin
(``mutmut.__main__.runner.run_stats``), not in pytest itself.

The artifact uploaded from run 25735467415 is a partial
mutants/ tree with `.meta` files that have `null` exit codes
across the board — confirming mutmut never executed any
mutants. Triage table below stays empty until the underlying
mutmut/Bibliogon-pytest interaction is fixed.

### What this means for the audit data point

The test-infrastructure audit asked: "is mutation testing
valuable for Bibliogon at our scale?" The answer requires
mutmut to RUN. It currently doesn't. So the audit's data
point is: **mutmut is wired but operationally blocked.**
Whether the underlying bug is in mutmut's stats-collection
plugin, the way it interacts with our autouse session-scope
``_verify_test_isolation`` tripwire, or something else
entirely, is unknown without a deeper local investigation.

Filed as backlog item ``MUTMUT-STATS-COLLECTION-BUG-01``
(P3) with the failing-args reproducer.

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
