"""Unit tests for ``app.services.book_type_registry``.

Filed by BOOK-TYPES-SSOT-YAML-01 (2026-05-24). The module loads
``backend/config/book-types.yaml`` once at process start and
exposes the registry + lookup helpers consumed by core routers,
the API endpoint, and (transitively) every plugin that branches
on book_type.

The ``load_book_types`` LRU cache is cleared in each test that
exercises a different on-disk state, per the "Module-level caches
survive test boundaries" lessons-learned rule. The autouse fixture
clears in BOTH setup AND teardown via ``yield`` — clearing only on
setup would leave the fake-YAML fixture's result cached at module
exit, poisoning the cache for any later test file that exercises
the real registry path.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.schemas import BookType
from app.services import book_type_registry
from app.services.book_type_registry import (
    BookTypeDef,
    book_type_ids,
    book_types_with_capability,
    get_book_type,
    immutable_book_field_ids,
    load_book_types,
    pageable_book_types,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the LRU cache both BEFORE and AFTER each test."""
    load_book_types.cache_clear()
    yield
    load_book_types.cache_clear()


@pytest.fixture
def fake_registry_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Path:
    path = tmp_path / "book-types.yaml"
    monkeypatch.setattr(book_type_registry, "_REGISTRY_PATH", path)
    return path


# --- Real registry (the committed YAML) ----------------------------


class TestRealRegistry:
    """Sanity tests against the actual book-types.yaml on disk."""

    def test_real_registry_loads_all_three_types(self) -> None:
        types = load_book_types()
        assert set(types.keys()) == {"prose", "picture_book", "comic_book"}

    def test_each_type_is_a_validated_BookTypeDef(self) -> None:
        for type_id, definition in load_book_types().items():
            assert isinstance(definition, BookTypeDef)
            assert definition.id == type_id

    def test_prose_capabilities_match_known_truth(self) -> None:
        prose = get_book_type("prose")
        assert prose is not None
        assert prose.content_model == "chapters"
        assert prose.editor_component == "BookEditor"
        assert prose.capabilities.ebook_export is True
        assert prose.capabilities.paperback_export is True
        assert prose.capabilities.audiobook_export is True
        assert prose.capabilities.template_catalog is True

    def test_picture_book_capabilities_match_known_truth(self) -> None:
        picture = get_book_type("picture_book")
        assert picture is not None
        assert picture.content_model == "pages"
        assert picture.editor_component == "PageEditor"
        # KDP rejects picture-book ebooks; paperback only.
        assert picture.capabilities.ebook_export is False
        assert picture.capabilities.paperback_export is True
        assert picture.capabilities.audiobook_export is False
        assert picture.capabilities.template_catalog is False
        assert picture.default_page_size == "8.5x8.5"

    def test_comic_book_capabilities_match_known_truth(self) -> None:
        comic = get_book_type("comic_book")
        assert comic is not None
        assert comic.content_model == "pages"
        assert comic.editor_component == "ComicBookEditor"
        assert comic.capabilities.ebook_export is False
        assert comic.capabilities.paperback_export is True
        assert comic.capabilities.audiobook_export is False
        assert comic.default_page_size == "7x10"

    def test_pageable_book_types_matches_real_registry(self) -> None:
        # The hardcoded ``PAGEABLE_BOOK_TYPES`` in
        # backend/app/routers/pages.py that the registry will
        # replace.
        assert pageable_book_types() == frozenset(
            {"picture_book", "comic_book"}
        )

    def test_book_type_ids_returns_frozenset(self) -> None:
        ids = book_type_ids()
        assert isinstance(ids, frozenset)
        assert ids == frozenset({"prose", "picture_book", "comic_book"})

    def test_immutable_book_field_ids_includes_all_types(self) -> None:
        # All three current types are immutable after creation.
        assert immutable_book_field_ids() == frozenset(
            {"prose", "picture_book", "comic_book"}
        )

    def test_ebook_export_capability_query(self) -> None:
        # Only prose books are ebook-exportable on KDP.
        assert book_types_with_capability("ebook_export") == frozenset(
            {"prose"}
        )

    def test_paperback_export_capability_query(self) -> None:
        assert book_types_with_capability(
            "paperback_export"
        ) == frozenset({"prose", "picture_book", "comic_book"})

    def test_template_catalog_capability_query(self) -> None:
        assert book_types_with_capability(
            "template_catalog"
        ) == frozenset({"prose"})

    def test_unknown_capability_returns_empty(self) -> None:
        assert book_types_with_capability("nonexistent_flag") == frozenset()

    def test_get_unknown_book_type_returns_none(self) -> None:
        assert get_book_type("cookbook") is None

    def test_literal_matches_registry(self) -> None:
        """SSoT verification: the Pydantic Literal in
        ``app.schemas.BookType`` MUST equal the registry's id set.

        This is the only mechanism guaranteeing the Literal stays
        in sync with the YAML (per A5.1 default). A new book_type
        in YAML without a Literal bump fails this test.
        """
        from typing import get_args

        literal_values = set(get_args(BookType))
        registry_ids = set(load_book_types().keys())
        assert literal_values == registry_ids, (
            f"BookType Literal {literal_values} does not match registry "
            f"ids {registry_ids}. Update "
            f"backend/app/schemas/__init__.py:BookType + "
            f"frontend/src/api/client.ts:BookType to match the YAML."
        )


# --- Faked registry path (monkeypatched _REGISTRY_PATH) ------------


class TestFakedRegistry:
    """Tests against a tmpdir-backed YAML so we can exercise
    edge cases without touching the committed book-types.yaml."""

    def test_missing_yaml_returns_empty(
        self, fake_registry_path: Path
    ) -> None:
        # File does not exist at the fake path.
        assert not fake_registry_path.exists()
        assert load_book_types() == {}

    def test_non_mapping_root_returns_empty(
        self, fake_registry_path: Path
    ) -> None:
        fake_registry_path.write_text(
            "- this is a list at root\n", encoding="utf-8"
        )
        assert load_book_types() == {}

    def test_missing_book_types_key_returns_empty(
        self, fake_registry_path: Path
    ) -> None:
        fake_registry_path.write_text(
            "unrelated_key: value\n", encoding="utf-8"
        )
        assert load_book_types() == {}

    def test_book_types_not_list_returns_empty(
        self, fake_registry_path: Path
    ) -> None:
        fake_registry_path.write_text(
            "book_types: not_a_list\n", encoding="utf-8"
        )
        assert load_book_types() == {}

    def test_malformed_entry_logged_and_skipped(
        self, fake_registry_path: Path
    ) -> None:
        # Entry missing required fields (label_key, content_model).
        fake_registry_path.write_text(
            (
                "book_types:\n"
                "  - id: half_baked\n"
                "  - id: valid_one\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    content_model: chapters\n"
                "    editor_component: SomeEditor\n"
                "    capabilities: {}\n"
            ),
            encoding="utf-8",
        )
        result = load_book_types()
        # Malformed entry skipped; valid one survives.
        assert "half_baked" not in result
        assert "valid_one" in result

    def test_capabilities_negative_default(
        self, fake_registry_path: Path
    ) -> None:
        # When capabilities is an empty dict, all flags default to
        # False (safe-by-default).
        fake_registry_path.write_text(
            (
                "book_types:\n"
                "  - id: minimal\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    content_model: chapters\n"
                "    editor_component: SomeEditor\n"
                "    capabilities: {}\n"
            ),
            encoding="utf-8",
        )
        minimal = get_book_type("minimal")
        assert minimal is not None
        assert minimal.capabilities.ebook_export is False
        assert minimal.capabilities.paperback_export is False
        assert minimal.capabilities.template_catalog is False

    def test_unknown_capability_field_rejected(
        self, fake_registry_path: Path
    ) -> None:
        # ``extra="forbid"`` on BookTypeCapabilities means a typo'd
        # flag fails validation. The entry is then SKIPPED (not
        # crashing); the registry stays usable.
        fake_registry_path.write_text(
            (
                "book_types:\n"
                "  - id: typo_test\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    content_model: chapters\n"
                "    editor_component: SomeEditor\n"
                "    capabilities:\n"
                "      ebok_export: true\n"  # typo: ebok != ebook
            ),
            encoding="utf-8",
        )
        # Malformed entry → not loaded.
        assert get_book_type("typo_test") is None

    def test_dashboard_create_visible_defaults_true(
        self, fake_registry_path: Path
    ) -> None:
        fake_registry_path.write_text(
            (
                "book_types:\n"
                "  - id: minimal\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    content_model: chapters\n"
                "    editor_component: SomeEditor\n"
                "    capabilities: {}\n"
            ),
            encoding="utf-8",
        )
        minimal = get_book_type("minimal")
        assert minimal is not None
        assert minimal.dashboard_create_visible is True
        assert minimal.immutable_after_create is True
