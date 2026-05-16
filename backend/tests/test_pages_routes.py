"""Pages CRUD + book_type validation + cascade tests (Phase 4 Session 2).

Covers the routes added in bibliogon_kinderbuch/pages.py plus the
``book_type`` discriminator behaviour added in the backend Book model
+ Pydantic schemas + the books PATCH handler.

Schema under test:

    book_type IN {prose, picture_book, comic_book}

- ``prose``        — existing chapter-based path (default).
- ``picture_book`` — v1 active; plugin-kinderbuch owns the pages.
- ``comic_book``   — reserved for future plugin-comics; the value is
                     accepted at the schema layer but the pages
                     routes reject it (no comic plugin yet).

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

    def test_comic_book_reserved_accepted_by_schema(self, client):
        # comic_book is a valid schema value (reserved for future plugin)
        # even though the picture-book plugin won't serve pages for it.
        book = _create_book(client, "ComicResv", book_type="comic_book")
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

    def test_create_page_rejects_comic_book(self, client):
        # comic_book is reserved but has no plugin yet; pages routes
        # belong to the picture-book plugin only. Forward-compat:
        # future plugin-comics will mount /api/books/{id}/panels etc.
        # under its own gate.
        book = _create_book(client, "ComicGate", book_type="comic_book")
        r = client.post(
            f"/api/books/{book['id']}/pages",
            json={"layout": "speech_bubble"},
        )
        assert r.status_code == 400
        assert "picture_book" in r.json()["detail"]

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
            speech_bubble_config={"anchor_position": "top-left"},
        )
        assert page["text_content"] == "Hello world"
        assert page["speech_bubble_config"] == {"anchor_position": "top-left"}

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

    def test_patch_speech_bubble_config_roundtrips(self, client):
        book = _create_book(client, "CRUD7", book_type="picture_book")
        page = _create_page(client, book["id"], "speech_bubble")
        r = client.patch(
            f"/api/books/{book['id']}/pages/{page['id']}",
            json={"speech_bubble_config": {"anchor_position": "center", "size": "lg"}},
        )
        assert r.status_code == 200
        assert r.json()["speech_bubble_config"] == {
            "anchor_position": "center",
            "size": "lg",
        }
        # Re-read confirms persistence.
        r = client.get(f"/api/books/{book['id']}/pages")
        assert r.json()[0]["speech_bubble_config"]["size"] == "lg"

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
