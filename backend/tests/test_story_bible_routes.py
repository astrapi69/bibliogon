"""Integration tests for the Story Bible CRUD routes
(STORY-BIBLE-PLUGIN-01 Session 2 C3).

Exercised through the full app (TestClient + lifespan) so the
plugin-story-bible router actually mounts — the "two installation
paths" backend tier. Covers entity-types SSoT, the full CRUD cycle
(incl. the mandatory List endpoint), per-type position assignment,
metadata round-trip, and the 404 / 422 error paths.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient, title: str = "Bible Book") -> str:
    resp = client.post("/api/books", json={"title": title, "author": "Author"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def test_entity_types_endpoint_returns_registry() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/story-bible/entity-types")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {
            "character",
            "setting",
            "plot_point",
            "item",
            "lore",
        }
        assert body["character"]["default"] is True


def test_full_crud_cycle() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)

        # Create — position server-assigned per entity_type.
        r1 = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Alice"},
        )
        assert r1.status_code == 201, r1.text
        e1 = r1.json()
        assert e1["position"] == 1
        assert e1["book_id"] == book_id

        r2 = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Bob"},
        )
        assert r2.json()["position"] == 2

        # A different entity_type starts its own position sequence.
        r3 = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "setting", "name": "Rivendell"},
        )
        assert r3.json()["position"] == 1

        # List (mandatory) — all three, then filtered.
        all_entities = client.get(
            f"/api/story-bible/books/{book_id}/entities"
        ).json()
        assert len(all_entities) == 3
        characters = client.get(
            f"/api/story-bible/books/{book_id}/entities?entity_type=character"
        ).json()
        assert {e["name"] for e in characters} == {"Alice", "Bob"}

        # Read by id.
        eid = e1["id"]
        got = client.get(f"/api/story-bible/entities/{eid}")
        assert got.status_code == 200
        assert got.json()["name"] == "Alice"

        # Update.
        patched = client.patch(
            f"/api/story-bible/entities/{eid}",
            json={"name": "Alice the Brave"},
        )
        assert patched.status_code == 200
        assert patched.json()["name"] == "Alice the Brave"

        # Delete.
        deleted = client.delete(f"/api/story-bible/entities/{eid}")
        assert deleted.status_code == 204
        assert (
            client.get(f"/api/story-bible/entities/{eid}").status_code == 404
        )


def test_metadata_round_trips_as_object() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        resp = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={
                "entity_type": "character",
                "name": "Carol",
                "entity_metadata": {"role": "protagonist", "aliases": "C."},
                "description": '{"type":"doc","content":[]}',
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["entity_metadata"] == {
            "role": "protagonist",
            "aliases": "C.",
        }
        assert body["description"] == '{"type":"doc","content":[]}'


def test_create_on_unknown_book_404() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/api/story-bible/books/nonexistent/entities",
            json={"entity_type": "character", "name": "Ghost"},
        )
        assert resp.status_code == 404


def test_create_with_invalid_entity_type_422() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        resp = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "villain_arc", "name": "X"},
        )
        assert resp.status_code == 422


def test_patch_and_delete_unknown_entity_404() -> None:
    with TestClient(app) as client:
        assert (
            client.patch(
                "/api/story-bible/entities/nope", json={"name": "X"}
            ).status_code
            == 404
        )
        assert (
            client.delete("/api/story-bible/entities/nope").status_code == 404
        )
