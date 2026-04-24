"""Block 1 (multi-cover) regression tests.

Pins current behaviour + new primary_cover override:
- All files in assets/covers/ land as Asset rows with
  asset_type="cover"
- book.cover_image picks the file named in metadata.yaml
  (cover-image or cover_image key) if it resolves to an
  imported asset; otherwise first alphabetical
- Wizard override ``primary_cover=<filename>`` lets the user
  pick explicitly; the named file becomes book.cover_image
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Asset, Book


def _zip_with_covers(
    tmp_dir: Path,
    *,
    cover_image_key: str | None = None,
    cover_filenames: tuple[str, ...] = (
        "a-ebook.png",
        "b-paperback.png",
        "c-hardcover.png",
    ),
) -> Path:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        yaml_body = "title: Multi Cover\nauthor: A\nlang: en\n"
        if cover_image_key:
            yaml_body += f'cover-image: "{cover_image_key}"\n'
        zf.writestr("book/config/metadata.yaml", yaml_body)
        for name in cover_filenames:
            zf.writestr(
                f"book/assets/covers/{name}", b"\x89PNG\r\n\x1a\n"
            )
        zf.writestr("book/manuscript/chapters/01.md", "# C\n\nBody.\n")
    path = tmp_dir / "multi.zip"
    path.write_bytes(buf.getvalue())
    return path


def _import(zip_path: Path, overrides: dict | None = None) -> str:
    Base.metadata.create_all(bind=engine)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    return handler.execute(
        str(zip_path),
        detected,
        overrides=overrides or {},
        duplicate_action="create",
    )


# --- current behavior: all covers imported ---


def test_all_cover_files_imported_as_asset_rows(tmp_path: Path) -> None:
    """Baseline: WBT import already creates one Asset row per file
    in assets/covers/. Block 1 preserves this; the wizard + metadata
    editor UI consume the list to offer primary selection."""
    zip_path = _zip_with_covers(tmp_path)
    book_id = _import(zip_path)
    with SessionLocal() as session:
        covers = (
            session.query(Asset)
            .filter(Asset.book_id == book_id, Asset.asset_type == "cover")
            .order_by(Asset.filename)
            .all()
        )
        filenames = [c.filename for c in covers]
        assert filenames == [
            "a-ebook.png",
            "b-paperback.png",
            "c-hardcover.png",
        ]


def test_metadata_cover_image_key_picks_primary(tmp_path: Path) -> None:
    """metadata.yaml's ``cover-image`` key names the primary. The
    named file must land on book.cover_image even when the
    alphabetical default would pick a different one."""
    zip_path = _zip_with_covers(
        tmp_path, cover_image_key="b-paperback.png"
    )
    book_id = _import(zip_path)
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        assert book.cover_image is not None
        assert book.cover_image.endswith("b-paperback.png"), (
            f"metadata cover-image key should win; got {book.cover_image!r}"
        )


def test_alphabetical_fallback_when_no_metadata_key(tmp_path: Path) -> None:
    """Without cover-image in metadata.yaml, fall back to first
    alphabetical. Pin this so a future change doesn't silently pick
    a different default."""
    zip_path = _zip_with_covers(tmp_path)
    book_id = _import(zip_path)
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        assert book.cover_image is not None
        assert book.cover_image.endswith("a-ebook.png")


# --- primary_cover override ---


def test_primary_cover_override_picks_named_file(tmp_path: Path) -> None:
    """User's wizard choice overrides everything: the named file
    wins regardless of metadata.yaml or alphabetical ordering."""
    zip_path = _zip_with_covers(
        tmp_path, cover_image_key="a-ebook.png"
    )
    book_id = _import(
        zip_path, overrides={"primary_cover": "c-hardcover.png"}
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        assert book.cover_image is not None
        assert book.cover_image.endswith("c-hardcover.png")


def test_primary_cover_override_rejects_unknown_filename(
    tmp_path: Path,
) -> None:
    """Override referencing a non-imported cover filename must
    raise; silently falling back to another cover would mask a
    UI bug."""
    import pytest

    zip_path = _zip_with_covers(tmp_path)
    with pytest.raises(Exception):  # noqa: BLE001 - any deny is fine
        _import(
            zip_path, overrides={"primary_cover": "nonexistent.png"}
        )
