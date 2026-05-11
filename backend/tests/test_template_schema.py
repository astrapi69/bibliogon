"""Unit tests for ``app.ai.template_schema``.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 2/10. Pins the
self-explanatory-YAML contract:

- Empty templates have no ``reference`` block; ``language``
  lives at root (the "file alone tells the AI what language
  to respond in" invariant).
- Per-record templates have a ``reference`` block carrying
  ``id``, ``language``, ``body_word_count``, ``body_preview``;
  no root-level ``language`` (it's inside reference).
- Three keys per fillable field: ``description``, ``example``,
  ``current_value``. Description and example survive round-trip.
- Header is regenerated on every export; comments inside an
  imported YAML are silently dropped by PyYAML.
- ``schema_version`` and ``type`` are validated; mismatches
  raise ``TemplateSchemaError``.
- Real UTF-8 (umlauts, CJK) survives round-trip without
  escape sequences.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.ai.template_schema import (
    ARTICLE_HEADER,
    ARTICLE_PROMPTS_VERSION,
    BOOK_HEADER,
    BOOK_PROMPTS_VERSION,
    SCHEMA_VERSION,
    ArticleTemplate,
    BookTemplate,
    TemplateSchemaError,
    build_article_template_from_record,
    build_book_template_from_record,
    build_empty_article_template,
    build_empty_book_template,
    extract_body_preview,
    extract_body_text,
    parse_template_from_yaml,
    serialize_template_to_yaml,
)


# ---------------------------------------------------------------------------
# Empty templates
# ---------------------------------------------------------------------------


def test_empty_article_template_has_no_reference_block() -> None:
    tpl = build_empty_article_template("en")
    yaml_text = serialize_template_to_yaml(tpl, include_header=False)
    assert "reference:" not in yaml_text
    assert "language: en" in yaml_text
    assert "type: article" in yaml_text
    assert f"schema_version: {SCHEMA_VERSION}" in yaml_text


def test_empty_book_template_has_no_reference_block() -> None:
    tpl = build_empty_book_template("de")
    yaml_text = serialize_template_to_yaml(tpl, include_header=False)
    assert "reference:" not in yaml_text
    assert "language: de" in yaml_text
    assert "type: book" in yaml_text


def test_empty_template_fields_default_to_null_or_empty_list() -> None:
    tpl = build_empty_article_template("en")
    assert tpl.title.current_value is None
    assert tpl.tags.current_value == []
    assert tpl.inline_image_prompts.current_value == []
    assert tpl.featured_image_prompt.current_value is None


# ---------------------------------------------------------------------------
# Per-record templates
# ---------------------------------------------------------------------------


def _fake_article(**overrides: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "id": "abc123",
        "title": "Migrate a Maven project to Gradle",
        "language": "en",
        "seo_title": "Maven to Gradle Migration",
        "seo_description": None,
        "excerpt": None,
        "tags": json.dumps(["java", "build-tools"]),
        "topic": "Build Tools",
        "featured_image_prompt": None,
        "inline_image_prompts": "[]",
        "content_json": json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Hello world."}],
                    },
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "text",
                                "text": "Second paragraph with umlauts: aeoeues.",
                            }
                        ],
                    },
                ],
            }
        ),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_per_article_template_carries_reference_block() -> None:
    article = _fake_article()
    tpl = build_article_template_from_record(article)

    assert tpl.reference is not None
    assert tpl.reference.id == "abc123"
    assert tpl.reference.language == "en"
    assert tpl.reference.body_word_count > 0
    # No root-level language when reference is present.
    assert tpl.language is None


def test_per_article_template_populates_current_values() -> None:
    article = _fake_article()
    tpl = build_article_template_from_record(article)

    assert tpl.title.current_value == "Migrate a Maven project to Gradle"
    assert tpl.seo_title.current_value == "Maven to Gradle Migration"
    assert tpl.seo_description.current_value is None
    assert tpl.tags.current_value == ["java", "build-tools"]
    assert tpl.topic.current_value == "Build Tools"
    assert tpl.inline_image_prompts.current_value == []


def test_per_article_template_empty_string_columns_become_null() -> None:
    article = _fake_article(title="", topic="")
    tpl = build_article_template_from_record(article)
    # Empty-string columns collapse to None so the AI sees "unset",
    # not "explicitly empty". The "or None" idiom in the factory.
    assert tpl.title.current_value is None
    assert tpl.topic.current_value is None


def test_per_article_template_malformed_tags_json_becomes_empty_list() -> None:
    article = _fake_article(tags="not-json")
    tpl = build_article_template_from_record(article)
    assert tpl.tags.current_value == []


def _fake_book(chapters: list[SimpleNamespace] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id="bookid1",
        title="The Last Cartographer",
        subtitle=None,
        description="A field guide",
        genre="Non-Fiction",
        language="de",
        keywords=json.dumps(["cartography", "field-guide"]),
        html_description=None,
        backpage_description=None,
        backpage_author_bio=None,
        cover_image_prompt=None,
        chapter_summaries="[]",
        chapters=chapters or [],
    )


def _fake_chapter(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        content=json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": text}],
                    }
                ],
            }
        )
    )


def test_per_book_template_aggregates_chapters_into_body_preview() -> None:
    book = _fake_book(
        chapters=[
            _fake_chapter("Chapter one introduction."),
            _fake_chapter("Chapter two details."),
        ]
    )
    tpl = build_book_template_from_record(book)
    assert tpl.reference is not None
    assert tpl.reference.id == "bookid1"
    assert tpl.reference.body_word_count > 0
    assert "Chapter one introduction" in tpl.reference.body_preview
    assert "Chapter two details" in tpl.reference.body_preview


def test_per_book_template_empty_chapters_produce_empty_preview() -> None:
    book = _fake_book(chapters=[])
    tpl = build_book_template_from_record(book)
    assert tpl.reference is not None
    assert tpl.reference.body_word_count == 0
    assert tpl.reference.body_preview == ""


# ---------------------------------------------------------------------------
# Body preview helper
# ---------------------------------------------------------------------------


def test_extract_body_text_walks_nested_tiptap_doc() -> None:
    doc = json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Hello"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "World"}],
                },
            ],
        }
    )
    assert extract_body_text(doc) == "Hello\nWorld"


def test_extract_body_text_handles_malformed_json() -> None:
    assert extract_body_text("not-json") == ""
    assert extract_body_text(None) == ""
    assert extract_body_text("") == ""


def test_extract_body_preview_truncates_at_word_limit() -> None:
    long_doc = json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": " ".join(["word"] * 1200)}
                    ],
                }
            ],
        }
    )
    preview, total = extract_body_preview(long_doc, word_limit=500)
    assert total == 1200
    assert preview.endswith("[...]")
    # 500 'word' tokens + space + '[...]' marker.
    assert preview.count("word") == 500


def test_extract_body_preview_no_truncation_when_under_limit() -> None:
    short_doc = json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Three short words"}],
                }
            ],
        }
    )
    preview, total = extract_body_preview(short_doc, word_limit=500)
    assert total == 3
    assert preview == "Three short words"
    assert "[...]" not in preview


# ---------------------------------------------------------------------------
# Serialization + parsing
# ---------------------------------------------------------------------------


def test_serialize_includes_header_by_default() -> None:
    tpl = build_empty_article_template("en")
    yaml_with_header = serialize_template_to_yaml(tpl)
    assert yaml_with_header.startswith(ARTICLE_HEADER)


def test_serialize_excludes_header_when_requested() -> None:
    tpl = build_empty_article_template("en")
    yaml_body = serialize_template_to_yaml(tpl, include_header=False)
    assert not yaml_body.startswith("#")
    assert yaml_body.startswith("type: article")


def test_book_header_used_for_book_template() -> None:
    tpl = build_empty_book_template("en")
    serialized = serialize_template_to_yaml(tpl)
    assert serialized.startswith(BOOK_HEADER)
    assert "chapter_summaries" in BOOK_HEADER


def test_roundtrip_article_template() -> None:
    original = build_article_template_from_record(_fake_article())
    yaml_text = serialize_template_to_yaml(original)
    parsed = parse_template_from_yaml(yaml_text)
    assert isinstance(parsed, ArticleTemplate)
    assert parsed.title.current_value == original.title.current_value
    assert parsed.tags.current_value == original.tags.current_value
    assert parsed.reference is not None
    assert parsed.reference.id == "abc123"


def test_roundtrip_book_template() -> None:
    original = build_book_template_from_record(
        _fake_book(chapters=[_fake_chapter("Chapter text.")])
    )
    yaml_text = serialize_template_to_yaml(original)
    parsed = parse_template_from_yaml(yaml_text)
    assert isinstance(parsed, BookTemplate)
    assert parsed.title.current_value == "The Last Cartographer"
    assert parsed.keywords.current_value == ["cartography", "field-guide"]


def test_roundtrip_preserves_utf8_umlauts_and_cjk() -> None:
    tpl = build_empty_article_template("de")
    # Inject UTF-8 content into current_value to verify round-trip.
    tpl.title.current_value = "Schoenes Beispiel mit Umlauten: äöüß"
    tpl.topic.current_value = "中文"  # "Chinese" in Chinese
    yaml_text = serialize_template_to_yaml(tpl)
    # safe_dump with allow_unicode=True writes real characters, not escapes.
    assert "äöüß" in yaml_text
    assert "中文" in yaml_text
    parsed = parse_template_from_yaml(yaml_text)
    assert isinstance(parsed, ArticleTemplate)
    assert parsed.title.current_value == "Schoenes Beispiel mit Umlauten: äöüß"
    assert parsed.topic.current_value == "中文"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_parse_rejects_unknown_schema_version() -> None:
    body = "type: article\nschema_version: 99\ntitle: {description: x, current_value: null}\n"
    with pytest.raises(TemplateSchemaError, match="schema_version"):
        parse_template_from_yaml(body)


def test_parse_rejects_unknown_type() -> None:
    body = f"type: poem\nschema_version: {SCHEMA_VERSION}\n"
    with pytest.raises(TemplateSchemaError, match="type"):
        parse_template_from_yaml(body)


def test_parse_rejects_malformed_yaml() -> None:
    with pytest.raises(TemplateSchemaError, match="Malformed YAML"):
        parse_template_from_yaml("type: article\n  bad-indent: : :")


def test_parse_rejects_non_mapping_root() -> None:
    with pytest.raises(TemplateSchemaError, match="mapping"):
        parse_template_from_yaml("- a\n- b\n")


def test_parse_rejects_missing_required_field() -> None:
    # Missing the bulk of the required fields; Pydantic validation
    # surfaces as TemplateSchemaError.
    body = f"type: article\nschema_version: {SCHEMA_VERSION}\n"
    with pytest.raises(TemplateSchemaError, match="invalid"):
        parse_template_from_yaml(body)


# ---------------------------------------------------------------------------
# Header content invariants
# ---------------------------------------------------------------------------


def test_headers_are_valid_yaml_comments() -> None:
    """Every non-blank line of the header must start with '#'
    so the header survives concatenation with the YAML body
    without breaking the parser."""
    for header in (ARTICLE_HEADER, BOOK_HEADER):
        for line in header.splitlines():
            assert line == "" or line.startswith("#"), (
                f"Header line is not a YAML comment: {line!r}"
            )


def test_headers_mention_self_explanatory_invariants() -> None:
    """Smoke test that the rules-for-AI text actually carries
    the contract. Easy to forget when refactoring."""
    for header in (ARTICLE_HEADER, BOOK_HEADER):
        assert "current_value" in header
        assert "schema_version" in header
        assert "UTF-8" in header


def test_prompts_versions_are_stable_strings() -> None:
    """Prompt-module version literals are used in the
    ``generated_with`` template metadata downstream. Pin them."""
    assert ARTICLE_PROMPTS_VERSION == "article_v1"
    assert BOOK_PROMPTS_VERSION == "book_v1"
