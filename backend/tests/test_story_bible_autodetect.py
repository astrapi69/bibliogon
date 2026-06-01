"""Tests for the Story Bible auto-detect endpoint (STORY-BIBLE C14).

Exercised through the full app so the plugin-story-bible router mounts.
Covers: detection in chapter text, word-boundary (no substring false
positives), the short-name skip, and exclusion of already-linked pairs.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _book(client: TestClient) -> str:
    r = client.post("/api/books", json={"title": "Detect", "author": "A"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _chapter(client: TestClient, book_id: str, title: str, content: str) -> str:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "content": content},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _entity(client: TestClient, book_id: str, name: str) -> str:
    r = client.post(
        f"/api/story-bible/books/{book_id}/entities",
        json={"entity_type": "character", "name": name},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_detects_name_in_chapter_text() -> None:
    with TestClient(app) as client:
        book_id = _book(client)
        ch = _chapter(client, book_id, "One", "Alice met Bob. Alice smiled.")
        _entity(client, book_id, "Alice")
        _entity(client, book_id, "Bob")
        proposals = client.post(f"/api/story-bible/books/{book_id}/auto-detect").json()
        by_name = {p["entity_name"]: p for p in proposals}
        assert "Alice" in by_name and "Bob" in by_name
        assert by_name["Alice"]["chapter_id"] == ch
        assert by_name["Alice"]["occurrences"] == 2
        assert by_name["Bob"]["occurrences"] == 1


def test_word_boundary_no_substring_false_positive() -> None:
    with TestClient(app) as client:
        book_id = _book(client)
        _chapter(client, book_id, "One", "Samuel walked alone.")
        _entity(client, book_id, "Sam")
        proposals = client.post(f"/api/story-bible/books/{book_id}/auto-detect").json()
        # "Sam" must NOT match inside "Samuel".
        assert proposals == []


def test_short_names_are_skipped() -> None:
    with TestClient(app) as client:
        book_id = _book(client)
        _chapter(client, book_id, "One", "I I I am here.")
        _entity(client, book_id, "I")
        proposals = client.post(f"/api/story-bible/books/{book_id}/auto-detect").json()
        assert proposals == []


def test_already_linked_pair_excluded() -> None:
    with TestClient(app) as client:
        book_id = _book(client)
        ch = _chapter(client, book_id, "One", "Alice was here.")
        entity_id = _entity(client, book_id, "Alice")
        # Link Alice -> chapter; auto-detect should not re-propose it.
        link = client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "chapter_id": ch},
        )
        assert link.status_code in (200, 201), link.text
        proposals = client.post(f"/api/story-bible/books/{book_id}/auto-detect").json()
        assert proposals == []


def test_auto_detect_unknown_book_404() -> None:
    with TestClient(app) as client:
        r = client.post("/api/story-bible/books/nope/auto-detect")
        assert r.status_code == 404
