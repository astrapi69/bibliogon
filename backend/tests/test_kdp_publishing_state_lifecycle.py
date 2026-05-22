"""End-to-end lifecycle tests for the KDP publishing-state +
ARC-reviewer server-side foundation (C7).

KDP-PUBLISHING-WIZARD-01-PHASE-2 Session 1 boundary commit.
Where C5 + C6 cover individual endpoints, this file exercises
the CROSS-endpoint journeys that the wizard will hit in Session
2 — making sure the persistence layer is coherent end-to-end
BEFORE the UI ships against it.

Scope:
- Full launch journey: create book → PATCH publishing-state
  (pricing + KDP-Select) → POST 3 ARC reviewers → PATCH 2 to
  ``reviewed`` + 1 to ``declined`` → verify final GET shape.
- CASCADE integrity via the API layer (not just model-level):
  hard-deleting a Book through SQLAlchemy removes its
  publishing-state row + all attached reviewers; subsequent
  endpoint calls return 404.
- Auto-save resume: PATCH state + reviewer in separate calls;
  the GET wrapper returns both stable.
- Conflict-detection signal: book edits between wizard
  sessions bump ``book_updated_at`` while ``state.updated_at``
  stays.
- Multi-region pricing round-trip across multiple PATCHes
  preserves dict shape.

This is the green-baseline gate for Session 2 (wizard UI +
persistence wiring). If these tests pass, the server side is
ready for the wizard's auto-save flow (C11).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import ArcReviewer, Book, BookPublishingState


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def book_id() -> str:
    with SessionLocal() as session:
        book = Book(
            title="Launch Test Book",
            author="Author",
            book_type="prose",
        )
        session.add(book)
        session.commit()
        return book.id


def test_full_launch_journey(client, book_id):
    """The journey the wizard's user takes from a fresh book
    through to a launch-ready publishing-state row with
    completed ARC outreach."""
    # 1. Set pricing + KDP-Select enrollment.
    state_resp = client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={
            "royalty_plan": "70",
            "kdp_select_enrolled": True,
            "expanded_distribution": False,
            "prices": {
                "US": {"currency": "USD", "list_price": 4.99},
                "EU": {"currency": "EUR", "list_price": 4.49},
            },
        },
    )
    assert state_resp.status_code == 200

    # 2. Add 3 reviewers.
    reviewer_ids = []
    for name in ["Aliska", "Bartolomeo", "Catalina"]:
        post_resp = client.post(
            f"/api/kdp/publishing-state/{book_id}/reviewers",
            json={"reviewer_name": name},
        )
        assert post_resp.status_code == 201
        reviewer_ids.append(post_resp.json()["id"])

    # 3. Progress reviewer A through invited → sent → received →
    #    reviewed (with permalink).
    for status in ["sent", "received", "reviewed"]:
        body = {"review_status": status}
        if status == "reviewed":
            body["review_permalink"] = "https://example.com/aliska"
        resp = client.patch(
            f"/api/kdp/publishing-state/{book_id}/reviewers/{reviewer_ids[0]}",
            json=body,
        )
        assert resp.status_code == 200

    # 4. Reviewer B: invited → sent → reviewed (skip received).
    for status in ["sent", "reviewed"]:
        body = {"review_status": status}
        if status == "reviewed":
            body["review_permalink"] = "https://example.com/bart"
        client.patch(
            f"/api/kdp/publishing-state/{book_id}/reviewers/{reviewer_ids[1]}",
            json=body,
        )

    # 5. Reviewer C: invited → declined.
    client.patch(
        f"/api/kdp/publishing-state/{book_id}/reviewers/{reviewer_ids[2]}",
        json={"review_status": "declined"},
    )

    # Final GET shape.
    final = client.get(f"/api/kdp/publishing-state/{book_id}").json()
    assert final["state"]["royalty_plan"] == "70"
    assert final["state"]["kdp_select_enrolled"] is True
    assert final["state"]["prices"]["US"]["list_price"] == 4.99
    reviewers = final["state"]["arc_reviewers"]
    assert len(reviewers) == 3
    statuses = sorted(r["review_status"] for r in reviewers)
    assert statuses == ["declined", "reviewed", "reviewed"]
    reviewed = [r for r in reviewers if r["review_status"] == "reviewed"]
    assert all(r["reviewed_at"] is not None for r in reviewed)
    assert all(r["review_permalink"] is not None for r in reviewed)


def test_cascade_book_hard_delete_clears_state_and_reviewers(
    client, book_id
):
    """The FK CASCADE chain (Book → publishing_state → reviewers)
    is verified at the model-test level in C4; this test pins it
    at the API integration level too."""
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "35"},
    )
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "X"},
    )

    # Hard-delete the Book directly via SQLAlchemy (the public
    # API uses soft-delete; CASCADE only fires on hard-delete).
    with SessionLocal() as session:
        book = session.get(Book, book_id)
        assert book is not None
        session.delete(book)
        session.commit()

        # Confirm the cascade at the DB layer.
        assert (
            session.query(BookPublishingState)
            .filter_by(book_id=book_id)
            .one_or_none()
        ) is None
        assert (
            session.query(ArcReviewer)
            .filter_by(reviewer_name="X")
            .one_or_none()
        ) is None

    # Confirm at the API layer.
    get_resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    assert get_resp.status_code == 404


def test_resume_persistence_across_partial_updates(client, book_id):
    """Auto-save shape: the wizard PATCHes state + reviewer in
    separate transactions; subsequent GETs return both stable
    even when the transactions are interleaved."""
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "70"},
    )
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Resume A"},
    )
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"kdp_select_enrolled": True},
    )
    client.post(
        f"/api/kdp/publishing-state/{book_id}/reviewers",
        json={"reviewer_name": "Resume B"},
    )

    resp = client.get(f"/api/kdp/publishing-state/{book_id}")
    state = resp.json()["state"]
    assert state["royalty_plan"] == "70"
    assert state["kdp_select_enrolled"] is True
    names = sorted(r["reviewer_name"] for r in state["arc_reviewers"])
    assert names == ["Resume A", "Resume B"]


def test_conflict_detection_signal_after_separate_book_edit(
    client, book_id
):
    """Wizard reads ``book_updated_at`` from the GET wrapper. The
    yellow banner fires when ``book_updated_at >
    state.updated_at``. This test pins the signal-shape contract."""
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"royalty_plan": "35"},
    )
    before = client.get(f"/api/kdp/publishing-state/{book_id}").json()
    state_ts_before = before["state"]["updated_at"]

    # Simulate a separate book edit (the user touches Book
    # metadata between wizard sessions).
    with SessionLocal() as session:
        book = session.get(Book, book_id)
        assert book is not None
        book.title = "Edited Title"
        session.commit()

    after = client.get(f"/api/kdp/publishing-state/{book_id}").json()
    # state.updated_at unchanged (the wizard didn't touch it).
    assert after["state"]["updated_at"] == state_ts_before
    # book_updated_at is the conflict signal.
    assert after["book_updated_at"] != before["book_updated_at"]


def test_multi_region_pricing_preserved_across_patches(client, book_id):
    """Pricing dict round-trips through multiple PATCHes; later
    PATCHes that don't touch ``prices`` preserve the prior
    dict. Confirms the JSON-as-Text round-trip + the upsert's
    field-level merge semantics."""
    initial_prices = {
        "US": {"currency": "USD", "list_price": 4.99},
        "EU": {"currency": "EUR", "list_price": 4.49},
        "UK": {"currency": "GBP", "list_price": 3.99},
    }
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"prices": initial_prices, "royalty_plan": "70"},
    )

    # Subsequent PATCH that touches OTHER fields must NOT clobber
    # ``prices``.
    client.patch(
        f"/api/kdp/publishing-state/{book_id}",
        json={"kdp_select_enrolled": True},
    )
    state = client.get(
        f"/api/kdp/publishing-state/{book_id}"
    ).json()["state"]
    assert state["prices"] == initial_prices
    assert state["kdp_select_enrolled"] is True
