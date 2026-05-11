"""Smoke tests for the Article + Book template prompt modules.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 3/10. Pins the
``(system_prompt, user_prompt)`` shape and the invariants that
matter to downstream callers (system prompt names the
language, user prompt names the title, both are non-empty,
output-shape YAML appears in the user prompt).

Not a quality check on the prompts themselves - prompt-text
quality is verified by hand and by real AI fills in
Session 2 + 3.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.ai import article_template_prompts as ap
from app.ai import book_template_prompts as bp


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def article() -> SimpleNamespace:
    return SimpleNamespace(
        title="Migrate a Maven project to Gradle",
        subtitle=None,
        author="Asterios Raptis",
        topic="Build Tools",
        language="en",
    )


@pytest.fixture
def german_article() -> SimpleNamespace:
    return SimpleNamespace(
        title="Maven nach Gradle migrieren",
        subtitle=None,
        author=None,
        topic=None,
        language="de",
    )


@pytest.fixture
def book() -> SimpleNamespace:
    return SimpleNamespace(
        title="The Last Cartographer",
        subtitle="A Practical Guide",
        author="Marta Rivers",
        genre="Non-Fiction",
        series=None,
        language="en",
    )


@pytest.fixture
def short_body() -> str:
    return "Hello world. This is a tiny excerpt for the prompt."


# ---------------------------------------------------------------------------
# Article prompts
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "builder",
    [
        ap.build_seo_prompt,
        ap.build_tags_prompt,
        ap.build_topic_prompt,
        ap.build_excerpt_prompt,
    ],
)
def test_article_builders_return_system_user_tuple(builder, article, short_body):
    system, user = builder(article, short_body)
    assert isinstance(system, str) and system
    assert isinstance(user, str) and user
    # System prompt names the language.
    assert "en" in system
    # User prompt names the article.
    assert "Migrate a Maven project to Gradle" in user
    # User prompt mentions the expected YAML output shape.
    assert "YAML" in user.upper() or "yaml" in user
    # User prompt includes the body excerpt.
    assert "Hello world" in user


def test_article_image_prompts_builder_carries_inline_count(article, short_body):
    system, user = ap.build_image_prompts_prompt(article, short_body, inline_count=3)
    assert "featured_image_prompt" in user
    assert "inline_image_prompts" in user
    assert "3" in user  # the count_hint surfaces


def test_article_image_prompts_inline_count_clamped_to_five(article, short_body):
    _, user = ap.build_image_prompts_prompt(article, short_body, inline_count=99)
    # Sanity: count_hint clamped at 5.
    assert "5 entries" in user or " 5 " in user


def test_article_image_prompts_inline_count_floor_at_one(article, short_body):
    _, user = ap.build_image_prompts_prompt(article, short_body, inline_count=0)
    # Floor at 1, never zero.
    assert "1 entries" in user or " 1 " in user


def test_article_system_prompt_carries_utf8_rule(article, short_body):
    system, _ = ap.build_seo_prompt(article, short_body)
    assert "UTF-8" in system
    assert "null" in system.lower()  # rule about leaving uncertain fields null


def test_article_german_language_appears_in_system_prompt(german_article, short_body):
    system, _ = ap.build_tags_prompt(german_article, short_body)
    assert "de" in system


def test_article_excerpt_clamped(article):
    long_body = "x" * 5000
    _, user = ap.build_seo_prompt(article, long_body)
    # The body excerpt is clamped; we don't pin the exact
    # length here but we verify it doesn't blow past the limit
    # by a lot.
    assert "x" * 5000 not in user
    assert "x" * 1500 in user


def test_article_optional_metadata_skipped_when_empty(german_article, short_body):
    _, user = ap.build_topic_prompt(german_article, short_body)
    # Author + topic + subtitle are None on german_article; the
    # metadata header should skip them.
    assert "Author:" not in user
    assert "Subtitle:" not in user
    assert "Topic:" not in user


# ---------------------------------------------------------------------------
# Book prompts
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "builder",
    [
        bp.build_marketing_copy_prompt,
        bp.build_tags_prompt,
        bp.build_description_genre_prompt,
        bp.build_cover_prompt,
    ],
)
def test_book_builders_return_system_user_tuple(builder, book, short_body):
    system, user = builder(book, short_body)
    assert isinstance(system, str) and system
    assert isinstance(user, str) and user
    assert "en" in system
    assert "The Last Cartographer" in user


def test_book_marketing_copy_prompt_names_all_three_fields(book, short_body):
    _, user = bp.build_marketing_copy_prompt(book, short_body)
    assert "backpage_description" in user
    assert "backpage_author_bio" in user
    assert "html_description" in user


def test_book_tags_prompt_uses_keywords_not_tags(book, short_body):
    """Books use the ``keywords`` column, not ``tags``."""
    _, user = bp.build_tags_prompt(book, short_body)
    assert "keywords:" in user


def test_book_description_genre_prompt_names_both_fields(book, short_body):
    _, user = bp.build_description_genre_prompt(book, short_body)
    assert "description:" in user
    assert "genre:" in user


def test_book_cover_prompt_signals_image_prompt_can_be_english(book, short_body):
    _, user = bp.build_cover_prompt(book, short_body)
    assert "English" in user


def test_book_chapter_summaries_prompt_lists_each_chapter(book):
    chapters = [
        {
            "chapter_id": "ch1abc",
            "title": "The First Survey",
            "excerpt": "Marta arrives in Lisbon.",
        },
        {
            "chapter_id": "ch2def",
            "title": "The Census",
            "excerpt": "The wildlife corridor census kicks off.",
        },
    ]
    system, user = bp.build_chapter_summaries_prompt(book, chapters)
    assert "ch1abc" in user
    assert "ch2def" in user
    assert "The First Survey" in user
    assert "The Census" in user
    assert "do NOT invent" in user
    assert "do NOT skip" in user


def test_book_chapter_summaries_handles_empty_excerpt(book):
    chapters = [{"chapter_id": "ch1", "title": "Empty", "excerpt": None}]
    _, user = bp.build_chapter_summaries_prompt(book, chapters)
    assert "ch1" in user
    assert "Empty" in user


def test_book_chapter_excerpt_clamped(book):
    chapters = [
        {
            "chapter_id": "ch1",
            "title": "Long",
            "excerpt": "z" * 5000,
        }
    ]
    _, user = bp.build_chapter_summaries_prompt(book, chapters)
    # Per-chapter excerpt clamped at 600 chars.
    assert "z" * 5000 not in user
    assert "z" * 600 in user


def test_book_system_prompt_carries_utf8_rule(book, short_body):
    system, _ = bp.build_marketing_copy_prompt(book, short_body)
    assert "UTF-8" in system


# ---------------------------------------------------------------------------
# Cross-cutting: __all__ surface stable
# ---------------------------------------------------------------------------


def test_article_module_exports_expected_names():
    assert set(ap.__all__) == {
        "build_seo_prompt",
        "build_tags_prompt",
        "build_topic_prompt",
        "build_excerpt_prompt",
        "build_image_prompts_prompt",
    }


def test_book_module_exports_expected_names():
    assert set(bp.__all__) == {
        "build_marketing_copy_prompt",
        "build_tags_prompt",
        "build_description_genre_prompt",
        "build_cover_prompt",
        "build_chapter_summaries_prompt",
    }
