"""PUBLICATION-STATUS-BOOK-PARITY-01 tests.

Pin the contract:

- Default ``Book.status`` is ``"draft"`` (matches Article).
- PATCH accepts the 4 valid values + rejects unknown ones.
- ``PublicationStatus`` Literal stays in sync with the
  ``_PUBLISHING_LIFECYCLE`` tuple (drift-detector).
- Article + Book share the same enum source.
"""

from __future__ import annotations

from typing import get_args

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import (
    PublicationStatus,
    _ARTICLE_STATUSES,
    _PUBLISHING_LIFECYCLE,
)

client = TestClient(app)


def test_publication_statuses_tuple_and_literal_match() -> None:
    """Drift-detector: the runtime tuple and the Pydantic Literal
    MUST agree. If they diverge, every status-validation path
    silently drifts from the API surface."""
    assert set(_PUBLISHING_LIFECYCLE) == set(get_args(PublicationStatus))


def test_article_and_book_share_publication_status_source() -> None:
    """Same publication-lifecycle source backs both surfaces. A
    future status change (e.g. adding 'paused') propagates to
    both Article and Book in one edit."""
    assert _ARTICLE_STATUSES is _PUBLISHING_LIFECYCLE


def test_new_book_defaults_to_draft_status() -> None:
    resp = client.post(
        "/api/books",
        json={"title": "Status Default Test", "author": "Aster"},
    )
    assert resp.status_code in (200, 201), resp.text
    body = resp.json()
    assert body["status"] == "draft"


def test_book_create_accepts_explicit_status() -> None:
    resp = client.post(
        "/api/books",
        json={
            "title": "Explicit Status",
            "author": "Aster",
            "status": "ready",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["status"] == "ready"


def test_book_patch_accepts_each_status_value() -> None:
    create_resp = client.post(
        "/api/books",
        json={"title": "Patch Each", "author": "Aster"},
    )
    book_id = create_resp.json()["id"]
    for status_value in ("draft", "ready", "published", "archived"):
        resp = client.patch(
            f"/api/books/{book_id}",
            json={"status": status_value},
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["status"] == status_value


def test_book_patch_rejects_unknown_status_with_422() -> None:
    create_resp = client.post(
        "/api/books",
        json={"title": "Reject Unknown", "author": "Aster"},
    )
    book_id = create_resp.json()["id"]
    resp = client.patch(
        f"/api/books/{book_id}",
        json={"status": "totally_made_up_value"},
    )
    assert resp.status_code == 422


def test_book_create_rejects_unknown_status_with_422() -> None:
    resp = client.post(
        "/api/books",
        json={
            "title": "Bad Status on Create",
            "author": "Aster",
            "status": "bogus_value",
        },
    )
    assert resp.status_code == 422
