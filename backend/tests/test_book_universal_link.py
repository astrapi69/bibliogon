"""Round-trip tests for Book.universal_link (#797).

#782 added the column and the promotion endpoints but not the book
schema, so the field was invisible to `GET /api/books/{id}` and
unsettable through `PATCH` - the half-wired shape the lessons-learned
rule names: a stored value no consumer can read.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

LINK = "https://mybook.to/die-formbare-ewigkeit"


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def book_id(client: TestClient) -> str:
    response = client.post("/api/books", json={"title": "Universal-Link Probe", "author": "Aster"})
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


def test_a_fresh_book_reports_the_field_as_null(client: TestClient, book_id: str) -> None:
    body = client.get(f"/api/books/{book_id}").json()
    assert "universal_link" in body
    assert body["universal_link"] is None


def test_patch_sets_the_link_and_get_returns_it(client: TestClient, book_id: str) -> None:
    patched = client.patch(f"/api/books/{book_id}", json={"universal_link": LINK})
    assert patched.status_code == 200, patched.text
    assert patched.json()["universal_link"] == LINK
    assert client.get(f"/api/books/{book_id}").json()["universal_link"] == LINK


def test_publishing_metadata_is_set_by_patch_not_at_creation(client: TestClient) -> None:
    """`BookCreate` is deliberately narrow - no ISBN, no ASIN, no
    publisher. The link follows the same rule rather than becoming the
    one publishing field that is special."""
    response = client.post(
        "/api/books",
        json={
            "title": "Mit Link",
            "author": "Aster",
            "universal_link": LINK,
            "isbn_ebook": "978-3-16-148410-0",
        },
    )
    assert response.status_code in (200, 201), response.text
    body = response.json()
    assert body["universal_link"] is None
    assert body["isbn_ebook"] is None

    patched = client.patch(f"/api/books/{body['id']}", json={"universal_link": LINK})
    assert patched.json()["universal_link"] == LINK


def test_an_empty_string_clears_the_link(client: TestClient, book_id: str) -> None:
    client.patch(f"/api/books/{book_id}", json={"universal_link": LINK})
    cleared = client.patch(f"/api/books/{book_id}", json={"universal_link": ""})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["universal_link"] in (None, "")


def test_an_overlong_link_is_rejected_rather_than_truncated(
    client: TestClient, book_id: str
) -> None:
    """The column is String(500); a silently truncated URL resolves
    nowhere, which is worse than a refusal."""
    response = client.patch(
        f"/api/books/{book_id}", json={"universal_link": "https://x.example/" + "a" * 600}
    )
    assert response.status_code == 422


def test_the_link_survives_a_backup_round_trip(client: TestClient, book_id: str) -> None:
    """The .bgb serializer is introspection-driven, so this is a pin
    against a future column allowlist dropping the field."""
    from app.database import SessionLocal
    from app.models import Book
    from app.services.backup.serializer import serialize_row

    client.patch(f"/api/books/{book_id}", json={"universal_link": LINK})
    with SessionLocal() as db:
        book = db.query(Book).filter(Book.id == book_id).one()
        assert serialize_row(book)["universal_link"] == LINK
