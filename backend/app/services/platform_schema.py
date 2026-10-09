"""AR-02 Phase 2 platform schema loader + validator.

Reads ``backend/app/data/platform_schemas.yaml`` once at startup and
exposes:

- :func:`load_platform_schemas` returns the full mapping
- :func:`get_platform_schema` returns one entry or None
- :func:`validate_platform_metadata` checks a metadata blob against
  the platform's ``required_metadata`` list and returns
  ``(is_valid, errors)``
- :func:`publishing_method_of` resolves one platform's publishing
  method, defaulting to ``"manual"`` for an unknown platform

Validation is intentionally permissive on optional fields (extra
fields allowed). Only the required-list check is hard.

``publishing_method`` is the exception to that permissiveness, and
deliberately so (#918). It decides whether the UI offers to publish for
the user at all, so a typo in the YAML must not be able to degrade a
platform to manual silently - that is the half-wired shape where the
user sees a field whose value never reaches them. The loader rejects
anything outside the literal set, naming the platform and the value.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).resolve().parent.parent / "data" / "platform_schemas.yaml"

#: The two ways an Article reaches a platform. ``manual`` means the user
#: copies it across and marks the publication published; ``api`` means an
#: adapter can post it. Every shipped platform is ``manual`` until the
#: first adapter lands (#917).
PUBLISHING_METHODS: frozenset[str] = frozenset({"manual", "api"})

DEFAULT_PUBLISHING_METHOD = "manual"


class PlatformSchemaError(ValueError):
    """Raised when ``platform_schemas.yaml`` carries a value the loader
    cannot honour. Distinct from a structural warning: a malformed root
    degrades to an empty mapping, but a bad ``publishing_method`` would
    change what the UI offers, so it fails instead."""


def _validate_publishing_methods(data: dict[str, Any]) -> None:
    """Reject any entry whose ``publishing_method`` is not in the literal
    set. Raises :class:`PlatformSchemaError` naming the platform, the bad
    value and the allowed values, so the message is actionable without
    opening the loader."""
    for platform, schema in data.items():
        if not isinstance(schema, dict):
            continue
        method = schema.get("publishing_method", DEFAULT_PUBLISHING_METHOD)
        if method not in PUBLISHING_METHODS:
            allowed = ", ".join(sorted(PUBLISHING_METHODS))
            raise PlatformSchemaError(
                f"platform {platform!r} has publishing_method {method!r}; "
                f"expected one of: {allowed}"
            )


@lru_cache(maxsize=1)
def load_platform_schemas() -> dict[str, dict[str, Any]]:
    """Return the full platform schema mapping.

    Cached for the lifetime of the process. Tests that need a fresh
    read can call ``load_platform_schemas.cache_clear()``.

    Raises:
        PlatformSchemaError: when an entry's ``publishing_method`` is not
            one of :data:`PUBLISHING_METHODS`.
    """
    if not _SCHEMA_PATH.is_file():
        logger.warning("Platform schemas file not found at %s", _SCHEMA_PATH)
        return {}
    with _SCHEMA_PATH.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        logger.warning("Platform schemas YAML root is not a mapping")
        return {}
    _validate_publishing_methods(data)
    return data


def get_platform_schema(platform: str) -> dict[str, Any] | None:
    """Return one platform's schema, or None if unknown."""
    return load_platform_schemas().get(platform)


def publishing_method_of(platform: str) -> str:
    """Return the platform's publishing method.

    An unknown platform is ``"manual"``: the user may define a
    Publication for something Bibliogon ships no schema for, and the one
    thing that must not happen is offering to publish on their behalf to
    a platform nothing knows how to reach. The loader has already
    rejected any other value, so no second check is needed here.
    """
    schema = get_platform_schema(platform)
    if schema is None:
        return DEFAULT_PUBLISHING_METHOD
    return str(schema.get("publishing_method", DEFAULT_PUBLISHING_METHOD))


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
