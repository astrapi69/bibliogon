# Mutation Testing — Core Import Orchestrator

**Date:** 2026-05-02
**Scope:** `backend/app/import_plugins/` + `backend/app/routers/import_orchestrator.py`
**Tool:** mutmut ^3.5.0 (already installed via `Q-02` in `28fe59c`)
**Tracker:** GitHub issue requesting mutmut wiring for CIO modules.

## Status

**[TBD — pending first CI run.]**

The nightly workflow `.github/workflows/mutation-import.yml` is now wired
but is **OFF by default**. To produce the first numbers, either:

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
