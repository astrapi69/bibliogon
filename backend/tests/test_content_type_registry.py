"""Unit tests for ``app.services.content_type_registry``.

Filed by ARTICLE-TYPES-SSOT-01 (2026-05-29). Mirrors the
test_book_type_registry.py shape from BOOK-TYPES-SSOT-YAML-01
(2026-05-24).

The ``load_content_types`` LRU cache is cleared in each test
that exercises a different on-disk state, per the "Module-level
caches survive test boundaries" lessons-learned rule. The autouse
fixture clears in BOTH setup AND teardown via ``yield``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.schemas import ContentType
from app.services import content_type_registry
from app.services.content_type_registry import (
    ContentTypeDef,
    content_type_extra_field_names,
    content_type_ids,
    default_content_type_id,
    get_content_type,
    load_content_types,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the LRU cache both BEFORE and AFTER each test."""
    load_content_types.cache_clear()
    yield
    load_content_types.cache_clear()


@pytest.fixture
def fake_registry_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "content-types.yaml"
    monkeypatch.setattr(content_type_registry, "_REGISTRY_PATH", path)
    return path


# --- Real registry (the committed YAML) ----------------------------


class TestRealRegistry:
    """Sanity tests against the actual content-types.yaml on disk."""

    def test_real_registry_loads_all_nine_types(self) -> None:
        types = load_content_types()
        assert set(types.keys()) == {
            "blogpost",
            "tutorial",
            "review",
            "essay",
            "newsletter",
            "interview",
            "listicle",
            "short_story",
            "article",
        }

    def test_each_type_is_a_validated_ContentTypeDef(self) -> None:
        for type_id, definition in load_content_types().items():
            assert isinstance(definition, ContentTypeDef)
            assert definition.id == type_id

    def test_blogpost_is_default(self) -> None:
        blogpost = get_content_type("blogpost")
        assert blogpost is not None
        assert blogpost.default is True
        assert blogpost.icon == "FileText"
        assert blogpost.extra_fields == []

    def test_default_content_type_id_returns_blogpost(self) -> None:
        assert default_content_type_id() == "blogpost"

    def test_tutorial_extra_fields_match_known_truth(self) -> None:
        tutorial = get_content_type("tutorial")
        assert tutorial is not None
        names = [f.name for f in tutorial.extra_fields]
        assert names == [
            "difficulty_level",
            "prerequisites",
            "estimated_duration_minutes",
        ]
        difficulty = tutorial.extra_fields[0]
        assert difficulty.type == "enum"
        assert difficulty.values == ["beginner", "intermediate", "advanced"]

    def test_review_rating_bounds_are_1_to_5(self) -> None:
        review = get_content_type("review")
        assert review is not None
        rating = next(f for f in review.extra_fields if f.name == "rating")
        assert rating.type == "number"
        assert rating.min == 1
        assert rating.max == 5

    def test_essay_has_no_extra_fields(self) -> None:
        essay = get_content_type("essay")
        assert essay is not None
        assert essay.extra_fields == []

    def test_newsletter_extra_fields_match_known_truth(self) -> None:
        newsletter = get_content_type("newsletter")
        assert newsletter is not None
        names = [f.name for f in newsletter.extra_fields]
        assert names == ["issue_number", "send_date"]

    def test_content_type_ids_returns_frozenset(self) -> None:
        ids = content_type_ids()
        assert isinstance(ids, frozenset)
        assert ids == frozenset(
            {
                "blogpost",
                "tutorial",
                "review",
                "essay",
                "newsletter",
                "interview",
                "listicle",
                "short_story",
                "article",
            }
        )

    def test_content_type_extra_field_names_for_tutorial(self) -> None:
        assert content_type_extra_field_names("tutorial") == frozenset(
            {
                "difficulty_level",
                "prerequisites",
                "estimated_duration_minutes",
            }
        )

    def test_extra_field_names_for_unknown_type_returns_empty(self) -> None:
        assert content_type_extra_field_names("unknown_type") == frozenset()

    def test_extra_field_names_for_blogpost_is_empty(self) -> None:
        assert content_type_extra_field_names("blogpost") == frozenset()

    def test_get_unknown_content_type_returns_none(self) -> None:
        assert get_content_type("cookbook") is None

    def test_literal_matches_registry(self) -> None:
        """SSoT verification: the Pydantic Literal in
        ``app.schemas.ContentType`` MUST equal the registry's id set.

        Same drift-detector pattern as BookType. A new content_type
        in YAML without a Literal bump fails this test.
        """
        from typing import get_args

        literal_values = set(get_args(ContentType))
        registry_ids = set(load_content_types().keys())
        assert literal_values == registry_ids, (
            f"ContentType Literal {literal_values} does not match "
            f"registry ids {registry_ids}. Update "
            f"backend/app/schemas/__init__.py:ContentType + "
            f"frontend/src/api/client.ts:ContentType to match the YAML."
        )


# --- Faked registry path (monkeypatched _REGISTRY_PATH) ------------


class TestFakedRegistry:
    """Tests against a tmpdir-backed YAML so we can exercise edge
    cases without touching the committed content-types.yaml."""

    def test_missing_yaml_returns_empty(self, fake_registry_path: Path) -> None:
        assert not fake_registry_path.exists()
        assert load_content_types() == {}

    def test_non_mapping_root_returns_empty(self, fake_registry_path: Path) -> None:
        fake_registry_path.write_text("- this is a list at root\n", encoding="utf-8")
        assert load_content_types() == {}

    def test_missing_content_types_key_returns_empty(self, fake_registry_path: Path) -> None:
        fake_registry_path.write_text("unrelated_key: value\n", encoding="utf-8")
        assert load_content_types() == {}

    def test_content_types_not_list_returns_empty(self, fake_registry_path: Path) -> None:
        fake_registry_path.write_text("content_types: not_a_list\n", encoding="utf-8")
        assert load_content_types() == {}

    def test_malformed_entry_logged_and_skipped(self, fake_registry_path: Path) -> None:
        # Entry missing required fields.
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: half_baked\n"
                "  - id: valid_one\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
            ),
            encoding="utf-8",
        )
        result = load_content_types()
        assert "half_baked" not in result
        assert "valid_one" in result

    def test_default_falls_back_to_first_id_when_none_marked(
        self, fake_registry_path: Path
    ) -> None:
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: aaa\n"
                "    label_key: ui.aaa\n"
                "    description_key: ui.aaa_desc\n"
                "    icon: Star\n"
                "  - id: bbb\n"
                "    label_key: ui.bbb\n"
                "    description_key: ui.bbb_desc\n"
                "    icon: Star\n"
            ),
            encoding="utf-8",
        )
        assert default_content_type_id() == "aaa"

    def test_default_falls_back_to_blogpost_on_empty_registry(
        self, fake_registry_path: Path
    ) -> None:
        # File missing → registry empty → fallback string.
        assert default_content_type_id() == "blogpost"

    def test_extra_field_extra_keys_forbidden(self, fake_registry_path: Path) -> None:
        # ``extra="forbid"`` on ContentTypeExtraField means a typo'd
        # key fails validation; the parent entry is then SKIPPED.
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: bad_field\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    extra_fields:\n"
                "      - name: foo\n"
                "        type: text\n"
                "        label_key: ui.foo_label\n"
                "        unknown_key: yes\n"
            ),
            encoding="utf-8",
        )
        assert get_content_type("bad_field") is None


class TestCoreFields:
    """ARTICLE-TYPES-FIELD-VISIBILITY-01: per-type ``core_fields``
    visibility list (SSoT for which optional ArticleEditor sidebar
    fields each content type shows)."""

    def test_core_fields_match_the_approved_matrix(self) -> None:
        types = load_content_types()
        assert types["blogpost"].core_fields == [
            "tags",
            "excerpt",
            "seo",
            "canonical_url",
            "featured_image",
        ]
        assert types["tutorial"].core_fields == [
            "tags",
            "excerpt",
            "seo",
            "featured_image",
        ]
        # newsletter shows NO optional core fields (only its
        # type-specific issue_number / send_date extra_fields).
        assert types["newsletter"].core_fields == []
        assert types["short_story"].core_fields == ["tags"]
        # The generic "article" type mirrors blogpost's full core set.
        assert types["article"].core_fields == [
            "tags",
            "excerpt",
            "seo",
            "canonical_url",
            "featured_image",
        ]
        # canonical_url is exposed only by blogpost + the generic article.
        for tid, defn in types.items():
            if tid not in ("blogpost", "article"):
                assert "canonical_url" not in (defn.core_fields or [])

    def test_valid_core_fields_parse(self, fake_registry_path: Path) -> None:
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: custom\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    core_fields: [tags, seo]\n"
                "    extra_fields: []\n"
            ),
            encoding="utf-8",
        )
        defn = get_content_type("custom")
        assert defn is not None
        assert defn.core_fields == ["tags", "seo"]

    def test_omitted_core_fields_defaults_to_none_show_all(self, fake_registry_path: Path) -> None:
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: custom\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    extra_fields: []\n"
            ),
            encoding="utf-8",
        )
        defn = get_content_type("custom")
        assert defn is not None
        # None = "show all" (permissive default); the frontend's
        # ``coreFields == null`` check renders every optional field.
        assert defn.core_fields is None

    def test_unknown_core_field_key_skips_the_entry(self, fake_registry_path: Path) -> None:
        # The field_validator rejects unknown core-field names; the
        # loader catches the ValueError and SKIPS the malformed entry
        # (loud log, no import-time crash) — same shape as a bad
        # extra_field.
        fake_registry_path.write_text(
            (
                "content_types:\n"
                "  - id: bad_core\n"
                "    label_key: ui.foo\n"
                "    description_key: ui.bar\n"
                "    icon: Star\n"
                "    core_fields: [tags, bogus_field]\n"
                "    extra_fields: []\n"
            ),
            encoding="utf-8",
        )
        assert get_content_type("bad_core") is None
