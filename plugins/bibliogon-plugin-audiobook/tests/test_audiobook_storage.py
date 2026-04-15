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


# --- Incremental persistence: flush_chapter + finalize_audiobook ---

def test_has_audiobook_requires_complete_status(tmp_path: Path, source_dir: Path):
    """A partial run (status=in_progress) must NOT count as an existing audiobook.

    Pins the contract that powers the overwrite warning: users only
    see the "audiobook already exists" 409 when a previous export
    actually completed, not while their own currently-running
    incremental flushes are landing.
    """
    audiobook_storage.flush_chapter(
        book_id="book-partial",
        source_mp3=source_dir / "001-vorwort.mp3",
        chapter_extras={"title": "Vorwort", "position": 0},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    # load_metadata finds it (the UI can read partial state)
    meta = audiobook_storage.load_metadata("book-partial", root=tmp_path)
    assert meta is not None
    assert meta["status"] == "in_progress"
    # but has_audiobook returns False (no overwrite warning yet)
    assert audiobook_storage.has_audiobook("book-partial", root=tmp_path) is False


def test_flush_chapter_then_finalize_flips_status(tmp_path: Path, source_dir: Path):
    audiobook_storage.flush_chapter(
        book_id="book-seq",
        source_mp3=source_dir / "001-vorwort.mp3",
        chapter_extras={"title": "Vorwort", "position": 0},
        base_metadata={"engine": "edge-tts", "voice": "Katja"},
        root=tmp_path,
    )
    audiobook_storage.flush_chapter(
        book_id="book-seq",
        source_mp3=source_dir / "002-kapitel-1.mp3",
        chapter_extras={"title": "Kapitel 1", "position": 1},
        base_metadata={"engine": "edge-tts", "voice": "Katja"},
        root=tmp_path,
    )
    audiobook_storage.finalize_audiobook(
        book_id="book-seq",
        source_dir=source_dir,
        merged_file="test-book-audiobook.mp3",
        base_metadata={"engine": "edge-tts", "voice": "Katja", "merge_mode": "both"},
        root=tmp_path,
    )
    meta = audiobook_storage.load_metadata("book-seq", root=tmp_path)
    assert meta["status"] == "complete"
    assert meta["created_at"]
    assert {c["title"] for c in meta["chapter_files"]} == {"Vorwort", "Kapitel 1"}
    assert meta["merged"]["filename"] == "audiobook.mp3"
    assert audiobook_storage.has_audiobook("book-seq", root=tmp_path) is True


def test_cancellation_preserves_completed_chapters(tmp_path: Path, source_dir: Path):
    """Partial writes survive when finalize_audiobook is never reached.

    Simulates the cancellation path: two chapters get flushed, then
    an exception prevents finalize from running. The chapters must
    remain on disk AND visible in metadata.json.
    """
    audiobook_storage.flush_chapter(
        book_id="book-cancel",
        source_mp3=source_dir / "001-vorwort.mp3",
        chapter_extras={"title": "Vorwort", "position": 0},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    audiobook_storage.flush_chapter(
        book_id="book-cancel",
        source_mp3=source_dir / "002-kapitel-1.mp3",
        chapter_extras={"title": "Kapitel 1", "position": 1},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    # Simulate cancellation: the caller's mark_failed annotates the
    # partial state. No finalize call.
    audiobook_storage.mark_failed("book-cancel", "Cancelled by user", root=tmp_path)

    target = tmp_path / "book-cancel" / "audiobook"
    assert (target / "chapters" / "001-vorwort.mp3").exists()
    assert (target / "chapters" / "002-kapitel-1.mp3").exists()
    meta = audiobook_storage.load_metadata("book-cancel", root=tmp_path)
    assert meta["status"] == "in_progress"
    assert meta["last_error"] == "Cancelled by user"
    assert len(meta["chapter_files"]) == 2
    # has_audiobook still False - the partial run should trigger
    # "skip existing"/"regenerate all" on re-export, not the plain
    # overwrite warning that implies a completed audiobook exists.
    assert audiobook_storage.has_audiobook("book-cancel", root=tmp_path) is False


def test_flush_chapter_same_path_is_noop_copy(tmp_path: Path):
    """When source_mp3 is already in the persistent dir (direct-write
    path), flush must not raise SameFileError on self-copy."""
    chapters_dir = audiobook_storage.prepare_chapters_dir("book-direct", root=tmp_path)
    existing = chapters_dir / "001-inplace.mp3"
    existing.write_bytes(b"\x00already here\x00")

    meta = audiobook_storage.flush_chapter(
        book_id="book-direct",
        source_mp3=existing,
        chapter_extras={"title": "Inplace", "position": 0},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    assert existing.exists()
    assert existing.read_bytes() == b"\x00already here\x00"
    assert meta["chapter_files"][0]["filename"] == "001-inplace.mp3"


def test_flush_chapter_updates_existing_entry(tmp_path: Path, source_dir: Path):
    """Re-flushing the same filename replaces the entry, not appends."""
    audiobook_storage.flush_chapter(
        book_id="book-refl",
        source_mp3=source_dir / "001-vorwort.mp3",
        chapter_extras={"title": "First take", "position": 0},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    audiobook_storage.flush_chapter(
        book_id="book-refl",
        source_mp3=source_dir / "001-vorwort.mp3",
        chapter_extras={"title": "Second take", "position": 0},
        base_metadata={"engine": "edge-tts"},
        root=tmp_path,
    )
    meta = audiobook_storage.load_metadata("book-refl", root=tmp_path)
    assert len(meta["chapter_files"]) == 1
    assert meta["chapter_files"][0]["title"] == "Second take"


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
