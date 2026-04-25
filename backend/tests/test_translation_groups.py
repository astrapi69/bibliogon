"""PGS-04 backend tests: translation-group linking primitives + endpoints.

Covers:
- ``derive_language``: branch-name detection rules.
- ``link_books``: fresh group, fold-into-existing, transitive merge,
  no-op for fewer than two ids.
- ``unlink_book``: removes the row, auto-clears the lone survivor.
- ``list_siblings``: excludes self, hides soft-deleted, sorts by lang.
- HTTP endpoints: GET /translations/{book_id}, POST /translations/link,
  POST /translations/{book_id}/unlink + 404 for unknown books.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Book
from app.services.translation_groups import (
    derive_language,
    link_books,
    list_siblings,
    unlink_book,
)

client = TestClient(app)


# --- pure derive_language ---


@pytest.mark.parametrize(
    "branch,meta,expected",
    [
        ("main-de", "en", "de"),
        ("main-FR", "en", "fr"),
        ("main", "en", "en"),
        ("main", None, None),
        ("feature/x", "es", "es"),
        ("", "ja", "ja"),
        ("main-de-AT", "en", "en"),  # locale tags rejected -> fall back to meta
    ],
)
def test_derive_language(branch: str, meta: str | None, expected: str | None) -> None:
    assert derive_language(branch, meta) == expected


# --- fixtures ---


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _make_book(db: Session, title: str, language: str) -> Book:
    b = Book(title=title, author="Aster", language=language)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@pytest.fixture
def three_books(db: Session) -> list[Book]:
    rows = [
        _make_book(db, "Buch DE", "de"),
        _make_book(db, "Book EN", "en"),
        _make_book(db, "Libro ES", "es"),
    ]
    yield rows
    for r in rows:
        db.delete(r)
    db.commit()


# --- link_books ---


def test_link_books_with_fewer_than_two_ids_is_noop(db: Session, three_books: list[Book]) -> None:
    out = link_books(db, book_ids=[three_books[0].id])
    assert out is None
    assert three_books[0].translation_group_id is None


def test_link_books_creates_fresh_group_when_none_exist(
    db: Session, three_books: list[Book]
) -> None:
    ids = [b.id for b in three_books]
    group_id = link_books(db, book_ids=ids)
    assert group_id is not None
    db.expire_all()
    rows = db.query(Book).filter(Book.id.in_(ids)).all()
    assert all(b.translation_group_id == group_id for b in rows)


def test_link_books_folds_new_member_into_existing_group(
    db: Session, three_books: list[Book]
) -> None:
    de, en, es = three_books
    # Pre-link de + en.
    first = link_books(db, book_ids=[de.id, en.id])
    # Add es later; expect fold into the existing group, not a new one.
    second = link_books(db, book_ids=[es.id, en.id])
    assert second == first


def test_link_books_merges_two_existing_groups_deterministically(
    db: Session, three_books: list[Book]
) -> None:
    """When two pre-existing groups would overlap, the lexicographically
    smaller id wins so a replay is deterministic across machines."""
    de, en, es = three_books
    g1 = link_books(db, book_ids=[de.id, en.id])
    # Promote es into its own group.
    es.translation_group_id = "z" * 32
    db.add(es)
    db.commit()
    merged = link_books(db, book_ids=[en.id, es.id])
    assert merged == min(g1, "z" * 32)


# --- unlink_book ---


def test_unlink_book_removes_row_and_auto_clears_lone_survivor(
    db: Session, three_books: list[Book]
) -> None:
    de, en, _es = three_books
    link_books(db, book_ids=[de.id, en.id])

    unlink_book(db, book_id=de.id)
    db.expire_all()

    de_row = db.get(Book, de.id)
    en_row = db.get(Book, en.id)
    # de is unlinked; en (the lone survivor) is also auto-unlinked.
    assert de_row.translation_group_id is None
    assert en_row.translation_group_id is None


def test_unlink_book_keeps_remaining_group_when_three_or_more(
    db: Session, three_books: list[Book]
) -> None:
    de, en, es = three_books
    group_id = link_books(db, book_ids=[de.id, en.id, es.id])

    unlink_book(db, book_id=de.id)
    db.expire_all()

    # The remaining pair stays grouped; only de is cleared.
    assert db.get(Book, de.id).translation_group_id is None
    assert db.get(Book, en.id).translation_group_id == group_id
    assert db.get(Book, es.id).translation_group_id == group_id


def test_unlink_book_idempotent_on_unlinked_or_unknown(db: Session) -> None:
    # Both call shapes should be silent no-ops, not raise.
    unlink_book(db, book_id="does-not-exist")


# --- list_siblings ---


def test_list_siblings_excludes_self_and_sorts_by_language(
    db: Session, three_books: list[Book]
) -> None:
    de, en, es = three_books
    link_books(db, book_ids=[de.id, en.id, es.id])

    siblings = list_siblings(db, book_id=en.id)
    assert [s.language for s in siblings] == ["de", "es"]
    assert all(s.book_id != en.id for s in siblings)


def test_list_siblings_returns_empty_when_unlinked(
    db: Session, three_books: list[Book]
) -> None:
    assert list_siblings(db, book_id=three_books[0].id) == []


def test_list_siblings_hides_soft_deleted_books(
    db: Session, three_books: list[Book]
) -> None:
    from datetime import UTC, datetime

    de, en, es = three_books
    link_books(db, book_ids=[de.id, en.id, es.id])
    en.deleted_at = datetime.now(UTC)
    db.add(en)
    db.commit()

    siblings = list_siblings(db, book_id=de.id)
    assert [s.book_id for s in siblings] == [es.id]


# --- HTTP endpoints ---


def test_get_siblings_returns_404_for_unknown_book() -> None:
    resp = client.get("/api/translations/does-not-exist")
    assert resp.status_code == 404


def test_get_siblings_returns_empty_for_unlinked(
    db: Session, three_books: list[Book]
) -> None:
    resp = client.get(f"/api/translations/{three_books[0].id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["translation_group_id"] is None
    assert body["siblings"] == []


def test_link_endpoint_groups_books(db: Session, three_books: list[Book]) -> None:
    ids = [b.id for b in three_books]
    resp = client.post("/api/translations/link", json={"book_ids": ids})
    assert resp.status_code == 200
    body = resp.json()
    assert body["translation_group_id"] is not None
    assert sorted(body["linked_book_ids"]) == sorted(ids)

    # GET surfaces the siblings list.
    de, en, _es = three_books
    resp = client.get(f"/api/translations/{en.id}")
    assert resp.status_code == 200
    siblings = resp.json()["siblings"]
    assert len(siblings) == 2
    # Excludes self.
    assert all(s["book_id"] != en.id for s in siblings)


def test_link_endpoint_skips_unknown_book_ids(
    db: Session, three_books: list[Book]
) -> None:
    resp = client.post(
        "/api/translations/link",
        json={"book_ids": [three_books[0].id, "ghost"]},
    )
    # Only one valid id -> below the link threshold, returns null.
    assert resp.status_code == 200
    assert resp.json()["translation_group_id"] is None


def test_link_endpoint_rejects_too_few_ids() -> None:
    resp = client.post("/api/translations/link", json={"book_ids": ["x"]})
    assert resp.status_code == 422


def test_unlink_endpoint_idempotent_returns_204(
    db: Session, three_books: list[Book]
) -> None:
    link_books(db, book_ids=[three_books[0].id, three_books[1].id])

    resp = client.post(f"/api/translations/{three_books[0].id}/unlink")
    assert resp.status_code == 204
    # Second call is a silent no-op.
    resp = client.post(f"/api/translations/{three_books[0].id}/unlink")
    assert resp.status_code == 204
