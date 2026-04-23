"""Tests for the BookImportSource model.

Covers the row-level contract: create, query by source identifier,
cascade delete with the parent book, and one-source-per-book
relationship on Book.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Book, BookImportSource


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_book(db: Session, title: str = "Test Book") -> Book:
    book = Book(title=title, author="Alice", language="en")
    db.add(book)
    db.flush()
    return book


def test_create_and_roundtrip(db: Session) -> None:
    book = _make_book(db)
    db.add(
        BookImportSource(
            book_id=book.id,
            source_identifier="sha256:deadbeef",
            source_type="bgb",
            format_name="bgb",
        )
    )
    db.flush()

    row = db.query(BookImportSource).filter_by(book_id=book.id).one()
    assert row.source_identifier == "sha256:deadbeef"
    assert row.source_type == "bgb"
    assert row.imported_at is not None


def test_query_by_source_identifier(db: Session) -> None:
    book_a = _make_book(db, title="A")
    book_b = _make_book(db, title="B")
    db.add_all(
        [
            BookImportSource(
                book_id=book_a.id,
                source_identifier="sha256:aaa",
                source_type="bgb",
                format_name="bgb",
            ),
            BookImportSource(
                book_id=book_b.id,
                source_identifier="sha256:bbb",
                source_type="bgb",
                format_name="bgb",
            ),
        ]
    )
    db.flush()

    hit = (
        db.execute(
            select(BookImportSource).where(
                BookImportSource.source_identifier == "sha256:aaa",
                BookImportSource.source_type == "bgb",
            )
        )
        .scalars()
        .one()
    )
    assert hit.book_id == book_a.id


def test_cascade_delete_removes_import_source(db: Session) -> None:
    book = _make_book(db)
    db.add(
        BookImportSource(
            book_id=book.id,
            source_identifier="sha256:ccc",
            source_type="bgb",
            format_name="bgb",
        )
    )
    db.flush()
    book_id = book.id
    db.delete(book)
    db.flush()
    assert (
        db.query(BookImportSource).filter_by(book_id=book_id).count() == 0
    ), "BookImportSource should cascade-delete with its Book"


def test_book_import_source_relationship_is_single(db: Session) -> None:
    """Book.import_source is uselist=False; each book has at most one."""
    book = _make_book(db)
    db.add(
        BookImportSource(
            book_id=book.id,
            source_identifier="sha256:ddd",
            source_type="bgb",
            format_name="bgb",
        )
    )
    db.flush()
    db.refresh(book)
    assert book.import_source is not None
    assert book.import_source.source_identifier == "sha256:ddd"


def test_missing_source_identifier_is_rejected(db: Session) -> None:
    book = _make_book(db)
    db.add(
        BookImportSource(
            book_id=book.id,
            source_identifier=None,  # type: ignore[arg-type]
            source_type="bgb",
            format_name="bgb",
        )
    )
    with pytest.raises(Exception):  # noqa: BLE001 - SQLAlchemy raises IntegrityError
        db.flush()
