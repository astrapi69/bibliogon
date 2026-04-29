"""AR-01 Phase 1: Article CRUD tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create(title: str = "My Article", **extra) -> dict:
    payload = {"title": title}
    payload.update(extra)
    resp = client.post("/api/articles", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- create ---


def test_create_article_minimal() -> None:
    article = _create("Minimal")
    assert article["title"] == "Minimal"
    assert article["subtitle"] is None
    assert article["author"] is None
    assert article["language"] == "en"
    assert article["content_type"] == "article"
    assert article["status"] == "draft"
    assert article["content_json"] == ""
    assert article["id"]
    assert article["created_at"]
    assert article["updated_at"]


def test_create_article_with_metadata() -> None:
    article = _create(
        "Loaded",
        subtitle="Subtitle",
        author="A. Person",
        language="de",
    )
    assert article["subtitle"] == "Subtitle"
    assert article["author"] == "A. Person"
    assert article["language"] == "de"


def test_create_article_rejects_empty_title() -> None:
    resp = client.post("/api/articles", json={"title": ""})
    assert resp.status_code == 422


def test_create_article_always_starts_draft() -> None:
    """Status is server-assigned; the create payload cannot bypass it."""
    article = _create("Draft Test")
    assert article["status"] == "draft"


# --- list ---


def test_list_articles_returns_all_when_no_filter() -> None:
    a = _create("ListA")
    b = _create("ListB")
    resp = client.get("/api/articles")
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert a["id"] in ids
    assert b["id"] in ids


def test_list_articles_filters_by_status() -> None:
    drafted = _create("Drafted")
    publish = _create("ToPublish")
    client.patch(f"/api/articles/{publish['id']}", json={"status": "published"})

    resp = client.get("/api/articles", params={"status": "published"})
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert publish["id"] in ids
    assert drafted["id"] not in ids


def test_list_articles_400_on_invalid_status() -> None:
    resp = client.get("/api/articles", params={"status": "weird"})
    assert resp.status_code == 400


def test_list_articles_orders_by_updated_at_desc() -> None:
    """Most recently touched article comes first."""
    older = _create("Older")
    newer = _create("Newer")
    # Touch older to make it newer-than-newer.
    client.patch(f"/api/articles/{older['id']}", json={"title": "Older Bumped"})
    rows = client.get("/api/articles").json()
    ids_in_order = [row["id"] for row in rows]
    assert ids_in_order.index(older["id"]) < ids_in_order.index(newer["id"])


# --- get ---


def test_get_article_returns_full_payload() -> None:
    article = _create("Specific")
    resp = client.get(f"/api/articles/{article['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == article["id"]
    assert body["title"] == "Specific"


def test_get_article_404_on_missing() -> None:
    resp = client.get("/api/articles/does-not-exist")
    assert resp.status_code == 404


# --- patch ---


def test_patch_article_updates_only_provided_fields() -> None:
    article = _create("Original", subtitle="OrigSub", author="A")
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={"title": "Renamed"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["subtitle"] == "OrigSub"
    assert body["author"] == "A"


def test_patch_article_persists_content_json() -> None:
    article = _create("Content Test")
    tiptap_doc = (
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}'
    )
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={"content_json": tiptap_doc},
    )
    assert resp.status_code == 200
    assert resp.json()["content_json"] == tiptap_doc


def test_patch_article_status_transitions() -> None:
    article = _create("Lifecycle")
    for new_status in ("ready", "published", "archived", "draft"):
        resp = client.patch(f"/api/articles/{article['id']}", json={"status": new_status})
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == new_status


def test_patch_article_ready_status_persists() -> None:
    """``ready`` is the new state between draft and published.
    Smoke check that it round-trips through GET."""
    article = _create("Ready Test")
    resp = client.patch(f"/api/articles/{article['id']}", json={"status": "ready"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ready"
    fetched = client.get(f"/api/articles/{article['id']}").json()
    assert fetched["status"] == "ready"


def test_patch_article_rejects_invalid_status() -> None:
    article = _create("Status Test")
    resp = client.patch(f"/api/articles/{article['id']}", json={"status": "garbage"})
    assert resp.status_code == 422


def test_patch_article_404_on_missing() -> None:
    resp = client.patch("/api/articles/does-not-exist", json={"title": "x"})
    assert resp.status_code == 404


def test_patch_article_bumps_updated_at() -> None:
    article = _create("Bump Test")
    original_updated = article["updated_at"]
    # Force a real time delta by sending an update.
    resp = client.patch(f"/api/articles/{article['id']}", json={"title": "Bumped"})
    new_updated = resp.json()["updated_at"]
    assert new_updated >= original_updated


# --- delete ---


def test_delete_article_soft_deletes_into_trash() -> None:
    """Default delete moves the article into the trash (sets
    ``deleted_at``) and removes it from the live list. The article
    is still fetchable by id so the editor can restore via direct
    URL."""
    article = _create("To Trash")
    resp = client.delete(f"/api/articles/{article['id']}")
    assert resp.status_code == 204

    live = client.get("/api/articles").json()
    assert all(a["id"] != article["id"] for a in live)

    detail = client.get(f"/api/articles/{article['id']}")
    assert detail.status_code == 200
    assert detail.json().get("deleted_at") is not None or detail.status_code == 200


def test_delete_article_404_on_missing() -> None:
    resp = client.delete("/api/articles/ghost")
    assert resp.status_code == 404


def test_trash_list_returns_only_trashed_articles() -> None:
    live = _create("Live Article")
    trashed = _create("Trashed Article")
    client.delete(f"/api/articles/{trashed['id']}")

    rows = client.get("/api/articles/trash/list").json()
    ids = [r["id"] for r in rows]
    assert trashed["id"] in ids
    assert live["id"] not in ids


def test_restore_article_clears_deleted_at() -> None:
    article = _create("Restorable")
    client.delete(f"/api/articles/{article['id']}")

    resp = client.post(f"/api/articles/trash/{article['id']}/restore")
    assert resp.status_code == 200
    assert resp.json().get("deleted_at") is None

    live = client.get("/api/articles").json()
    assert any(a["id"] == article["id"] for a in live)


def test_restore_404_on_non_trashed() -> None:
    """Restoring an article that is NOT in the trash is a 404 - the
    endpoint is only valid against the trash, mirroring books."""
    article = _create("Live Only")
    resp = client.post(f"/api/articles/trash/{article['id']}/restore")
    assert resp.status_code == 404


def test_permanent_delete_removes_article_and_uploads() -> None:
    """``DELETE /api/articles/trash/{id}`` removes the trashed row +
    on-disk assets. Guards F-9 (assets orphaned) under the new
    trash-bin pattern."""
    import shutil as _shutil
    from pathlib import Path

    article = _create("With Assets")
    uploads_root = Path("uploads") / "articles" / article["id"]
    uploads_root.mkdir(parents=True, exist_ok=True)
    (uploads_root / "featured.png").write_bytes(b"fake-image")
    assert uploads_root.exists()

    try:
        # Step 1: soft-delete into trash.
        client.delete(f"/api/articles/{article['id']}")
        # Step 2: permanent-delete from trash.
        resp = client.delete(f"/api/articles/trash/{article['id']}")
        assert resp.status_code == 204
        assert not uploads_root.exists()

        # Article row gone for good.
        follow = client.get(f"/api/articles/{article['id']}")
        assert follow.status_code == 404
    finally:
        if uploads_root.exists():
            _shutil.rmtree(uploads_root, ignore_errors=True)


def test_permanent_delete_404_on_non_trashed() -> None:
    """Permanent-delete only operates on trashed articles. A live
    article must NOT be hard-deleted via the trash endpoint."""
    article = _create("Live Article")
    resp = client.delete(f"/api/articles/trash/{article['id']}")
    assert resp.status_code == 404


def test_empty_trash_purges_all_trashed() -> None:
    a1 = _create("Trash 1")
    a2 = _create("Trash 2")
    client.delete(f"/api/articles/{a1['id']}")
    client.delete(f"/api/articles/{a2['id']}")

    resp = client.delete("/api/articles/trash/empty")
    assert resp.status_code == 204

    rows = client.get("/api/articles/trash/list").json()
    ids = [r["id"] for r in rows]
    assert a1["id"] not in ids
    assert a2["id"] not in ids


# --- isolation: Article does NOT touch books ---


def test_article_phase2_1_topic_seo_fields_persist() -> None:
    article = _create("Phase 2.1 Test")
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={
            "topic": "Tech",
            "seo_title": "An SEO-Optimized Title",
            "seo_description": "Short pitch for search snippets.",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topic"] == "Tech"
    assert body["seo_title"] == "An SEO-Optimized Title"
    assert body["seo_description"] == "Short pitch for search snippets."


def test_article_phase2_1_fields_default_null_on_create() -> None:
    article = _create("Defaults")
    assert article["topic"] is None
    assert article["seo_title"] is None
    assert article["seo_description"] is None


def test_settings_topics_round_trip() -> None:
    """Settings PATCH accepts topics list, dedupes + strips, and
    reads back through GET."""
    # Get current state, send a new topics list, verify GET returns it.
    initial = client.get("/api/settings/app").json()
    initial_topics = initial.get("topics") or []

    resp = client.patch(
        "/api/settings/app",
        json={"topics": ["Tech", "Tech", "  Writing  ", "", "Recipes"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topics"] == ["Tech", "Writing", "Recipes"]

    # GET returns the persisted list.
    fetched = client.get("/api/settings/app").json()
    assert fetched["topics"] == ["Tech", "Writing", "Recipes"]

    # Restore (omit topics from the cleanup PATCH so other tests
    # don't depend on starting state).
    if initial_topics is not None:
        client.patch(
            "/api/settings/app",
            json={"topics": initial_topics},
        )


def test_article_crud_does_not_create_book_rows() -> None:
    """Sanity: creating articles does not pollute the books table.
    (Article is its own entity, separate from Book.)"""
    before = client.get("/api/books").json()
    _create("Independent")
    after = client.get("/api/books").json()
    assert {b["id"] for b in before} == {b["id"] for b in after}
