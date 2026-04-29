"""Tests for ``POST /api/articles/{id}/ai/generate-meta`` plus the
permissive tag parser. AI provider call is patched so no network /
key required.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.seo_prompts import parse_tags_from_ai_output
from app.main import app


client = TestClient(app)


# --- _create helper ---


def _create_article(
    *, title: str = "Test Article", content_json: str | None = None
) -> dict:
    payload = {"title": title, "language": "en"}
    resp = client.post("/api/articles", json=payload)
    assert resp.status_code == 201
    article = resp.json()
    if content_json:
        client.patch(f"/api/articles/{article['id']}", json={"content_json": content_json})
        resp = client.get(f"/api/articles/{article['id']}")
        article = resp.json()
    return article


_TIPTAP_DOC = (
    '{"type":"doc","content":['
    '{"type":"paragraph","content":[{"type":"text","text":"Hello world."}]}'
    ',{"type":"paragraph","content":[{"type":"text","text":"Second paragraph."}]}'
    "]}"
)


# --- parse_tags_from_ai_output ---


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("ai, ml, deep learning", ["ai", "ml", "deep learning"]),
        ("- ai\n- ml\n- deep learning", ["ai", "ml", "deep learning"]),
        ("1. ai\n2. ml\n3. deep learning", ["ai", "ml", "deep learning"]),
        ('"ai", "ml", "deep learning"', ["ai", "ml", "deep learning"]),
        ("", []),
        ("   ", []),
        # Dedupe + cap at 10.
        (
            "a, a, b, c, d, e, f, g, h, i, j, k, l",
            ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
        ),
    ],
)
def test_parse_tags_handles_format_variants(raw: str, expected: list[str]) -> None:
    assert parse_tags_from_ai_output(raw) == expected


# --- endpoint contract ---


def _patched_chat_response(content: str, tokens: int = 42):
    return AsyncMock(
        return_value={
            "content": content,
            "usage": {"total_tokens": tokens},
        }
    )


def test_generate_meta_seo_title_populates_field_and_tracks_tokens() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    with patch(
        "app.ai.routes._is_ai_enabled", return_value=True
    ), patch("app.ai.routes._get_client") as get_client:
        client_mock = AsyncMock()
        client_mock.chat = _patched_chat_response("My SEO Title")
        get_client.return_value = client_mock
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "seo_title"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["generated_text"] == "My SEO Title"
    assert body["tokens_used"] == 42

    # Tokens persisted on the article.
    follow = client.get(f"/api/articles/{article['id']}").json()
    assert follow["ai_tokens_used"] == 42


def test_generate_meta_seo_title_clamps_to_60_chars() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    long_title = "A " * 60  # 120 chars
    with patch(
        "app.ai.routes._is_ai_enabled", return_value=True
    ), patch("app.ai.routes._get_client") as get_client:
        client_mock = AsyncMock()
        client_mock.chat = _patched_chat_response(long_title, tokens=10)
        get_client.return_value = client_mock
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "seo_title"},
        )
    assert resp.status_code == 200
    assert len(resp.json()["generated_text"]) <= 60


def test_generate_meta_seo_description_clamps_to_160_chars() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    long_desc = "x" * 500
    with patch(
        "app.ai.routes._is_ai_enabled", return_value=True
    ), patch("app.ai.routes._get_client") as get_client:
        client_mock = AsyncMock()
        client_mock.chat = _patched_chat_response(long_desc, tokens=10)
        get_client.return_value = client_mock
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "seo_description"},
        )
    assert resp.status_code == 200
    assert len(resp.json()["generated_text"]) <= 160


def test_generate_meta_tags_returns_list() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    with patch(
        "app.ai.routes._is_ai_enabled", return_value=True
    ), patch("app.ai.routes._get_client") as get_client:
        client_mock = AsyncMock()
        client_mock.chat = _patched_chat_response(
            "ai, ml, deep learning, neural networks, transformers", tokens=20
        )
        get_client.return_value = client_mock
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "tags"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["generated_tags"] == [
        "ai",
        "ml",
        "deep learning",
        "neural networks",
        "transformers",
    ]


def test_generate_meta_400_on_empty_article() -> None:
    article = _create_article()  # no content_json
    with patch("app.ai.routes._is_ai_enabled", return_value=True):
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "seo_title"},
        )
    assert resp.status_code == 400


def test_generate_meta_400_on_invalid_field() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    with patch("app.ai.routes._is_ai_enabled", return_value=True):
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "ghost"},
        )
    assert resp.status_code == 400


def test_generate_meta_404_on_missing_article() -> None:
    with patch("app.ai.routes._is_ai_enabled", return_value=True):
        resp = client.post(
            "/api/articles/ghost/ai/generate-meta",
            json={"field": "seo_title"},
        )
    assert resp.status_code == 404


def test_generate_meta_403_when_ai_disabled() -> None:
    article = _create_article(content_json=_TIPTAP_DOC)
    with patch("app.ai.routes._is_ai_enabled", return_value=False):
        resp = client.post(
            f"/api/articles/{article['id']}/ai/generate-meta",
            json={"field": "seo_title"},
        )
    assert resp.status_code == 403
