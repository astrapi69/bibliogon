"""Pages CRUD + book_type validation + cascade tests.

Covers the routes in ``backend/app/routers/pages.py`` (relocated
from plugin-kinderbuch in PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01)
plus the ``book_type`` discriminator behaviour in the backend
Book model + Pydantic schemas + the books PATCH handler.

Schema under test:

    book_type IN {prose, picture_book, comic_book}

- ``prose``        — chapter-based path (default); pages routes
                     reject it.
- ``picture_book`` — page-based; plugin-kinderbuch renders.
- ``comic_book``   — page-based; plugin-comics renders pages
                     plus owns the ``comic_panels`` and
                     ``comic_bubbles`` subresources.

Both picture_book and comic_book share the core ``pages`` table
and the same CRUD routes. PageLayout values are layout-specific
to the rendering plugin: picture-book layouts (``speech_bubble``,
``image_top_text_bottom``, …) for picture_book pages,
``comic_panel_grid`` for comic_book pages. The route layer does
NOT cross-validate layout vs book_type — that's a frontend
concern (pickers filter per book_type; comic_book's editor passes
``comic_panel_grid`` directly).

These tests exercise the route stack through TestClient (full
FastAPI lifespan + plugin manager + alembic schema bootstrap) so a
regression in mount-wiring, plugin-config loading, or the schema
discriminator fires here rather than in production.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    """Module-scoped TestClient that fires the FastAPI lifespan.

    The lifespan triggers PluginForge's ``manager.mount_routes(app)``
    which adds the /api/books/{id}/pages routes from the kinderbuch
    plugin. Without the lifespan only the core routes (defined at
    module import time) are present and every plugin route 404s with
    the misleading ``{"detail": "Not Found"}`` default.

    The ``with TestClient(app)`` form is intentional: lifespan exit
    calls ``manager.deactivate_all()`` which unregisters every plugin
    from pluggy. Subsequent test files that re-enter the lifespan
    (the per-test ``with TestClient(app) as client:`` pattern used by
    test_ms_tools_book_thresholds.py, test_translate_article.py, etc.)
    re-register cleanly. Without a clean exit the unregister never
    runs and the next file fails with ``ValueError: Plugin name
    already registered`` from pluggy.
    """
    with TestClient(app) as c:
        yield c


# --- Helpers -------------------------------------------------------------


def _create_book(
    client: TestClient,
    title: str,
    *,
    book_type: str = "prose",
) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": title, "author": "T", "book_type": book_type}
    r = client.post("/api/books", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _create_page(
    client: TestClient,
    book_id: str,
    layout: str = "image_top_text_bottom",
    **kw: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"layout": layout, **kw}
    r = client.post(f"/api/books/{book_id}/pages", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# --- BookCreate validation ----------------------------------------------


class TestBookTypeDiscriminator:
    def test_default_is_prose(self, client):
        book = _create_book(client, "DefaultProse", book_type="prose")
        assert book["book_type"] == "prose"

    def test_omitted_book_type_is_prose(self, client):
        r = client.post("/api/books", json={"title": "X", "author": "T"})
        assert r.status_code == 201
        assert r.json()["book_type"] == "prose"

    def test_picture_book_accepted(self, client):
        book = _create_book(client, "PicBook", book_type="picture_book")
        assert book["book_type"] == "picture_book"

    def test_comic_book_accepted(self, client):
        # comic_book is page-based and now serves pages through the
        # same core router as picture_book (PLUGIN-COMICS-SESSION-3-
        # PAGES-CRUD-01).
        book = _create_book(client, "ComicAccept", book_type="comic_book")
        assert book["book_type"] == "comic_book"

    def test_visual_book_no_longer_a_valid_value(self, client):
        r = client.post(
            "/api/books",
            json={"title": "X", "author": "T", "book_type": "visual_book"},
        )
        assert r.status_code == 422

    def test_invalid_book_type_rejected(self, client):
        r = client.post(
            "/api/books",
            json={"title": "X", "author": "T", "book_type": "not_a_thing"},
        )
        assert r.status_code == 422


class TestBookTypeImmutability:
    def test_patch_book_type_returns_400(self, client):
        book = _create_book(client, "Immut1", book_type="prose")
        r = client.patch(
            f"/api/books/{book['id']}",
            json={"book_type": "picture_book"},
        )
        assert r.status_code == 400
        assert "immutable" in r.json()["detail"]
        assert "book_type" in r.json()["detail"]

    def test_patch_book_type_unchanged_value_also_400(self, client):
        # The guard is keyed on field presence, not on value-changing.
        # Allowing same-value PATCH would create a "sometimes 200,
        # sometimes 400" surprise; reject uniformly so the rule is
        # observable.
        book = _create_book(client, "Immut2", book_type="picture_book")
        r = client.patch(
            f"/api/books/{book['id']}",
            json={"book_type": "picture_book"},
        )
        assert r.status_code == 400

    def test_patch_other_fields_unaffected(self, client):
        book = _create_book(client, "Immut3", book_type="picture_book")
        r = client.patch(
            f"/api/books/{book['id']}",
            json={"description": "new desc"},
        )
        assert r.status_code == 200
        assert r.json()["description"] == "new desc"
        assert r.json()["book_type"] == "picture_book"


# --- Pages route gating --------------------------------------------------


class TestPagesGate:
    def test_list_pages_rejects_prose(self, client):
        book = _create_book(client, "ProseGate", book_type="prose")
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 400
        assert "picture_book" in r.json()["detail"]

    def test_create_page_rejects_prose(self, client):
        book = _create_book(client, "ProseGate2", book_type="prose")
        r = client.post(
            f"/api/books/{book['id']}/pages",
            json={"layout": "speech_bubble"},
        )
        assert r.status_code == 400

    def test_create_page_accepts_comic_book(self, client):
        # comic_book pages are accepted by the gate as of
        # PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01. Closes the
        # half-wired ComicBookEditor "no comic pages yet" state.
        book = _create_book(client, "ComicGate", book_type="comic_book")
        r = client.post(
            f"/api/books/{book['id']}/pages",
            json={"layout": "comic_panel_grid"},
        )
        assert r.status_code == 201, r.text
        assert r.json()["layout"] == "comic_panel_grid"
        assert r.json()["position"] == 1

    def test_list_pages_returns_404_for_missing_book(self, client):
        r = client.get("/api/books/does-not-exist/pages")
        assert r.status_code == 404

    def test_create_page_returns_404_for_missing_book(self, client):
        r = client.post(
            "/api/books/does-not-exist/pages",
            json={"layout": "speech_bubble"},
        )
        assert r.status_code == 404

    def test_list_pages_empty_for_new_picture_book(self, client):
        book = _create_book(client, "EmptyPic", book_type="picture_book")
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 200
        assert r.json() == []


# --- Pages CRUD ----------------------------------------------------------


class TestPagesCRUD:
    def test_create_first_page_gets_position_1(self, client):
        book = _create_book(client, "CRUD1", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        assert page["position"] == 1
        assert page["layout"] == "speech_bubble"
        assert page["text_content"] is None

    def test_create_pages_auto_increment_position(self, client):
        book = _create_book(client, "CRUD2", book_type="picture_book")
        positions = [_create_page(client, book["id"])["position"] for _ in range(5)]
        assert positions == [1, 2, 3, 4, 5]

    def test_create_page_with_full_payload(self, client):
        book = _create_book(client, "CRUD3", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="speech_bubble",
            text_content="Hello world",
            layout_config={"anchor_position": "top-left"},
        )
        assert page["text_content"] == "Hello world"
        assert page["layout_config"] == {"anchor_position": "top-left"}

    def test_invalid_layout_rejected(self, client):
        book = _create_book(client, "CRUD4", book_type="picture_book")
        r = client.post(
            f"/api/books/{book['id']}/pages",
            json={"layout": "not_a_layout"},
        )
        assert r.status_code == 422

    def test_list_pages_returns_position_order(self, client):
        book = _create_book(client, "CRUD5", book_type="picture_book")
        for _ in range(3):
            _create_page(client, book["id"])
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 200
        positions = [p["position"] for p in r.json()]
        assert positions == [1, 2, 3]

    def test_patch_updates_layout_and_text(self, client):
        book = _create_book(client, "CRUD6", book_type="picture_book")
        page = _create_page(client, book["id"], "image_top_text_bottom")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"layout": "text_only", "text_content": "Just text"},
        )
        assert r.status_code == 200
        assert r.json()["layout"] == "text_only"
        assert r.json()["text_content"] == "Just text"

    def test_patch_layout_config_roundtrips(self, client):
        book = _create_book(client, "CRUD7", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"layout_config": {"anchor_position": "center", "size": "lg"}},
        )
        assert r.status_code == 200
        assert r.json()["layout_config"] == {
            "anchor_position": "center",
            "size": "lg",
        }
        # Re-read confirms persistence.
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.json()[0]["layout_config"]["size"] == "lg"

    def test_patch_unknown_page_returns_404(self, client):
        book = _create_book(client, "CRUD8", book_type="picture_book")
        r = client.patch(
            f"/api/books/{book['id']}/pages/missing",
            json={"layout": "text_only"},
        )
        assert r.status_code == 404

    def test_patch_position_not_mutable_through_schema(self, client):
        book = _create_book(client, "CRUD9", book_type="picture_book")
        page = _create_page(client, book["id"])
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"position": 99, "layout": "text_only"},
        )
        # Pydantic strips position silently; layout update wins; position untouched.
        assert r.status_code == 200
        assert r.json()["position"] == 1
        assert r.json()["layout"] == "text_only"

    def test_delete_page_returns_204_and_shifts_remaining(self, client):
        book = _create_book(client, "CRUDDelete", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(4)]
        # Delete the second page (position 2).
        r = client.delete(f"/api/books/{book['id']}/pages/{pages[1]['id']}")
        assert r.status_code == 204
        # Remaining 3 pages now have dense positions [1, 2, 3].
        r = client.get(f"/api/books/{book['id']}/pages")
        positions = [p["position"] for p in r.json()]
        assert positions == [1, 2, 3]
        ids = {p["id"] for p in r.json()}
        assert pages[1]["id"] not in ids
        assert pages[0]["id"] in ids and pages[2]["id"] in ids and pages[3]["id"] in ids

    def test_delete_unknown_page_returns_404(self, client):
        book = _create_book(client, "CRUDDel2", book_type="picture_book")
        r = client.delete(f"/api/books/{book['id']}/pages/missing")
        assert r.status_code == 404


# --- Reorder -------------------------------------------------------------


class TestReorder:
    def test_reorder_reverses_positions(self, client):
        book = _create_book(client, "Reorder1", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(4)]
        page_ids = [p["id"] for p in pages]
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": list(reversed(page_ids))},
        )
        assert r.status_code == 200
        positions_by_id = {p["id"]: p["position"] for p in r.json()}
        assert positions_by_id[pages[0]["id"]] == 4
        assert positions_by_id[pages[3]["id"]] == 1

    def test_reorder_rejects_missing_ids(self, client):
        book = _create_book(client, "Reorder2", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(3)]
        # Submit only 2 of 3 IDs.
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": [pages[0]["id"], pages[1]["id"]]},
        )
        assert r.status_code == 400
        assert "Missing" in r.json()["detail"]

    def test_reorder_rejects_unknown_ids(self, client):
        book = _create_book(client, "Reorder3", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(2)]
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": [pages[0]["id"], pages[1]["id"], "ghost-id"]},
        )
        assert r.status_code == 400
        assert "unknown" in r.json()["detail"]

    def test_reorder_rejects_duplicate_ids(self, client):
        book = _create_book(client, "Reorder4", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(2)]
        # Duplicate one id -> set vs list mismatch -> caught as missing the other.
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": [pages[0]["id"], pages[0]["id"]]},
        )
        assert r.status_code == 400

    def test_reorder_atomic_on_3_pages(self, client):
        book = _create_book(client, "Reorder5", book_type="picture_book")
        pages = [_create_page(client, book["id"]) for _ in range(3)]
        # Rotate left: [A, B, C] -> [B, C, A].
        new_order = [pages[1]["id"], pages[2]["id"], pages[0]["id"]]
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": new_order},
        )
        assert r.status_code == 200
        listed = client.get(f"/api/books/{book['id']}/pages").json()
        assert [p["id"] for p in listed] == new_order
        # And positions are dense 1..3.
        assert [p["position"] for p in listed] == [1, 2, 3]


# --- Cascade + asset SET NULL -------------------------------------------


class TestCascadeAndAssetUnlink:
    def test_book_delete_cascade_pages(self, client):
        from sqlalchemy import text

        from app.database import engine

        book = _create_book(client, "Cascade1", book_type="picture_book")
        _create_page(client, book["id"])
        _create_page(client, book["id"])
        # Hard-delete the book via direct SQL (the API uses soft-delete
        # by default; this test exercises the FK CASCADE, not the API
        # trash flow).
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM books WHERE id = :i"), {"i": book["id"]})
            remaining = list(
                conn.execute(
                    text("SELECT COUNT(*) FROM pages WHERE book_id = :i"),
                    {"i": book["id"]},
                )
            )[0][0]
        assert remaining == 0, (
            "FK cascade did not propagate: pages survived book delete"
        )

    def test_asset_delete_nulls_page_image_asset_id(self, client):
        from sqlalchemy import text

        from app.database import engine

        book = _create_book(client, "Asset1", book_type="picture_book")
        # Insert an asset row directly (the assets POST requires multipart
        # + a real file; we do not need to test the asset-upload route
        # itself, only the FK SET NULL behaviour).
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO assets (id, book_id, filename, asset_type, path, uploaded_at) "
                    "VALUES ('asset-1', :b, 'pic.png', 'figure', '/dev/null', CURRENT_TIMESTAMP)"
                ),
                {"b": book["id"]},
            )
        page = _create_page(client, book["id"], image_asset_id="asset-1")
        assert page["image_asset_id"] == "asset-1"
        # Delete the asset row directly.
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM assets WHERE id = 'asset-1'"))
        # Page should still exist with image_asset_id nulled.
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 200
        assert r.json()[0]["id"] == page["id"]
        assert r.json()[0]["image_asset_id"] is None


# --- BookOut shape -------------------------------------------------------


class TestBookOutShape:
    def test_book_out_exposes_book_type(self, client):
        book = _create_book(client, "OutShape", book_type="picture_book")
        r = client.get(f"/api/books/{book['id']}")
        assert r.status_code == 200
        assert r.json()["book_type"] == "picture_book"

    def test_book_out_for_prose(self, client):
        book = _create_book(client, "OutProse", book_type="prose")
        r = client.get(f"/api/books/{book['id']}")
        assert r.status_code == 200
        assert r.json()["book_type"] == "prose"


# --- PB-PHASE4 Session 4c-B-1 Commit 4: TipTap JSON-as-string roundtrip ---


class TestTipTapTextContentRoundtrip:
    """Storage flow for the 3 TipTap layouts (image_top_text_bottom,
    image_left_text_right, text_only).

    Per the 4c-B Pre-Inspection D2 decision: ``Page.text_content`` is
    a ``Text`` column that accepts either plain string (Tier-Property
    layouts) OR a JSON-serialized TipTap doc (TipTap layouts). The
    per-layout discriminator lives entirely on the frontend (parse on
    read, serialize on write); the backend is transparent.

    These tests pin the transparent-storage contract: the backend
    must NOT modify, validate, or restructure the text_content value
    when it happens to be a JSON-shaped string. The frontend owns
    the per-layout discriminator + the backward-compat parsing.
    """

    TIPTAP_DOC_JSON = (
        '{"type":"doc","content":[{"type":"paragraph","content":'
        '[{"type":"text","text":"Once upon a time."}]}]}'
    )

    def test_create_page_with_tiptap_json_text_content_roundtrips(self, client):
        """POST + GET round-trip preserves the JSON string verbatim."""
        book = _create_book(client, "TipTap1", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="text_only",
            text_content=self.TIPTAP_DOC_JSON,
        )
        assert page["text_content"] == self.TIPTAP_DOC_JSON
        # GET round-trip
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 200
        assert r.json()[0]["text_content"] == self.TIPTAP_DOC_JSON

    def test_patch_page_with_tiptap_json_text_content(self, client):
        """PATCH replaces the text_content string verbatim — no
        JSON-aware merging or coercion on the backend."""
        book = _create_book(client, "TipTap2", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="image_top_text_bottom",
            text_content="legacy plain text",
        )
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"text_content": self.TIPTAP_DOC_JSON},
        )
        assert r.status_code == 200
        assert r.json()["text_content"] == self.TIPTAP_DOC_JSON

    def test_layout_switch_does_not_touch_text_content_format(self, client):
        """Switching a page from a TipTap layout to a Tier-Property
        layout (or vice versa) leaves ``text_content`` UNCHANGED by
        the backend. The frontend's parser handles the per-layout
        discriminator on the next read.

        Regression pin: if backend ever grows JSON-aware coercion
        keyed on layout (e.g. "unwrap to plain text when layout
        switches to speech_bubble"), this test fires."""
        book = _create_book(client, "TipTap3", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="text_only",
            text_content=self.TIPTAP_DOC_JSON,
        )
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"layout": "speech_bubble"},
        )
        assert r.status_code == 200
        # text_content remained unchanged across the layout switch.
        assert r.json()["text_content"] == self.TIPTAP_DOC_JSON

    def test_tier_property_layouts_keep_plain_string_text_content(self, client):
        """Plain-string text_content on Tier-Property layouts works
        as before (no JSON shape required)."""
        book = _create_book(client, "TipTap4", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="speech_bubble",
            text_content="Hello bubble!",
        )
        assert page["text_content"] == "Hello bubble!"
        # Round-trip remains plain.
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.json()[0]["text_content"] == "Hello bubble!"

    def test_tiptap_json_with_unicode_roundtrips(self, client):
        """German + emoji content survives the JSON-as-string
        roundtrip. Picture-books are i18n-heavy + the user's German
        + emoji content matters."""
        unicode_doc = (
            '{"type":"doc","content":[{"type":"paragraph","content":'
            '[{"type":"text","text":"Hänsel und Gretel \\ud83c\\udf2a"}]}]}'
        )
        book = _create_book(client, "TipTap5", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="text_only",
            text_content=unicode_doc,
        )
        assert page["text_content"] == unicode_doc

    def test_empty_text_content_persisted_as_null(self, client):
        """Frontend normalises empty docs to ``null`` before sending;
        backend accepts ``null`` for text_content unchanged."""
        book = _create_book(client, "TipTap6", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="text_only",
            text_content=None,
        )
        assert page["text_content"] is None
        # PATCH to null also accepted.
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"text_content": None},
        )
        assert r.status_code == 200
        assert r.json()["text_content"] is None


# --- Comic-book pages CRUD ----------------------------------------------


class TestComicBookPagesCRUD:
    """Positive-path coverage for comic_book pages-CRUD.

    PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 relaxed the gate from
    ``book_type == "picture_book"`` to
    ``book_type IN {"picture_book", "comic_book"}``. These cases pin
    that each endpoint (list / create / update / delete / reorder)
    now accepts comic_book. The picture_book happy-path tests above
    continue to pin the picture_book contract; this class is the
    parallel-surface insurance against future asymmetric drift.
    """

    def test_list_pages_empty_for_new_comic_book(self, client):
        book = _create_book(client, "CB-Empty", book_type="comic_book")
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_first_comic_page_gets_position_1(self, client):
        book = _create_book(client, "CB-Create1", book_type="comic_book")
        page = _create_page(client, book["id"], "comic_panel_grid")
        assert page["position"] == 1
        assert page["layout"] == "comic_panel_grid"
        assert page["text_content"] is None

    def test_create_comic_pages_auto_increment_position(self, client):
        book = _create_book(client, "CB-Create2", book_type="comic_book")
        positions = [
            _create_page(client, book["id"], "comic_panel_grid")["position"]
            for _ in range(4)
        ]
        assert positions == [1, 2, 3, 4]

    def test_create_comic_page_with_layout_config(self, client):
        # Comic-grid template lives in layout_config.comic_grid_template
        # per the Session-1 sharing decision (verified in ComicPanel
        # docstring at backend/app/models/__init__.py).
        book = _create_book(client, "CB-Create3", book_type="comic_book")
        page = _create_page(
            client,
            book["id"],
            layout="comic_panel_grid",
            layout_config={"comic_grid_template": "grid_2x2"},
        )
        assert page["layout_config"] == {"comic_grid_template": "grid_2x2"}

    def test_patch_comic_page(self, client):
        book = _create_book(client, "CB-Patch", book_type="comic_book")
        page = _create_page(client, book["id"], "comic_panel_grid")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"layout_config": {"comic_grid_template": "grid_3x3"}},
        )
        assert r.status_code == 200
        assert r.json()["layout_config"] == {"comic_grid_template": "grid_3x3"}

    def test_delete_comic_page_shifts_positions(self, client):
        book = _create_book(client, "CB-Delete", book_type="comic_book")
        pages = [_create_page(client, book["id"], "comic_panel_grid") for _ in range(3)]
        r = client.delete(f"/api/books/{book['id']}/pages/{pages[0]['id']}")
        assert r.status_code == 204
        listed = client.get(f"/api/books/{book['id']}/pages").json()
        assert [p["position"] for p in listed] == [1, 2]
        assert pages[0]["id"] not in {p["id"] for p in listed}

    def test_reorder_comic_pages(self, client):
        book = _create_book(client, "CB-Reorder", book_type="comic_book")
        pages = [_create_page(client, book["id"], "comic_panel_grid") for _ in range(3)]
        new_order = [pages[2]["id"], pages[0]["id"], pages[1]["id"]]
        r = client.post(
            f"/api/books/{book['id']}/pages/reorder",
            json={"page_ids": new_order},
        )
        assert r.status_code == 200
        assert [p["id"] for p in r.json()] == new_order
        assert [p["position"] for p in r.json()] == [1, 2, 3]

    def test_picture_book_layout_accepted_on_comic_page(self, client):
        # Route-level cross-validation between layout + book_type was
        # explicitly deferred (accept-as-degenerate-case decision in
        # the PAGES-CRUD-01 Pre-Inspection): the route accepts any
        # PageLayout literal for any pageable book_type. Frontend
        # pickers filter what's appropriate. Pin the current contract
        # so a future tightening surfaces here.
        book = _create_book(client, "CB-Cross", book_type="comic_book")
        page = _create_page(client, book["id"], "speech_bubble")
        assert page["layout"] == "speech_bubble"

    def test_comic_panel_grid_layout_accepted_on_picture_book(self, client):
        # Mirror of the above; pins symmetry. A future tightening of
        # the route's layout-vs-book_type cross-validation would
        # break this test on the picture_book side too.
        book = _create_book(client, "PB-Cross", book_type="picture_book")
        page = _create_page(client, book["id"], "comic_panel_grid")
        assert page["layout"] == "comic_panel_grid"


# --- Storyboard fields (PICTURE-BOOK-STORYBOARD-VIEW-01) ---------------


class TestStoryboardFields:
    """Round-trip coverage for the 4 storyboard schema columns.

    Per the lessons-learned rule "End-to-end behavior tests are not
    'kwarg passes through' tests": each new field gets at least one
    case that flips it to a non-default value and asserts an
    observable difference in the response shape. Covers create-path
    + patch-path + persistence + validation rejection.
    """

    def test_default_storyboard_fields_are_null(self, client):
        book = _create_book(client, "SB-Default", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        assert page["notes"] is None
        assert page["story_beat"] is None
        assert page["mood_color"] is None
        assert page["act_group"] is None

    def test_create_page_with_all_storyboard_fields_roundtrips(self, client):
        book = _create_book(client, "SB-Create", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="speech_bubble",
            notes="Pacing feels slow here; consider trimming.",
            story_beat="climax",
            mood_color="#FF6B35",
            act_group="Act II",
        )
        assert page["notes"] == "Pacing feels slow here; consider trimming."
        assert page["story_beat"] == "climax"
        assert page["mood_color"] == "#FF6B35"
        assert page["act_group"] == "Act II"
        # Persistence: re-read confirms.
        r = client.get(f"/api/books/{book['id']}/pages")
        persisted = r.json()[0]
        assert persisted["notes"] == "Pacing feels slow here; consider trimming."
        assert persisted["story_beat"] == "climax"
        assert persisted["mood_color"] == "#FF6B35"
        assert persisted["act_group"] == "Act II"

    def test_patch_notes_roundtrips(self, client):
        book = _create_book(client, "SB-Notes", book_type="picture_book")
        page = _create_page(client, book["id"], "text_only")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"notes": "Author memo: needs revision."},
        )
        assert r.status_code == 200
        assert r.json()["notes"] == "Author memo: needs revision."

    @pytest.mark.parametrize(
        "beat",
        ["setup", "inciting", "rising", "climax", "falling", "resolution"],
    )
    def test_patch_story_beat_accepts_all_six_values(self, client, beat):
        book = _create_book(client, f"SB-Beat-{beat}", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"story_beat": beat},
        )
        assert r.status_code == 200
        assert r.json()["story_beat"] == beat

    def test_invalid_story_beat_rejected(self, client):
        book = _create_book(client, "SB-BeatBad", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"story_beat": "denouement"},
        )
        assert r.status_code == 422

    @pytest.mark.parametrize(
        "color",
        ["#FF0000", "#abcdef", "#0a0B0c", "#FFFFFF", "#000000"],
    )
    def test_patch_mood_color_accepts_valid_hex(self, client, color):
        book = _create_book(client, f"SB-Color-{color[1:]}", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"mood_color": color},
        )
        assert r.status_code == 200
        assert r.json()["mood_color"] == color

    @pytest.mark.parametrize(
        "color",
        ["red", "#F00", "FF6B35", "#GGGGGG", "#1234567", "#12345"],
    )
    def test_invalid_mood_color_rejected(self, client, color):
        book = _create_book(client, f"SB-ColorBad-{color}", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"mood_color": color},
        )
        assert r.status_code == 422

    def test_patch_act_group_roundtrips(self, client):
        book = _create_book(client, "SB-Act", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"act_group": "Opening Act"},
        )
        assert r.status_code == 200
        assert r.json()["act_group"] == "Opening Act"

    def test_patch_clears_storyboard_field_via_null(self, client):
        # PATCH ``{"notes": null}`` sets notes back to NULL (per
        # PageUpdate's exclude_unset semantics — the key IS present,
        # value IS None, so setattr fires and clears the row).
        book = _create_book(client, "SB-Clear", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble", notes="Initial note")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"notes": None},
        )
        assert r.status_code == 200
        assert r.json()["notes"] is None

    def test_patch_one_field_does_not_overwrite_others(self, client):
        # Half-wired-prevention pin: PATCH'ing only ``story_beat``
        # must NOT clobber notes / mood_color / act_group. Tests the
        # ``exclude_unset=True`` semantics of the PageUpdate handler.
        book = _create_book(client, "SB-Partial", book_type="picture_book")
        page = _create_page(
            client,
            book["id"],
            layout="speech_bubble",
            notes="Keep me",
            story_beat="setup",
            mood_color="#112233",
            act_group="Act I",
        )
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"story_beat": "climax"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["story_beat"] == "climax"
        assert body["notes"] == "Keep me"
        assert body["mood_color"] == "#112233"
        assert body["act_group"] == "Act I"

    def test_comic_book_pages_also_accept_storyboard_fields(self, client):
        # Storyboard view is picture-book-only in v1 (per A4 of the
        # Pre-Inspection), but the SCHEMA is shared. Comic-book pages
        # must accept the same fields so a future v2 extension to
        # comic_book Storyboard works without a schema change.
        book = _create_book(client, "SB-Comic", book_type="comic_book")
        page = _create_page(
            client,
            book["id"],
            layout="comic_panel_grid",
            notes="Comic-book annotation",
            story_beat="rising",
        )
        assert page["notes"] == "Comic-book annotation"
        assert page["story_beat"] == "rising"
