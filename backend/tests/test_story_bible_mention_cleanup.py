"""Regression pins for QA M3: deleting a Story Bible entity degrades its
@-mention nodes in chapter / page content to plain text (no dangling
mention node is left behind)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.main import app


def _doc_with_mention(entity_id: str) -> str:
    return json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Meet "},
                        {
                            "type": "mention",
                            "attrs": {"id": entity_id, "label": "Hero", "entityType": "character"},
                        },
                        {"type": "text", "text": " today."},
                    ],
                }
            ],
        }
    )


def _mention_ids(raw: str) -> list[str]:
    found: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "mention":
                found.append((node.get("attrs") or {}).get("id"))
            walk(node.get("content"))
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(json.loads(raw))
    return found


def test_deleting_entity_degrades_chapter_mention_to_text() -> None:
    with TestClient(app) as client:
        book_id = client.post(
            "/api/books", json={"title": "Mention Book", "author": "A"}
        ).json()["id"]
        entity = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Hero"},
        ).json()
        eid = entity["id"]

        chapter = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": "Ch1", "content": _doc_with_mention(eid)},
        ).json()

        # Sanity: the mention is present before deletion.
        before = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}").json()
        assert eid in _mention_ids(before["content"])

        assert client.delete(f"/api/story-bible/entities/{eid}").status_code == 204

        after = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}").json()
        # No mention node references the deleted entity anymore...
        assert eid not in _mention_ids(after["content"])
        assert _mention_ids(after["content"]) == []
        # ...and the human-readable label survives as plain text.
        assert "Hero" in after["content"]


def test_deleting_entity_leaves_other_mentions_intact() -> None:
    with TestClient(app) as client:
        book_id = client.post(
            "/api/books", json={"title": "Two Mentions", "author": "A"}
        ).json()["id"]
        hero = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Hero"},
        ).json()
        villain = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Villain"},
        ).json()
        doc = json.dumps(
            {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {"type": "mention", "attrs": {"id": hero["id"], "label": "Hero", "entityType": "character"}},
                            {"type": "mention", "attrs": {"id": villain["id"], "label": "Villain", "entityType": "character"}},
                        ],
                    }
                ],
            }
        )
        chapter = client.post(
            f"/api/books/{book_id}/chapters", json={"title": "Ch1", "content": doc}
        ).json()

        client.delete(f"/api/story-bible/entities/{hero['id']}")

        after = client.get(f"/api/books/{book_id}/chapters/{chapter['id']}").json()
        ids = _mention_ids(after["content"])
        assert hero["id"] not in ids
        assert villain["id"] in ids  # the surviving entity's mention is untouched
