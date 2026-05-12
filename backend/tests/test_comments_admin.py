"""Tests for the /api/comments admin router.

MEDIUM-COMMENTS-IMPORT-01 commit 7. Covers list with optional
imported_from + orphans_only filters, soft-delete via DELETE,
404 for unknown id, and idempotent re-delete (returns 204 even
when the comment is already soft-deleted).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleComment

client = TestClient(app)


def _make_article(title: str = "Host") -> str:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _seed_comments() -> dict[str, str]:
    """Insert a known set of comments + return their ids by handle."""
    host_id = _make_article("Host with comments")
    db = SessionLocal()
    try:
        rows = [
            ArticleComment(
                body_text="Linked, medium",
                responds_to_article_id=host_id,
                imported_from="medium",
                imported_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            ),
            ArticleComment(
                body_text="Orphan, medium",
                responds_to_url="https://medium.com/parent",
                imported_from="medium",
                imported_at=datetime(2026, 4, 2, tzinfo=timezone.utc),
            ),
            ArticleComment(
                body_text="Orphan, wordpress",
                responds_to_url="https://example.com/wp",
                imported_from="wordpress",
                imported_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
            ),
        ]
        db.add_all(rows)
        db.commit()
        ids = {
            "linked_medium": rows[0].id,
            "orphan_medium": rows[1].id,
            "orphan_wp": rows[2].id,
        }
    finally:
        db.close()
    return ids


def test_list_returns_all_undeleted_by_default() -> None:
    ids = _seed_comments()
    resp = client.get("/api/comments?limit=500")
    assert resp.status_code == 200
    returned_ids = {c["id"] for c in resp.json()}
    assert ids["linked_medium"] in returned_ids
    assert ids["orphan_medium"] in returned_ids
    assert ids["orphan_wp"] in returned_ids


def test_list_filter_by_imported_from() -> None:
    _seed_comments()
    resp = client.get("/api/comments?imported_from=medium&limit=500")
    assert resp.status_code == 200
    sources = {c["imported_from"] for c in resp.json()}
    assert sources == {"medium"}


def test_list_orphans_only() -> None:
    ids = _seed_comments()
    resp = client.get("/api/comments?orphans_only=true&limit=500")
    assert resp.status_code == 200
    returned_ids = {c["id"] for c in resp.json()}
    # Linked comment must be filtered out.
    assert ids["linked_medium"] not in returned_ids
    # Both orphans present.
    assert ids["orphan_medium"] in returned_ids
    assert ids["orphan_wp"] in returned_ids


def test_list_combined_orphans_and_imported_from() -> None:
    """Both filters can be applied at once. ``orphans_only=true``
    + ``imported_from=medium`` yields only Medium orphans."""
    ids = _seed_comments()
    resp = client.get(
        "/api/comments?orphans_only=true&imported_from=medium&limit=500"
    )
    assert resp.status_code == 200
    returned_ids = {c["id"] for c in resp.json()}
    assert returned_ids == {ids["orphan_medium"]}


def test_list_excludes_soft_deleted() -> None:
    ids = _seed_comments()
    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter_by(id=ids["orphan_wp"]).one()
        comment.deleted_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
    resp = client.get("/api/comments?limit=500")
    returned_ids = {c["id"] for c in resp.json()}
    assert ids["orphan_wp"] not in returned_ids


def test_delete_soft_deletes_comment() -> None:
    ids = _seed_comments()
    target = ids["linked_medium"]
    resp = client.delete(f"/api/comments/{target}")
    assert resp.status_code == 204

    # Confirm DB state: row stays but ``deleted_at`` is set.
    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter_by(id=target).one()
        assert comment.deleted_at is not None
    finally:
        db.close()

    # Listing excludes the soft-deleted entry now.
    listed_ids = {c["id"] for c in client.get("/api/comments?limit=500").json()}
    assert target not in listed_ids


def test_delete_unknown_id_returns_404() -> None:
    resp = client.delete("/api/comments/does-not-exist")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_delete_idempotent_for_already_deleted() -> None:
    """Re-deleting a soft-deleted comment must still return 204
    so an admin view's bulk-delete-by-id loop stays clean."""
    ids = _seed_comments()
    target = ids["orphan_medium"]
    first = client.delete(f"/api/comments/{target}")
    assert first.status_code == 204
    second = client.delete(f"/api/comments/{target}")
    assert second.status_code == 204
