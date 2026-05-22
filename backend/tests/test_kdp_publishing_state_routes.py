"""Integration tests for the KDP publishing-state endpoints (C5).

Covers KDP-PUBLISHING-WIZARD-01-PHASE-2 Session 1 C5 — the
GET / PATCH / DELETE ``/api/kdp/publishing-state/{book_id}``
endpoints that the wizard's auto-save flow (C11) targets.

Scope:
- GET on a book with no row returns ``state=None`` + the book's
  ``updated_at`` (client-side conflict detection signal).
- PATCH creates the row on first call (upsert).
- PATCH updates fields on subsequent calls; unset fields stay
  unchanged.
- PATCH on a non-existent book returns 404.
- DELETE removes the row + is idempotent (no-op on missing row).
- Round-trip of JSON-shaped fields (``prices`` +
  ``launch_checklist_state``) preserves dict shape.
- 422 on invalid royalty_plan literal.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Book


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def book_id() -> str:
    with SessionLocal() as session:
        book = Book(title="Test Book", author="Author", book_type="prose")
        session.add(book)
        session.commit()
        return book.id


def test_get_returns_state_none_when_no_row_exists(client, book_id):
    resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["book_id"] == book_id
    assert body["book_updated_at"] is not None
    assert body["state"] is None


def test_get_returns_404_for_missing_book(client):
    resp = client.get("/api/kdp/publishing-state/nonexistent-id")
    assert resp.status_code == 404


def test_patch_creates_row_on_first_call(client, book_id):
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "70"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["book_id"] == book_id
    assert body["royalty_plan"] == "70"
    assert body["kdp_select_enrolled"] is False
    assert body["expanded_distribution"] is False
    assert body["prices"] == {}
    assert body["launch_checklist_state"] == {}


def test_patch_updates_existing_row(client, book_id):
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "70"},
    )
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"kdp_select_enrolled": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Updated field:
    assert body["kdp_select_enrolled"] is True
    # Previously-set field stays unchanged:
    assert body["royalty_plan"] == "70"


def test_patch_returns_404_for_missing_book(client):
    resp = client.patch(
        "/api/kdp/publishing-state/nonexistent-id",
        json={"royalty_plan": "70"},
    )
    assert resp.status_code == 404


def test_get_returns_persisted_row_after_patch(client, book_id):
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "35", "expanded_distribution": True},
    )
    resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    assert resp.status_code == 200
    body = resp.json()
    state = body["state"]
    assert state is not None
    assert state["royalty_plan"] == "35"
    assert state["expanded_distribution"] is True


def test_patch_round_trips_json_prices_field(client, book_id):
    prices = {
        "US": {"currency": "USD", "list_price": 4.99},
        "EU": {"currency": "EUR", "list_price": 4.49},
    }
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"prices": prices},
    )
    assert resp.status_code == 200
    assert resp.json()["prices"] == prices


def test_patch_round_trips_launch_checklist_state(client, book_id):
    checklist = {
        "metadata_validated": "2026-05-22T13:00:00",
        "cover_validated": "2026-05-22T13:05:00",
    }
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"launch_checklist_state": checklist},
    )
    assert resp.status_code == 200
    assert resp.json()["launch_checklist_state"] == checklist


def test_patch_rejects_invalid_royalty_plan(client, book_id):
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "50"},  # not "35" or "70"
    )
    assert resp.status_code == 422


def test_delete_removes_existing_row(client, book_id):
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "70"},
    )
    resp = client.delete(f"/api/kdp/publishing-state/{book_id}")
    assert resp.status_code == 204
    # GET now returns state=None again.
    get_resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    assert get_resp.json()["state"] is None


def test_delete_is_idempotent(client, book_id):
    # No row exists to start with.
    resp = client.delete(f"/api/kdp/publishing-state/{book_id}")
    assert resp.status_code == 204


def test_book_updated_at_changes_after_book_edit(client, book_id):
    """The conflict-detection contract: the wizard reads
    ``book_updated_at`` from the GET response. After the user
    edits the Book separately, the next GET reflects the new
    timestamp; the wizard compares against ``state.updated_at``
    to decide whether to re-validate."""
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "70"},
    )
    initial = client.get(f"/api/kdp/publishing-state/{book_id}").json()
    initial_book_ts = initial["book_updated_at"]

    # Simulate a separate book edit bumping updated_at.
    with SessionLocal() as session:
        book = session.get(Book, book_id)
        assert book is not None
        book.title = "Updated Title"
        session.commit()

    later = client.get(f"/api/kdp/publishing-state/{book_id}").json()
    assert later["book_updated_at"] != initial_book_ts
