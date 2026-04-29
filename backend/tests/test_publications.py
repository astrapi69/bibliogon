"""AR-02 Phase 2: Publication CRUD + drift detection + platform schemas."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_article(title: str = "Phase 2 Article") -> dict:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_pub(article_id: str, **overrides) -> dict:
    payload: dict = {
        "platform": "medium",
        "platform_metadata": {"title": "T", "tags": ["a", "b"]},
    }
    payload.update(overrides)
    resp = client.post(f"/api/articles/{article_id}/publications", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- platform schemas ---


def test_platform_schemas_endpoint_returns_known_platforms() -> None:
    # Top-level path to avoid collision with /articles/{article_id}.
    resp = client.get("/api/article-platforms")
    assert resp.status_code == 200
    body = resp.json()
    for slug in ("medium", "substack", "x", "linkedin"):
        assert slug in body
    medium = body["medium"]
    assert medium["display_name"] == "Medium"
    assert "title" in medium["required_metadata"]


def test_platform_schemas_unknown_platform_falls_through_to_permissive() -> None:
    """Unknown platforms validate as OK (permissive). User can define
    a Publication for a platform Bibliogon doesn't ship a schema for."""
    article = _create_article()
    resp = client.post(
        f"/api/articles/{article['id']}/publications",
        json={"platform": "weird-platform-xyz", "platform_metadata": {}},
    )
    assert resp.status_code == 201, resp.text


# --- CRUD ---


def test_create_publication_returns_201_and_starts_planned() -> None:
    article = _create_article()
    pub = _create_pub(article["id"])
    assert pub["platform"] == "medium"
    assert pub["status"] == "planned"
    assert pub["is_promo"] is False
    assert pub["platform_metadata"]["title"] == "T"
    assert pub["content_snapshot_at_publish"] is None


def test_create_publication_400_when_required_fields_missing() -> None:
    article = _create_article()
    resp = client.post(
        f"/api/articles/{article['id']}/publications",
        json={"platform": "medium", "platform_metadata": {}},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"]["error"] == "platform_metadata_invalid"
    assert any("title" in e for e in body["detail"]["errors"])


def test_create_publication_400_when_tags_exceed_max() -> None:
    article = _create_article()
    resp = client.post(
        f"/api/articles/{article['id']}/publications",
        json={
            "platform": "medium",
            "platform_metadata": {
                "title": "T",
                "tags": ["1", "2", "3", "4", "5", "6"],  # 6 > medium max 5
            },
        },
    )
    assert resp.status_code == 400


def test_create_publication_400_when_x_body_exceeds_280_chars() -> None:
    article = _create_article()
    resp = client.post(
        f"/api/articles/{article['id']}/publications",
        json={
            "platform": "x",
            "platform_metadata": {"body": "x" * 281},
        },
    )
    assert resp.status_code == 400


def test_create_publication_404_on_unknown_article() -> None:
    resp = client.post(
        "/api/articles/missing-id/publications",
        json={"platform": "medium", "platform_metadata": {"title": "T", "tags": ["a"]}},
    )
    assert resp.status_code == 404


def test_list_publications_for_article() -> None:
    article = _create_article()
    a = _create_pub(article["id"])
    b = _create_pub(article["id"], platform="x", platform_metadata={"body": "post"})
    rows = client.get(f"/api/articles/{article['id']}/publications").json()
    ids = {r["id"] for r in rows}
    assert a["id"] in ids
    assert b["id"] in ids


def test_get_publication_404_on_missing() -> None:
    article = _create_article()
    resp = client.get(f"/api/articles/{article['id']}/publications/no-such-id")
    assert resp.status_code == 404


def test_patch_publication_updates_fields() -> None:
    article = _create_article()
    pub = _create_pub(article["id"])
    resp = client.patch(
        f"/api/articles/{article['id']}/publications/{pub['id']}",
        json={"notes": "Editor's note", "scheduled_at": "2026-05-01T10:00:00Z"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["notes"] == "Editor's note"
    assert body["scheduled_at"]


def test_patch_publication_rejects_invalid_status() -> None:
    article = _create_article()
    pub = _create_pub(article["id"])
    resp = client.patch(
        f"/api/articles/{article['id']}/publications/{pub['id']}",
        json={"status": "weird"},
    )
    assert resp.status_code == 422


def test_patch_publication_validates_platform_metadata() -> None:
    article = _create_article()
    pub = _create_pub(article["id"])
    resp = client.patch(
        f"/api/articles/{article['id']}/publications/{pub['id']}",
        json={"platform_metadata": {"title": ""}},
    )
    assert resp.status_code == 400


def test_delete_publication() -> None:
    article = _create_article()
    pub = _create_pub(article["id"])
    resp = client.delete(f"/api/articles/{article['id']}/publications/{pub['id']}")
    assert resp.status_code == 204
    assert client.get(f"/api/articles/{article['id']}/publications/{pub['id']}").status_code == 404


def test_cascade_delete_publications_when_article_permanently_deleted() -> None:
    """After the trash-bin migration ``DELETE /api/articles/{id}`` is
    a soft delete - the cascade only fires on permanent delete via
    the trash endpoint, which is what we exercise here."""
    article = _create_article()
    pub = _create_pub(article["id"])
    client.delete(f"/api/articles/{article['id']}")
    client.delete(f"/api/articles/trash/{article['id']}")
    # Article + publication both gone.
    assert client.get(f"/api/articles/{article['id']}").status_code == 404
    assert client.get(f"/api/articles/{article['id']}/publications/{pub['id']}").status_code == 404


# --- mark-published + drift ---


def test_mark_published_snapshots_content_and_sets_status() -> None:
    article = _create_article()
    # Give the article some content first.
    tiptap = (
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"v1"}]}]}'
    )
    client.patch(f"/api/articles/{article['id']}", json={"content_json": tiptap})
    pub = _create_pub(article["id"])
    resp = client.post(
        f"/api/articles/{article['id']}/publications/{pub['id']}/mark-published",
        json={"published_url": "https://medium.com/p/abc"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "published"
    assert body["content_snapshot_at_publish"] == tiptap
    assert body["published_at"]
    assert body["last_verified_at"]
    assert body["platform_metadata"]["published_url"] == "https://medium.com/p/abc"


def test_drift_detection_flips_status_to_out_of_sync_after_edit() -> None:
    article = _create_article()
    tiptap_v1 = (
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"v1"}]}]}'
    )
    client.patch(f"/api/articles/{article['id']}", json={"content_json": tiptap_v1})
    pub = _create_pub(article["id"])
    client.post(
        f"/api/articles/{article['id']}/publications/{pub['id']}/mark-published",
        json={},
    )

    # User edits the article after publishing.
    tiptap_v2 = (
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"v2"}]}]}'
    )
    client.patch(f"/api/articles/{article['id']}", json={"content_json": tiptap_v2})

    # GET should detect drift and flip to out_of_sync.
    resp = client.get(f"/api/articles/{article['id']}/publications/{pub['id']}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "out_of_sync"


def test_verify_live_clears_out_of_sync_and_re_snapshots() -> None:
    article = _create_article()
    tiptap_v1 = '{"type":"doc","content":[{"type":"text","text":"v1"}]}'
    client.patch(f"/api/articles/{article['id']}", json={"content_json": tiptap_v1})
    pub = _create_pub(article["id"])
    client.post(
        f"/api/articles/{article['id']}/publications/{pub['id']}/mark-published",
        json={},
    )

    # Cause drift.
    tiptap_v2 = '{"type":"doc","content":[{"type":"text","text":"v2"}]}'
    client.patch(f"/api/articles/{article['id']}", json={"content_json": tiptap_v2})
    drifted = client.get(f"/api/articles/{article['id']}/publications/{pub['id']}").json()
    assert drifted["status"] == "out_of_sync"

    # User affirms the live version matches the new local content.
    resp = client.post(f"/api/articles/{article['id']}/publications/{pub['id']}/verify-live")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "published"
    assert body["content_snapshot_at_publish"] == tiptap_v2

    # Subsequent GET should not flip back.
    follow = client.get(f"/api/articles/{article['id']}/publications/{pub['id']}").json()
    assert follow["status"] == "published"


def test_drift_detection_ignores_planned_publications() -> None:
    """A planned publication (never marked published) is not subject
    to drift; the snapshot is null and the comparison is a no-op."""
    article = _create_article()
    pub = _create_pub(article["id"])
    # Edit article without marking publication as published.
    client.patch(
        f"/api/articles/{article['id']}",
        json={"content_json": '{"type":"doc"}'},
    )
    body = client.get(f"/api/articles/{article['id']}/publications/{pub['id']}").json()
    assert body["status"] == "planned"


# --- promo + multi-platform ---


def test_is_promo_flag_persists() -> None:
    article = _create_article()
    main = _create_pub(article["id"], platform="medium")
    promo = _create_pub(
        article["id"],
        platform="x",
        is_promo=True,
        platform_metadata={"body": f"Read it: {main['id']}"},
    )
    assert main["is_promo"] is False
    assert promo["is_promo"] is True


# --- Article SEO fields (Phase 2 additive) ---


def test_article_phase2_seo_fields_persist() -> None:
    article = _create_article()
    resp = client.patch(
        f"/api/articles/{article['id']}",
        json={
            "canonical_url": "https://example.com/canonical",
            "featured_image_url": "https://example.com/cover.png",
            "excerpt": "Short summary.",
            "tags": ["python", "fastapi"],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["canonical_url"] == "https://example.com/canonical"
    assert body["featured_image_url"] == "https://example.com/cover.png"
    assert body["excerpt"] == "Short summary."
    assert body["tags"] == ["python", "fastapi"]


def test_article_seo_fields_default_empty_on_create() -> None:
    article = _create_article("Defaults Test")
    assert article["canonical_url"] is None
    assert article["featured_image_url"] is None
    assert article["excerpt"] is None
    assert article["tags"] == []
