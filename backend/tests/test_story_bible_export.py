"""Story Bible Markdown export tests (STORY-BIBLE-STORYBOARD-
INTEGRATION-01 C12). Unit-tests the pure builder + the endpoint.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from bibliogon_story_bible.export import (
    _tiptap_to_text,
    build_story_bible_markdown,
)


def test_tiptap_to_text_extracts_plain_text() -> None:
    doc = (
        '{"type":"doc","content":[{"type":"paragraph","content":'
        '[{"type":"text","text":"Brave hero."}]}]}'
    )
    assert _tiptap_to_text(doc) == "Brave hero."


def test_tiptap_to_text_falls_back_on_plain_string() -> None:
    assert _tiptap_to_text("just text") == "just text"
    assert _tiptap_to_text(None) == ""
    assert _tiptap_to_text("not json {") == "not json {"


def test_build_markdown_groups_by_type_with_appearances() -> None:
    md = build_story_bible_markdown(
        "My Book",
        {"character": "Characters", "setting": "Locations"},
        [
            {"id": "e1", "entity_type": "character", "name": "Max", "description": None},
            {
                "id": "e2",
                "entity_type": "setting",
                "name": "The Forest",
                "description": None,
            },
        ],
        {"e1": ["Page 1", "Page 3"]},
    )
    assert "# Story Bible: My Book" in md
    assert "## Characters" in md
    assert "### Max" in md
    assert "**Appearances:** Page 1, Page 3" in md
    assert "## Locations" in md
    assert "### The Forest" in md
    # Characters render before Locations (type order).
    assert md.index("## Characters") < md.index("## Locations")


def test_build_markdown_handles_empty_bible() -> None:
    md = build_story_bible_markdown("Empty", {}, [], {})
    assert md.strip() == "# Story Bible: Empty"


def _create_book(client: TestClient) -> str:
    r = client.post(
        "/api/books",
        json={"title": "Export Book", "author": "A", "book_type": "picture_book"},
    )
    return r.json()["id"]


def test_export_endpoint_returns_markdown_payload() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Max"},
        )
        body = client.get(f"/api/story-bible/books/{book_id}/export").json()
        assert body["format"] == "markdown"
        assert body["filename"].endswith(".md")
        assert "# Story Bible: Export Book" in body["content"]
        assert "### Max" in body["content"]
