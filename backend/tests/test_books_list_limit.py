"""DASHBOARD-PAGINATION-LOAD-MORE-01: limit param on GET /api/books.

Companion to the same param on GET /api/articles (see
test_articles.py). Verifies the cap-and-default behaviour the
dashboard's "Load more" pattern relies on.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book(title: str) -> dict:
    resp = client.post("/api/books", json={"title": title, "author": "A"})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_list_books_limit_caps_response() -> None:
    """``limit`` returns the N most-recently-updated rows."""
    _create_book("limit-A")
    _create_book("limit-B")
    _create_book("limit-C")
    rows = client.get("/api/books", params={"limit": 2}).json()
    assert len(rows) == 2


def test_list_books_limit_returns_most_recent_first() -> None:
    """Ordering remains updated_at desc when limit is applied."""
    older = _create_book("older")
    newer = _create_book("newer")
    # Touch older so it becomes the most-recently-updated.
    client.patch(f"/api/books/{older['id']}", json={"subtitle": "bumped"})
    rows = client.get("/api/books", params={"limit": 1}).json()
    assert len(rows) == 1
    assert rows[0]["id"] == older["id"]
    assert rows[0]["id"] != newer["id"]


def test_list_books_no_limit_returns_all() -> None:
    """Omitting ``limit`` preserves the historical no-cap behaviour."""
    for i in range(3):
        _create_book(f"no-limit-{i}")
    rows = client.get("/api/books").json()
    titles = {r["title"] for r in rows}
    assert {"no-limit-0", "no-limit-1", "no-limit-2"}.issubset(titles)


def test_list_books_limit_rejects_zero_and_negative() -> None:
    """``ge=1`` guards against silly values."""
    assert client.get("/api/books", params={"limit": 0}).status_code == 422
    assert client.get("/api/books", params={"limit": -5}).status_code == 422


def test_list_books_limit_rejects_above_cap() -> None:
    """``le=1000`` prevents huge-page abuse."""
    assert client.get("/api/books", params={"limit": 1001}).status_code == 422
