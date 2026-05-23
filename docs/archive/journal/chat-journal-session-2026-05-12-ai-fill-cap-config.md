# Session journal - 2026-05-12 - AI-FILL-CAP-CONFIG-01

Single-task session promoting the second UNIVERSAL-AI-TEMPLATE
Session 2 follow-up from P5 to active work.

## Context

UNIVERSAL-AI-TEMPLATE-01 Session 1 (backend) shipped bulk AI-fill
and bulk AI-template export/import with hardcoded caps of 50 items
per batch. Session 2 filed `AI-FILL-CAP-CONFIG-01` under P5 with the
rationale "hardcoded per S8 to keep the surface small until real
usage data justifies the configuration; power-users who need higher
caps can edit the constants in their fork." This session promoted
it so power-users no longer need a fork — they edit
``backend/config/app.yaml``.

## Survey

- Original prompt: `push and proceed with next AI-FILL-CAP-CONFIG-01`
- Push: `git push origin main` (846de1f..d9439b4)
- Existing caps:
  - `MAX_BULK_AI_FILL = 50` in
    `backend/app/routers/ai_template_bulk_fill.py`
    (applied via Pydantic `Field(max_length=...)` on
    `_BulkFillRequest.ids`, surfaces as 422 on overflow)
  - `MAX_BULK_AI_TEMPLATE = 50` in
    `backend/app/routers/ai_template_bulk.py`
    (applied via Pydantic on `_BulkExportRequest.ids` AND an
    inline check in the ZIP-import handler for "ZIP contains
    N templates; cap is N" phrasing)
- AI config flows: `backend/config/app.yaml` → `app.main._load_app_config`
  (three-layer chain: project YAML < user override < env-vars)
  → `app.ai.routes._get_ai_config()`.
- Existing config-driven helpers in the same file:
  `_get_rate_limit_seconds` reads `ai.rate_limit_seconds`,
  `_get_configured_model` reads `ai.model`. Same pattern fits
  the caps.

## Design decisions

1. **Where the caps live**: under `ai.bulk` (not `ai.max_*`)
   because the keys are operationally related ("don't AI-fill
   1000 articles in one go") and grouping them keeps the YAML
   readable. Marked `# INTERNAL` per the existing rule for
   settings without a Settings UI.
2. **Pydantic vs handler check**: dropped the Pydantic
   `Field(max_length=...)` constraint entirely. Pydantic field
   constraints are class-time literals and can't reference
   runtime config. Replaced with a handler-side
   `_enforce_bulk_ai_*_cap(len(ids))` that raises HTTPException
   422 with the cap surfaced in the error detail. Tests that
   relied on 422 for oversize requests still pass — the status
   code is unchanged.
3. **Safe defaults**: non-int / zero / negative / None values
   in YAML fall back to `DEFAULT_MAX_BULK_AI_FILL = 50` and
   `DEFAULT_MAX_BULK_AI_TEMPLATE = 50` via `_coerce_positive_int`.
   A typo like `max_ai_fill: "fifty"` must not silently shrink
   the cap to 0; it returns the default. This is the same
   pattern already used by `_get_rate_limit_seconds` for the
   rate-limit float.
4. **No env-var override**: caps aren't secrets. The
   `_ENV_SECRET_OVERRIDES` table in `app.main` stays scoped to
   `ai.api_key`. Power users editing the YAML is the
   documented UX.

## What landed (1 commit)

### Config

- `backend/config/app.yaml`: new `ai.bulk` block with
  `max_ai_fill: 50` and `max_ai_template: 50`, fronted by a
  multi-line `# INTERNAL` comment explaining what each cap
  guards and when to raise it.
- `backend/config/app.yaml.example`: same block.

### Helper

- `backend/app/ai/routes.py`: new `DEFAULT_MAX_BULK_AI_FILL`,
  `DEFAULT_MAX_BULK_AI_TEMPLATE`, `_coerce_positive_int`, and
  `_get_bulk_ai_caps` functions. The helper reads the merged
  config fresh per call (same approach as
  `_get_rate_limit_seconds`); cost is negligible because the
  config files are small.

### Router refactors

- `backend/app/routers/ai_template_bulk_fill.py`:
  - Pydantic `_BulkFillRequest.ids` constraint changed from
    `Field(min_length=1, max_length=MAX_BULK_AI_FILL)` to
    `Field(min_length=1)`.
  - New `_get_active_bulk_ai_fill_cap()` and
    `_enforce_bulk_ai_fill_cap(id_count)` helpers; the latter
    fires at the top of `estimate_article_bulk_fill`,
    `start_article_bulk_fill`, `estimate_book_bulk_fill`, and
    `start_book_bulk_fill`.
  - `MAX_BULK_AI_FILL = 50` constant retained as the
    documented default (referenced by `_get_bulk_ai_caps` and
    re-exported in `__all__`).
- `backend/app/routers/ai_template_bulk.py`: parallel changes.
  - `_BulkExportRequest.ids` constraint relaxed.
  - New `_get_active_bulk_ai_template_cap()` +
    `_enforce_bulk_ai_template_cap`.
  - Handler check added at the top of `bulk_export_articles`
    and `bulk_export_books`; the inline check inside
    `_iter_yaml_entries` (used by both import paths) now
    reads the runtime cap via `_get_active_bulk_ai_template_cap()`
    and surfaces it in the "ZIP contains N templates; cap is N"
    detail.

### Tests

- New `backend/tests/test_bulk_ai_caps.py` (12 unit tests):
  - Defaults applied when `ai.bulk` block missing
  - Defaults applied when `ai.bulk` is the wrong shape
    (string instead of dict)
  - Custom values round-trip cleanly
  - One key set, the other defaults
  - Zero / negative / None / non-numeric all fall back
  - String-int (`"200"`) coerces (YAML quote quirk)
  - Shipped `app.yaml` carries positive int values
  - `_coerce_positive_int` direct unit tests
- Extended `tests/test_ai_template_bulk_fill.py` (+2):
  - Estimate accepts a 51-id batch when cap is raised to 100
    (404 surfaces instead of 422 because the synthesized ids
    don't exist; the cap check is no longer the gate)
  - Start fires 422 with `cap is 3` in the detail when the
    runtime cap is lowered to 3
- Extended `tests/test_ai_template_bulk.py` (+3):
  - Export: lowering the cap to 5 fires 422 with `cap is 5`
  - Export: raising the cap to 200 lets a 51-id batch through
  - Import: a 6-entry ZIP fails with the
    "ZIP contains 6 templates; cap is 5" phrasing under a
    lowered cap

## Counts

- Backend: 1550 → 1568 (+18) (12 new caps tests + 2 bulk_fill
  + 3 bulk + 1 implicit from refactored behavior)
- Frontend: 889 (unchanged; backend-only feature)

## Documentation + archive

- `docs/CHANGELOG.md`: new `[Unreleased] > Added` entry above
  the BULK-AI-FILL-LIVE-COST-01 entry.
- `docs/backlog.md`: removed the AI-FILL-CAP-CONFIG-01 entry
  from P5, decremented the open-tasks counter, updated the
  "Last updated" line.
- `docs/roadmap-archive/2026-05.md`: new
  "Archived 2026-05-12 (AI-FILL-CAP-CONFIG-01)" section above
  the BULK-AI-FILL-LIVE-COST-01 entry.

## Questions and assumptions

- Assumption: the caps belong under `ai.bulk` rather than
  under a new top-level `bulk:` key or alongside
  `ai.rate_limit_seconds`. Basis: they're closely related to
  the AI rate-limit and the existing AI-config helpers
  (`_get_rate_limit_seconds`, `_get_configured_model`) follow
  the same "read `ai.*` fresh" pattern, so colocating reads
  to a sibling block keeps the surface coherent. Recorded as
  a design decision above.
- Assumption: power users editing YAML is the documented
  authoring UX; no Settings tab is added. Basis: backlog entry
  explicitly framed this as "configurable as plugin settings
  rather than hardcoded constants" — YAML config IS the
  configuration mechanism; a UI surface is a separate task
  that would need its own field-class authoring and
  i18n × 8 burden.
