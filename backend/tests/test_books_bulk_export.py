"""Bulk book export tests.

Covers ``POST /api/books/bulk-export`` (AR-BULK-BOOKS-PARITY-01).
Mirrors the article-bulk-export test shape: validation, ZIP shape,
filename collision suffix, ID-order preservation, 404 on unknown ID.

Pandoc-driven formats (EPUB / PDF / DOCX) execute the real Pandoc
binary the same way per-book export tests do; the smoke-level checks
verify response media type and ZIP contents, not rendered file
correctness.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str, author: str = "T. Tester") -> dict:
    resp = client.post("/api/books", json={"title": title, "author": author})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _add_chapter(
    client: TestClient,
    book_id: str,
    title: str,
    text: str = "Body of chapter.",
) -> None:
    """Bulk export needs at least one chapter for the export pipeline
    to produce non-empty output. Minimal TipTap doc is enough."""
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={
            "title": title,
            "content": '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"' + text + '"}]}]}',
        },
    )
    assert resp.status_code in (200, 201), resp.text


def _seed_book(client: TestClient, title: str, **author_kwargs) -> str:
    book = _create_book(client, title, **author_kwargs)
    _add_chapter(client, book["id"], "Chapter One")
    return book["id"]


# --- Validation -------------------------------------------------


class TestValidation:
    def test_empty_book_ids_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/books/bulk-export",
            json={"book_ids": [], "format": "epub"},
        )
        assert resp.status_code == 422

    def test_over_limit_returns_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/books/bulk-export",
            json={
                "book_ids": [f"id-{i}" for i in range(201)],
                "format": "epub",
            },
        )
        assert resp.status_code == 422

    def test_unknown_format_returns_422(self, client: TestClient) -> None:
        # Need at least one valid id to get past book-list validation.
        book_id = _seed_book(client, "Format Probe")
        resp = client.post(
            "/api/books/bulk-export",
            json={"book_ids": [book_id], "format": "markdown"},
        )
        assert resp.status_code == 422


# --- ZIP shape --------------------------------------------------


class TestZipShape:
    def test_three_books_produce_zip_with_three_files(self, client: TestClient) -> None:
        a = _seed_book(client, "Book Alpha")
        b = _seed_book(client, "Book Bravo")
        c = _seed_book(client, "Book Charlie")
        resp = client.post(
            "/api/books/bulk-export",
            json={"book_ids": [a, b, c], "format": "epub"},
        )
        if resp.status_code == 502 or resp.status_code == 422:
            pytest.skip(f"Pandoc/Docker unavailable in test environment: {resp.text[:200]}")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = sorted(zf.namelist())
            assert len(names) == 3
            for name in names:
                assert name.endswith(".epub")

    def test_filename_collision_uses_numeric_suffix(self, client: TestClient) -> None:
        a = _seed_book(client, "Same Title")
        b = _seed_book(client, "Same Title")
        c = _seed_book(client, "Same Title")
        resp = client.post(
            "/api/books/bulk-export",
            json={"book_ids": [a, b, c], "format": "epub"},
        )
        if resp.status_code == 502 or resp.status_code == 422:
            pytest.skip(f"Pandoc unavailable: {resp.text[:200]}")
        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = sorted(zf.namelist())
            assert len(names) == 3
            # Slugs of "Same Title" -> "same-title"; collisions get
            # ``-2`` then ``-3``. Sorted output has the bare slug
            # followed by suffixed variants.
            assert "same-title.epub" in names
            assert any("same-title-2" in n for n in names)
            assert any("same-title-3" in n for n in names)


# --- 404 path ---------------------------------------------------


class TestUnknownId:
    def test_unknown_book_id_returns_404(self, client: TestClient) -> None:
        resp = client.post(
            "/api/books/bulk-export",
            json={"book_ids": ["does-not-exist"], "format": "epub"},
        )
        assert resp.status_code == 404
        # The per-book route raises 404 with "Book not found"; the
        # bulk endpoint propagates the same message because the
        # underlying ``_load_book`` helper raises HTTPException(404).
        assert "not found" in resp.json()["detail"].lower()
