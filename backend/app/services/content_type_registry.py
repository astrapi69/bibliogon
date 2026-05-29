"""ContentTypeRegistry — single source of truth for article-type metadata.

Reads ``backend/config/content-types.yaml`` once at startup and exposes:

- :func:`load_content_types` — full {id: ContentTypeDef} mapping
- :func:`get_content_type` — lookup by id
- :func:`content_type_ids` — set of valid ids
- :func:`default_content_type_id` — the registry's default-marked id

Cached via ``@lru_cache(maxsize=1)``. Tests that monkeypatch the
YAML path MUST register a yield-based autouse fixture clearing the
cache in BOTH setup AND teardown (per the "Module-level caches
survive test boundaries" lessons-learned rule).

Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29). Mirrors the
BookTypeRegistry shape from BOOK-TYPES-SSOT-YAML-01 (2026-05-24).
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "content-types.yaml"


class ContentTypeExtraField(BaseModel):
    """One per-type extra field declaration. Stored on the
    ``Article.article_metadata`` JSON column, keyed by ``name``.

    ``type`` is one of ``text`` / ``number`` / ``enum`` / ``date``
    — drives the frontend's input-component selection in
    ArticleEditor's type-specific section."""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    label_key: str
    # enum-specific: list of allowed values.
    values: list[str] | None = None
    # number-specific bounds.
    min: float | None = None
    max: float | None = None


class ContentTypeDef(BaseModel):
    """One article-type entry from the YAML registry."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label_key: str
    description_key: str
    icon: str
    default: bool = False
    extra_fields: list[ContentTypeExtraField] = []


@lru_cache(maxsize=1)
def load_content_types() -> dict[str, ContentTypeDef]:
    """Return the full {id: ContentTypeDef} mapping.

    Cached for the lifetime of the process. Tests that need a fresh
    read MUST call ``load_content_types.cache_clear()`` in both
    setup and teardown of any fixture that fakes the registry.
    """
    if not _REGISTRY_PATH.is_file():
        logger.warning("Article-types registry file not found at %s", _REGISTRY_PATH)
        return {}
    with _REGISTRY_PATH.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        logger.warning("content-types YAML root is not a mapping")
        return {}
    entries = raw.get("content_types") or []
    if not isinstance(entries, list):
        logger.warning("content-types 'content_types' key must be a list")
        return {}
    result: dict[str, ContentTypeDef] = {}
    for entry in entries:
        try:
            parsed = ContentTypeDef.model_validate(entry)
        except Exception as exc:  # noqa: BLE001 — log + skip on
            # malformed entry; loud warning instead of import-time
            # crash so the app still boots.
            logger.error(
                "Skipping malformed article-type entry: %s (error: %s)",
                entry,
                exc,
            )
            continue
        result[parsed.id] = parsed
    return result


def get_content_type(type_id: str) -> ContentTypeDef | None:
    """Return one article-type's definition, or None if unknown."""
    return load_content_types().get(type_id)


def content_type_ids() -> frozenset[str]:
    """Return the set of valid article-type ids."""
    return frozenset(load_content_types().keys())


def default_content_type_id() -> str:
    """Return the id of the article-type marked ``default: true``,
    or the first registered id if none is marked, or ``"blogpost"``
    as the ultimate fallback (matches the Article model + column
    default).
    """
    types = load_content_types()
    for at in types.values():
        if at.default:
            return at.id
    if types:
        return next(iter(types.keys()))
    return "blogpost"


def content_type_extra_field_names(type_id: str) -> frozenset[str]:
    """Return the set of extra_field names declared for the given
    article-type. Empty set for unknown ids or types with no
    extra_fields. Used by the PATCH validator (future) to reject
    metadata keys that aren't part of the schema."""
    at = get_content_type(type_id)
    if at is None:
        return frozenset()
    return frozenset(f.name for f in at.extra_fields)


def content_type_extra_fields_raw() -> dict[str, list[dict[str, Any]]]:
    """Return a ``{type_id: [extra_field_dict, ...]}`` mapping with
    extra_fields serialised as plain dicts. Useful for tests that
    assert on the YAML's structure without importing the Pydantic
    types."""
    return {
        type_id: [field.model_dump(exclude_none=True) for field in at.extra_fields]
        for type_id, at in load_content_types().items()
    }
