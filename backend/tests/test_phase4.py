"""Tests for Phase 4: ChapterType, Assets, Backup, Import."""

import io
import json
import zipfile

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book(title: str = "Phase4 Test", author: str = "Tester") -> str:
    r = client.post("/api/books", json={"title": title, "author": author})
    assert r.status_code == 201
    return r.json()["id"]


def _cleanup_book(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")


# --- ChapterType tests ---


def test_chapter_type_default():
    book_id = _create_book()
    r = client.post(f"/api/books/{book_id}/chapters", json={"title": "Normal Chapter"})
    assert r.status_code == 201
    assert r.json()["chapter_type"] == "chapter"
    _cleanup_book(book_id)


def test_chapter_type_preface():
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": "Vorwort", "chapter_type": "preface"},
    )
    assert r.status_code == 201
    assert r.json()["chapter_type"] == "preface"
    _cleanup_book(book_id)


def test_chapter_type_update():
    book_id = _create_book()
    r = client.post(f"/api/books/{book_id}/chapters", json={"title": "Chapter"})
    ch_id = r.json()["id"]

    r = client.patch(
        f"/api/books/{book_id}/chapters/{ch_id}",
        json={"chapter_type": "appendix"},
    )
    assert r.status_code == 200
    assert r.json()["chapter_type"] == "appendix"
    _cleanup_book(book_id)


# --- Asset upload tests ---


def test_asset_upload_and_list():
    book_id = _create_book()

    # Upload
    file_content = b"fake image data"
    r = client.post(
        f"/api/books/{book_id}/assets?asset_type=cover",
        files={"file": ("cover.png", io.BytesIO(file_content), "image/png")},
    )
    assert r.status_code == 201
    asset = r.json()
    assert asset["filename"] == "cover.png"
    assert asset["asset_type"] == "cover"

    # List
    r = client.get(f"/api/books/{book_id}/assets")
    assert r.status_code == 200
    assert len(r.json()) == 1

    # Delete
    r = client.delete(f"/api/books/{book_id}/assets/{asset['id']}")
    assert r.status_code == 204

    r = client.get(f"/api/books/{book_id}/assets")
    assert len(r.json()) == 0

    _cleanup_book(book_id)


def test_asset_invalid_type():
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/assets?asset_type=invalid",
        files={"file": ("test.png", io.BytesIO(b"data"), "image/png")},
    )
    assert r.status_code == 400
    _cleanup_book(book_id)


# --- Backup tests ---


def test_backup_export_and_import():
    # Create book with chapters
    book_id = _create_book("Backup Test", "Backup Author")
    client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": "Kapitel 1", "content": "Inhalt 1"},
    )
    client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": "Kapitel 2", "content": "Inhalt 2", "chapter_type": "preface"},
    )

    # Export backup
    r = client.get("/api/backup/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    # Verify ZIP contents
    zip_data = io.BytesIO(r.content)
    with zipfile.ZipFile(zip_data, "r") as zf:
        names = zf.namelist()
        assert any("manifest.json" in n for n in names)
        assert any("book.json" in n for n in names)

    # Delete original book
    _cleanup_book(book_id)

    # Re-import
    zip_data.seek(0)
    r = client.post(
        "/api/backup/import",
        files={"file": ("backup.zip", zip_data, "application/zip")},
    )
    assert r.status_code == 200
    assert r.json()["imported_books"] == 1

    # Verify book is restored
    r = client.get(f"/api/books/{book_id}")
    assert r.status_code == 200
    assert r.json()["title"] == "Backup Test"
    assert len(r.json()["chapters"]) == 2

    _cleanup_book(book_id)


# --- write-book-template import tests ---


def test_import_project():
    # Create a write-book-template ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr(
            "my-book/config/metadata.yaml",
            "title: Imported Book\nauthor: Import Author\nlang: en\n",
        )
        zf.writestr(
            "my-book/manuscript/chapters/01-introduction.md",
            "# Introduction\n\nThis is the first chapter.\n",
        )
        zf.writestr(
            "my-book/manuscript/chapters/02-the-plot.md",
            "# The Plot\n\nThe story continues.\n",
        )
        zf.writestr(
            "my-book/manuscript/front-matter/preface.md",
            "# Preface\n\nA preface text.\n",
        )
        zf.writestr(
            "my-book/manuscript/back-matter/about-the-author.md",
            "# About the Author\n\nThe author bio.\n",
        )

    zip_buffer.seek(0)
    r = client.post(
        "/api/backup/import-project",
        files={"file": ("my-book.zip", zip_buffer, "application/zip")},
    )
    assert r.status_code == 200
    result = r.json()
    assert result["title"] == "Imported Book"
    assert result["chapter_count"] == 4  # 2 chapters + preface + about_author

    # Verify the book
    book_id = result["book_id"]
    r = client.get(f"/api/books/{book_id}")
    book = r.json()
    assert book["author"] == "Import Author"
    assert book["language"] == "en"

    chapters = book["chapters"]
    chapter_types = {ch["chapter_type"] for ch in chapters}
    assert "chapter" in chapter_types
    assert "preface" in chapter_types
    assert "about_author" in chapter_types

    _cleanup_book(book_id)
