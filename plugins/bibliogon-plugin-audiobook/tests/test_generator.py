"""Tests for audiobook generator module."""

import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bibliogon_audiobook.generator import (
    MERGE_MODES,
    SKIP_TYPES,
    bundle_audiobook_output,
    extract_plain_text,
    generate_audiobook,
    generate_chapter_audio,
    merge_mp3_files,
    is_ffmpeg_available,
    normalize_merge_mode,
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


@pytest.mark.asyncio
async def test_generate_audiobook_returns_merged_file_key():
    """Verify merged_file key is present in result."""
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_get.return_value = mock_engine

        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=[], output_dir=Path(tmp),
            )
            assert "merged_file" in result
            assert result["merged_file"] is None  # no files to merge
            assert result["merge_mode"] == "merged"  # default


# --- normalize_merge_mode (legacy bool migration) ---


def test_normalize_merge_mode_legacy_true():
    """True (legacy boolean) maps to 'merged'."""
    assert normalize_merge_mode(True) == "merged"


def test_normalize_merge_mode_legacy_false():
    """False (legacy boolean) maps to 'separate'."""
    assert normalize_merge_mode(False) == "separate"


def test_normalize_merge_mode_passthrough():
    for mode in MERGE_MODES:
        assert normalize_merge_mode(mode) == mode


def test_normalize_merge_mode_unknown_defaults_to_merged():
    assert normalize_merge_mode(None) == "merged"
    assert normalize_merge_mode("nonsense") == "merged"
    assert normalize_merge_mode(42) == "merged"


# --- bundle_audiobook_output (3-mode export) ---


def _make_chapter_files(tmp: Path, names: list[str]) -> None:
    for name in names:
        (tmp / name).write_bytes(b"fake mp3")


def test_bundle_separate_zips_only_chapters():
    import zipfile
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        _make_chapter_files(d, ["001-a.mp3", "002-b.mp3"])
        # Pretend a merged file also exists on disk; it must NOT be included.
        (d / "test-audiobook.mp3").write_bytes(b"merged")
        result = {
            "merge_mode": "separate",
            "generated_files": ["001-a.mp3", "002-b.mp3"],
            "merged_file": None,
        }
        out = bundle_audiobook_output(result, d, "Test")
        assert out is not None and out.suffix == ".zip"
        with zipfile.ZipFile(out) as zf:
            names = zf.namelist()
        assert "001-a.mp3" in names
        assert "002-b.mp3" in names
        assert "test-audiobook.mp3" not in names


def test_bundle_merged_returns_single_mp3():
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        _make_chapter_files(d, ["001-a.mp3", "002-b.mp3"])
        merged = d / "test-audiobook.mp3"
        merged.write_bytes(b"merged")
        result = {
            "merge_mode": "merged",
            "generated_files": ["001-a.mp3", "002-b.mp3"],
            "merged_file": "test-audiobook.mp3",
        }
        out = bundle_audiobook_output(result, d, "Test")
        assert out == merged
        assert out.suffix == ".mp3"


def test_bundle_both_zips_chapters_and_merged():
    import zipfile
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        _make_chapter_files(d, ["001-a.mp3", "002-b.mp3"])
        (d / "test-audiobook.mp3").write_bytes(b"merged")
        result = {
            "merge_mode": "both",
            "generated_files": ["001-a.mp3", "002-b.mp3"],
            "merged_file": "test-audiobook.mp3",
        }
        out = bundle_audiobook_output(result, d, "Test")
        assert out is not None and out.suffix == ".zip"
        with zipfile.ZipFile(out) as zf:
            names = zf.namelist()
        assert "001-a.mp3" in names
        assert "002-b.mp3" in names
        assert "test-audiobook.mp3" in names


def test_bundle_returns_none_when_nothing_generated():
    with tempfile.TemporaryDirectory() as tmp:
        result = {"merge_mode": "merged", "generated_files": [], "merged_file": None}
        assert bundle_audiobook_output(result, Path(tmp), "Test") is None


@pytest.mark.asyncio
async def test_generate_audiobook_emits_progress_events():
    """progress_callback must receive start, chapter_*, and done events."""
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(return_value=Path("/tmp/x.mp3"))
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "TOC", "content": "x", "chapter_type": "toc", "position": 0},
            {"title": "Ch 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hi."}]}],
            }), "chapter_type": "chapter", "position": 1},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            await generate_audiobook(
                book_title="Test",
                chapters=chapters,
                output_dir=Path(tmp),
                progress_callback=cb,
            )

    types = [e[0] for e in events]
    assert types[0] == "start"
    assert "chapter_skipped" in types  # the toc
    assert "chapter_start" in types
    assert "chapter_done" in types
    assert types[-1] == "done"
    # start payload knows the total
    assert events[0][1]["total"] == 2
    assert events[0][1]["book_title"] == "Test"


@pytest.mark.asyncio
async def test_generate_audiobook_progress_callback_failure_does_not_kill_export():
    """A broken subscriber must not abort the generator."""
    async def bad_cb(event_type: str, payload: dict) -> None:
        raise RuntimeError("subscriber blew up")

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_get.return_value = AsyncMock()
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test",
                chapters=[],
                output_dir=Path(tmp),
                progress_callback=bad_cb,
            )
            assert result["generated_count"] == 0  # finished cleanly


@pytest.mark.asyncio
async def test_generate_audiobook_accepts_legacy_bool_true():
    """Backwards compatibility: legacy True must be treated as 'merged'."""
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_get.return_value = mock_engine
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=[], output_dir=Path(tmp), merge=True,
            )
            assert result["merge_mode"] == "merged"


@pytest.mark.asyncio
async def test_generate_audiobook_accepts_legacy_bool_false():
    """Backwards compatibility: legacy False must be treated as 'separate'."""
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_get.return_value = mock_engine
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=[], output_dir=Path(tmp), merge=False,
            )
            assert result["merge_mode"] == "separate"


# --- merge_mp3_files ---


def test_merge_no_files():
    with pytest.raises(ValueError, match="No input files"):
        merge_mp3_files([], Path("/tmp/out.mp3"))


def test_merge_single_file():
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.mp3"
        src.write_bytes(b"fake mp3 data")
        out = Path(tmp) / "output.mp3"
        result = merge_mp3_files([src], out)
        assert result.exists()
        assert result.read_bytes() == b"fake mp3 data"


def test_merge_creates_concat_list():
    """Test that merge with multiple files calls ffmpeg (mocked)."""
    with tempfile.TemporaryDirectory() as tmp:
        f1 = Path(tmp) / "001.mp3"
        f2 = Path(tmp) / "002.mp3"
        f1.write_bytes(b"data1")
        f2.write_bytes(b"data2")
        out = Path(tmp) / "merged.mp3"

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            merge_mp3_files([f1, f2], out)
            mock_run.assert_called_once()
            call_args = mock_run.call_args[0][0]
            assert "ffmpeg" in call_args
            assert "-f" in call_args
            assert "concat" in call_args


def test_merge_ffmpeg_not_found():
    with tempfile.TemporaryDirectory() as tmp:
        f1 = Path(tmp) / "001.mp3"
        f2 = Path(tmp) / "002.mp3"
        f1.write_bytes(b"data1")
        f2.write_bytes(b"data2")
        out = Path(tmp) / "merged.mp3"

        with patch("subprocess.run", side_effect=FileNotFoundError):
            with pytest.raises(RuntimeError, match="ffmpeg not found"):
                merge_mp3_files([f1, f2], out)


def test_merge_ffmpeg_fails():
    with tempfile.TemporaryDirectory() as tmp:
        f1 = Path(tmp) / "001.mp3"
        f2 = Path(tmp) / "002.mp3"
        f1.write_bytes(b"data1")
        f2.write_bytes(b"data2")
        out = Path(tmp) / "merged.mp3"

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="error output")
            with pytest.raises(RuntimeError, match="ffmpeg failed"):
                merge_mp3_files([f1, f2], out)


# --- is_ffmpeg_available ---


def test_is_ffmpeg_available_true():
    with patch("subprocess.run"):
        assert is_ffmpeg_available() is True


def test_is_ffmpeg_available_false():
    with patch("subprocess.run", side_effect=FileNotFoundError):
        assert is_ffmpeg_available() is False
