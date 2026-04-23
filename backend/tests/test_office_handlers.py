"""Tests for the .docx and .epub import handlers (CIO-04).

Both handlers shell out to Pandoc. Unit tests mock the conversion
helper so the suite does not require crafted binary fixtures (the
Pandoc binary is available in CI and Docker but generating minimal
valid .docx/.epub in-test adds noise without catching more bugs).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.office import (
    DocxImportHandler,
    EpubImportHandler,
    _split_into_chapters,
    _extract_title,
)
from app.models import Asset, Book, Chapter


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _fake_conversion(markdown: str):
    """Factory for the Pandoc mock: returns (markdown, empty_media_dir)."""

    def _convert(path: Path, fmt: str):
        import tempfile

        media = Path(tempfile.mkdtemp(prefix="fake_media_"))
        return markdown, media

    return _convert


# --- can_handle ---


def test_docx_can_handle_docx(tmp_path: Path) -> None:
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    assert DocxImportHandler().can_handle(str(f)) is True


def test_docx_rejects_other_extensions(tmp_path: Path) -> None:
    f = tmp_path / "book.epub"
    f.write_bytes(b"PK\x03\x04")
    assert DocxImportHandler().can_handle(str(f)) is False


def test_epub_can_handle_epub(tmp_path: Path) -> None:
    f = tmp_path / "book.epub"
    f.write_bytes(b"PK\x03\x04")
    assert EpubImportHandler().can_handle(str(f)) is True


def test_epub_rejects_directories(tmp_path: Path) -> None:
    assert EpubImportHandler().can_handle(str(tmp_path)) is False


# --- detect ---


def test_detect_splits_on_h1(tmp_path: Path, monkeypatch) -> None:
    markdown = "# One\n\nFirst body.\n\n# Two\n\nSecond body.\n"
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion(markdown),
    )
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    detected = DocxImportHandler().detect(str(f))
    assert [c.title for c in detected.chapters] == ["One", "Two"]
    assert detected.title == "One"
    assert detected.format_name == "docx"
    assert detected.source_identifier.startswith("sha256:")


def test_detect_without_h1_yields_single_chapter(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion("Just some text with no H1 at all."),
    )
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    detected = DocxImportHandler().detect(str(f))
    assert len(detected.chapters) == 1
    assert detected.chapters[0].title == "Untitled"
    assert detected.title == "book"  # path.stem fallback


def test_detect_warns_on_long_single_chapter(
    tmp_path: Path, monkeypatch
) -> None:
    markdown = "Body text.\n" * 10_000
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion(markdown),
    )
    f = tmp_path / "book.epub"
    f.write_bytes(b"PK\x03\x04")
    detected = EpubImportHandler().detect(str(f))
    assert any("single long chapter" in w.lower() for w in detected.warnings)


# --- execute ---


def test_execute_creates_book_and_chapters(
    tmp_path: Path, db: Session, monkeypatch
) -> None:
    from app.routers import assets as assets_mod

    monkeypatch.setattr(assets_mod, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion("# Chapter A\n\nBody A.\n\n# Chapter B\n\nBody B.\n"),
    )
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    handler = DocxImportHandler()
    detected = handler.detect(str(f))
    book_id = handler.execute(str(f), detected, overrides={})

    chapters = (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )
    assert [c.title for c in chapters] == ["Chapter A", "Chapter B"]


def test_execute_with_overrides_updates_book(
    tmp_path: Path, db: Session, monkeypatch
) -> None:
    from app.routers import assets as assets_mod

    monkeypatch.setattr(assets_mod, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion("# Auto\n\nBody."),
    )
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    handler = DocxImportHandler()
    detected = handler.detect(str(f))
    book_id = handler.execute(
        str(f),
        detected,
        overrides={"title": "Override", "author": "Alice", "language": "en"},
    )
    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Override"
    assert book.language == "en"


def test_execute_rejects_unknown_override_key(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _fake_conversion("# A\n\nBody."),
    )
    f = tmp_path / "book.docx"
    f.write_bytes(b"PK\x03\x04")
    handler = DocxImportHandler()
    detected = handler.detect(str(f))
    with pytest.raises(KeyError):
        handler.execute(str(f), detected, overrides={"bogus": "nope"})


def test_execute_copies_pandoc_extracted_media(
    tmp_path: Path, db: Session, monkeypatch
) -> None:
    """When Pandoc writes images into the --extract-media dir, the handler
    copies them into uploads/{book}/figure/ and records Asset rows."""
    import shutil

    from app.routers import assets as assets_mod

    monkeypatch.setattr(assets_mod, "UPLOAD_DIR", tmp_path / "uploads")

    def _convert_with_media(path: Path, fmt: str):
        media = tmp_path / "media"
        media.mkdir(exist_ok=True)
        (media / "figure1.png").write_bytes(b"\x89PNG\r\n\x1a\n")
        return "# Intro\n\n![alt](media/figure1.png)\n", media

    monkeypatch.setattr(
        "app.import_plugins.handlers.office._convert_to_markdown",
        _convert_with_media,
    )
    f = tmp_path / "book.epub"
    f.write_bytes(b"PK\x03\x04")
    handler = EpubImportHandler()
    detected = handler.detect(str(f))
    book_id = handler.execute(str(f), detected, overrides={})

    figures = (
        db.query(Asset)
        .filter(Asset.book_id == book_id, Asset.asset_type == "figure")
        .all()
    )
    assert any(a.filename == "figure1.png" for a in figures)

    # cleanup shared between mock invocations
    shutil.rmtree(tmp_path / "media", ignore_errors=True)


# --- Pure helpers ---


def test_split_into_chapters_handles_empty() -> None:
    assert _split_into_chapters("") == []


def test_split_into_chapters_discards_prematter() -> None:
    result = _split_into_chapters("Pre\n\n# A\n\nBody A.\n\n# B\n\nBody B.\n")
    assert [c["title"] for c in result] == ["A", "B"]
    assert result[0]["body"].startswith("Body A")


def test_extract_title_returns_first_h1() -> None:
    assert _extract_title("## Not h1\n\n# Real Title\n\n# Later\n") == "Real Title"
    assert _extract_title("No heading at all.") is None
