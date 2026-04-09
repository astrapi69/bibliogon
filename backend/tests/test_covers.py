"""Tests for the cover upload endpoint and service."""

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


# --- Helpers ---


def _create_book(title: str = "Cover Test", author: str = "Tester") -> str:
    r = client.post("/api/books", json={"title": title, "author": author})
    assert r.status_code == 201
    return r.json()["id"]


def _cleanup_book(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def _png_bytes(width: int = 1600, height: int = 2560, color: str = "white") -> bytes:
    """Generate a real PNG of the requested dimensions."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(width: int = 800, height: int = 1200) -> bytes:
    img = Image.new("RGB", (width, height), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# --- Upload happy path ---


def test_upload_cover_png_success():
    book_id = _create_book()
    payload = _png_bytes(1600, 2560)

    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("my-cover.png", io.BytesIO(payload), "image/png")},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["width"] == 1600
    assert body["height"] == 2560
    assert body["aspect_ratio"] == 1.6
    assert body["filename"].endswith(".png")
    assert body["cover_image"].endswith(body["filename"])
    assert body["size_bytes"] == len(payload)

    # Book.cover_image was updated server-side
    book = client.get(f"/api/books/{book_id}").json()
    assert book["cover_image"] == body["cover_image"]

    _cleanup_book(book_id)


def test_upload_cover_jpeg_success():
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("cover.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")},
    )
    assert r.status_code == 201
    assert r.json()["filename"].endswith(".jpg")
    _cleanup_book(book_id)


# --- Validation failures ---


def test_upload_cover_rejects_unknown_extension():
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("evil.txt", io.BytesIO(b"not an image"), "text/plain")},
    )
    assert r.status_code == 400
    assert "Unsupported cover format" in r.json()["detail"]
    _cleanup_book(book_id)


def test_upload_cover_rejects_corrupt_image_with_valid_extension():
    """A .png that isn't actually a PNG must be caught by Pillow verify()."""
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("fake.png", io.BytesIO(b"definitely not png bytes"), "image/png")},
    )
    assert r.status_code == 400
    _cleanup_book(book_id)


def test_upload_cover_rejects_oversize_file():
    """File over the 10 MB cap is refused with 413."""
    book_id = _create_book()
    # 11 MB of zeros prefixed with a PNG-like header doesn't matter -
    # the size check fires before Pillow ever runs.
    payload = b"\x89PNG\r\n\x1a\n" + b"\0" * (11 * 1024 * 1024)
    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("huge.png", io.BytesIO(payload), "image/png")},
    )
    assert r.status_code == 413
    assert "Max" in r.json()["detail"]
    _cleanup_book(book_id)


def test_upload_cover_rejects_empty_file():
    book_id = _create_book()
    r = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("empty.png", io.BytesIO(b""), "image/png")},
    )
    assert r.status_code == 400
    _cleanup_book(book_id)


def test_upload_cover_book_not_found():
    r = client.post(
        "/api/books/does-not-exist/cover",
        files={"file": ("c.png", io.BytesIO(_png_bytes(100, 100)), "image/png")},
    )
    assert r.status_code == 404


# --- Replace existing cover ---


def test_upload_cover_replaces_existing():
    """Uploading a second cover removes the first asset row + file."""
    book_id = _create_book()

    r1 = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("first.png", io.BytesIO(_png_bytes(800, 1200)), "image/png")},
    )
    assert r1.status_code == 201

    r2 = client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("second.jpg", io.BytesIO(_jpeg_bytes(1600, 2560)), "image/jpeg")},
    )
    assert r2.status_code == 201
    assert r2.json()["filename"].endswith(".jpg")

    # Only one cover asset remains in the listing
    assets = client.get(f"/api/books/{book_id}/assets").json()
    cover_assets = [a for a in assets if a["asset_type"] == "cover"]
    assert len(cover_assets) == 1
    assert cover_assets[0]["filename"].endswith(".jpg")

    _cleanup_book(book_id)


# --- Delete ---


def test_delete_cover_clears_book_field():
    book_id = _create_book()
    client.post(
        f"/api/books/{book_id}/cover",
        files={"file": ("c.png", io.BytesIO(_png_bytes(400, 600)), "image/png")},
    )

    r = client.delete(f"/api/books/{book_id}/cover")
    assert r.status_code == 204

    book = client.get(f"/api/books/{book_id}").json()
    assert book["cover_image"] is None

    assets = client.get(f"/api/books/{book_id}/assets").json()
    assert not any(a["asset_type"] == "cover" for a in assets)

    _cleanup_book(book_id)


def test_delete_cover_when_none_set_is_idempotent():
    book_id = _create_book()
    r = client.delete(f"/api/books/{book_id}/cover")
    assert r.status_code == 204
    _cleanup_book(book_id)


# --- Limits endpoint ---


def test_cover_limits_endpoint():
    book_id = _create_book()
    r = client.get(f"/api/books/{book_id}/cover/limits")
    assert r.status_code == 200
    body = r.json()
    assert body["max_mb"] == 10
    assert ".png" in body["allowed_extensions"]
    assert ".jpg" in body["allowed_extensions"]
    assert ".webp" in body["allowed_extensions"]
    _cleanup_book(book_id)
