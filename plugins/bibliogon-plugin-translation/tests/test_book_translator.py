"""Tests for book translator module."""

import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from bibliogon_translation.book_translator import (
    TranslationProgress,
    extract_plain_text_from_tiptap,
    rebuild_tiptap_with_translation,
    translate_chapter_content,
)


# --- TranslationProgress ---


def test_progress_initial():
    p = TranslationProgress(total_chapters=5)
    assert p.total == 5
    assert p.completed == 0
    assert p.percentage == 0


def test_progress_partial():
    p = TranslationProgress(total_chapters=4)
    p.completed = 2
    assert p.percentage == 50


def test_progress_complete():
    p = TranslationProgress(total_chapters=3)
    p.completed = 3
    assert p.percentage == 100


def test_progress_zero_chapters():
    p = TranslationProgress(total_chapters=0)
    assert p.percentage == 100


def test_progress_to_dict():
    p = TranslationProgress(total_chapters=2)
    p.completed = 1
    p.errors.append({"chapter": "Ch1", "error": "timeout"})
    d = p.to_dict()
    assert d["total"] == 2
    assert d["completed"] == 1
    assert d["percentage"] == 50
    assert len(d["errors"]) == 1


# --- extract_plain_text_from_tiptap ---


def test_extract_empty():
    assert extract_plain_text_from_tiptap("") == ""
    assert extract_plain_text_from_tiptap("   ") == ""


def test_extract_plain_text():
    # Non-JSON content returned as-is
    assert extract_plain_text_from_tiptap("Hello world") == "Hello world"


def test_extract_from_tiptap_json():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hello world."}],
            },
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Second paragraph."}],
            },
        ],
    }
    result = extract_plain_text_from_tiptap(json.dumps(doc))
    assert "Hello world." in result
    assert "Second paragraph." in result


def test_extract_heading():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 2},
                "content": [{"type": "text", "text": "Chapter Title"}],
            },
        ],
    }
    result = extract_plain_text_from_tiptap(json.dumps(doc))
    assert "Chapter Title" in result


def test_extract_with_marks():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Bold ", "marks": [{"type": "bold"}]},
                    {"type": "text", "text": "and normal."},
                ],
            },
        ],
    }
    result = extract_plain_text_from_tiptap(json.dumps(doc))
    assert "Bold " in result
    assert "and normal." in result


# --- rebuild_tiptap_with_translation ---


def test_rebuild_empty():
    assert rebuild_tiptap_with_translation("", "translated") == ""


def test_rebuild_non_json():
    assert rebuild_tiptap_with_translation("plain text", "translated") == "translated"


def test_rebuild_replaces_text():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Hallo"}],
            },
        ],
    }
    original = json.dumps(doc)
    result = rebuild_tiptap_with_translation(original, "Hello")
    rebuilt = json.loads(result)
    assert rebuilt["content"][0]["content"][0]["text"] == "Hello"


def test_rebuild_preserves_structure():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Original", "marks": [{"type": "bold"}]},
                ],
            },
        ],
    }
    original = json.dumps(doc)
    result = rebuild_tiptap_with_translation(original, "Translated")
    rebuilt = json.loads(result)
    # Bold mark should be preserved
    assert rebuilt["content"][0]["content"][0]["marks"] == [{"type": "bold"}]
    assert rebuilt["content"][0]["content"][0]["text"] == "Translated"


# --- translate_chapter_content ---


@pytest.mark.asyncio
async def test_translate_empty_text():
    result = await translate_chapter_content(
        text="", target_lang="en", source_lang=None,
        provider="deepl", deepl_client=None, lmstudio_client=None,
    )
    assert result == ""


@pytest.mark.asyncio
async def test_translate_with_deepl():
    mock_client = AsyncMock()
    mock_client.translate = AsyncMock(return_value={"translated_text": "Hello"})

    result = await translate_chapter_content(
        text="Hallo", target_lang="EN", source_lang="DE",
        provider="deepl", deepl_client=mock_client, lmstudio_client=None,
    )
    assert result == "Hello"


@pytest.mark.asyncio
async def test_translate_with_lmstudio():
    mock_client = AsyncMock()
    mock_client.translate = AsyncMock(return_value={"translated_text": "Bonjour"})

    result = await translate_chapter_content(
        text="Hello", target_lang="fr", source_lang="en",
        provider="lmstudio", deepl_client=None, lmstudio_client=mock_client,
    )
    assert result == "Bonjour"


@pytest.mark.asyncio
async def test_translate_fallback_on_no_client():
    result = await translate_chapter_content(
        text="Original", target_lang="en", source_lang=None,
        provider="deepl", deepl_client=None, lmstudio_client=None,
    )
    assert result == "Original"
