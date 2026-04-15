"""Tests for audiobook generator module."""

import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bibliogon_audiobook.generator import (
    MERGE_MODES,
    SKIP_TYPES,
    _content_hash,
    _write_cache_meta,
    bundle_audiobook_output,
    extract_plain_text,
    generate_audiobook,
    generate_chapter_audio,
    merge_mp3_files,
    is_ffmpeg_available,
    normalize_merge_mode,
    should_regenerate,
    _build_chapter_intro,
    _normalize_skip_set,
    _should_skip,
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


# --- on_chapter_persisted hook ---


@pytest.mark.asyncio
async def test_on_chapter_persisted_fires_per_chapter():
    """Hook is invoked once per successfully generated chapter, not at the end."""
    async def stub_synth(text, output_path, **kwargs):
        Path(output_path).write_bytes(b"\x00fake mp3\x00")

    calls: list[dict] = []

    async def on_persisted(mp3_path, chapter_info):
        # Verify the file is ALREADY on disk when the hook fires.
        assert mp3_path.exists()
        calls.append({"path": str(mp3_path), **chapter_info})

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(side_effect=stub_synth)
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "Intro", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A."}]}],
            }), "chapter_type": "chapter", "position": 0},
            {"title": "Chapter 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "B."}]}],
            }), "chapter_type": "chapter", "position": 1},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
                on_chapter_persisted=on_persisted,
            )
    assert result["generated_count"] == 2
    assert [c["title"] for c in calls] == ["Intro", "Chapter 1"]
    assert [c["position"] for c in calls] == [0, 1]
    assert all(not c["reused"] for c in calls)


@pytest.mark.asyncio
async def test_on_chapter_persisted_hook_exception_does_not_kill_export():
    """A broken subscriber must NOT abort the export. Cancellation
    robustness depends on every chapter_done making it past the hook."""
    async def stub_synth(text, output_path, **kwargs):
        Path(output_path).write_bytes(b"\x00fake\x00")

    async def broken_hook(mp3_path, chapter_info):
        raise RuntimeError("downstream write failed")

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(side_effect=stub_synth)
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "Chapter 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "X."}]}],
            }), "chapter_type": "chapter", "position": 0},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
                on_chapter_persisted=broken_hook,
            )
    assert result["generated_count"] == 1
    assert result["error_count"] == 0


@pytest.mark.asyncio
async def test_cache_hit_same_path_does_not_raise():
    """When output_dir == cache_dir (direct-persist mode) the cache-hit
    branch must skip the self-copy instead of crashing with SameFileError."""
    import hashlib
    from bibliogon_audiobook.generator import _slugify

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        plain = "Z."
        # Pre-populate the dir with a valid cached chapter matching the
        # content hash the generator will compute.
        title = "Chapter 1"
        fname = f"001-{_slugify(title)}.mp3"
        (tmp_path / fname).write_bytes(b"\x00cached\x00")
        (tmp_path / fname).with_suffix(".meta.json").write_text(
            json.dumps({
                "content_hash": hashlib.sha256(plain.encode("utf-8")).hexdigest(),
                "engine": "edge-tts",
                "voice": "",
                "speed": "1.0",
            }),
        )

        persisted: list[str] = []

        async def on_persisted(mp3_path, chapter_info):
            persisted.append(mp3_path.name)

        with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
            mock_engine = AsyncMock()
            mock_engine.synthesize = AsyncMock()
            mock_get.return_value = mock_engine

            chapters = [{
                "title": title, "content": json.dumps({
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": plain}]}],
                }), "chapter_type": "chapter", "position": 0,
            }]
            result = await generate_audiobook(
                book_title="Test", chapters=chapters,
                output_dir=tmp_path, cache_dir=tmp_path,
                on_chapter_persisted=on_persisted,
            )
        assert result["reused_count"] == 1
        assert persisted == [fname]
        # TTS engine must NOT have been called on a cache hit
        mock_engine.synthesize.assert_not_called()


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
    # chapter_done events carry a duration_seconds float so the
    # progress UI can show "01 | Vorwort fertig (12s)" - the field
    # was added in the prefix-format refactor and the frontend now
    # depends on it.
    done_events = [e for e in events if e[0] == "chapter_done"]
    assert done_events, "expected at least one chapter_done event"
    for _t, payload in done_events:
        assert "duration_seconds" in payload
        assert isinstance(payload["duration_seconds"], (int, float))
        assert payload["duration_seconds"] >= 0


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


# --- Skip-list helpers ---


def test_normalize_skip_set_lowercases_and_dedupes():
    assert _normalize_skip_set(["TOC", "  Imprint  ", "TOC"]) == {"toc", "imprint"}


def test_normalize_skip_set_none_uses_default():
    assert _normalize_skip_set(None) == {s.lower() for s in SKIP_TYPES}


def test_should_skip_matches_chapter_type():
    assert _should_skip("toc", "Inhaltsverzeichnis", {"toc"}) is True


def test_should_skip_matches_title_when_type_is_chapter():
    """User adds 'Glossar' to skip list - chapter typed 'chapter' is still skipped."""
    assert _should_skip("chapter", "Glossar", {"glossar"}) is True


def test_should_skip_is_case_insensitive_on_input_side():
    """The skip_set is expected pre-normalized; the input chapter is folded."""
    assert _should_skip("CHAPTER", "Danksagung", {"danksagung"}) is True
    assert _should_skip("TOC", "X", {"toc"}) is True


def test_should_skip_returns_false_for_normal_chapter():
    assert _should_skip("chapter", "Kapitel 1", {"toc", "imprint"}) is False


@pytest.mark.asyncio
async def test_generate_audiobook_skips_by_title():
    """skip_types matches against title when the type doesn't match."""
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(return_value=Path("/tmp/x.mp3"))
        mock_get.return_value = mock_engine

        chapters = [
            {"title": "Kapitel 1", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hi."}]}],
            }), "chapter_type": "chapter", "position": 1},
            {"title": "Glossar", "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hi."}]}],
            }), "chapter_type": "chapter", "position": 2},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
                skip_types={"glossar"},
            )
            assert "Glossar" in result["skipped"]
            assert "Kapitel 1" not in result["skipped"]


# --- Chapter intro (read_chapter_number) ---


def test_build_chapter_intro_german_ordinals():
    assert _build_chapter_intro(1, "de") == "Erstes Kapitel"
    assert _build_chapter_intro(10, "de") == "Zehntes Kapitel"


def test_build_chapter_intro_english_ordinals():
    assert _build_chapter_intro(1, "en") == "First chapter"
    assert _build_chapter_intro(3, "en") == "Third chapter"


def test_build_chapter_intro_falls_back_above_ten():
    assert _build_chapter_intro(11, "de") == "Kapitel 11"
    assert _build_chapter_intro(12, "en") == "Chapter 12"


def test_build_chapter_intro_unknown_language_uses_english_word():
    """Languages without an ordinal map still get the localized word fallback."""
    assert _build_chapter_intro(5, "es") == "Capitulo 5"
    assert _build_chapter_intro(5, "ja") == "チャプター 5"
    # Unknown language code -> English fallback
    assert _build_chapter_intro(5, "xx") == "Chapter 5"


def test_build_chapter_intro_normalizes_locale_form():
    """en-US should be treated as en."""
    assert _build_chapter_intro(2, "en-US") == "Second chapter"


@pytest.mark.asyncio
async def test_generate_audiobook_does_not_prepend_title_by_default():
    """Default: chapter title is NOT spoken (regression for the 'Kapitel X' bug)."""
    captured_text: list[str] = []

    async def fake_synth(text, output_path, voice="", language="de", rate=""):
        captured_text.append(text)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"x")

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        engine = AsyncMock()
        engine.synthesize = fake_synth
        mock_get.return_value = engine

        chapters = [{
            "title": "Vorwort",
            "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Body text."}]}],
            }),
            "chapter_type": "chapter",
            "position": 0,
        }]
        with tempfile.TemporaryDirectory() as tmp:
            await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
            )

    assert len(captured_text) == 1
    spoken = captured_text[0]
    # The spoken text must NOT start with the chapter title
    assert not spoken.startswith("Vorwort")
    assert "Body text." in spoken


@pytest.mark.asyncio
async def test_generate_audiobook_with_read_chapter_number_prepends_intro():
    """When read_chapter_number=True an ordinal intro is spoken."""
    captured_text: list[str] = []

    async def fake_synth(text, output_path, voice="", language="de", rate=""):
        captured_text.append(text)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"x")

    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        engine = AsyncMock()
        engine.synthesize = fake_synth
        mock_get.return_value = engine

        chapters = [{
            "title": "Vorwort",
            "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Body."}]}],
            }),
            "chapter_type": "chapter",
            "position": 0,
        }]
        with tempfile.TemporaryDirectory() as tmp:
            await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
                language="de", read_chapter_number=True,
            )

    assert captured_text[0].startswith("Erstes Kapitel")


@pytest.mark.asyncio
async def test_generate_audiobook_filename_uses_real_title_not_intro():
    """Even with read_chapter_number=True, the file slug is the chapter title."""
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        engine = AsyncMock()
        engine.synthesize = AsyncMock(return_value=Path("/tmp/x.mp3"))
        mock_get.return_value = engine

        chapters = [{
            "title": "Vorwort",
            "content": json.dumps({
                "type": "doc",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": "X."}]}],
            }),
            "chapter_type": "chapter",
            "position": 0,
        }]
        with tempfile.TemporaryDirectory() as tmp:
            result = await generate_audiobook(
                book_title="Test", chapters=chapters, output_dir=Path(tmp),
                language="de", read_chapter_number=True,
            )
            # The on-disk filename uses the actual title slug
            assert any("vorwort" in name for name in result["generated_files"])


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


# --- Content-hash cache ---


def test_should_regenerate_true_when_no_cached_file(tmp_path):
    assert should_regenerate("hello", tmp_path / "missing.mp3", "edge-tts", "v", "1.0") is True


def test_should_regenerate_true_when_no_sidecar(tmp_path):
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    assert should_regenerate("hello", mp3, "edge-tts", "v", "1.0") is True


def test_should_regenerate_false_on_full_match(tmp_path):
    text = "Hello world"
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    _write_cache_meta(mp3.with_suffix(".meta.json"), _content_hash(text), "edge-tts", "v1", "1.0")
    assert should_regenerate(text, mp3, "edge-tts", "v1", "1.0") is False


def test_should_regenerate_true_on_content_change(tmp_path):
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    _write_cache_meta(mp3.with_suffix(".meta.json"), _content_hash("old text"), "edge-tts", "v1", "1.0")
    assert should_regenerate("new text", mp3, "edge-tts", "v1", "1.0") is True


def test_should_regenerate_true_on_voice_change(tmp_path):
    text = "same"
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    _write_cache_meta(mp3.with_suffix(".meta.json"), _content_hash(text), "edge-tts", "old-voice", "1.0")
    assert should_regenerate(text, mp3, "edge-tts", "new-voice", "1.0") is True


def test_should_regenerate_true_on_engine_change(tmp_path):
    text = "same"
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    _write_cache_meta(mp3.with_suffix(".meta.json"), _content_hash(text), "edge-tts", "v", "1.0")
    assert should_regenerate(text, mp3, "elevenlabs", "v", "1.0") is True


def test_should_regenerate_true_on_speed_change(tmp_path):
    text = "same"
    mp3 = tmp_path / "ch.mp3"
    mp3.write_bytes(b"fake")
    _write_cache_meta(mp3.with_suffix(".meta.json"), _content_hash(text), "edge-tts", "v", "1.0")
    assert should_regenerate(text, mp3, "edge-tts", "v", "1.5") is True


@pytest.mark.asyncio
async def test_generate_audiobook_reuses_cached_chapters(tmp_path):
    """When cache_dir has a matching chapter, TTS is NOT called for it."""
    # Set up a cache directory with one pre-generated chapter
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cached_mp3 = cache_dir / "001-chapter-1.mp3"
    cached_mp3.write_bytes(b"cached audio bytes")

    chapter_content = json.dumps({
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello."}]}],
    })
    plain = extract_plain_text(chapter_content)
    _write_cache_meta(
        cached_mp3.with_suffix(".meta.json"),
        _content_hash(plain), "edge-tts", "", "1.0",
    )

    events: list[tuple[str, dict]] = []
    async def cb(event_type, payload):
        events.append((event_type, payload))

    output_dir = tmp_path / "output"
    with patch("bibliogon_audiobook.generator.get_engine") as mock_get:
        mock_engine = AsyncMock()
        mock_engine.synthesize = AsyncMock(return_value=Path("/tmp/x.mp3"))
        mock_get.return_value = mock_engine

        result = await generate_audiobook(
            book_title="Test",
            chapters=[{
                "title": "Chapter 1",
                "content": chapter_content,
                "chapter_type": "chapter",
                "position": 1,
            }],
            output_dir=output_dir,
            engine_id="edge-tts",
            voice="",
            rate="1.0",
            progress_callback=cb,
            cache_dir=cache_dir,
        )

    # The TTS engine must NOT have been called (cache hit)
    mock_engine.synthesize.assert_not_called()

    # The chapter was reused, not generated
    assert result["reused_count"] == 1
    assert result["generated_count"] == 1  # reused files are in generated_files too
    assert "Chapter 1" in result["reused"]

    # The output dir has the file (copied from cache)
    assert (output_dir / "001-chapter-1.mp3").exists()

    # A "chapter_reused" event was emitted
    event_types = [e[0] for e in events]
    assert "chapter_reused" in event_types
    assert "chapter_start" not in event_types  # no start event for reused
