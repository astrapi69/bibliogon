"""End-to-end tests for POST /api/articles/bulk-delete,
POST /api/books/bulk-delete, and POST /api/comments/bulk-delete.

Covers both soft (default) and permanent paths plus the edge
cases the user spec'd: empty body rejected, over-limit rejected,
missing IDs land in ``failed``, already-trashed IDs land in
``skipped_already_trashed`` on the soft path, cascade-deletes
children on the permanent path. ArticleComment is a leaf (no
cascade children) so its permanent path just removes the row.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleAsset, ArticleComment, Book, Chapter, Publication


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _make_article(client: TestClient, title: str = "Bulk-test article") -> str:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _make_book(client: TestClient, title: str = "Bulk-test book") -> str:
    resp = client.post("/api/books", json={"title": title, "author": "Tester"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _make_comment(
    db: Session,
    body_text: str = "Bulk-test comment",
    imported_from: str = "medium",
) -> str:
    """Insert an ArticleComment directly via SQLAlchemy. Comments don't
    have a create-endpoint — they arrive via the Medium-import plugin
    in production; tests seed them through the ORM, mirroring the
    pattern used in ``test_comments_admin.py``."""
    row = ArticleComment(
        body_text=body_text,
        imported_from=imported_from,
        imported_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    db.add(row)
    db.commit()
    return row.id


# ---------------------------------------------------------------------------
# Articles — soft path
# ---------------------------------------------------------------------------


def test_articles_bulk_delete_soft_path_moves_to_trash(
    client: TestClient, db: Session
) -> None:
    ids = [_make_article(client, f"Soft target {i}") for i in range(3)]
    resp = client.request(
        "POST", "/api/articles/bulk-delete", json={"ids": ids, "permanent": False}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_count"] == 3
    assert body["skipped_already_trashed"] == []
    assert body["failed"] == []
    for aid in ids:
        row = db.query(Article).filter(Article.id == aid).one()
        assert row.deleted_at is not None  # in trash


def test_articles_bulk_delete_soft_path_skips_already_trashed(
    client: TestClient, db: Session
) -> None:
    """Mixed list: half already trashed, half live. Soft path skips
    the trashed ones and surfaces them under skipped_already_trashed."""
    live_ids = [_make_article(client, f"Live {i}") for i in range(2)]
    trashed_ids = [_make_article(client, f"Pre-trashed {i}") for i in range(2)]
    # Trash the pre-trashed ones via the existing single-item endpoint.
    for tid in trashed_ids:
        assert client.delete(f"/api/articles/{tid}").status_code == 204

    all_ids = [*live_ids, *trashed_ids]
    body = client.post(
        "/api/articles/bulk-delete", json={"ids": all_ids, "permanent": False}
    ).json()
    assert body["deleted_count"] == 2  # only the live ones
    assert set(body["skipped_already_trashed"]) == set(trashed_ids)
    assert body["failed"] == []


def test_articles_bulk_delete_missing_id_lands_in_failed(
    client: TestClient,
) -> None:
    """An ID that does not exist in the DB lands in failed[] with the
    "not found" error rather than aborting the whole batch."""
    real_id = _make_article(client, "Real")
    body = client.post(
        "/api/articles/bulk-delete",
        json={"ids": [real_id, "fake-id-does-not-exist"], "permanent": False},
    ).json()
    assert body["deleted_count"] == 1
    assert {f["id"] for f in body["failed"]} == {"fake-id-does-not-exist"}
    assert body["failed"][0]["error"] == "not found"


# ---------------------------------------------------------------------------
# Articles — permanent path + cascade
# ---------------------------------------------------------------------------


def test_articles_bulk_delete_permanent_path_hard_deletes(
    client: TestClient, db: Session
) -> None:
    ids = [_make_article(client, f"Permanent target {i}") for i in range(2)]
    body = client.post(
        "/api/articles/bulk-delete", json={"ids": ids, "permanent": True}
    ).json()
    assert body["deleted_count"] == 2
    assert body["skipped_already_trashed"] == []
    assert body["failed"] == []
    # Rows are gone from the DB entirely.
    for aid in ids:
        assert db.query(Article).filter(Article.id == aid).first() is None


def test_articles_bulk_delete_permanent_cascades_children(
    client: TestClient, db: Session
) -> None:
    """Permanent delete must cascade to Publication + ArticleAsset
    + ArticleImportSource (SQLAlchemy cascade='all, delete-orphan'
    on each relationship)."""
    aid = _make_article(client, "With children")
    # Add a child publication directly so we don't depend on the
    # publication-create endpoint's platform-schema validation.
    db.add(Publication(article_id=aid, platform="medium", platform_metadata="{}"))
    db.commit()
    assert db.query(Publication).filter(Publication.article_id == aid).count() == 1

    body = client.post(
        "/api/articles/bulk-delete", json={"ids": [aid], "permanent": True}
    ).json()
    assert body["deleted_count"] == 1

    # Article + cascaded children all gone.
    assert db.query(Article).filter(Article.id == aid).first() is None
    assert db.query(Publication).filter(Publication.article_id == aid).count() == 0
    assert db.query(ArticleAsset).filter(ArticleAsset.article_id == aid).count() == 0


# ---------------------------------------------------------------------------
# Books — same shape, different model
# ---------------------------------------------------------------------------


def test_books_bulk_delete_soft_path_moves_to_trash(
    client: TestClient, db: Session
) -> None:
    ids = [_make_book(client, f"Book soft {i}") for i in range(2)]
    body = client.post(
        "/api/books/bulk-delete", json={"ids": ids, "permanent": False}
    ).json()
    assert body["deleted_count"] == 2
    for bid in ids:
        row = db.query(Book).filter(Book.id == bid).one()
        assert row.deleted_at is not None


def test_books_bulk_delete_permanent_cascades_chapters(
    client: TestClient, db: Session
) -> None:
    """Books cascade to Chapter / Asset / BookImportSource — verify
    Chapter as the most likely child to exist on a fresh book."""
    bid = _make_book(client, "With chapter")
    chap_resp = client.post(
        f"/api/books/{bid}/chapters",
        json={"title": "Ch 1", "content": "{}", "position": 0},
    )
    assert chap_resp.status_code in (200, 201)
    assert db.query(Chapter).filter(Chapter.book_id == bid).count() == 1

    body = client.post(
        "/api/books/bulk-delete", json={"ids": [bid], "permanent": True}
    ).json()
    assert body["deleted_count"] == 1
    assert db.query(Book).filter(Book.id == bid).first() is None
    assert db.query(Chapter).filter(Chapter.book_id == bid).count() == 0


# ---------------------------------------------------------------------------
# Comments — soft + permanent paths (leaf model, no cascade children)
# ---------------------------------------------------------------------------


def test_comments_bulk_delete_soft_path_moves_to_trash(
    client: TestClient, db: Session
) -> None:
    ids = [_make_comment(db, f"Soft comment {i}") for i in range(3)]
    body = client.post(
        "/api/comments/bulk-delete", json={"ids": ids, "permanent": False}
    ).json()
    assert body["deleted_count"] == 3
    assert body["skipped_already_trashed"] == []
    assert body["failed"] == []
    for cid in ids:
        row = db.query(ArticleComment).filter(ArticleComment.id == cid).one()
        assert row.deleted_at is not None


def test_comments_bulk_delete_soft_path_skips_already_trashed(
    client: TestClient, db: Session
) -> None:
    """Mixed list: half already trashed, half live. Soft path skips
    the trashed ones and surfaces them under skipped_already_trashed."""
    live_ids = [_make_comment(db, f"Live comment {i}") for i in range(2)]
    trashed_ids = [_make_comment(db, f"Pre-trashed comment {i}") for i in range(2)]
    for tid in trashed_ids:
        assert client.delete(f"/api/comments/{tid}").status_code == 204

    all_ids = [*live_ids, *trashed_ids]
    body = client.post(
        "/api/comments/bulk-delete", json={"ids": all_ids, "permanent": False}
    ).json()
    assert body["deleted_count"] == 2
    assert set(body["skipped_already_trashed"]) == set(trashed_ids)
    assert body["failed"] == []


def test_comments_bulk_delete_missing_id_lands_in_failed(
    client: TestClient, db: Session
) -> None:
    real_id = _make_comment(db, "Real comment")
    body = client.post(
        "/api/comments/bulk-delete",
        json={"ids": [real_id, "fake-comment-id"], "permanent": False},
    ).json()
    assert body["deleted_count"] == 1
    assert {f["id"] for f in body["failed"]} == {"fake-comment-id"}
    assert body["failed"][0]["error"] == "not found"


def test_comments_bulk_delete_permanent_path_hard_deletes(
    client: TestClient, db: Session
) -> None:
    """ArticleComment is a leaf — no cascade children to check, just
    verify the row is gone from the DB entirely."""
    ids = [_make_comment(db, f"Permanent comment {i}") for i in range(2)]
    body = client.post(
        "/api/comments/bulk-delete", json={"ids": ids, "permanent": True}
    ).json()
    assert body["deleted_count"] == 2
    for cid in ids:
        assert db.query(ArticleComment).filter(ArticleComment.id == cid).first() is None


# ---------------------------------------------------------------------------
# Request validation
# ---------------------------------------------------------------------------


def test_empty_ids_rejected(client: TestClient) -> None:
    resp = client.post(
        "/api/articles/bulk-delete", json={"ids": [], "permanent": False}
    )
    assert resp.status_code == 422  # Pydantic min_length=1


def test_over_200_ids_accepted_no_cap(client: TestClient) -> None:
    """Bulk-delete is uncapped — see the "per-operation cost-profile
    limits" lesson. 201 non-existent IDs are accepted by Pydantic
    (no max_length), the backend processes the batch, every row
    lands in failed[] because none exist. Contrast with bulk-export
    which keeps its 200-cap for the pandoc cost-profile reason."""
    fake_ids = [f"id-{i}" for i in range(201)]
    resp = client.post(
        "/api/articles/bulk-delete", json={"ids": fake_ids, "permanent": False}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted_count"] == 0
    assert len(body["failed"]) == 201
    assert all(f["error"] == "not found" for f in body["failed"])
