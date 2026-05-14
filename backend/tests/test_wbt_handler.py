"""Tests for the write-book-template import handler (CIO-02)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest
import yaml
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Asset, Book, Chapter


@pytest.fixture
def handler() -> WbtImportHandler:
    return WbtImportHandler()


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _minimal_wbt(tmp_path: Path, name: str = "project", title: str = "WBT Book") -> Path:
    root = tmp_path / name
    (root / "config").mkdir(parents=True)
    (root / "manuscript" / "chapters").mkdir(parents=True)
    (root / "assets" / "covers").mkdir(parents=True)

    (root / "config" / "metadata.yaml").write_text(
        yaml.safe_dump({"title": title, "author": "Alice", "language": "en"}),
        encoding="utf-8",
    )
    (root / "manuscript" / "chapters" / "01-intro.md").write_text(
        "# Intro\n\nChapter one body.", encoding="utf-8"
    )
    (root / "manuscript" / "chapters" / "02-next.md").write_text(
        "# Second\n\nChapter two body.", encoding="utf-8"
    )
    (root / "assets" / "covers" / "cover.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    return root


def _zip_of(root: Path, dest: Path) -> Path:
    """Zip the WBT project under a single-folder wrapper."""
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in root.rglob("*"):
            if p.is_file():
                arcname = str(Path(root.name) / p.relative_to(root))
                zf.write(p, arcname)
    return dest


def test_can_handle_zip_with_metadata(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    zip_path = _zip_of(root, tmp_path / "project.zip")
    assert handler.can_handle(str(zip_path)) is True


def test_can_handle_directory_that_is_wbt_root(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    assert handler.can_handle(str(root)) is True


def test_can_handle_rejects_zip_without_metadata(handler: WbtImportHandler, tmp_path: Path) -> None:
    bad = tmp_path / "no-meta.zip"
    with zipfile.ZipFile(bad, "w") as zf:
        zf.writestr("foo/bar.txt", "hi")
    assert handler.can_handle(str(bad)) is False


def test_can_handle_rejects_bgb(handler: WbtImportHandler, tmp_path: Path) -> None:
    bgb = tmp_path / "book.bgb"
    with zipfile.ZipFile(bgb, "w") as zf:
        zf.writestr("manifest.json", json.dumps({"format": "bibliogon-backup"}))
    assert handler.can_handle(str(bgb)) is False  # .zip suffix required


def test_detect_returns_title_author_language(handler: WbtImportHandler, tmp_path: Path) -> None:
    zip_path = _zip_of(_minimal_wbt(tmp_path, title="Preview Book"), tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    assert detected.format_name == "wbt-zip"
    assert detected.title == "Preview Book"
    assert detected.author == "Alice"
    assert detected.language == "en"
    assert detected.source_identifier.startswith("sha256:")


def test_detect_lists_chapters_in_order(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    zip_path = _zip_of(root, tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    titles = [c.title for c in detected.chapters]
    assert titles == ["Intro", "Second"]


def test_detect_classifies_cover_asset(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    zip_path = _zip_of(root, tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    covers = [a for a in detected.assets if a.purpose == "cover"]
    assert any(a.filename == "cover.png" for a in covers)


def test_detect_warns_when_cover_missing(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    (root / "assets" / "covers" / "cover.png").unlink()
    zip_path = _zip_of(root, tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    assert any("cover" in w.lower() for w in detected.warnings)


def test_source_identifier_deterministic_for_zip(handler: WbtImportHandler, tmp_path: Path) -> None:
    root = _minimal_wbt(tmp_path)
    zip_path = _zip_of(root, tmp_path / "p.zip")
    first = handler.detect(str(zip_path)).source_identifier
    second = handler.detect(str(zip_path)).source_identifier
    assert first == second


def test_execute_creates_book_and_chapters(
    handler: WbtImportHandler, tmp_path: Path, db: Session, monkeypatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    root = _minimal_wbt(tmp_path, title="Exec Book")
    zip_path = _zip_of(root, tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(str(zip_path), detected, overrides={})

    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Exec Book"
    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).order_by(Chapter.position).all()
    assert len(chapters) >= 2


def test_execute_with_overrides_updates_book(
    handler: WbtImportHandler, tmp_path: Path, db: Session, monkeypatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    zip_path = _zip_of(_minimal_wbt(tmp_path, title="Original"), tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path),
        detected,
        overrides={"title": "Overridden", "language": "de"},
    )
    book = db.query(Book).filter(Book.id == book_id).one()
    assert book.title == "Overridden"
    assert book.language == "de"


def test_execute_rejects_unknown_override_key(
    handler: WbtImportHandler, tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    zip_path = _zip_of(_minimal_wbt(tmp_path), tmp_path / "p.zip")
    detected = handler.detect(str(zip_path))
    with pytest.raises(KeyError):
        handler.execute(str(zip_path), detected, overrides={"bogus": 1})


def test_execute_overwrite_removes_existing_chapters_and_assets(
    handler: WbtImportHandler, tmp_path: Path, db: Session, monkeypatch
) -> None:
    """``duplicate_action="overwrite"`` must hard-delete the existing
    Book's chapters AND assets before re-importing. Regression pin for
    ``_hard_delete_book``: previous coverage left both DELETE
    statements untested, so mutating either filter to a no-op would
    silently leak old data into the overwritten Book.
    """
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    first_root = _minimal_wbt(tmp_path / "first", name="proj", title="Old")
    first_zip = _zip_of(first_root, tmp_path / "first.zip")
    first_detected = handler.detect(str(first_zip))
    first_id = handler.execute(str(first_zip), first_detected, overrides={})

    chapter_count_before = db.query(Chapter).filter(Chapter.book_id == first_id).count()
    asset_count_before = db.query(Asset).filter(Asset.book_id == first_id).count()
    assert chapter_count_before >= 1
    assert asset_count_before >= 1

    second_root = _minimal_wbt(tmp_path / "second", name="proj2", title="Replaced")
    # Adjust the second project so it has DIFFERENT chapters to
    # confirm the new content lands, not just that the old is gone.
    for old_md in (second_root / "manuscript" / "chapters").glob("*.md"):
        old_md.unlink()
    (second_root / "manuscript" / "chapters" / "01-fresh.md").write_text(
        "# Fresh\n\nBrand-new body.", encoding="utf-8"
    )
    second_zip = _zip_of(second_root, tmp_path / "second.zip")
    second_detected = handler.detect(str(second_zip))
    second_id = handler.execute(
        str(second_zip),
        second_detected,
        overrides={},
        duplicate_action="overwrite",
        existing_book_id=first_id,
    )
    db.expire_all()

    assert db.query(Chapter).filter(Chapter.book_id == first_id).count() == 0
    assert db.query(Asset).filter(Asset.book_id == first_id).count() == 0

    new_chapter_titles = [
        c.title
        for c in db.query(Chapter)
        .filter(Chapter.book_id == second_id)
        .order_by(Chapter.position)
        .all()
    ]
    assert "Fresh" in new_chapter_titles
