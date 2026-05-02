"""Tests for the markdown-folder import handler (CIO-03 foundation)."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.markdown_folder import MarkdownFolderHandler
from app.models import Asset, Book, Chapter


@pytest.fixture
def handler() -> MarkdownFolderHandler:
    return MarkdownFolderHandler()


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _folder_with(tmp_path: Path, files: dict[str, str | bytes]) -> Path:
    root = tmp_path / "project"
    root.mkdir()
    for rel, content in files.items():
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            dest.write_bytes(content)
        else:
            dest.write_text(content, encoding="utf-8")
    return root


def test_can_handle_directory_with_md(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(tmp_path, {"01-intro.md": "# Intro\n\nHi."})
    assert handler.can_handle(str(root)) is True


def test_can_handle_rejects_empty_directory(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    assert handler.can_handle(str(root)) is False


def test_can_handle_rejects_non_directory(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    f = tmp_path / "a.md"
    f.write_text("# t")
    assert handler.can_handle(str(f)) is False


def test_detect_extracts_title_from_readme(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path,
        {
            "README.md": "# From Readme\n\nDescription here.",
            "01-intro.md": "# Intro\n\nHi.",
        },
    )
    detected = handler.detect(str(root))
    assert detected.title == "From Readme"
    assert len(detected.chapters) == 1  # README excluded from chapters
    assert detected.chapters[0].title == "Intro"


def test_detect_falls_back_to_first_chapter_title(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path,
        {"01-intro.md": "# Pilot\n\nOne.", "02-next.md": "# Next\n\nTwo."},
    )
    detected = handler.detect(str(root))
    assert detected.title == "Pilot"


def test_detect_orders_by_numeric_prefix(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path,
        {
            "02-second.md": "# B",
            "10-tenth.md": "# J",
            "01-first.md": "# A",
        },
    )
    detected = handler.detect(str(root))
    assert [c.title for c in detected.chapters] == ["A", "B", "J"]


def test_detect_classifies_cover_image(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path,
        {
            "01-intro.md": "# A\n\nA.",
            "cover.png": b"\x89PNG\r\n\x1a\n",
        },
    )
    detected = handler.detect(str(root))
    covers = [a for a in detected.assets if a.purpose == "cover"]
    assert len(covers) == 1
    assert covers[0].filename == "cover.png"


def test_detect_picks_up_figures_from_images_subfolder(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path,
        {
            "01-intro.md": "# A\n\nA.",
            "images/diagram.png": b"\x89PNG\r\n\x1a\n",
            "images/photo.jpg": b"\xff\xd8\xff",
        },
    )
    detected = handler.detect(str(root))
    figures = [a for a in detected.assets if a.purpose == "figure"]
    assert {a.filename for a in figures} == {"diagram.png", "photo.jpg"}


def test_source_identifier_deterministic(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(
        tmp_path, {"01-a.md": "# A\n\nX.", "02-b.md": "# B\n\nY."}
    )
    first = handler.detect(str(root)).source_identifier
    second = handler.detect(str(root)).source_identifier
    assert first == second


def test_execute_creates_book_and_chapters(
    handler: MarkdownFolderHandler, tmp_path: Path, db: Session
) -> None:
    root = _folder_with(
        tmp_path,
        {"01-a.md": "# A\n\nOne.", "02-b.md": "# B\n\nTwo."},
    )
    detected = handler.detect(str(root))
    book_id = handler.execute(str(root), detected, overrides={})
    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )
    assert [c.title for c in chapters] == ["A", "B"]
    assert [c.position for c in chapters] == [0, 1]


def test_execute_copies_cover_and_figures(
    handler: MarkdownFolderHandler, tmp_path: Path, db: Session, monkeypatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    root = _folder_with(
        tmp_path,
        {
            "01-a.md": "# A\n\nHi.",
            "cover.png": b"\x89PNG\r\n\x1a\n",
            "images/fig.jpg": b"\xff\xd8\xff",
        },
    )
    detected = handler.detect(str(root))
    book_id = handler.execute(str(root), detected, overrides={})

    asset_rows = db.query(Asset).filter(Asset.book_id == book_id).all()
    by_type = {(a.filename, a.asset_type) for a in asset_rows}
    assert ("cover.png", "cover") in by_type
    assert ("fig.jpg", "figure") in by_type


def test_execute_with_overrides_updates_columns(
    handler: MarkdownFolderHandler, tmp_path: Path, db: Session
) -> None:
    root = _folder_with(tmp_path, {"01-a.md": "# Auto\n\nOne."})
    detected = handler.detect(str(root))
    book_id = handler.execute(
        str(root),
        detected,
        overrides={"title": "Override", "author": "Alice", "language": "en"},
    )
    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Override"
    assert book.author == "Alice"
    assert book.language == "en"


def test_execute_rejects_unknown_override_key(
    handler: MarkdownFolderHandler, tmp_path: Path
) -> None:
    root = _folder_with(tmp_path, {"01-a.md": "# A\n\nX."})
    detected = handler.detect(str(root))
    with pytest.raises(KeyError):
        handler.execute(str(root), detected, overrides={"bogus": "x"})


def test_execute_overwrite_replaces_existing(
    handler: MarkdownFolderHandler, tmp_path: Path, db: Session
) -> None:
    root_v1 = _folder_with(tmp_path, {"01-a.md": "# V1\n\nOne."})
    first_id = handler.execute(str(root_v1), handler.detect(str(root_v1)), overrides={})

    root_v2 = tmp_path / "project2"
    root_v2.mkdir()
    (root_v2 / "01-a.md").write_text("# V2\n\nTwo.", encoding="utf-8")
    detected2 = handler.detect(str(root_v2))

    returned = handler.execute(
        str(root_v2),
        detected2,
        overrides={},
        duplicate_action="overwrite",
        existing_book_id=first_id,
    )
    assert db.query(Book).filter(Book.id == first_id).count() == 0
    assert db.query(Book).filter(Book.id == returned).one().title == "V2"
