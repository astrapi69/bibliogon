"""Tests for the persistent audiobook storage helpers."""

import json
from pathlib import Path

import pytest

from bibliogon_audiobook import audiobook_storage


@pytest.fixture
def source_dir(tmp_path: Path) -> Path:
    """A temp directory containing two chapter MP3s and a merged file."""
    src = tmp_path / "generator_out"
    src.mkdir()
    (src / "001-vorwort.mp3").write_bytes(b"\x00\x01vorwort\x00")
    (src / "002-kapitel-1.mp3").write_bytes(b"\x00\x01kapitel1\x00\x02")
    (src / "test-book-audiobook.mp3").write_bytes(b"\x00\x01merged content\x00\x02\x03")
    return src


def test_persist_audiobook_writes_chapters_merged_and_metadata(tmp_path: Path, source_dir: Path):
    """All files end up in chapters/ + audiobook.mp3 + metadata.json."""
    metadata = audiobook_storage.persist_audiobook(
        book_id="book-1",
        source_dir=source_dir,
        generated_files=["001-vorwort.mp3", "002-kapitel-1.mp3"],
        merged_file="test-book-audiobook.mp3",
        metadata={"engine": "edge-tts", "voice": "Katja", "language": "de", "merge_mode": "both"},
        root=tmp_path,
    )

    target = tmp_path / "book-1" / "audiobook"
    assert (target / "chapters" / "001-vorwort.mp3").exists()
    assert (target / "chapters" / "002-kapitel-1.mp3").exists()
    assert (target / "audiobook.mp3").exists()
    assert (target / "metadata.json").exists()

    on_disk = json.loads((target / "metadata.json").read_text())
    assert on_disk["engine"] == "edge-tts"
    assert on_disk["book_id"] == "book-1"
    assert on_disk["created_at"]  # ISO timestamp present
    assert {c["filename"] for c in on_disk["chapter_files"]} == {
        "001-vorwort.mp3", "002-kapitel-1.mp3",
    }
    assert on_disk["merged"]["filename"] == "audiobook.mp3"
    assert metadata["merged"]["size_bytes"] > 0


def test_persist_audiobook_without_merged_file(tmp_path: Path, source_dir: Path):
    """merge_mode=separate -> no audiobook.mp3 in the persisted layout."""
    audiobook_storage.persist_audiobook(
        book_id="book-2",
        source_dir=source_dir,
        generated_files=["001-vorwort.mp3"],
        merged_file=None,
        metadata={"engine": "edge-tts", "merge_mode": "separate"},
        root=tmp_path,
    )
    target = tmp_path / "book-2" / "audiobook"
    assert (target / "chapters" / "001-vorwort.mp3").exists()
    assert not (target / "audiobook.mp3").exists()
    on_disk = json.loads((target / "metadata.json").read_text())
    assert on_disk["merged"] is None


def test_persist_audiobook_overwrites_previous(tmp_path: Path, source_dir: Path):
    """A second call replaces the previous persistence directory entirely."""
    audiobook_storage.persist_audiobook(
        book_id="book-3", source_dir=source_dir,
        generated_files=["001-vorwort.mp3"], merged_file=None,
        metadata={"engine": "old"}, root=tmp_path,
    )
    # New source dir, only one different file:
    new_src = tmp_path / "second_out"
    new_src.mkdir()
    (new_src / "099-only.mp3").write_bytes(b"only")
    audiobook_storage.persist_audiobook(
        book_id="book-3", source_dir=new_src,
        generated_files=["099-only.mp3"], merged_file=None,
        metadata={"engine": "new"}, root=tmp_path,
    )
    target = tmp_path / "book-3" / "audiobook"
    assert not (target / "chapters" / "001-vorwort.mp3").exists()
    assert (target / "chapters" / "099-only.mp3").exists()
    assert json.loads((target / "metadata.json").read_text())["engine"] == "new"


def test_has_and_load_metadata_handle_missing_book(tmp_path: Path):
    assert audiobook_storage.has_audiobook("ghost", root=tmp_path) is False
    assert audiobook_storage.load_metadata("ghost", root=tmp_path) is None


def test_chapter_file_path_blocks_path_traversal(tmp_path: Path, source_dir: Path):
    """A crafted ../-style filename must not escape the chapters dir."""
    audiobook_storage.persist_audiobook(
        book_id="book-4", source_dir=source_dir,
        generated_files=["001-vorwort.mp3"], merged_file=None,
        metadata={}, root=tmp_path,
    )
    legit = audiobook_storage.chapter_file_path("book-4", "001-vorwort.mp3", root=tmp_path)
    assert legit is not None
    assert legit.exists()

    # Try to escape via traversal:
    escape = audiobook_storage.chapter_file_path("book-4", "../../../etc/passwd", root=tmp_path)
    assert escape is None


def test_delete_audiobook_removes_directory(tmp_path: Path, source_dir: Path):
    audiobook_storage.persist_audiobook(
        book_id="book-5", source_dir=source_dir,
        generated_files=["001-vorwort.mp3"], merged_file=None,
        metadata={}, root=tmp_path,
    )
    assert audiobook_storage.has_audiobook("book-5", root=tmp_path) is True
    assert audiobook_storage.delete_audiobook("book-5", root=tmp_path) is True
    assert audiobook_storage.has_audiobook("book-5", root=tmp_path) is False
    # Idempotent: a second call returns False without raising.
    assert audiobook_storage.delete_audiobook("book-5", root=tmp_path) is False
