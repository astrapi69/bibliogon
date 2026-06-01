"""Integration tests for StoryEntity relationships (STORY-BIBLE C10).

Covers relationship CRUD via the entity create/patch path, the
resolve endpoint (target_entity_id -> full entity object), and the
invalid-target rejection paths (missing target, cross-book target,
self-relationship). Exercised through the full app so the
plugin-story-bible router mounts.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient, title: str = "Rel Book") -> str:
    resp = client.post("/api/books", json={"title": title, "author": "Author"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _create_entity(client: TestClient, book_id: str, name: str, **kwargs) -> dict:
    payload = {"entity_type": "character", "name": name}
    payload.update(kwargs)
    r = client.post(f"/api/story-bible/books/{book_id}/entities", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_entity_with_relationship_roundtrips() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        bob = _create_entity(
            client,
            book_id,
            "Bob",
            relationships=[
                {
                    "target_entity_id": alice["id"],
                    "relationship_type": "ally",
                    "description": "Childhood friends.",
                }
            ],
        )
        assert bob["relationships"] == [
            {
                "target_entity_id": alice["id"],
                "relationship_type": "ally",
                "description": "Childhood friends.",
            }
        ]
        # Persistence
        re_read = client.get(f"/api/story-bible/entities/{bob['id']}").json()
        assert re_read["relationships"][0]["relationship_type"] == "ally"


def test_patch_adds_and_clears_relationships() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        bob = _create_entity(client, book_id, "Bob")
        # Add via PATCH
        r = client.patch(
            f"/api/story-bible/entities/{bob['id']}",
            json={
                "relationships": [{"target_entity_id": alice["id"], "relationship_type": "rival"}]
            },
        )
        assert r.status_code == 200
        assert r.json()["relationships"][0]["relationship_type"] == "rival"
        # Clear via PATCH with empty list
        r2 = client.patch(
            f"/api/story-bible/entities/{bob['id']}",
            json={"relationships": []},
        )
        assert r2.status_code == 200
        assert r2.json()["relationships"] in (None, [])


def test_resolve_endpoint_returns_full_target() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        bob = _create_entity(
            client,
            book_id,
            "Bob",
            relationships=[{"target_entity_id": alice["id"], "relationship_type": "mentor"}],
        )
        r = client.get(f"/api/story-bible/books/{book_id}/entities/{bob['id']}/relationships")
        assert r.status_code == 200
        body = r.json()
        assert len(body) == 1
        assert body[0]["relationship_type"] == "mentor"
        assert body[0]["target"]["id"] == alice["id"]
        assert body[0]["target"]["name"] == "Alice"


def test_resolve_drops_deleted_target() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        bob = _create_entity(
            client,
            book_id,
            "Bob",
            relationships=[{"target_entity_id": alice["id"], "relationship_type": "family"}],
        )
        # Delete the target; the resolve endpoint must drop the stale rel.
        client.delete(f"/api/story-bible/entities/{alice['id']}")
        r = client.get(f"/api/story-bible/books/{book_id}/entities/{bob['id']}/relationships")
        assert r.status_code == 200
        assert r.json() == []


def test_missing_target_rejected_on_create() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        r = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={
                "entity_type": "character",
                "name": "Bob",
                "relationships": [{"target_entity_id": "nonexistent", "relationship_type": "ally"}],
            },
        )
        assert r.status_code == 400


def test_cross_book_target_rejected() -> None:
    with TestClient(app) as client:
        book_a = _create_book(client, "Book A")
        book_b = _create_book(client, "Book B")
        foreign = _create_entity(client, book_b, "Foreign")
        r = client.post(
            f"/api/story-bible/books/{book_a}/entities",
            json={
                "entity_type": "character",
                "name": "Bob",
                "relationships": [
                    {
                        "target_entity_id": foreign["id"],
                        "relationship_type": "ally",
                    }
                ],
            },
        )
        assert r.status_code == 400


def test_self_relationship_rejected_on_patch() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        r = client.patch(
            f"/api/story-bible/entities/{alice['id']}",
            json={
                "relationships": [{"target_entity_id": alice["id"], "relationship_type": "ally"}]
            },
        )
        assert r.status_code == 400


def test_invalid_relationship_type_rejected() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        alice = _create_entity(client, book_id, "Alice")
        r = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={
                "entity_type": "character",
                "name": "Bob",
                "relationships": [
                    {
                        "target_entity_id": alice["id"],
                        "relationship_type": "frenemy",
                    }
                ],
            },
        )
        assert r.status_code == 422
