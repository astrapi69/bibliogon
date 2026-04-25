"""Tests for the ``.bgb`` import handler."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.bgb import BgbImportHandler
from app.models import Book


@pytest.fixture
def handler() -> BgbImportHandler:
    return BgbImportHandler()


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _write_bgb(
    tmp_path: Path,
    book_id: str = "book-1",
    title: str = "Test",
    author: str = "Alice",
    chapters: list[dict] | None = None,
    name: str = "backup.bgb",
) -> Path:
    chapters = chapters or [
        {"id": "ch-1", "title": "Chapter 1", "content": "Hello world.", "position": 0},
    ]
    book_blob = {
        "id": book_id,
        "title": title,
        "author": author,
        "language": "en",
        "chapters": chapters,
        "assets": [],
    }

    manifest = {"format": "bibliogon-backup", "version": 1}

    bgb = tmp_path / name
    with zipfile.ZipFile(bgb, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr(f"books/{book_id}/book.json", json.dumps(book_blob))
        for ch in chapters:
            zf.writestr(
                f"books/{book_id}/chapters/{ch['id']}.json", json.dumps(ch)
            )
    return bgb


def test_can_handle_bgb_extension(handler: BgbImportHandler, tmp_path: Path) -> None:
    bgb = _write_bgb(tmp_path)
    assert handler.can_handle(str(bgb)) is True


def test_can_handle_rejects_other_extensions(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    txt = tmp_path / "data.txt"
    txt.write_text("not a zip")
    assert handler.can_handle(str(txt)) is False

    zip_path = tmp_path / "archive.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("x.txt", "y")
    assert handler.can_handle(str(zip_path)) is False  # wrong extension


def test_detect_returns_expected_shape(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_bgb(
        tmp_path,
        title="My Book",
        author="Bob",
        chapters=[
            {"id": "a", "title": "One", "content": "word " * 10, "position": 0},
            {"id": "b", "title": "Two", "content": "word " * 5, "position": 1},
        ],
    )
    detected = handler.detect(str(bgb))

    assert detected.format_name == "bgb"
    assert detected.source_identifier.startswith("sha256:")
    assert detected.title == "My Book"
    assert detected.author == "Bob"
    assert detected.language == "en"
    assert len(detected.chapters) == 2
    assert detected.chapters[0].title == "One"
    assert detected.chapters[0].word_count == 10
    assert detected.warnings == []  # well-formed backup


def test_source_identifier_is_deterministic(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_bgb(tmp_path, book_id="same", title="Same")
    first = handler.detect(str(bgb)).source_identifier
    second = handler.detect(str(bgb)).source_identifier
    assert first == second

    expected = f"sha256:{hashlib.sha256(bgb.read_bytes()).hexdigest()}"
    assert first == expected


def test_detect_warns_when_manifest_is_missing(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bad = tmp_path / "bad.bgb"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("books/x/book.json", json.dumps({"id": "x", "title": "T", "author": "A"}))
    detected = handler.detect(str(bad))
    assert any("manifest" in w.lower() for w in detected.warnings)


def test_detect_warns_on_unexpected_manifest_format(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bad = tmp_path / "bad.bgb"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("manifest.json", json.dumps({"format": "something-else"}))
        zf.writestr(
            "books/x/book.json",
            json.dumps({"id": "x", "title": "T", "author": "A"}),
        )
    detected = handler.detect(str(bad))
    assert any("manifest" in w.lower() or "format" in w.lower() for w in detected.warnings)


def test_execute_creates_book(
    handler: BgbImportHandler, tmp_path: Path, db: Session
) -> None:
    bgb = _write_bgb(tmp_path, book_id="exec-1", title="Exec Test")
    detected = handler.detect(str(bgb))
    book_id = handler.execute(str(bgb), detected, overrides={})
    assert book_id == "exec-1"
    row = db.query(Book).filter(Book.id == "exec-1").one()
    assert row.title == "Exec Test"


def test_execute_with_overrides_updates_columns(
    handler: BgbImportHandler, tmp_path: Path, db: Session
) -> None:
    bgb = _write_bgb(tmp_path, book_id="exec-2", title="Original")
    detected = handler.detect(str(bgb))
    handler.execute(
        str(bgb), detected, overrides={"title": "Overridden", "language": "de"}
    )
    row = db.query(Book).filter(Book.id == "exec-2").one()
    assert row.title == "Overridden"
    assert row.language == "de"


def test_execute_rejects_unknown_override_key(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_bgb(tmp_path, book_id="exec-3")
    detected = handler.detect(str(bgb))
    with pytest.raises(KeyError):
        handler.execute(str(bgb), detected, overrides={"not_a_column": "x"})


def test_execute_overwrite_replaces_existing(
    handler: BgbImportHandler, tmp_path: Path, db: Session
) -> None:
    bgb = _write_bgb(tmp_path, book_id="dup-1", title="V1")
    detected = handler.detect(str(bgb))
    handler.execute(str(bgb), detected, overrides={})

    bgb2 = _write_bgb(tmp_path, book_id="dup-1", title="V2", name="backup2.bgb")
    detected2 = handler.detect(str(bgb2))
    returned = handler.execute(
        str(bgb2),
        detected2,
        overrides={},
        duplicate_action="overwrite",
        existing_book_id="dup-1",
    )
    assert returned == "dup-1"
    row = db.query(Book).filter(Book.id == "dup-1").one()
    assert row.title == "V2"
    assert db.query(Book).filter(Book.id == "dup-1").count() == 1  # no duplicate


# --- Multi-book BGB ---


def _write_multi_bgb(
    tmp_path: Path, book_ids: list[str], name: str = "multi.bgb"
) -> Path:
    """Build a .bgb that carries N books inside one archive."""
    manifest = {"format": "bibliogon-backup", "version": 1}
    bgb = tmp_path / name
    with zipfile.ZipFile(bgb, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        for idx, bid in enumerate(book_ids):
            blob = {
                "id": bid,
                "title": f"Book {idx + 1}",
                "author": f"Author {idx + 1}",
                "language": "en",
                "chapters": [
                    {
                        "id": f"{bid}-ch1",
                        "title": "Ch 1",
                        "content": "Body.",
                        "position": 0,
                    },
                ],
                "assets": [],
            }
            zf.writestr(f"books/{bid}/book.json", json.dumps(blob))
            zf.writestr(
                f"books/{bid}/chapters/{bid}-ch1.json",
                json.dumps(blob["chapters"][0]),
            )
    return bgb


def test_detect_multi_book_surfaces_books_list(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_multi_bgb(tmp_path, ["mb-1", "mb-2", "mb-3"])
    detected = handler.detect(str(bgb))
    assert detected.is_multi_book is True
    assert detected.books is not None
    assert len(detected.books) == 3
    titles = {b.title for b in detected.books}
    assert titles == {"Book 1", "Book 2", "Book 3"}
    # Per-book source_identifier follows sha256:<hash>::<uuid> shape.
    sids = {b.source_identifier for b in detected.books}
    assert all("::mb-" in sid for sid in sids)
    # Scalar title still carries first book for backwards compat.
    assert detected.title == "Book 1"


def test_detect_single_book_keeps_is_multi_book_false(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_bgb(tmp_path, book_id="solo")
    detected = handler.detect(str(bgb))
    assert detected.is_multi_book is False
    assert detected.books is None


def test_execute_multi_imports_all_books_when_no_filter(
    handler: BgbImportHandler, tmp_path: Path, db: Session
) -> None:
    bgb = _write_multi_bgb(tmp_path, ["mb-a", "mb-b"])
    detected = handler.detect(str(bgb))
    ids = handler.execute_multi(str(bgb), detected, overrides={})
    assert sorted(ids) == ["mb-a", "mb-b"]
    titles = {b.title for b in db.query(Book).filter(Book.id.in_(ids)).all()}
    assert titles == {"Book 1", "Book 2"}


def test_execute_multi_respects_selected_books(
    handler: BgbImportHandler, tmp_path: Path, db: Session
) -> None:
    bgb = _write_multi_bgb(tmp_path, ["sel-a", "sel-b", "sel-c"])
    detected = handler.detect(str(bgb))
    # Only import the second book.
    target_sid = next(
        b.source_identifier for b in detected.books if b.title == "Book 2"
    )
    ids = handler.execute_multi(
        str(bgb),
        detected,
        overrides={"selected_books": [target_sid]},
    )
    assert ids == ["sel-b"]
    rows = db.query(Book).filter(Book.id.in_(["sel-a", "sel-b", "sel-c"])).all()
    assert {b.id for b in rows} == {"sel-b"}


def test_execute_multi_empty_selection_raises(
    handler: BgbImportHandler, tmp_path: Path
) -> None:
    bgb = _write_multi_bgb(tmp_path, ["x", "y"])
    detected = handler.detect(str(bgb))
    with pytest.raises(ValueError, match="selected_books"):
        handler.execute_multi(
            str(bgb), detected, overrides={"selected_books": []}
        )
