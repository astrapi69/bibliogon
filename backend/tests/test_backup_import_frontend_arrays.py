"""Regression (#349): importing a frontend-exported ``.bgb`` whose
book.json carries JSON-array fields (``keywords`` etc.) as real arrays
must not crash with SQLite's 'type list is not supported'.

The backend serializer always emits these Text-stored-as-JSON columns as
strings, so the full-roundtrip test never exercises the array shape. The
client-side ``backupExport.ts`` exports them as real JSON arrays (the
frontend Book type declares ``keywords: string[]``); this test builds
that exact archive shape by hand and imports it through the production
restore path.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from fastapi import UploadFile

from app.database import SessionLocal
from app.models import Book
from app.services.backup.backup_import import import_backup_archive


def _write_frontend_bgb(path: Path, book: dict) -> None:
    """Write a minimal manifest-3.0 ``.bgb`` with one book.json."""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps({"format": "bibliogon-backup", "version": "3.0"}),
        )
        zf.writestr(f"books/{book['id']}/book.json", json.dumps(book))


def test_import_bgb_with_array_shaped_book_fields(tmp_path):
    """A .bgb whose book.json has list-typed JSON-array columns restores
    cleanly; pre-fix this raised sqlite3.ProgrammingError on flush."""
    book = {
        "id": "fe_arrays_1",
        "title": "Frontend Export",
        "author": "Aster",
        "language": "de",
        "keywords": ["tag1", "tag2"],
        "categories": ["Fiction", "Fantasy"],
        "bisac_codes": ["FIC009000"],
        "chapter_summaries": [{"chapter_id": "c1", "title": "One", "summary": "s"}],
        "audiobook_skip_chapter_types": ["toc", "imprint"],
    }
    bgb_path = tmp_path / "frontend.bgb"
    _write_frontend_bgb(bgb_path, book)

    with open(bgb_path, "rb") as fh:
        upload = UploadFile(filename="frontend.bgb", file=fh)
        with SessionLocal() as db:
            result = import_backup_archive(upload, db)

    assert result["imported_books"] == 1

    with SessionLocal() as db:
        restored = db.query(Book).filter(Book.id == "fe_arrays_1").one()
        assert json.loads(restored.keywords) == ["tag1", "tag2"]
        assert json.loads(restored.categories) == ["Fiction", "Fantasy"]
        assert json.loads(restored.bisac_codes) == ["FIC009000"]
        assert json.loads(restored.audiobook_skip_chapter_types) == [
            "toc",
            "imprint",
        ]
        db.query(Book).filter(Book.id == "fe_arrays_1").delete()
        db.commit()


def test_import_bgb_with_empty_keyword_list(tmp_path):
    """The minimal reproduction case: ``keywords: []``."""
    book = {
        "id": "fe_empty_kw",
        "title": "Empty Keywords",
        "author": "Aster",
        "language": "de",
        "keywords": [],
    }
    bgb_path = tmp_path / "empty.bgb"
    _write_frontend_bgb(bgb_path, book)

    with open(bgb_path, "rb") as fh:
        upload = UploadFile(filename="empty.bgb", file=fh)
        with SessionLocal() as db:
            result = import_backup_archive(upload, db)

    assert result["imported_books"] == 1

    with SessionLocal() as db:
        restored = db.query(Book).filter(Book.id == "fe_empty_kw").one()
        assert restored.keywords == "[]"
        db.query(Book).filter(Book.id == "fe_empty_kw").delete()
        db.commit()
