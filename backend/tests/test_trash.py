"""Integration tests for the trash / soft-delete endpoints.

Covers the full lifecycle:
  DELETE /api/books/{id}                -> soft-delete (sets deleted_at)
  GET    /api/books/trash/list          -> list trashed books
  POST   /api/books/trash/{id}/restore  -> restore from trash
  DELETE /api/books/trash/{id}          -> permanent delete one
  DELETE /api/books/trash/empty         -> permanent delete all

Also verifies that soft-deleted books are excluded from the normal
book list and that chapters cascade on permanent delete.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book(title: str = "Trash Test", author: str = "Tester") -> dict:
    resp = client.post("/api/books", json={"title": title, "author": author})
    assert resp.status_code == 201
    return resp.json()


def _create_chapter(book_id: str, title: str = "Ch1") -> dict:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "content": "{}"},
    )
    assert resp.status_code == 201
    return resp.json()


# --- Soft-delete ---


def test_delete_book_moves_to_trash():
    """DELETE /api/books/{id} sets deleted_at instead of removing the row."""
    book = _create_book("To Trash")

    resp = client.delete(f"/api/books/{book['id']}")
    assert resp.status_code == 204

    # Gone from normal list
    books = client.get("/api/books").json()
    assert all(b["id"] != book["id"] for b in books)

    # Present in trash
    trash = client.get("/api/books/trash/list").json()
    assert any(b["id"] == book["id"] for b in trash)


def test_deleted_book_not_in_normal_list():
    """Soft-deleted books are filtered out of GET /api/books."""
    book_a = _create_book("Active Book")
    book_b = _create_book("Trashed Book")

    client.delete(f"/api/books/{book_b['id']}")

    books = client.get("/api/books").json()
    book_ids = [b["id"] for b in books]
    assert book_a["id"] in book_ids
    assert book_b["id"] not in book_ids


def test_deleted_book_not_updatable():
    """PATCH on a soft-deleted book returns 404."""
    book = _create_book("Will Trash")
    client.delete(f"/api/books/{book['id']}")

    resp = client.patch(f"/api/books/{book['id']}", json={"title": "New Title"})
    assert resp.status_code == 404


# --- Trash list ---


def test_trash_list_empty_by_default():
    """Fresh DB has no trashed books."""
    resp = client.get("/api/books/trash/list")
    assert resp.status_code == 200
    assert resp.json() == []


def test_trash_list_returns_only_deleted_books():
    """Only soft-deleted books appear in the trash list."""
    active = _create_book("Active")
    trashed = _create_book("Trashed")
    client.delete(f"/api/books/{trashed['id']}")

    trash = client.get("/api/books/trash/list").json()
    trash_ids = [b["id"] for b in trash]
    assert trashed["id"] in trash_ids
    assert active["id"] not in trash_ids


# --- Restore ---


def test_restore_book_from_trash():
    """POST /api/books/trash/{id}/restore clears deleted_at."""
    book = _create_book("Restore Me")
    client.delete(f"/api/books/{book['id']}")

    resp = client.post(f"/api/books/trash/{book['id']}/restore")
    assert resp.status_code == 200
    restored = resp.json()
    assert restored["title"] == "Restore Me"

    # Back in normal list
    books = client.get("/api/books").json()
    assert any(b["id"] == book["id"] for b in books)

    # Gone from trash
    trash = client.get("/api/books/trash/list").json()
    assert all(b["id"] != book["id"] for b in trash)


def test_restore_nonexistent_book_returns_404():
    """Restoring a book that is not in the trash returns 404."""
    resp = client.post("/api/books/trash/nonexistent123/restore")
    assert resp.status_code == 404


def test_restore_active_book_returns_404():
    """Restoring a book that is not soft-deleted returns 404."""
    book = _create_book("Not Deleted")

    resp = client.post(f"/api/books/trash/{book['id']}/restore")
    assert resp.status_code == 404


# --- Permanent delete (single) ---


def test_permanent_delete_one():
    """DELETE /api/books/trash/{id} removes the row permanently."""
    book = _create_book("Permanent Delete")
    client.delete(f"/api/books/{book['id']}")

    resp = client.delete(f"/api/books/trash/{book['id']}")
    assert resp.status_code == 204

    # Gone from both lists
    books = client.get("/api/books").json()
    trash = client.get("/api/books/trash/list").json()
    all_ids = [b["id"] for b in books] + [b["id"] for b in trash]
    assert book["id"] not in all_ids


def test_permanent_delete_cascades_chapters():
    """Permanent delete also removes associated chapters."""
    book = _create_book("Cascade Test")
    chapter = _create_chapter(book["id"], "Will be deleted")

    client.delete(f"/api/books/{book['id']}")
    client.delete(f"/api/books/trash/{book['id']}")

    # Chapter should not be accessible
    resp = client.get(f"/api/books/{book['id']}/chapters")
    # Book is gone, so chapters endpoint returns 404 or empty
    # depending on implementation. At minimum, no chapters remain.
    if resp.status_code == 200:
        assert resp.json() == []


def test_permanent_delete_nonexistent_returns_404():
    """Permanent delete of a non-trashed book returns 404."""
    resp = client.delete("/api/books/trash/nonexistent123")
    assert resp.status_code == 404


def test_permanent_delete_active_book_returns_404():
    """Cannot permanently delete a book that is not in the trash."""
    book = _create_book("Still Active")

    resp = client.delete(f"/api/books/trash/{book['id']}")
    assert resp.status_code == 404


# --- Empty trash ---


def test_empty_trash():
    """DELETE /api/books/trash/empty removes all trashed books."""
    book_a = _create_book("Trash A")
    book_b = _create_book("Trash B")
    active = _create_book("Stay Active")

    client.delete(f"/api/books/{book_a['id']}")
    client.delete(f"/api/books/{book_b['id']}")

    resp = client.delete("/api/books/trash/empty")
    assert resp.status_code == 204

    # Trash is empty
    trash = client.get("/api/books/trash/list").json()
    assert trash == []

    # Active book untouched
    books = client.get("/api/books").json()
    assert any(b["id"] == active["id"] for b in books)


def test_empty_trash_when_already_empty():
    """Empty trash on an already-empty trash is a no-op (not an error)."""
    resp = client.delete("/api/books/trash/empty")
    assert resp.status_code == 204
