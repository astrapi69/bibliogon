"""Round-trip coverage for CHAPTER-COLLECTIONS-01 (Book.collections).

Manual chapter collections stored as a JSON list of
{id, name, chapter_ids[]} on the book. Covers default, round-trip,
exclude_unset preservation, empty list, and validation rejects.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Collections Book", "author": "Aster"})
    assert r.status_code == 201
    return r.json()["id"]


class TestBookCollections:
    def test_defaults_null(self):
        book = client.get(f"/api/books/{_create_book()}").json()
        assert book["collections"] is None

    def test_patch_collections_roundtrips(self):
        book_id = _create_book()
        payload = {
            "collections": [
                {"id": "c1", "name": "Act I", "chapter_ids": ["ch1", "ch2"]},
                {"id": "c2", "name": "Needs pass", "chapter_ids": []},
            ]
        }
        r = client.patch(f"/api/books/{book_id}", json=payload)
        assert r.status_code == 200, r.text
        cols = r.json()["collections"]
        assert [c["name"] for c in cols] == ["Act I", "Needs pass"]
        assert cols[0]["chapter_ids"] == ["ch1", "ch2"]
        persisted = client.get(f"/api/books/{book_id}").json()["collections"]
        assert persisted[0]["id"] == "c1"
        assert persisted[1]["chapter_ids"] == []

    def test_patch_without_collections_preserves_existing(self):
        book_id = _create_book()
        client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "name": "Keep", "chapter_ids": []}]},
        )
        r = client.patch(f"/api/books/{book_id}", json={"subtitle": "x"})
        assert r.status_code == 200
        assert [c["name"] for c in r.json()["collections"]] == ["Keep"]

    def test_empty_list_clears(self):
        book_id = _create_book()
        client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "name": "Tmp", "chapter_ids": []}]},
        )
        r = client.patch(f"/api/books/{book_id}", json={"collections": []})
        assert r.status_code == 200
        assert r.json()["collections"] == []

    def test_missing_name_rejected(self):
        book_id = _create_book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "chapter_ids": []}]},
        )
        assert r.status_code == 422

    def test_blank_name_rejected(self):
        book_id = _create_book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "name": "", "chapter_ids": []}]},
        )
        assert r.status_code == 422

    def test_color_defaults_null(self):
        book_id = _create_book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "name": "Plain", "chapter_ids": []}]},
        )
        assert r.status_code == 200
        assert r.json()["collections"][0]["color"] is None

    def test_color_roundtrips(self):
        book_id = _create_book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={
                "collections": [
                    {"id": "c1", "name": "Battles", "chapter_ids": [], "color": "#ef4444"}
                ]
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["collections"][0]["color"] == "#ef4444"
        persisted = client.get(f"/api/books/{book_id}").json()["collections"]
        assert persisted[0]["color"] == "#ef4444"

    def test_invalid_color_rejected(self):
        book_id = _create_book()
        r = client.patch(
            f"/api/books/{book_id}",
            json={"collections": [{"id": "c1", "name": "Bad", "chapter_ids": [], "color": "red"}]},
        )
        assert r.status_code == 422
