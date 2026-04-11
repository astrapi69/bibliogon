"""Tests for the keywords field: list[str] on the API, JSON text in DB.

Covers:
- GET/PATCH round-trip via the API returns a ``list[str]``.
- Legacy callers that send a JSON-encoded string still work.
- Legacy callers that send a comma-separated string still work.
- Empty strings and duplicates are dropped by the inbound validator.
- ORM column stays JSON-encoded text (no schema migration needed).
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Book
from app.database import SessionLocal


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient) -> str:
    r = client.post("/api/books", json={"title": "KW Test", "author": "T"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def test_patch_keywords_as_list(client):
    book_id = _create_book(client)
    try:
        r = client.patch(
            f"/api/books/{book_id}",
            json={"keywords": ["science fiction", "dystopia", "climate"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["keywords"] == ["science fiction", "dystopia", "climate"]

        # GET must return the same list, not a JSON string
        r = client.get(f"/api/books/{book_id}")
        assert r.status_code == 200
        assert r.json()["keywords"] == ["science fiction", "dystopia", "climate"]
    finally:
        _cleanup(client, book_id)


def test_patch_keywords_as_legacy_json_string(client):
    book_id = _create_book(client)
    try:
        r = client.patch(
            f"/api/books/{book_id}",
            json={"keywords": json.dumps(["alpha", "beta"])},
        )
        assert r.status_code == 200, r.text
        assert r.json()["keywords"] == ["alpha", "beta"]
    finally:
        _cleanup(client, book_id)


def test_patch_keywords_as_legacy_csv_string(client):
    book_id = _create_book(client)
    try:
        r = client.patch(
            f"/api/books/{book_id}",
            json={"keywords": "one, two ,  three,,"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["keywords"] == ["one", "two", "three"]
    finally:
        _cleanup(client, book_id)


def test_patch_keywords_drops_duplicates_and_empty(client):
    book_id = _create_book(client)
    try:
        r = client.patch(
            f"/api/books/{book_id}",
            json={"keywords": ["Alpha", "alpha", "", "  ", "Beta"]},
        )
        assert r.status_code == 200, r.text
        # First occurrence wins, whitespace/empty dropped, case-insensitive dedup
        assert r.json()["keywords"] == ["Alpha", "Beta"]
    finally:
        _cleanup(client, book_id)


def test_keywords_stored_as_json_text_in_db(client):
    book_id = _create_book(client)
    try:
        client.patch(
            f"/api/books/{book_id}",
            json={"keywords": ["foo", "bar"]},
        )
        # Inspect the ORM column directly to confirm the storage format.
        db = SessionLocal()
        try:
            book = db.query(Book).filter(Book.id == book_id).first()
            assert book is not None
            assert isinstance(book.keywords, str)
            assert json.loads(book.keywords) == ["foo", "bar"]
        finally:
            db.close()
    finally:
        _cleanup(client, book_id)


def test_empty_keywords_list_clears_field(client):
    book_id = _create_book(client)
    try:
        client.patch(f"/api/books/{book_id}", json={"keywords": ["x", "y"]})
        r = client.patch(f"/api/books/{book_id}", json={"keywords": []})
        assert r.status_code == 200
        assert r.json()["keywords"] == []
    finally:
        _cleanup(client, book_id)
