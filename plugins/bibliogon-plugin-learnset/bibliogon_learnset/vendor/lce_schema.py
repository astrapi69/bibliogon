"""Python-side JSON-Schema validation for the canonical lesson schema.

WHY THIS FILE EXISTS (engine#115)
---------------------------------
The ecosystem validates the SAME schema with two engines: the TypeScript
engine (ajv, ECMA-262 regexes with the ``u`` flag) and every content repo's
``scripts/validate_content.py`` (the ``jsonschema`` library, Python ``re``).

Since schema 1.10 the canonical slug rule uses Unicode property escapes::

    ^[\\p{Ll}\\p{Nd}]+(-[\\p{Ll}\\p{Nd}]+)*$

``\\p{...}`` is valid ECMA-262 and NOT valid Python ``re``. The consequence
is not a rule that quietly stops working - it is total: ``check_schema``
rejects the whole schema, and instance validation raises
``re.PatternError``, so the Python validator dies on every document.

Disabling the ``format`` check is a HALF fix that looks green: it silences
the metaschema rejection while instance validation still raises. This module
takes the other route - it swaps the ``pattern`` keyword for an
implementation backed by the ``regex`` package, which understands
``\\p{...}``. Both engines then APPLY the same rule instead of merely
surviving it.

This file ships INSIDE the npm package (``python/`` is in package ``files``)
so all consumers read one pinned source instead of eleven copies that drift
independently.

USAGE::

    from lce_schema import build_validator
    validator = build_validator(json.loads(schema_path.read_text()))
    errors = list(validator.iter_errors(lesson))

Requires ``jsonschema>=4`` and ``regex``.
"""
from __future__ import annotations

from typing import Any

import jsonschema
from jsonschema import validators

try:
    import regex as _regex
except ImportError as _import_error:  # pragma: no cover - environment guard
    # Loud on purpose. Falling back to ``re`` would make every pattern with a
    # Unicode property escape raise, and silently skipping the pattern keyword
    # would leave a rule that can never fail - worse than no rule at all.
    raise SystemExit(
        "FATAL: the 'regex' package is required to validate this schema "
        "(the slug pattern uses Unicode property escapes, which Python's "
        "built-in 're' cannot compile). Install it with: pip install regex"
    ) from _import_error


def _pattern_with_unicode_properties(
    validator: Any, patternValue: str, instance: Any, schemaNode: Any
):
    """``pattern`` keyword backed by ``regex`` instead of ``re``.

    Mirrors the JSON-Schema contract: non-strings are ignored, and the match
    is unanchored (the schema's own ``^``/``$`` do the anchoring), matching
    ajv's behaviour on the engine side.
    """
    if not isinstance(instance, str):
        return
    if _regex.search(patternValue, instance) is None:
        yield jsonschema.ValidationError(f"{instance!r} does not match {patternValue!r}")


#: Draft 2020-12 validator whose ``pattern`` keyword understands ``\p{...}``.
UnicodeAwareValidator = validators.extend(
    jsonschema.Draft202012Validator,
    {"pattern": _pattern_with_unicode_properties},
)


def build_validator(schema: dict) -> Any:
    """Return a validator for ``schema`` that can read Unicode property
    escapes in ``pattern``.

    ``check_schema`` runs with ``format_checker=None``: the metaschema's
    ``format: regex`` assertion is a Python-``re`` compile check, which is
    exactly the thing that does not apply here. Every other structural
    assertion of the metaschema still runs, so a genuinely malformed schema
    is still rejected.
    """
    jsonschema.Draft202012Validator.check_schema(schema, format_checker=None)
    return UnicodeAwareValidator(schema, format_checker=None)
