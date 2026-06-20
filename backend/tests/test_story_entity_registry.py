"""Tests for the StoryEntityRegistry SSoT loader
(STORY-BIBLE-PLUGIN-01 Session 2).

Reads the committed backend/config/story-bible-entities.yaml (no
monkeypatched path here — these assert the real shipped SSoT). The
autouse fixture clears the lru_cache in BOTH setup and teardown per
the "Module-level caches survive test boundaries" rule, so a stale
cache from another test file can't poison this one and vice versa.
"""

from __future__ import annotations

from typing import get_args

import pytest

from app.schemas import STORY_ENTITY_TYPES, StoryEntityType
from app.services.registries.story_entity_registry import (
    default_story_entity_type_id,
    get_story_entity_type,
    load_story_entity_types,
    story_entity_type_ids,
)


@pytest.fixture(autouse=True)
def _clear_registry_cache():
    load_story_entity_types.cache_clear()
    yield
    load_story_entity_types.cache_clear()


def test_loads_five_entity_types() -> None:
    types = load_story_entity_types()
    assert set(types.keys()) == {
        "character",
        "setting",
        "plot_point",
        "item",
        "lore",
    }


def test_literal_matches_registry() -> None:
    """Drift guard: the StoryEntityType Literal, the
    STORY_ENTITY_TYPES tuple, and the YAML registry ids must agree."""
    registry_ids = set(story_entity_type_ids())
    literal_ids = set(get_args(StoryEntityType))
    tuple_ids = set(STORY_ENTITY_TYPES)
    assert registry_ids == literal_ids == tuple_ids


def test_default_is_character() -> None:
    assert default_story_entity_type_id() == "character"


def test_character_has_expected_extra_fields() -> None:
    character = get_story_entity_type("character")
    assert character is not None
    names = {f.name for f in character.extra_fields}
    assert names == {
        "aliases",
        "role",
        "traits",
        "arc_notes",
        "relationships",
    }


def test_enum_extra_field_carries_values() -> None:
    lore = get_story_entity_type("lore")
    assert lore is not None
    category = next(f for f in lore.extra_fields if f.name == "category")
    assert category.type == "enum"
    assert "magic" in (category.values or [])


def test_unknown_type_returns_none() -> None:
    assert get_story_entity_type("nonexistent") is None
