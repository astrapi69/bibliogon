"""Integration tests for comic-panel + comic-bubble CRUD routes
(plugin-comics Session 2 C2).

Exercises the full path: HTTP request -> route handler ->
service-layer SQL -> ComicPanel/ComicBubble row in DB -> JSON
response shape. The plugin's own ``test_plugin_smoke.py`` covers
the class-attribute contract; this file covers the operational
contract at the backend tier where the full ``app`` + DB layer is
available (per the "Two installation paths" lesson —
backend-tier pytest is the canonical integration gate).

Coverage scope:
- POST /api/books/{book_id}/comic-pages/{page_id}/panels
  (create panel; auto-position; 400 on non-comic-book; 404 on
  unknown page/book)
- GET  /api/books/{book_id}/comic-pages/{page_id}/panels
  (list; ordered by position; empty list for new page)
- PATCH /api/books/{book_id}/comic-panels/{panel_id}
  (partial update; book_id chain validation)
- DELETE /api/books/{book_id}/comic-panels/{panel_id}
  (cascade chain reaches bubbles)
- POST /api/books/{book_id}/comic-panels/{panel_id}/bubbles
  (create bubble; auto-position; bubble_type enum validation;
  defaults applied per migration server_default)
- PATCH /api/books/{book_id}/comic-bubbles/{bubble_id}
  (partial update; bubble_type validation; book_id chain)
- DELETE /api/books/{book_id}/comic-bubbles/{bubble_id}
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # Lifespan context activates plugins so their routes mount.
    with TestClient(app) as c:
        yield c


def _create_comic_book(client: TestClient, title: str = "Comics Test") -> str:
    """Helper: create a comic_book and return its id. Picture-book
    routes can't create comic_book content; we go through the
    generic POST /api/books with book_type set."""
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "Test Author", "book_type": "comic_book"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _create_picture_book(client: TestClient, title: str = "Picture Test") -> str:
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "Test Author", "book_type": "picture_book"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _create_prose_book(client: TestClient, title: str = "Prose Test") -> str:
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "Test Author"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _add_comic_page(client: TestClient, book_id: str) -> str:
    """Comic pages reuse the existing /api/books/{id}/pages
    endpoint per the Session 1 sharing decision. The picture-book
    gate at that route rejects comic_book by default, so we go
    through SQL directly to add the page (sidesteps the gate that
    enforces the book_type=picture_book check)."""
    from app.database import SessionLocal
    from app.models import Page

    session = SessionLocal()
    try:
        page = Page(
            book_id=book_id,
            position=1,
            layout="speech_bubble",
        )
        session.add(page)
        session.commit()
        return page.id
    finally:
        session.close()


# --- Panel routes ---


class TestComicPanelCreate:
    def test_create_panel_returns_201_with_panel_out(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        resp = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["page_id"] == page_id
        assert body["position"] == 1
        assert body["bounds"]["width_pct"] == 100

    def test_create_panel_auto_assigns_next_position(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        for expected_pos in (1, 2, 3):
            resp = client.post(
                f"/api/books/{book_id}/comic-pages/{page_id}/panels",
                json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 50, "height_pct": 50}},
            )
            assert resp.status_code == 201
            assert resp.json()["position"] == expected_pos

    def test_create_panel_rejects_picture_book_with_400(self, client: TestClient) -> None:
        book_id = _create_picture_book(client)
        # Need a page for the route to even resolve panel-create,
        # but we can hit the gate before that by using a fake page id.
        resp = client.post(
            f"/api/books/{book_id}/comic-pages/fake/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        assert resp.status_code == 400, resp.text
        assert "comic_book" in resp.json()["detail"]

    def test_create_panel_rejects_prose_with_400(self, client: TestClient) -> None:
        book_id = _create_prose_book(client)
        resp = client.post(
            f"/api/books/{book_id}/comic-pages/fake/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        assert resp.status_code == 400

    def test_create_panel_404_for_unknown_book(self, client: TestClient) -> None:
        resp = client.post(
            "/api/books/does-not-exist/comic-pages/fake/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        assert resp.status_code == 404


class TestComicPanelList:
    def test_list_empty_for_new_comic_page(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        resp = client.get(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels"
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_returns_panels_ordered_by_position(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        for _ in range(3):
            client.post(
                f"/api/books/{book_id}/comic-pages/{page_id}/panels",
                json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 50, "height_pct": 50}},
            )
        resp = client.get(f"/api/books/{book_id}/comic-pages/{page_id}/panels")
        positions = [p["position"] for p in resp.json()]
        assert positions == [1, 2, 3]


class TestComicPanelUpdate:
    def test_partial_update_persists(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        create = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        panel_id = create.json()["id"]
        resp = client.patch(
            f"/api/books/{book_id}/comic-panels/{panel_id}",
            json={"bounds": {"x_pct": 10, "y_pct": 10, "width_pct": 80, "height_pct": 80}},
        )
        assert resp.status_code == 200
        assert resp.json()["bounds"] == {"x_pct": 10, "y_pct": 10, "width_pct": 80, "height_pct": 80}

    def test_update_rejects_cross_book_id(self, client: TestClient) -> None:
        # Panel A on book A. Try to PATCH via book B's URL.
        book_a = _create_comic_book(client, title="Book A")
        book_b = _create_comic_book(client, title="Book B")
        page_a = _add_comic_page(client, book_a)
        create = client.post(
            f"/api/books/{book_a}/comic-pages/{page_a}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        panel_id = create.json()["id"]
        resp = client.patch(
            f"/api/books/{book_b}/comic-panels/{panel_id}",
            json={"bounds": {"x_pct": 50, "y_pct": 50, "width_pct": 50, "height_pct": 50}},
        )
        assert resp.status_code == 404


class TestComicPanelDelete:
    def test_delete_returns_204_and_removes_row(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        create = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        )
        panel_id = create.json()["id"]
        resp = client.delete(f"/api/books/{book_id}/comic-panels/{panel_id}")
        assert resp.status_code == 204
        # Subsequent GET-list does NOT include the deleted panel.
        listing = client.get(f"/api/books/{book_id}/comic-pages/{page_id}/panels")
        assert listing.json() == []

    def test_delete_cascade_chain_removes_bubbles(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        # Add a bubble inside that panel.
        client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={
                "bubble_type": "speech",
                "anchor": {"x_pct": 50, "y_pct": 50},
            },
        )
        # Delete the panel -> bubble must cascade-delete via FK.
        resp = client.delete(f"/api/books/{book_id}/comic-panels/{panel['id']}")
        assert resp.status_code == 204
        # Verify via SQL (no list-bubbles endpoint shipped in
        # Session 2; list is implicit through the panel hierarchy).
        from app.database import SessionLocal
        from app.models import ComicBubble

        session = SessionLocal()
        try:
            remaining = (
                session.query(ComicBubble)
                .filter(ComicBubble.panel_id == panel["id"])
                .count()
            )
            assert remaining == 0
        finally:
            session.close()


# --- Bubble routes ---


class TestComicBubbleCreate:
    def test_create_bubble_returns_201_with_defaults_from_migration(
        self, client: TestClient
    ) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        resp = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={
                "bubble_type": "speech",
                "anchor": {"x_pct": 50, "y_pct": 90},
            },
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["panel_id"] == panel["id"]
        assert body["bubble_type"] == "speech"
        assert body["position"] == 1
        # Defaults from the Pydantic schema (mirror the migration
        # server_default values).
        assert body["width_pct"] == 30
        assert body["height_pct"] == 20
        assert body["tail_direction"] == "none"
        assert body["tail_position_pct"] == 50
        assert body["tail_length_px"] == 16

    @pytest.mark.parametrize(
        "bubble_type",
        ["speech", "thought", "narration", "shout", "whisper", "sound_effect"],
    )
    def test_create_bubble_accepts_all_6_bubble_types(
        self, client: TestClient, bubble_type: str
    ) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        resp = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={
                "bubble_type": bubble_type,
                "anchor": {"x_pct": 50, "y_pct": 50},
            },
        )
        assert resp.status_code == 201, f"{bubble_type}: {resp.text}"

    def test_create_bubble_rejects_unknown_bubble_type(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        resp = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={"bubble_type": "garbage", "anchor": {"x_pct": 0, "y_pct": 0}},
        )
        # Pydantic Literal validation fires before the route logic.
        assert resp.status_code == 422

    def test_create_bubble_auto_assigns_position(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        for expected_pos in (1, 2, 3):
            resp = client.post(
                f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
                json={"bubble_type": "speech", "anchor": {"x_pct": 50, "y_pct": 50}},
            )
            assert resp.json()["position"] == expected_pos

    def test_create_bubble_persists_bubble_config_tier1_tier2_round_trip(
        self, client: TestClient
    ) -> None:
        """Field-name parity with picture-book's Page.layout_config
        .bubbles[0] shape (Pre-Inspection §2). 14 keys round-trip
        through the JSON-as-Text column."""
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        tier_config = {
            "background_color": "#ffeebb",
            "border_color": "#221100",
            "border_width": 3,
            "border_style": "dashed",
            "border_radius": 30,
            "shadow": True,
            "shadow_intensity": 6,
            "padding": 14,
            "font_family": "Comic Neue",
            "font_size": 18,
            "font_weight": "bold",
            "text_color": "#001122",
            "text_align": "center",
            "italic": True,
        }
        resp = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={
                "bubble_type": "shout",
                "anchor": {"x_pct": 50, "y_pct": 50},
                "bubble_config": tier_config,
            },
        )
        assert resp.status_code == 201
        assert resp.json()["bubble_config"] == tier_config


class TestComicBubbleUpdate:
    def test_partial_update_persists(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        bubble = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={"bubble_type": "speech", "anchor": {"x_pct": 50, "y_pct": 50}},
        ).json()
        resp = client.patch(
            f"/api/books/{book_id}/comic-bubbles/{bubble['id']}",
            json={"tail_direction": "SE", "tail_position_pct": 25, "tail_length_px": 24},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tail_direction"] == "SE"
        assert body["tail_position_pct"] == 25
        assert body["tail_length_px"] == 24

    def test_update_rejects_invalid_tail_direction(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        bubble = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={"bubble_type": "speech", "anchor": {"x_pct": 50, "y_pct": 50}},
        ).json()
        resp = client.patch(
            f"/api/books/{book_id}/comic-bubbles/{bubble['id']}",
            json={"tail_direction": "INVALID"},
        )
        assert resp.status_code == 422

    def test_update_rejects_cross_book_id(self, client: TestClient) -> None:
        book_a = _create_comic_book(client, title="Bubble Book A")
        book_b = _create_comic_book(client, title="Bubble Book B")
        page_a = _add_comic_page(client, book_a)
        panel = client.post(
            f"/api/books/{book_a}/comic-pages/{page_a}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        bubble = client.post(
            f"/api/books/{book_a}/comic-panels/{panel['id']}/bubbles",
            json={"bubble_type": "speech", "anchor": {"x_pct": 50, "y_pct": 50}},
        ).json()
        resp = client.patch(
            f"/api/books/{book_b}/comic-bubbles/{bubble['id']}",
            json={"text_content": "hijack"},
        )
        assert resp.status_code == 404


class TestComicBubbleDelete:
    def test_delete_returns_204(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={"bounds": {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}},
        ).json()
        bubble = client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={"bubble_type": "thought", "anchor": {"x_pct": 30, "y_pct": 30}},
        ).json()
        resp = client.delete(f"/api/books/{book_id}/comic-bubbles/{bubble['id']}")
        assert resp.status_code == 204

    def test_delete_404_for_unknown_bubble(self, client: TestClient) -> None:
        book_id = _create_comic_book(client)
        resp = client.delete(f"/api/books/{book_id}/comic-bubbles/does-not-exist")
        assert resp.status_code == 404


# --- Export dispatch (C3) ---


@pytest.fixture(scope="class")
def shared_client():
    """Class-scoped TestClient to reduce cumulative lifespan cycles.

    The P1 baseline issue (PLUGINFORGE-RECURSION-LIMIT-REGRESSION-01)
    is driven by module-level singleton state accumulating per
    TestClient lifespan. The class fixture keeps the 8 dispatch
    tests on a single client lifespan rather than 8 separate ones.
    """
    with TestClient(app) as c:
        yield c


class TestComicBookExportDispatch:
    """Pins the comic_book branch of plugin-export's ``export()``
    route. The dispatch site reads ``Book.book_type`` and branches
    to ``_export_comic_book_pdf`` which lazy-imports the
    plugin-comics walker."""

    def test_comic_book_export_pdf_returns_200_with_pdf_content_type(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Export Smoke")
        page_id = _add_comic_page(client, book_id)
        panel = client.post(
            f"/api/books/{book_id}/comic-pages/{page_id}/panels",
            json={
                "bounds": {
                    "x_pct": 0,
                    "y_pct": 0,
                    "width_pct": 100,
                    "height_pct": 100,
                }
            },
        ).json()
        client.post(
            f"/api/books/{book_id}/comic-panels/{panel['id']}/bubbles",
            json={
                "bubble_type": "speech",
                "anchor": {"x_pct": 50, "y_pct": 50},
                "text_content": "Hello",
            },
        )
        resp = client.get(f"/api/books/{book_id}/export/pdf")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"
        # PDF magic bytes -- verifies the dispatch reached the
        # walker and the walker reached WeasyPrint, not just that
        # some 200-status default body got returned.
        assert resp.content[:4] == b"%PDF"

    def test_comic_book_export_rejects_non_pdf_format(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        book_id = _create_comic_book(client)
        resp = client.get(f"/api/books/{book_id}/export/epub")
        assert resp.status_code == 400
        assert "Comic-book" in resp.json()["detail"] or "comic" in resp.json()["detail"].lower()

    def test_comic_book_export_filename_default_format(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Filename Test")
        _add_comic_page(client, book_id)
        resp = client.get(f"/api/books/{book_id}/export/pdf")
        assert resp.status_code == 200
        # Default format + bleed=false -> <slug>.pdf (no suffix).
        cd = resp.headers.get("content-disposition", "")
        assert "filename-test.pdf" in cd
        assert "-8.5x8.5" not in cd
        assert "-bleed" not in cd

    def test_comic_book_export_filename_non_default_format_appended(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Bigger")
        _add_comic_page(client, book_id)
        resp = client.get(
            f"/api/books/{book_id}/export/pdf?picture_book_format=11x8.5"
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "bigger-11x8.5.pdf" in cd

    def test_comic_book_export_filename_bleed_appended(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Marks")
        _add_comic_page(client, book_id)
        resp = client.get(
            f"/api/books/{book_id}/export/pdf?picture_book_bleed_marks=true"
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        assert "marks-bleed.pdf" in cd

    def test_comic_book_export_filename_format_and_bleed_combined(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Both")
        _add_comic_page(client, book_id)
        resp = client.get(
            f"/api/books/{book_id}/export/pdf"
            "?picture_book_format=11x8.5&picture_book_bleed_marks=true"
        )
        assert resp.status_code == 200
        cd = resp.headers.get("content-disposition", "")
        # Format-first-then-bleed order per Q4.
        assert "both-11x8.5-bleed.pdf" in cd

    def test_comic_book_export_handles_empty_book_without_pages(
        self, shared_client: TestClient
    ) -> None:
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_comic_book(client, title="Empty")
        # No pages, no panels, no bubbles.
        resp = client.get(f"/api/books/{book_id}/export/pdf")
        # Walker tolerates empty pages list -- output is a one-page
        # blank PDF. 200 + application/pdf still expected.
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"

    def test_picture_book_export_still_works_after_comic_branch(
        self, shared_client: TestClient
    ) -> None:
        """Regression-pin: the comic_book elif branch must not
        accidentally short-circuit picture-book dispatch."""
        client = shared_client
        pytest.importorskip("weasyprint")
        book_id = _create_picture_book(client, title="Still Works")
        # Picture-book uses the existing /pages endpoint.
        client.post(
            f"/api/books/{book_id}/pages",
            json={"layout": "text_only", "text_content": "Hi"},
        )
        resp = client.get(f"/api/books/{book_id}/export/pdf")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"
