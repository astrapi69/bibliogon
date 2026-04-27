"""AR-02 Phase 2 platform schema loader + validator.

Reads ``backend/app/data/platform_schemas.yaml`` once at startup and
exposes:

- :func:`load_platform_schemas` returns the full mapping
- :func:`get_platform_schema` returns one entry or None
- :func:`validate_platform_metadata` checks a metadata blob against
  the platform's ``required_metadata`` list and returns
  ``(is_valid, errors)``

Validation is intentionally permissive on optional fields (extra
fields allowed). Only the required-list check is hard.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "data" / "platform_schemas.yaml"


@lru_cache(maxsize=1)
def load_platform_schemas() -> dict[str, dict[str, Any]]:
    """Return the full platform schema mapping.

    Cached for the lifetime of the process. Tests that need a fresh
    read can call ``load_platform_schemas.cache_clear()``.
    """
    if not _SCHEMA_PATH.is_file():
        logger.warning("Platform schemas file not found at %s", _SCHEMA_PATH)
        return {}
    with _SCHEMA_PATH.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        logger.warning("Platform schemas YAML root is not a mapping")
        return {}
    return data


def get_platform_schema(platform: str) -> dict[str, Any] | None:
    """Return one platform's schema, or None if unknown."""
    return load_platform_schemas().get(platform)


def validate_platform_metadata(platform: str, metadata: dict[str, Any]) -> tuple[bool, list[str]]:
    """Check ``metadata`` against the platform's required fields.

    Unknown platforms pass (permissive) - the user gets to define a
    Publication for a platform Bibliogon doesn't ship a schema for.
    Required fields must be present AND non-empty.

    Returns ``(is_valid, list_of_error_messages)``.
    """
    schema = get_platform_schema(platform)
    if schema is None:
        return True, []
    required: list[str] = schema.get("required_metadata", []) or []
    errors: list[str] = []
    for field in required:
        value = metadata.get(field)
        if value is None or value == "" or value == [] or value == {}:
            errors.append(f"missing required field: {field}")
    max_tags = schema.get("max_tags")
    if isinstance(max_tags, int) and "tags" in metadata:
        tags = metadata.get("tags") or []
        if isinstance(tags, list) and len(tags) > max_tags:
            errors.append(f"tags exceed platform limit ({len(tags)} > {max_tags})")
    max_chars = schema.get("max_chars_per_post")
    if isinstance(max_chars, int):
        body = metadata.get("body")
        if isinstance(body, str) and len(body) > max_chars:
            errors.append(f"body exceeds platform limit ({len(body)} > {max_chars} chars)")
    return (len(errors) == 0, errors)
