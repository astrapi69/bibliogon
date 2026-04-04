"""Tests for audiobook generator module."""

import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bibliogon_audiobook.generator import (
    SKIP_TYPES,
    extract_plain_text,
    generate_audiobook,
    generate_chapter_audio,
    _slugify,
)


# --- extract_plain_text ---


def test_extract_empty():
    assert extract_plain_text("") == ""
    assert extract_plain_text("  ") == ""


def test_extract_non_json():
    assert extract_plain_text("Hello world") == "Hello world"


def test_extract_tiptap_paragraph():
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Hello world."}]},
        ],
    }
    result = extract_plain_text(json.dumps(doc))
    assert "Hello world." in result


def test_extract_tiptap_multiple_paragraphs():
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "First."}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "Second."}]},
        ],
    }
    result = extract_plain_text(json.dumps(doc))
    assert "First." in result
    assert "Second." in result


def test_extract_heading():
    doc = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Title"}]},
        ],
    }
    assert "Title" in extract_plain_text(json.dumps(doc))


def test_extract_with_marks():
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Bold", "marks": [{"type": "bold"}]},
                    {"type": "text", "text": " text"},
                ],
            },
        ],
    }
    result = extract_plain_text(json.dumps(doc))
    assert "Bold" in result
    assert "text" in result


# --- _slugify ---


def test_slugify_basic():
    assert _slugify("Hello World") == "hello-world"


def test_slugify_special_chars():
    assert _slugify("Kapitel 1: Der Anfang!") == "kapitel-1-der-anfang"


def test_slugify_long():
    result = _slugify("A" * 100)
    assert len(result) <= 50


def test_slugify_empty():
    assert _slugify("") == ""


# --- SKIP_TYPES ---


def test_skip_types_contains_expected():
    assert "toc" in SKIP_TYPES
    assert "imprint" in SKIP_TYPES
    assert "index" in SKIP_TYPES
    assert "chapter" not in SKIP_TYPES


# --- generate_chapter_audio ---


@pytest.mark.asyncio
async def test_generate_chapter_audio_empty_content():
    engine = AsyncMock()
    result = await generate_chapter_audio(
        title="Empty", content="", output_dir=Path("/tmp"),
        chapter_index=1, engine=engine, language="de",
    )
    assert result is None
    engine.synthesize.assert_not_called()


@pytest.mark.asyncio
async def test_generate_chapter_audio_success():
    engine = AsyncMock()
    engine.synthesize = AsyncMock(return_value=Path("/tmp/001-test.mp3"))

    with tempfile.TemporaryDirectory() as tmp:
        result = await generate_chapter_audio(
            title="Test Chapter",
            content=json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello."}]}],
            }),
            output_dir=Path(tmp),
            chapter_index=1,
            engine=engine,
            language="de",
        )
        assert result is not None
        engine.synthesize.assert_called_once()
        call_args = engine.synthesize.call_args
        assert "Test Chapter" in call_args[1].get("text", "") or "Test Chapter" in str(call_args)


# --- generate_audiobook ---


@pytest.mark.asyncio
async def test_generate_audiobook_skips_types():
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(return_value=Path("/tmp/test.mp3"))
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "TOC", "content": "toc content", "chapter_type": "toc", "position": 0},
            {"title": "Chapter 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello."}]}],
            }), "chapter_type": "chapter", "position": 1},
            {"title": "Imprint", "content": "imprint text", "chapter_type": "imprint", "position": 2},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test Book",
                chapters=chapters,
                output_dir=Path(tmp),
            )
            assert result["skipped_count"] == 2  # toc + imprint
            assert result["generated_count"] == 1
            assert "TOC" in result["skipped"]
            assert "Imprint" in result["skipped"]


@pytest.mark.asyncio
async def test_generate_audiobook_handles_errors():
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(side_effect=RuntimeError("TTS failed"))
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "Chapter 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Text."}]}],
            }), "chapter_type": "chapter", "position": 1},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
            )
            assert result["error_count"] == 1
            assert result["errors"][0]["chapter"] == "Chapter 1"


@pytest.mark.asyncio
async def test_generate_audiobook_empty_chapters():
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_get.return_value = mock_engine

        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Empty Book", chapters=[], output_dir=Path(tmp),
            )
            assert result["generated_count"] == 0
            assert result["error_count"] == 0
