"""Schema validation through the engine's sanctioned Python validator.

Wraps the vendored ``lce_schema.build_validator`` (learn-content-engine
0.23.0, engine#115) so callers get plain error strings. The vendored
schemas + validator live under ``bibliogon_learnset/vendor/`` with an
``engine-version.txt`` pin; upgrading the engine means re-copying the
three files from the engine tag and bumping the pin - never editing
them here.
"""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Any

from bibliogon_learnset.vendor.lce_schema import build_validator


def _load_schema(filename: str) -> dict[str, Any]:
    schema_text = (
        resources.files("bibliogon_learnset.vendor").joinpath(filename).read_text(encoding="utf-8")
    )
    return json.loads(schema_text)


@lru_cache(maxsize=2)
def _validator(filename: str) -> Any:
    return build_validator(_load_schema(filename))


def _format_errors(errors: list[Any]) -> list[str]:
    formatted = []
    for error in errors:
        path = "/".join(str(part) for part in error.absolute_path) or "<root>"
        formatted.append(f"{path}: {error.message}")
    return formatted


def validate_lesson(lesson: dict[str, Any]) -> list[str]:
    """Errors for one lesson dict against lesson.schema.json ([] = valid)."""
    return _format_errors(list(_validator("lesson.schema.json").iter_errors(lesson)))


def validate_manifest(manifest: dict[str, Any]) -> list[str]:
    """Errors for the manifest dict against content-manifest.schema.json."""
    return _format_errors(list(_validator("content-manifest.schema.json").iter_errors(manifest)))
