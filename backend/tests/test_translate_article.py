"""AR editor-parity Phase 2: /translation/translate-article tests."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _create_article(client: TestClient, title: str = "Source") -> dict:
    resp = client.post("/api/articles", json={"title": title})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _patch_article(client: TestClient, article_id: str, **patch_fields) -> None:
    resp = client.patch(f"/api/articles/{article_id}", json=patch_fields)
    assert resp.status_code == 200, resp.text


async def _fake_translate(text, target_lang, source_lang, provider, deepl_client, lmstudio_client):
    """Deterministic fake: prefix with target_lang so assertions are stable."""
    return f"[{target_lang}] {text}"


@pytest.fixture
def patched_translator():
    """Patch translate_chapter_content used inside the route."""
    with patch(
        "bibliogon_translation.routes.translate_chapter_content",
        side_effect=_fake_translate,
    ), patch(
        "bibliogon_translation.routes._build_translation_clients",
        return_value=(object(), None),
    ):
        yield


def test_translate_article_creates_target_language_copy(patched_translator) -> None:
    with TestClient(app) as client:
        source = _create_article(client, "Hello World")
        _patch_article(
            client,
            source["id"],
            subtitle="A subtitle",
            excerpt="The excerpt sentence.",
            seo_title="SEO Title",
            seo_description="SEO Description.",
            content_json=json.dumps({
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": "Body."}]}
                ],
            }),
        )

        resp = client.post(
            "/api/translation/translate-article",
            json={
                "article_id": source["id"],
                "target_lang": "EN",
                "provider": "deepl",
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["original_article_id"] == source["id"]
        assert body["language"] == "en"
        assert body["provider"] == "deepl"
        assert body["title"] == "[EN] Hello World (EN)"

        new_id = body["article_id"]
        new_article = client.get(f"/api/articles/{new_id}").json()
        assert new_article["status"] == "draft"
        assert new_article["language"] == "en"
        assert new_article["subtitle"] == "[EN] A subtitle"
        assert new_article["excerpt"] == "[EN] The excerpt sentence."
        assert new_article["seo_title"] == "[EN] SEO Title"
        assert new_article["seo_description"] == "[EN] SEO Description."
        # Body content_json must contain the translated body text.
        assert "[EN] Body." in new_article["content_json"]


def test_translate_article_skips_empty_metadata_fields(patched_translator) -> None:
    """Empty / None fields stay None (no '[EN] None' string leaks)."""
    with TestClient(app) as client:
        source = _create_article(client, "Bare")
        resp = client.post(
            "/api/translation/translate-article",
            json={"article_id": source["id"], "target_lang": "DE"},
        )
        assert resp.status_code == 200, resp.text
        new = client.get(f"/api/articles/{resp.json()['article_id']}").json()
        assert new["subtitle"] is None
        assert new["excerpt"] is None
        assert new["seo_title"] is None
        assert new["seo_description"] is None
        # Title still translated (always set).
        assert new["title"].startswith("[DE] Bare")


def test_translate_article_404_on_missing_id(patched_translator) -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/api/translation/translate-article",
            json={"article_id": "ghost", "target_lang": "EN"},
        )
        assert resp.status_code == 404


def test_translate_article_returns_502_on_lmstudio_unreachable() -> None:
    """LMStudio default endpoint (localhost:1234) often unavailable.
    Raw httpx ConnectError must surface as a clean 502 with a
    pointer to the unreachable provider, not a 500 with stack trace."""
    import httpx

    async def _raise_connect(*_a, **_kw):
        raise httpx.ConnectError("Connection refused")

    with patch(
        "bibliogon_translation.routes.translate_chapter_content",
        side_effect=_raise_connect,
    ), patch(
        "bibliogon_translation.routes._build_translation_clients",
        return_value=(None, object()),
    ), TestClient(app) as client:
        source = _create_article(client, "Net failure")
        resp = client.post(
            "/api/translation/translate-article",
            json={"article_id": source["id"], "target_lang": "EN", "provider": "lmstudio"},
        )
        assert resp.status_code == 502, resp.text
        detail = resp.json()["detail"]
        assert "LMStudio" in detail
        assert "not reachable" in detail


def test_translate_article_preserves_topic_tags_canonical(patched_translator) -> None:
    """Settings-managed values + identity fields copy verbatim."""
    with TestClient(app) as client:
        source = _create_article(client, "Tagged")
        _patch_article(
            client,
            source["id"],
            topic="Tech",
            tags=["python", "fastapi"],
            canonical_url="https://example.com/original",
        )
        resp = client.post(
            "/api/translation/translate-article",
            json={"article_id": source["id"], "target_lang": "FR"},
        )
        assert resp.status_code == 200
        new = client.get(f"/api/articles/{resp.json()['article_id']}").json()
        assert new["topic"] == "Tech"
        assert new["tags"] == ["python", "fastapi"]
        assert new["canonical_url"] == "https://example.com/original"
