"""Smoke tests for Bibliogon API."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_book_crud():
    # Create
    r = client.post("/api/books", json={
        "title": "Testbuch",
        "author": "Aster",
        "language": "de",
    })
    assert r.status_code == 201
    book = r.json()
    book_id = book["id"]
    assert book["title"] == "Testbuch"

    # List
    r = client.get("/api/books")
    assert r.status_code == 200
    assert any(b["id"] == book_id for b in r.json())

    # Get
    r = client.get(f"/api/books/{book_id}")
    assert r.status_code == 200
    assert r.json()["chapters"] == []

    # Update
    r = client.patch(f"/api/books/{book_id}", json={"subtitle": "Ein Test"})
    assert r.status_code == 200
    assert r.json()["subtitle"] == "Ein Test"

    # Delete
    r = client.delete(f"/api/books/{book_id}")
    assert r.status_code == 204


def test_chapter_crud():
    # Setup: create book
    r = client.post("/api/books", json={"title": "Kapitelbuch", "author": "Aster"})
    book_id = r.json()["id"]

    # Create chapters
    r1 = client.post(f"/api/books/{book_id}/chapters", json={"title": "Kapitel 1"})
    assert r1.status_code == 201
    ch1_id = r1.json()["id"]

    r2 = client.post(f"/api/books/{book_id}/chapters", json={
        "title": "Kapitel 2",
        "content": "Inhalt von Kapitel 2",
    })
    assert r2.status_code == 201
    ch2_id = r2.json()["id"]

    # List
    r = client.get(f"/api/books/{book_id}/chapters")
    assert len(r.json()) == 2

    # Update - optimistic lock requires the current version (starts at 1)
    r = client.patch(f"/api/books/{book_id}/chapters/{ch1_id}", json={
        "content": "Neuer Inhalt",
        "version": 1,
    })
    assert r.json()["content"] == "Neuer Inhalt"
    assert r.json()["version"] == 2

    # Reorder
    r = client.put(f"/api/books/{book_id}/chapters/reorder", json={
        "chapter_ids": [ch2_id, ch1_id]
    })
    assert r.status_code == 200
    ordered = r.json()
    assert ordered[0]["id"] == ch2_id
    assert ordered[1]["id"] == ch1_id

    # Delete chapter
    r = client.delete(f"/api/books/{book_id}/chapters/{ch1_id}")
    assert r.status_code == 204

    # Verify book detail shows remaining chapter
    r = client.get(f"/api/books/{book_id}")
    assert len(r.json()["chapters"]) == 1

    # Cleanup
    client.delete(f"/api/books/{book_id}")


if __name__ == "__main__":
    test_health()
    test_book_crud()
    test_chapter_crud()
    print("All tests passed.")
