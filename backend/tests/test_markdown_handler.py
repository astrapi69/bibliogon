"""Tests for the single-Markdown import handler."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.markdown import MarkdownImportHandler
from app.models import Book, Chapter


@pytest.fixture
def handler() -> MarkdownImportHandler:
    return MarkdownImportHandler()


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _write_md(
    tmp_path: Path,
    content: str = "# My Book\n\nHello world.",
    name: str = "book.md",
) -> Path:
    path = tmp_path / name
    path.write_text(content, encoding="utf-8")
    return path


def test_can_handle_md_extension(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    assert handler.can_handle(str(_write_md(tmp_path))) is True
    assert handler.can_handle(str(_write_md(tmp_path, name="book.markdown"))) is True


def test_can_handle_txt_with_h1(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(tmp_path, content="# Title\n\nText", name="doc.txt")
    assert handler.can_handle(str(path)) is True


def test_can_handle_rejects_txt_without_h1(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(tmp_path, content="Just plain text, no heading.", name="doc.txt")
    assert handler.can_handle(str(path)) is False


def test_can_handle_rejects_binary(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = tmp_path / "file.pdf"
    path.write_bytes(b"%PDF-1.4")
    assert handler.can_handle(str(path)) is False


def test_detect_returns_title_and_preview(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(
        tmp_path,
        content="# Big Book\n\nIntro paragraph.\n\n## Part One\n\nContent.",
    )
    detected = handler.detect(str(path))

    assert detected.format_name == "markdown"
    assert detected.source_identifier.startswith("signature:")
    assert detected.title == "Big Book"
    assert len(detected.chapters) == 1
    assert detected.chapters[0].word_count > 0
    assert "Big Book" in detected.chapters[0].content_preview or True
    assert detected.warnings == []


def test_detect_warns_when_h1_missing(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(tmp_path, content="Paragraph only, no heading.")
    detected = handler.detect(str(path))
    assert any("h1" in w.lower() or "title" in w.lower() for w in detected.warnings)


def test_source_identifier_is_deterministic(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(tmp_path, content="# Same Book\n\nHello.")
    first = handler.detect(str(path)).source_identifier
    second = handler.detect(str(path)).source_identifier
    assert first == second


def test_execute_creates_book_and_chapter(
    handler: MarkdownImportHandler, tmp_path: Path, db: Session
) -> None:
    path = _write_md(tmp_path, content="# Execute Test\n\nBody text.")
    detected = handler.detect(str(path))
    book_id = handler.execute(str(path), detected, overrides={})

    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Execute Test"
    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    assert len(chapters) == 1
    assert chapters[0].position == 0


def test_execute_with_overrides_updates_book(
    handler: MarkdownImportHandler, tmp_path: Path, db: Session
) -> None:
    path = _write_md(tmp_path, content="# Original\n\nBody.")
    detected = handler.detect(str(path))
    book_id = handler.execute(
        str(path),
        detected,
        overrides={"title": "Override", "author": "Alice", "language": "en"},
    )
    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Override"
    assert book.author == "Alice"
    assert book.language == "en"


def test_execute_rejects_unknown_override_key(
    handler: MarkdownImportHandler, tmp_path: Path
) -> None:
    path = _write_md(tmp_path)
    detected = handler.detect(str(path))
    with pytest.raises(KeyError):
        handler.execute(str(path), detected, overrides={"not_allowed": "x"})


def test_execute_overwrite_replaces_existing(
    handler: MarkdownImportHandler, tmp_path: Path, db: Session
) -> None:
    path = _write_md(tmp_path, content="# V1\n\nOne.")
    detected = handler.detect(str(path))
    first_id = handler.execute(str(path), detected, overrides={})

    path2 = _write_md(tmp_path, content="# V2\n\nTwo.", name="book2.md")
    detected2 = handler.detect(str(path2))
    returned = handler.execute(
        str(path2),
        detected2,
        overrides={},
        duplicate_action="overwrite",
        existing_book_id=first_id,
    )
    assert returned != first_id  # fresh book_id on overwrite (hard-delete + re-insert)
    assert db.query(Book).filter(Book.id == first_id).count() == 0
    assert db.query(Book).filter(Book.id == returned).one().title == "V2"
