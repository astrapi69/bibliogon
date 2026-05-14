"""Unit tests for ``app.services.platform_schema``.

The module loads ``backend/app/data/platform_schemas.yaml`` once at
process start and exposes a small validator for the AR-02 Phase 2
Publications feature. Mutation testing identified 54 surviving
mutants on this file with ZERO test coverage; these tests pin
every branch so a typo in the validator (off-by-one on max_tags,
empty-list-not-treated-as-empty, etc.) surfaces at CI time.

The ``load_platform_schemas`` LRU cache is cleared in each test
that exercises a different on-disk state.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import platform_schema
from app.services.platform_schema import (
    get_platform_schema,
    load_platform_schemas,
    validate_platform_metadata,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    load_platform_schemas.cache_clear()


@pytest.fixture
def fake_schema_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "platform_schemas.yaml"
    monkeypatch.setattr(platform_schema, "_SCHEMA_PATH", path)
    return path


# --- load_platform_schemas ---


def test_load_returns_empty_dict_when_file_missing(
    fake_schema_path: Path,
) -> None:
    assert load_platform_schemas() == {}


def test_load_returns_empty_dict_when_yaml_root_is_not_a_mapping(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("- just\n- a\n- list\n", encoding="utf-8")
    assert load_platform_schemas() == {}


def test_load_returns_full_mapping(fake_schema_path: Path) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: [title]\nsubstack:\n  required_metadata: [title, section]\n",
        encoding="utf-8",
    )
    result = load_platform_schemas()
    assert set(result.keys()) == {"medium", "substack"}
    assert result["substack"]["required_metadata"] == ["title", "section"]


def test_load_returns_empty_dict_when_yaml_is_empty(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("", encoding="utf-8")
    assert load_platform_schemas() == {}


# --- get_platform_schema ---


def test_get_returns_none_for_unknown_platform(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("medium:\n  required_metadata: [title]\n", encoding="utf-8")
    assert get_platform_schema("does-not-exist") is None


def test_get_returns_dict_for_known_platform(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: [title]\n  max_tags: 5\n",
        encoding="utf-8",
    )
    schema = get_platform_schema("medium")
    assert schema is not None
    assert schema["required_metadata"] == ["title"]
    assert schema["max_tags"] == 5


# --- validate_platform_metadata ---


def test_validate_unknown_platform_passes(fake_schema_path: Path) -> None:
    fake_schema_path.write_text("", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("no-such-platform", {"anything": "goes"})
    assert is_valid is True
    assert errors == []


def test_validate_required_field_missing_fails(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: [title, tags]\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("medium", {"title": "Hello"})
    assert is_valid is False
    assert any("tags" in e for e in errors)


def test_validate_required_field_empty_string_fails(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("medium:\n  required_metadata: [title]\n", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("medium", {"title": ""})
    assert is_valid is False
    assert "missing required field: title" in errors


def test_validate_required_field_empty_list_fails(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("medium:\n  required_metadata: [tags]\n", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("medium", {"tags": []})
    assert is_valid is False


def test_validate_required_field_empty_dict_fails(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("medium:\n  required_metadata: [meta]\n", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("medium", {"meta": {}})
    assert is_valid is False


def test_validate_required_field_none_value_fails(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text("medium:\n  required_metadata: [title]\n", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("medium", {"title": None})
    assert is_valid is False


def test_validate_all_required_present_passes(fake_schema_path: Path) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: [title, tags]\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("medium", {"title": "Hello", "tags": ["python"]})
    assert is_valid is True
    assert errors == []


def test_validate_no_required_metadata_passes(fake_schema_path: Path) -> None:
    fake_schema_path.write_text("medium:\n  display_name: Medium\n", encoding="utf-8")
    is_valid, errors = validate_platform_metadata("medium", {})
    assert is_valid is True
    assert errors == []


def test_validate_max_tags_enforced(fake_schema_path: Path) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: []\n  max_tags: 3\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("medium", {"tags": ["a", "b", "c", "d"]})
    assert is_valid is False
    assert any("tags exceed" in e for e in errors)


def test_validate_max_tags_within_limit_passes(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: []\n  max_tags: 5\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("medium", {"tags": ["a", "b", "c"]})
    assert is_valid is True


def test_validate_max_tags_ignored_when_not_int(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        'medium:\n  required_metadata: []\n  max_tags: "five"\n',
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata(
        "medium", {"tags": ["a", "b", "c", "d", "e", "f"]}
    )
    assert is_valid is True


def test_validate_max_tags_ignored_when_tags_not_list(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "medium:\n  required_metadata: []\n  max_tags: 3\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("medium", {"tags": "comma,separated,string"})
    assert is_valid is True


def test_validate_max_chars_enforced(fake_schema_path: Path) -> None:
    fake_schema_path.write_text(
        "twitter:\n  required_metadata: []\n  max_chars_per_post: 10\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata(
        "twitter", {"body": "this body is longer than ten characters"}
    )
    assert is_valid is False
    assert any("body exceeds" in e for e in errors)


def test_validate_max_chars_within_limit_passes(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "twitter:\n  required_metadata: []\n  max_chars_per_post: 280\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("twitter", {"body": "short tweet"})
    assert is_valid is True


def test_validate_max_chars_ignored_when_body_not_string(
    fake_schema_path: Path,
) -> None:
    fake_schema_path.write_text(
        "twitter:\n  required_metadata: []\n  max_chars_per_post: 10\n",
        encoding="utf-8",
    )
    is_valid, errors = validate_platform_metadata("twitter", {"body": 42})
    assert is_valid is True
