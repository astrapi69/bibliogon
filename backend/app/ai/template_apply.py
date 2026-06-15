"""Field-application primitives shared by the AI-template routers.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

import json
from typing import Any

# Reasons returned by ``apply_field`` for the skipped path.
APPLY_SKIP_EMPTY = "value-is-empty"
APPLY_SKIP_POPULATED = "field-already-populated"
APPLY_UPDATED = "updated"


def is_template_value_empty(value: Any) -> bool:
    """An AI- or template-supplied value is "empty" (=> always
    skip on apply) when it is None, an empty / whitespace-only
    string, or an empty list."""
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    return False


def is_column_populated(raw: Any, *, is_json_list: bool) -> bool:
    """True when the current article/book column is non-empty;
    force=false should preserve it. JSON-text-as-list columns
    are decoded before the length check; string columns use a
    truthy / non-whitespace check."""
    if is_json_list:
        if not raw:
            return False
        try:
            decoded = json.loads(raw)
        except (ValueError, TypeError):
            return False
        return isinstance(decoded, list) and len(decoded) > 0
    if raw is None:
        return False
    if isinstance(raw, str):
        return bool(raw.strip())
    return bool(raw)


def apply_field(
    record: Any,
    column_name: str,
    new_value: Any,
    *,
    force: bool,
    is_json_list: bool,
) -> str:
    """Apply a single field to an article/book record. Returns
    one of ``APPLY_UPDATED``, ``APPLY_SKIP_EMPTY``,
    ``APPLY_SKIP_POPULATED``. Caller owns the DB transaction.

    Force-override semantics (S6):
    - ``new_value`` empty: always skip, regardless of force.
    - Existing column populated + ``force=False``: skip.
    - Otherwise: write. JSON-list columns serialize via
      ``json.dumps`` so the on-disk text-as-list shape stays
      consistent with the rest of Bibliogon's conventions."""
    if is_template_value_empty(new_value):
        return APPLY_SKIP_EMPTY
    existing = getattr(record, column_name)
    if not force and is_column_populated(existing, is_json_list=is_json_list):
        return APPLY_SKIP_POPULATED
    if is_json_list:
        setattr(record, column_name, json.dumps(new_value))
    else:
        setattr(record, column_name, new_value)
    return APPLY_UPDATED
