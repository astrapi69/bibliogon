"""Regression tests for image-path rewriting during project import.

Covers the real-world cases seen in the write-book-template import bug
report (2026-04-22): source HTML with smart quotes around src values,
whitespace inserted inside filenames, and TipTap JSON containing the
same artefacts after a post-import editor save.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Asset, Base, Book, Chapter
from app.services.backup.asset_utils import backfill_image_paths, rewrite_image_paths


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


def _seed(db: Session, book_id: str, asset_filename: str = "diagram.jpg") -> str:
    db.add(Book(id=book_id, title="Test", author="A", language="en"))
    db.add(
        Asset(
            book_id=book_id,
            filename=asset_filename,
            asset_type="figure",
            path=f"uploads/{book_id}/figure/{asset_filename}",
        )
    )
    db.commit()
    return f"/api/books/{book_id}/assets/file/{asset_filename}"


def test_ascii_quoted_src_rewrites(db: Session) -> None:
    book_id = "book-1"
    api_url = _seed(db, book_id)
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content='<p><img src="assets/figures/diagram.jpg" alt="x"></p>',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 1
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert f'src="{api_url}"' in ch.content


def test_smart_quoted_src_rewrites(db: Session) -> None:
    """Curly-quoted src values (from typography-aware markdown exports)
    must be rewritten just like ASCII-quoted ones."""
    book_id = "book-2"
    api_url = _seed(db, book_id)
    # U+201C and U+201D around the src value; no ASCII quote anywhere.
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content="<p><img src=“assets/figures/diagram.jpg” alt=“x”></p>",
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 1
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert f'src="{api_url}"' in ch.content


def test_whitespace_inside_filename_normalized(db: Session) -> None:
    """Markdown line wrapping can insert spaces before the file extension.
    The rewrite must strip them before matching."""
    book_id = "book-3"
    api_url = _seed(db, book_id)
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content='<p><img src="assets/figures/diagram. jpg" alt="x"></p>',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 1
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert f'src="{api_url}"' in ch.content


def test_tiptap_json_src_rewrites(db: Session) -> None:
    """When a chapter was saved as TipTap JSON post-import, the rewrite
    must still find the src key and produce a JSON-safe replacement."""
    book_id = "book-4"
    api_url = _seed(db, book_id)
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content=(
                '{"type":"doc","content":[{"type":"imageFigure",'
                '"attrs":{"src":"assets/figures/diagram.jpg","alt":"x"}}]}'
            ),
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 1
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert f'"src":"{api_url}"' in ch.content


def test_truncated_src_stem_matched(db: Session) -> None:
    """TipTap's HTML parser sometimes truncates a smart-quoted src to
    ``“assets/foo.`` (extension lost). Best-effort stem match must still
    bind it to the correct asset filename."""
    book_id = "book-5"
    api_url = _seed(db, book_id, asset_filename="chapter_01_flimmern.jpg")
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content=(
                '{"type":"imageFigure","attrs":'
                '{"src":"“assets/chapter_01_flimmern.","alt":"x"}}'
            ),
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 1
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert f'"src":"{api_url}"' in ch.content


def test_rewrite_is_idempotent(db: Session) -> None:
    book_id = "book-6"
    _seed(db, book_id)
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content='<p><img src="assets/figures/diagram.jpg"></p>',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    first = rewrite_image_paths(db, book_id)
    second = rewrite_image_paths(db, book_id)
    assert first == 1
    assert second == 0


def test_unknown_asset_leaves_src_alone(db: Session) -> None:
    """If the referenced filename is not in the asset table, leave the tag
    as-is so the image can be debugged rather than silently broken."""
    book_id = "book-7"
    _seed(db, book_id, asset_filename="known.jpg")
    content = '<p><img src="assets/unknown.jpg"></p>'
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content=content,
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    assert rewrite_image_paths(db, book_id) == 0
    ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert ch.content == content


def test_backfill_commits(db: Session) -> None:
    book_id = "book-8"
    _seed(db, book_id)
    db.add(
        Chapter(
            book_id=book_id,
            title="C1",
            content='<p><img src="assets/figures/diagram.jpg"></p>',
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()

    modified = backfill_image_paths(db, book_id)
    assert modified == 1
    # New session sees the committed change.
    fresh_ch = db.query(Chapter).filter_by(book_id=book_id).one()
    assert "/api/books/" in fresh_ch.content
