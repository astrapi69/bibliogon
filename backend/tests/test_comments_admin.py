"""Tests for the /api/comments admin router.

MEDIUM-COMMENTS-IMPORT-01 commit 7. Covers list with optional
imported_from + orphans_only filters, soft-delete via DELETE,
404 for unknown id, and idempotent re-delete (returns 204 even
when the comment is already soft-deleted).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import ArticleComment

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
                imported_at=datetime(2026, 4, 1, tzinfo=UTC),
            ),
            ArticleComment(
                body_text="Orphan, medium",
                responds_to_url="https://medium.com/parent",
                imported_from="medium",
                imported_at=datetime(2026, 4, 2, tzinfo=UTC),
            ),
            ArticleComment(
                body_text="Orphan, wordpress",
                responds_to_url="https://example.com/wp",
                imported_from="wordpress",
                imported_at=datetime(2026, 4, 3, tzinfo=UTC),
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
    resp = client.get("/api/comments?orphans_only=true&imported_from=medium&limit=500")
    assert resp.status_code == 200
    returned_ids = {c["id"] for c in resp.json()}
    assert returned_ids == {ids["orphan_medium"]}


def test_list_excludes_soft_deleted() -> None:
    ids = _seed_comments()
    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter_by(id=ids["orphan_wp"]).one()
        comment.deleted_at = datetime.now(UTC)
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


# ---------------------------------------------------------------------------
# Bug 10: trash-lifecycle tests (list / restore / empty / permanent-delete)
# ---------------------------------------------------------------------------


def _trash_comment(comment_id: str) -> None:
    """Helper: soft-delete via the production DELETE endpoint."""
    resp = client.delete(f"/api/comments/{comment_id}")
    assert resp.status_code == 204


def test_trash_list_returns_empty_when_no_trashed_comments() -> None:
    _seed_comments()  # only live rows seeded
    resp = client.get("/api/comments/trash/list")
    assert resp.status_code == 200
    assert resp.json() == []


def test_trash_list_returns_only_soft_deleted_rows() -> None:
    ids = _seed_comments()
    _trash_comment(ids["orphan_medium"])
    resp = client.get("/api/comments/trash/list")
    assert resp.status_code == 200
    returned = {row["id"] for row in resp.json()}
    assert returned == {ids["orphan_medium"]}


def test_trash_list_excludes_live_comments() -> None:
    """Sanity check: the active list endpoint must NOT include
    trashed rows, and the trash list must NOT include live ones —
    they partition cleanly along ``deleted_at IS NULL`` / ``IS
    NOT NULL``.
    """
    ids = _seed_comments()
    _trash_comment(ids["orphan_medium"])
    live = client.get("/api/comments?limit=500").json()
    trash = client.get("/api/comments/trash/list").json()
    live_ids = {row["id"] for row in live}
    trash_ids = {row["id"] for row in trash}
    assert ids["orphan_medium"] not in live_ids
    assert ids["linked_medium"] in live_ids
    assert ids["orphan_medium"] in trash_ids
    assert ids["linked_medium"] not in trash_ids
    assert live_ids.isdisjoint(trash_ids)


def test_trash_list_ordered_newest_first() -> None:
    """Mirrors ``GET /api/articles/trash/list``: newest-trashed
    first matches the user's mental model when the trash view
    opens right after a bulk move-to-trash.
    """
    ids = _seed_comments()
    _trash_comment(ids["linked_medium"])
    _trash_comment(ids["orphan_medium"])
    _trash_comment(ids["orphan_wp"])
    rows = client.get("/api/comments/trash/list").json()
    ordered_ids = [row["id"] for row in rows]
    # The third soft-delete ran last → newest deleted_at →
    # appears first in the response.
    assert ordered_ids[0] == ids["orphan_wp"]


def test_restore_happy_path_returns_live_comment() -> None:
    ids = _seed_comments()
    target = ids["orphan_medium"]
    _trash_comment(target)
    resp = client.post(f"/api/comments/trash/{target}/restore")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == target
    # Restored row reappears in the live list.
    live = client.get("/api/comments?limit=500").json()
    assert target in {row["id"] for row in live}
    # And is no longer in the trash list.
    trash = client.get("/api/comments/trash/list").json()
    assert target not in {row["id"] for row in trash}


def test_restore_clears_deleted_at_on_db_row() -> None:
    ids = _seed_comments()
    target = ids["orphan_medium"]
    _trash_comment(target)
    client.post(f"/api/comments/trash/{target}/restore")
    db = SessionLocal()
    try:
        row = db.query(ArticleComment).filter(ArticleComment.id == target).first()
        assert row is not None
        assert row.deleted_at is None
    finally:
        db.close()


def test_restore_unknown_id_returns_404() -> None:
    resp = client.post("/api/comments/trash/does-not-exist/restore")
    assert resp.status_code == 404
    assert "not found in trash" in resp.json()["detail"].lower()


def test_restore_live_comment_returns_404() -> None:
    """Restoring an id that exists but isn't currently in trash
    must be a 404, not a silent success. Protects multi-tab
    races where another tab restored first.
    """
    ids = _seed_comments()
    resp = client.post(f"/api/comments/trash/{ids['linked_medium']}/restore")
    assert resp.status_code == 404
    assert "not found in trash" in resp.json()["detail"].lower()


def test_restore_then_redelete_lifecycle() -> None:
    """Full round-trip: soft-delete → restore → soft-delete again.
    The second soft-delete must succeed (the restore really did
    return the row to live state).
    """
    ids = _seed_comments()
    target = ids["orphan_medium"]
    _trash_comment(target)
    assert client.post(f"/api/comments/trash/{target}/restore").status_code == 200
    second = client.delete(f"/api/comments/{target}")
    assert second.status_code == 204


def test_permanent_delete_removes_row_from_db() -> None:
    ids = _seed_comments()
    target = ids["orphan_medium"]
    _trash_comment(target)
    resp = client.delete(f"/api/comments/trash/{target}")
    assert resp.status_code == 204
    db = SessionLocal()
    try:
        row = db.query(ArticleComment).filter(ArticleComment.id == target).first()
        assert row is None
    finally:
        db.close()


def test_permanent_delete_unknown_id_returns_404() -> None:
    resp = client.delete("/api/comments/trash/does-not-exist")
    assert resp.status_code == 404


def test_permanent_delete_live_comment_returns_404() -> None:
    """Refusing to hard-delete a live comment forces the caller
    to soft-delete first. No single-step hard-delete-without-
    trash path exists by design.
    """
    ids = _seed_comments()
    resp = client.delete(f"/api/comments/trash/{ids['linked_medium']}")
    assert resp.status_code == 404
    # Confirm the row is still alive (404 was a routing branch,
    # not an actual deletion).
    db = SessionLocal()
    try:
        row = db.query(ArticleComment).filter(ArticleComment.id == ids["linked_medium"]).first()
        assert row is not None
    finally:
        db.close()


def test_empty_trash_removes_all_trashed_rows() -> None:
    ids = _seed_comments()
    _trash_comment(ids["linked_medium"])
    _trash_comment(ids["orphan_wp"])
    resp = client.delete("/api/comments/trash/empty")
    assert resp.status_code == 204
    trash = client.get("/api/comments/trash/list").json()
    assert trash == []


def test_empty_trash_leaves_live_rows_intact() -> None:
    ids = _seed_comments()
    _trash_comment(ids["orphan_medium"])
    # linked_medium + orphan_wp stay live.
    client.delete("/api/comments/trash/empty")
    live = client.get("/api/comments?limit=500").json()
    live_ids = {row["id"] for row in live}
    assert ids["linked_medium"] in live_ids
    assert ids["orphan_wp"] in live_ids
    # The previously-trashed row is gone (hard-deleted), not just
    # restored.
    db = SessionLocal()
    try:
        gone = db.query(ArticleComment).filter(ArticleComment.id == ids["orphan_medium"]).first()
        assert gone is None
    finally:
        db.close()


def test_empty_trash_idempotent_when_already_empty() -> None:
    _seed_comments()  # no trashed rows
    first = client.delete("/api/comments/trash/empty")
    assert first.status_code == 204
    second = client.delete("/api/comments/trash/empty")
    assert second.status_code == 204


def test_trash_lifecycle_full_round_trip() -> None:
    """Backend regression-pin for the user-visible flow that Bug 10
    closes: soft-delete → trash list shows row → restore → row
    reappears in the active list → soft-delete again →
    permanent-delete-from-trash → gone forever.
    """
    ids = _seed_comments()
    target = ids["orphan_medium"]

    # Soft-delete.
    _trash_comment(target)
    assert target in {r["id"] for r in client.get("/api/comments/trash/list").json()}

    # Restore.
    assert client.post(f"/api/comments/trash/{target}/restore").status_code == 200
    assert target in {r["id"] for r in client.get("/api/comments?limit=500").json()}

    # Soft-delete again, then permanent-delete.
    _trash_comment(target)
    assert client.delete(f"/api/comments/trash/{target}").status_code == 204

    # Final state: row is gone from both lists AND from the DB.
    assert target not in {r["id"] for r in client.get("/api/comments/trash/list").json()}
    assert target not in {r["id"] for r in client.get("/api/comments?limit=500").json()}
    db = SessionLocal()
    try:
        assert db.query(ArticleComment).filter(ArticleComment.id == target).first() is None
    finally:
        db.close()
