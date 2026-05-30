"""Continuity-checker tests (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C11).

Unit-tests the pure rule function (no DB) plus an integration test
through the endpoint. The rules: entity_disappears (trailing absence),
entity_gap (internal absence), empty_page (no links).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from bibliogon_story_bible.continuity import compute_continuity_warnings


def _pages(n: int) -> list[dict]:
    return [{"id": f"p{i}", "position": i} for i in range(1, n + 1)]


def test_no_warnings_when_every_page_has_a_close_appearance() -> None:
    pages = _pages(3)
    links = [
        {"page_id": "p1", "entity_id": "e1", "entity_name": "Max"},
        {"page_id": "p2", "entity_id": "e1", "entity_name": "Max"},
        {"page_id": "p3", "entity_id": "e1", "entity_name": "Max"},
    ]
    assert compute_continuity_warnings(pages, links, gap_threshold=5) == []


def test_empty_page_flagged() -> None:
    pages = _pages(2)
    links = [{"page_id": "p1", "entity_id": "e1", "entity_name": "Max"}]
    warnings = compute_continuity_warnings(pages, links, gap_threshold=5)
    codes = {(w["code"], w["page_id"]) for w in warnings}
    assert ("empty_page", "p2") in codes


def test_entity_disappears_trailing_absence() -> None:
    pages = _pages(10)
    # Max only on p1; 9 trailing pages >= threshold 5.
    links = [{"page_id": "p1", "entity_id": "e1", "entity_name": "Max"}]
    warnings = compute_continuity_warnings(pages, links, gap_threshold=5)
    disappears = [w for w in warnings if w["code"] == "entity_disappears"]
    assert len(disappears) == 1
    assert disappears[0]["entity_name"] == "Max"
    assert disappears[0]["page_id"] == "p1"
    assert disappears[0]["page_position"] == 1


def test_entity_internal_gap() -> None:
    pages = _pages(10)
    # Max on p1 and p9 -> internal gap of 7 (>= 5).
    links = [
        {"page_id": "p1", "entity_id": "e1", "entity_name": "Max"},
        {"page_id": "p9", "entity_id": "e1", "entity_name": "Max"},
    ]
    warnings = compute_continuity_warnings(pages, links, gap_threshold=5)
    gaps = [w for w in warnings if w["code"] == "entity_gap"]
    assert len(gaps) == 1
    assert gaps[0]["page_id"] == "p1"
    assert gaps[0]["gap_to_position"] == 9
    # p9 is the last appearance with only 1 trailing page -> no disappears.
    assert not [w for w in warnings if w["code"] == "entity_disappears"]


def test_gap_below_threshold_not_flagged() -> None:
    pages = _pages(5)
    links = [
        {"page_id": "p1", "entity_id": "e1", "entity_name": "Max"},
        {"page_id": "p4", "entity_id": "e1", "entity_name": "Max"},
        {"page_id": "p5", "entity_id": "e1", "entity_name": "Max"},
    ]
    warnings = compute_continuity_warnings(pages, links, gap_threshold=5)
    assert not [w for w in warnings if w["code"] in ("entity_gap", "entity_disappears")]


def test_empty_pages_returns_empty_for_no_pages() -> None:
    assert compute_continuity_warnings([], []) == []


# --- integration ---------------------------------------------------------


def _create_book(client: TestClient) -> str:
    r = client.post(
        "/api/books",
        json={"title": "Arc Book", "author": "A", "book_type": "picture_book"},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_continuity_endpoint_flags_empty_page() -> None:
    with TestClient(app) as client:
        book_id = _create_book(client)
        entity_id = client.post(
            f"/api/story-bible/books/{book_id}/entities",
            json={"entity_type": "character", "name": "Max"},
        ).json()["id"]
        p1 = client.post(
            f"/api/books/{book_id}/pages", json={"layout": "image_top_text_bottom"}
        ).json()["id"]
        # A second page with no entity link -> empty_page warning.
        client.post(
            f"/api/books/{book_id}/pages", json={"layout": "image_top_text_bottom"}
        )
        client.post(
            "/api/story-bible/links",
            json={"entity_id": entity_id, "page_id": p1},
        )
        warnings = client.get(
            f"/api/story-bible/books/{book_id}/continuity-check"
        ).json()
        assert any(w["code"] == "empty_page" for w in warnings)


def test_continuity_endpoint_empty_for_prose_book() -> None:
    with TestClient(app) as client:
        r = client.post(
            "/api/books", json={"title": "Prose", "author": "A", "book_type": "prose"}
        )
        book_id = r.json()["id"]
        assert (
            client.get(f"/api/story-bible/books/{book_id}/continuity-check").json()
            == []
        )
