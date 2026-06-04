"""GET /api/books/{id}/full — full graph for offline download (P3-C3)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_full_returns_book_with_chapters_and_empty_graph_sections():
    book_id = client.post(
        "/api/books", json={"title": "Offline-Graph", "author": "A", "language": "de"}
    ).json()["id"]
    client.post(f"/api/books/{book_id}/chapters", json={"title": "Kap 1", "content": "{}"})

    r = client.get(f"/api/books/{book_id}/full")
    assert r.status_code == 200
    body = r.json()

    # Every declared graph section is present (empty when the book has none).
    for key in (
        "book",
        "chapters",
        "pages",
        "comic_panels",
        "comic_bubbles",
        "story_entities",
        "story_entity_page_links",
        "chapter_labels",
        "assets",
    ):
        assert key in body, f"missing section: {key}"

    assert body["book"]["id"] == book_id
    assert body["book"]["title"] == "Offline-Graph"
    assert len(body["chapters"]) == 1
    assert body["chapters"][0]["title"] == "Kap 1"
    # updated_at is serialized (ISO string) for the sync comparison.
    assert isinstance(body["chapters"][0]["updated_at"], str)
    assert body["pages"] == []
    assert body["comic_panels"] == []


def test_full_404_for_unknown_book():
    assert client.get("/api/books/does-not-exist/full").status_code == 404
