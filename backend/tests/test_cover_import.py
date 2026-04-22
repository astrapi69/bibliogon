"""Regression tests for cover-image handling during project import.

Two root causes covered:

1. write-book-template / Pandoc metadata.yaml ships the key as
   ``cover-image`` (hyphen), Bibliogon's older code only read
   ``cover_image`` (underscore).
2. ``_ASSET_TYPE_MAP`` only recognized ``covers`` (plural). A ZIP with
   an ``assets/cover/`` folder got classified as ``figure``, so
   ``_maybe_set_cover_from_assets`` found nothing and the book landed
   on the dashboard with no cover.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Asset, Base, Book
from app.services.backup.asset_utils import _classify_asset_type, import_assets
from app.services.backup.project_import import _maybe_set_cover_from_assets


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_singular_cover_folder_classifies_as_cover_type() -> None:
    assert _classify_asset_type(Path("cover/cover.png")) == "cover"


def test_plural_covers_folder_classifies_as_cover_type() -> None:
    assert _classify_asset_type(Path("covers/cover.png")) == "cover"


def test_back_cover_folder_classifies_as_cover_type() -> None:
    assert _classify_asset_type(Path("back-cover/back.png")) == "cover"


def test_images_folder_classifies_as_figure() -> None:
    assert _classify_asset_type(Path("images/foo.png")) == "figure"


def test_maybe_set_cover_uses_cover_type_asset(db: Session) -> None:
    """A cover-type asset must be picked up even if metadata.yaml
    did not explicitly carry a cover-image path."""
    book = Book(id="b1", title="X", author="A", language="en")
    db.add(book)
    db.add(
        Asset(
            book_id="b1",
            filename="cover.png",
            asset_type="cover",
            path="uploads/b1/cover/cover.png",
        )
    )
    db.commit()

    _maybe_set_cover_from_assets(db, book)

    assert book.cover_image == "uploads/b1/cover/cover.png"


def test_maybe_set_cover_filename_fallback_when_no_cover_type(db: Session) -> None:
    """If the classifier missed the cover (e.g. ZIP used an unusual
    folder name), any asset whose filename contains 'cover' still wins
    over leaving the book coverless."""
    book = Book(id="b2", title="X", author="A", language="en")
    db.add(book)
    db.add(
        Asset(
            book_id="b2",
            filename="my-cover.png",
            asset_type="figure",
            path="uploads/b2/figure/my-cover.png",
        )
    )
    db.commit()

    _maybe_set_cover_from_assets(db, book)

    assert book.cover_image == "uploads/b2/figure/my-cover.png"


def test_maybe_set_cover_does_not_override_existing(db: Session) -> None:
    book = Book(
        id="b3",
        title="X",
        author="A",
        language="en",
        cover_image="assets/cover/custom.png",
    )
    db.add(book)
    db.add(
        Asset(
            book_id="b3",
            filename="cover.png",
            asset_type="cover",
            path="uploads/b3/cover/cover.png",
        )
    )
    db.commit()

    _maybe_set_cover_from_assets(db, book)

    assert book.cover_image == "assets/cover/custom.png"


def test_metadata_cover_image_hyphenated_key() -> None:
    """``cover-image`` (Pandoc / write-book-template convention) must be
    read, not just ``cover_image``."""
    from app.services.backup.project_import import _parse_project_metadata

    for key in ("cover-image", "cover_image", "cover"):
        meta = _parse_project_metadata(
            {"title": "X", "author": "A", key: "assets/cover/cover.png"},
            Path("/tmp"),
        )
        assert meta.cover_image == "assets/cover/cover.png", f"failed for key {key!r}"


def test_import_assets_classifies_singular_cover_folder(tmp_path: Path, db: Session) -> None:
    """End-to-end: import_assets walks a singular ``cover/`` folder,
    creates a cover-typed Asset row, and copies the file into
    uploads/{book}/cover/."""
    book = Book(id="b4", title="X", author="A", language="en")
    db.add(book)
    db.commit()

    src = tmp_path / "assets"
    (src / "cover").mkdir(parents=True)
    (src / "cover" / "cover.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    # import_assets reads UPLOAD_DIR at call time; point it elsewhere.
    from app.routers import assets as assets_mod

    original = assets_mod.UPLOAD_DIR
    assets_mod.UPLOAD_DIR = tmp_path / "uploads"
    try:
        count = import_assets(db, "b4", src)
    finally:
        assets_mod.UPLOAD_DIR = original
    db.commit()

    assert count == 1
    row = db.query(Asset).filter_by(book_id="b4").one()
    assert row.asset_type == "cover"
    assert row.filename == "cover.png"
    assert (tmp_path / "uploads" / "b4" / "cover" / "cover.png").exists()
