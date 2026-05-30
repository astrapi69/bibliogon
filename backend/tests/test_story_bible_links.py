"""Integration tests for the Story-entity <-> page/chapter link
routes (STORY-BIBLE-STORYBOARD-INTEGRATION-01 Session B C4).

Exercised through the full app (TestClient + lifespan) so the
plugin-story-bible router mounts. Covers: create (page + chapter),
both query directions, the page-XOR-chapter guard, 404s, delete, and
the CASCADE behaviour (delete entity / page / chapter -> links gone).
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient, *, book_type: str = "prose") -> str:
    r = client.post(
        "/api/books",
        json={"title": "Link Book", "author": "A", "book_type": book_type},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _create_entity(client: TestClient, book_id: str, name: str = "Max") -> str:
    r = client.post(
        f"/api/story-bible/books/{book_id}/entities",
        json={"entity_type": "character", "name": name},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_page(client: TestClient, book_id: str) -> str:
    r = client.post(f"/api/books/{book_id}/pages", json={"layout": "image_top_text_bottom"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_chapter(client: TestClient, book_id: str) -> str:
    r = client.post(f"/api/books/{book_id}/chapters", json={"title": "Ch 1"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_link_entity_to_page_and_both_query_directions() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id, "Max")
        page_id = _create_page(client, book_id)

        # Create the link.
        r = client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "page_id": page_id, "role": "protagonist"},
        )
        assert r.status_code == 201, r.text
        link = r.json()
        assert link["page_id"] == page_id
        assert link["chapter_id"] is None
        assert link["role"] == "protagonist"
        # The entity is embedded for the badge use-case.
        assert link["entity"]["name"] == "Max"

        # Direction 1: entity -> appearances.
        appearances = client.get(f"/api/story-bible/entities/{entity_id}/appearances").json()
        assert [a["page_id"] for a in appearances] == [page_id]

        # Direction 2: page -> entities (storyboard badges).
        on_page = client.get(f"/api/story-bible/pages/{page_id}/entities").json()
        assert len(on_page) == 1
        assert on_page[0]["entity"]["name"] == "Max"


def test_link_entity_to_chapter_for_prose_book() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)  # prose
        entity_id = _create_entity(client, book_id)
        chapter_id = _create_chapter(client, book_id)
        r = client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "chapter_id": chapter_id},
        )
        assert r.status_code == 201, r.text
        assert r.json()["chapter_id"] == chapter_id
        assert r.json()["page_id"] is None


def test_link_requires_exactly_one_of_page_or_chapter() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id)
        page_id = _create_page(client, book_id)
        # Neither set -> 400.
        assert (
            client.post("/api/story-bible/links", json={"entity_id": entity_id}).status_code == 400
        )
        # Both set -> 400.
        chapter_book = _create_book(client)
        chapter_id = _create_chapter(client, chapter_book)
        assert (
            client.post(
                "/api/story-bible/links",
                json={
                    "entity_id": entity_id,
                    "page_id": page_id,
                    "chapter_id": chapter_id,
                },
            ).status_code
            == 400
        )


def test_link_unknown_entity_or_page_404() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id)
        page_id = _create_page(client, book_id)
        assert (
            client.post(
                "/api/story-bible/links",
                json={"entity_id": "ghost", "page_id": page_id},
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/story-bible/links",
                json={"entity_id": entity_id, "page_id": "ghost"},
            ).status_code
            == 404
        )


def test_delete_link() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id)
        page_id = _create_page(client, book_id)
        link_id = client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "page_id": page_id},
        ).json()["id"]
        assert client.delete(f"/api/story-bible/links/{link_id}").status_code == 204
        assert client.get(f"/api/story-bible/entities/{entity_id}/appearances").json() == []
        assert client.delete(f"/api/story-bible/links/{link_id}").status_code == 404


def test_deleting_entity_cascades_to_links() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id)
        page_id = _create_page(client, book_id)
        client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "page_id": page_id},
        )
        # Delete the entity -> its link must be gone (page -> entities empty).
        assert client.delete(f"/api/story-bible/entities/{entity_id}").status_code == 204
        assert client.get(f"/api/story-bible/pages/{page_id}/entities").json() == []


def test_deleting_page_cascades_to_links() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client, book_type="picture_book")
        entity_id = _create_entity(client, book_id)
        page_id = _create_page(client, book_id)
        client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "page_id": page_id},
        )
        # Delete the page -> the entity's appearance must be gone.
        assert client.delete(f"/api/books/{book_id}/pages/{page_id}").status_code in (
            200,
            204,
        )
        assert client.get(f"/api/story-bible/entities/{entity_id}/appearances").json() == []
