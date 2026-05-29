"""StoryEntityRegistry — single source of truth for Story Bible
entity-type metadata.

Reads ``backend/config/story-bible-entities.yaml`` once and exposes:

- :func:`load_story_entity_types` — full {id: StoryEntityTypeDef} mapping
- :func:`get_story_entity_type` — lookup by id
- :func:`story_entity_type_ids` — set of valid ids
- :func:`default_story_entity_type_id` — the registry's default-marked id

Cached via ``@lru_cache(maxsize=1)``. Tests that monkeypatch the
YAML path MUST register a yield-based autouse fixture clearing the
cache in BOTH setup AND teardown (per the "Module-level caches
survive test boundaries" lessons-learned rule).

Filed by STORY-BIBLE-PLUGIN-01 Session 2 (2026-05-30). Mirrors the
ContentTypeRegistry shape (ARTICLE-TYPES-SSOT-01).
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

_REGISTRY_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "story-bible-entities.yaml"
)


class StoryEntityExtraField(BaseModel):
    """One per-type extra field declaration. Stored on the
    ``StoryEntity.entity_metadata`` JSON column, keyed by ``name``.

    ``type`` is one of ``text`` / ``number`` / ``enum`` / ``date`` —
    drives the frontend's input-component selection in the Session-2+
    entity editor."""

    model_config = ConfigDict(extra="forbid")

    name: str
    type: str
    label_key: str
    values: list[str] | None = None
    min: float | None = None
    max: float | None = None


class StoryEntityTypeDef(BaseModel):
    """One entity-type entry from the YAML registry."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label_key: str
    description_key: str
    icon: str
    default: bool = False
    extra_fields: list[StoryEntityExtraField] = []


@lru_cache(maxsize=1)
def load_story_entity_types() -> dict[str, StoryEntityTypeDef]:
    """Return the full {id: StoryEntityTypeDef} mapping.

    Cached for the lifetime of the process. Tests that need a fresh
    read MUST call ``load_story_entity_types.cache_clear()`` in both
    setup and teardown of any fixture that fakes the registry.
    """
    if not _REGISTRY_PATH.is_file():
        logger.warning("Story-bible entity registry file not found at %s", _REGISTRY_PATH)
        return {}
    with _REGISTRY_PATH.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        logger.warning("story-bible-entities YAML root is not a mapping")
        return {}
    entries = raw.get("entity_types") or []
    if not isinstance(entries, list):
        logger.warning("story-bible-entities 'entity_types' key must be a list")
        return {}
    result: dict[str, StoryEntityTypeDef] = {}
    for entry in entries:
        try:
            parsed = StoryEntityTypeDef.model_validate(entry)
        except Exception as exc:  # noqa: BLE001 — log + skip malformed
            # entry; loud warning instead of an import-time crash so
            # the app still boots.
            logger.error(
                "Skipping malformed story-bible entity-type entry: %s (error: %s)",
                entry,
                exc,
            )
            continue
        result[parsed.id] = parsed
    return result


def get_story_entity_type(type_id: str) -> StoryEntityTypeDef | None:
    """Return one entity-type's definition, or None if unknown."""
    return load_story_entity_types().get(type_id)


def story_entity_type_ids() -> frozenset[str]:
    """Return the set of valid entity-type ids."""
    return frozenset(load_story_entity_types().keys())


def default_story_entity_type_id() -> str:
    """Return the id of the entity-type marked ``default: true``, or
    the first registered id if none is marked, or ``"character"`` as
    the ultimate fallback."""
    types = load_story_entity_types()
    for et in types.values():
        if et.default:
            return et.id
    if types:
        return next(iter(types.keys()))
    return "character"
