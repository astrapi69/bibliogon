"""Integration tests for the KDP ARC-reviewer endpoints (C6).

Covers KDP-PUBLISHING-WIZARD-01-PHASE-2 Session 1 C6 — the
GET / POST / PATCH / DELETE
``/api/kdp/publishing-state/{book_id}/reviewers`` endpoints
that back the wizard's ARC step (C10).

Scope:
- GET on a book with no publishing-state row returns ``[]``
  (graceful empty list, no auto-create).
- POST auto-creates the publishing-state row if absent +
  attaches the reviewer to it (the user shouldn't need to think
  about publishing-state).
- POST validates the book exists (404 on missing book).
- POST defaults ``review_status="invited"`` + stamps
  ``invited_at``.
- PATCH partial-updates fields; absent fields stay unchanged.
- PATCH transitions through the linear status machine
  (invited → sent → received → reviewed | declined).
- PATCH auto-stamps ``reviewed_at`` when status flips to
  ``reviewed``.
- PATCH validates the reviewer belongs to the book in the URL
  (404 on cross-book mutation attempt).
- PATCH rejects invalid status values (422).
- DELETE removes the reviewer (204).
- DELETE returns 404 for missing reviewer.
- BookPublishingStateRead now includes ``arc_reviewers`` list
  (via the publishing-state GET).
- CASCADE: deleting the publishing-state row removes its
  reviewers.
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


def test_list_returns_empty_for_book_without_publishing_state(
    client, book_id
):
    resp = client.get(
        f"/api/kdp/publishing-state/{book_id}/reviewers"
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_returns_404_for_missing_book(client):
    resp = client.get(
        "/api/kdp/publishing-state/nonexistent-id/reviewers"
    )
    assert resp.status_code == 404


def test_post_creates_reviewer_with_invited_status(client, book_id):
    resp = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={
            "reviewer_name": "Reviewer A",
            "reviewer_email": "a@example.com",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["reviewer_name"] == "Reviewer A"
    assert body["reviewer_email"] == "a@example.com"
    assert body["review_status"] == "invited"
    assert body["invited_at"] is not None
    assert body["reviewed_at"] is None


def test_post_auto_creates_publishing_state(client, book_id):
    """The publishing-state row is auto-created on first reviewer
    add; the user shouldn't need to PATCH publishing-state first."""
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    state_resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    body = state_resp.json()
    assert body["state"] is not None
    assert body["state"]["book_id"] == book_id


def test_post_returns_404_for_missing_book(client):
    resp = client.post(
        "/api/kdp/publishing-state/nonexistent-id/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    assert resp.status_code == 404


def test_post_omits_email_when_not_provided(client, book_id):
    resp = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer Anonymous"},
    )
    assert resp.status_code == 201
    assert resp.json()["reviewer_email"] is None


def test_list_returns_reviewers_in_created_at_order(client, book_id):
    for name in ["Reviewer A", "Reviewer B", "Reviewer C"]:
        client.post(
            f"/api/kdp/publishing-state/{book_id}/reviewers",
            json={"reviewer_name": name},
        )
    resp = client.get(
        f"/api/kdp/publishing-state/{book_id}/reviewers"
    )
    names = [r["reviewer_name"] for r in resp.json()]
    assert names == ["Reviewer A", "Reviewer B", "Reviewer C"]


def test_patch_updates_status_through_linear_machine(client, book_id):
    create = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    rid = create.json()["id"]
    for status in ["sent", "received", "reviewed"]:
        resp = client.patch(
            f"/api/kdp/publishing-state/{book_id}/reviewers/{rid}",
            json={"review_status": status},
        )
        assert resp.status_code == 200
        assert resp.json()["review_status"] == status


def test_patch_auto_stamps_reviewed_at_on_reviewed_status(
    client, book_id
):
    create = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    rid = create.json()["id"]
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}/reviewers/{rid}",
        json={
            "review_status": "reviewed",
            "review_permalink": "https://example.com/r",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["reviewed_at"] is not None
    assert body["review_permalink"] == "https://example.com/r"


def test_patch_rejects_invalid_status(client, book_id):
    create = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    rid = create.json()["id"]
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}/reviewers/{rid}",
        json={"review_status": "spam"},
    )
    assert resp.status_code == 422


def test_patch_returns_404_for_unknown_reviewer(client, book_id):
    resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}/reviewers/nope",
        json={"review_status": "sent"},
    )
    assert resp.status_code == 404


def test_patch_404_when_reviewer_belongs_to_different_book(client):
    with SessionLocal() as session:
        book_a = Book(title="Book A", author="X", book_type="prose")
        book_b = Book(title="Book B", author="Y", book_type="prose")
        session.add_all([book_a, book_b])
        session.commit()
        a_id = book_a.id
        b_id = book_b.id

    create = client.post(
        f"/api/kdp/publishing-state/{a_id}/reviewers",
        json={"reviewer_name": "A's Reviewer"},
    )
    rid = create.json()["id"]
    # Attempt to update via book B's URL.
    resp = client.patch(
        f"/api/kdp/publishing-state/{b_id}/reviewers/{rid}",
        json={"review_status": "sent"},
    )
    assert resp.status_code == 404


def test_delete_removes_reviewer(client, book_id):
    create = client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    rid = create.json()["id"]
    resp = client.delete(
        f"/api/kdp/publishing-state/{book_id}/reviewers/{rid}"
    )
    assert resp.status_code == 204
    # Subsequent list omits the deleted reviewer.
    list_resp = client.get(
        f"/api/kdp/publishing-state/{book_id}/reviewers"
    )
    assert list_resp.json() == []


def test_delete_returns_404_for_unknown_reviewer(client, book_id):
    resp = client.delete(
        f"/api/kdp/publishing-state/{book_id}/reviewers/nope"
    )
    assert resp.status_code == 404


def test_publishing_state_get_includes_arc_reviewers(client, book_id):
    """BookPublishingStateRead now exposes ``arc_reviewers``;
    GET on the publishing-state endpoint returns them as a nested
    list."""
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Embedded Reviewer"},
    )
    resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    body = resp.json()
    assert body["state"] is not None
    arc = body["state"]["arc_reviewers"]
    assert len(arc) == 1
    assert arc[0]["reviewer_name"] == "Embedded Reviewer"


def test_cascade_publishing_state_delete_removes_reviewers(
    client, book_id
):
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Reviewer A"},
    )
    # Delete the publishing-state row → CASCADE removes reviewers.
    delete_resp = client.delete(
        f"/api/kdp/publishing-state/{book_id}"
    )
    assert delete_resp.status_code == 204
    list_resp = client.get(
        f"/api/kdp/publishing-state/{book_id}/reviewers"
    )
    assert list_resp.status_code == 200
    assert list_resp.json() == []
