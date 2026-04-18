"""Tests for the unified smart-import endpoint."""

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _cleanup(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def test_smart_import_markdown_zip():
    """ZIP with .md files should be detected as markdown collection."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("chapter1.md", "# Chapter One\n\nHello world.\n")
        zf.writestr("chapter2.md", "# Chapter Two\n\nGoodbye.\n")
    buf.seek(0)

    r = client.post(
        "/api/backup/smart-import",
        files={"file": ("stories.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["type"] == "markdown"
    assert data["result"]["chapter_count"] == 2
    _cleanup(data["result"]["book_id"])


def test_smart_import_bgb_backup():
    """A .bgb file should be detected as backup."""
    # Create a book first
    book = client.post("/api/books", json={"title": "Backup Test", "author": "Test"}).json()
    client.post(f"/api/books/{book['id']}/chapters", json={"title": "Ch1"})

    # Export backup
    r = client.get("/api/backup/export")
    assert r.status_code == 200
    backup_bytes = r.content

    # Delete original
    client.delete(f"/api/books/{book['id']}")
    client.delete(f"/api/books/trash/{book['id']}")

    # Smart import the backup
    r = client.post(
        "/api/backup/smart-import",
        files={"file": ("backup.bgb", io.BytesIO(backup_bytes), "application/octet-stream")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["type"] == "backup"
    assert data["result"]["imported_books"] >= 1
    _cleanup(book["id"])


def test_smart_import_project_zip():
    """ZIP with metadata.yaml should be detected as write-book-template."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("my-book/config/metadata.yaml", "title: Smart Import Test\nauthor: Test\nlanguage: en\n")
        zf.writestr("my-book/manuscript/chapters/chapter-01.md", "# Chapter 1\n\nContent.\n")
    buf.seek(0)

    r = client.post(
        "/api/backup/smart-import",
        files={"file": ("project.zip", buf, "application/zip")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["type"] == "template"
    assert data["result"]["chapter_count"] >= 1
    _cleanup(data["result"]["book_id"])


def test_smart_import_unsupported_format():
    """Unsupported file should return 400."""
    r = client.post(
        "/api/backup/smart-import",
        files={"file": ("readme.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert r.status_code == 400
    assert "Unsupported" in r.json()["detail"]


def test_smart_import_empty_zip():
    """Empty ZIP should return 400."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w"):
        pass
    buf.seek(0)

    r = client.post(
        "/api/backup/smart-import",
        files={"file": ("empty.zip", buf, "application/zip")},
    )
    assert r.status_code == 400


def test_smart_import_closes_zip_handle():
    """Regression: _dispatch_zip must close the reopened file handles.

    Without the fix, UploadFile held an unclosed file object which the
    garbage collector later flagged as ResourceWarning.
    """
    import warnings

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "my-book/config/metadata.yaml",
            "title: Handle Close Test\nauthor: Test\nlanguage: en\n",
        )
        zf.writestr("my-book/manuscript/chapters/chapter-01.md", "# C1\n\nx\n")
    buf.seek(0)

    with warnings.catch_warnings():
        warnings.simplefilter("error", ResourceWarning)
        r = client.post(
            "/api/backup/smart-import",
            files={"file": ("handles.zip", buf, "application/zip")},
        )
        assert r.status_code == 200
        data = r.json()
        _cleanup(data["result"]["book_id"])
