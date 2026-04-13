"""Tests for the AI marketing text generation endpoint."""

import pytest
import yaml
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.ai.routes import _build_marketing_prompt, _MARKETING_PROMPTS


# ---------------------------------------------------------------------------
# Unit tests for prompt builder
# ---------------------------------------------------------------------------


def test_all_marketing_fields_have_prompts():
    expected = {"html_description", "backpage_description", "backpage_author_bio", "keywords"}
    assert set(_MARKETING_PROMPTS.keys()) == expected


def test_build_prompt_includes_book_context():
    from app.ai.routes import MarketingRequest

    req = MarketingRequest(
        field="html_description",
        book_title="My Novel",
        author="Jane Doe",
        genre="Thriller",
        language="en",
        description="A spy thriller set in Berlin.",
        chapter_titles=["The Arrival", "The Chase", "The Escape"],
    )
    system, user = _build_marketing_prompt("html_description", req)

    assert "English" in system
    assert "My Novel" in user
    assert "Jane Doe" in user
    assert "Thriller" in user
    assert "Berlin" in user
    assert "The Arrival" in user


def test_build_prompt_html_description_format():
    from app.ai.routes import MarketingRequest

    req = MarketingRequest(field="html_description", book_title="Test", language="de")
    system, _ = _build_marketing_prompt("html_description", req)

    assert "HTML" in system
    assert "<p>" in system
    assert "German" in system


def test_build_prompt_keywords_requests_json():
    from app.ai.routes import MarketingRequest

    req = MarketingRequest(field="keywords", book_title="Test", language="en")
    system, _ = _build_marketing_prompt("keywords", req)

    assert "JSON array" in system


def test_build_prompt_backpage_plain_text():
    from app.ai.routes import MarketingRequest

    req = MarketingRequest(field="backpage_description", book_title="Test", language="de")
    system, _ = _build_marketing_prompt("backpage_description", req)

    assert "no HTML" in system or "Plain text" in system


def test_build_prompt_includes_existing_text():
    from app.ai.routes import MarketingRequest

    req = MarketingRequest(
        field="html_description",
        book_title="Test",
        existing_text="Old description here.",
    )
    _, user = _build_marketing_prompt("html_description", req)

    assert "Old description here." in user


def test_build_prompt_caps_chapter_titles():
    from app.ai.routes import MarketingRequest

    long_chapters = [f"Chapter {i}" for i in range(30)]
    req = MarketingRequest(
        field="html_description",
        book_title="Test",
        chapter_titles=long_chapters,
    )
    _, user = _build_marketing_prompt("html_description", req)

    # Should cap at 20 chapter titles
    assert "Chapter 19" in user
    assert "Chapter 20" not in user


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------


@pytest.fixture
def enabled_client(tmp_path):
    """TestClient with AI enabled and LLM calls mocked."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_path = config_dir / "app.yaml"
    config_path.write_text(yaml.dump({
        "ai": {
            "enabled": True,
            "provider": "lmstudio",
            "base_url": "http://localhost:1234/v1",
            "model": "test-model",
            "api_key": "",
            "temperature": 0.7,
            "max_tokens": 2048,
        },
    }))

    def mock_ai_config():
        with open(config_path, encoding="utf-8") as f:
            return yaml.safe_load(f).get("ai", {})

    with patch("app.ai.routes._get_ai_config", side_effect=mock_ai_config):
        yield TestClient(app)


@pytest.fixture
def disabled_client(tmp_path):
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_path = config_dir / "app.yaml"
    config_path.write_text(yaml.dump({"ai": {"enabled": False}}))

    def mock_ai_config():
        with open(config_path, encoding="utf-8") as f:
            return yaml.safe_load(f).get("ai", {})

    with patch("app.ai.routes._get_ai_config", side_effect=mock_ai_config):
        yield TestClient(app)


def test_marketing_returns_403_when_disabled(disabled_client):
    resp = disabled_client.post("/api/ai/generate-marketing", json={
        "field": "html_description",
        "book_title": "Test",
    })
    assert resp.status_code == 403


def test_marketing_rejects_unknown_field(enabled_client):
    with patch("app.ai.routes._get_client") as mock_get:
        mock_get.return_value = AsyncMock()

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "nonexistent_field",
            "book_title": "Test",
        })
    assert resp.status_code == 400
    assert "nonexistent_field" in resp.json()["detail"]


def test_marketing_requires_book_title(enabled_client):
    resp = enabled_client.post("/api/ai/generate-marketing", json={
        "field": "html_description",
    })
    assert resp.status_code == 422


def test_marketing_html_description_success(enabled_client):
    mock_result = {
        "content": "<p>A gripping thriller that...</p>",
        "model": "test-model",
        "usage": {"prompt_tokens": 50, "completion_tokens": 100},
    }

    with patch("app.ai.routes._get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "html_description",
            "book_title": "The Berlin Job",
            "author": "Jane Doe",
            "genre": "Thriller",
            "language": "en",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["field"] == "html_description"
    assert "<p>" in data["content"]


def test_marketing_keywords_success(enabled_client):
    mock_result = {
        "content": '["spy thriller", "Berlin", "cold war", "espionage", "suspense", "action", "CIA"]',
        "model": "test-model",
        "usage": {},
    }

    with patch("app.ai.routes._get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "keywords",
            "book_title": "The Berlin Job",
            "language": "en",
        })

    assert resp.status_code == 200
    assert resp.json()["field"] == "keywords"


def test_marketing_backpage_description_success(enabled_client):
    mock_result = {
        "content": "A story of betrayal and redemption in post-war Berlin.",
        "model": "test-model",
        "usage": {},
    }

    with patch("app.ai.routes._get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "backpage_description",
            "book_title": "Test Book",
        })

    assert resp.status_code == 200
    assert "betrayal" in resp.json()["content"]


def test_marketing_returns_502_on_llm_error(enabled_client):
    from app.ai.llm_client import LLMError

    with patch("app.ai.routes._get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(side_effect=LLMError("Connection refused"))
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "html_description",
            "book_title": "Test",
        })

    assert resp.status_code == 502
    assert "Connection refused" in resp.json()["detail"]


def test_marketing_passes_chapter_titles(enabled_client):
    """Chapter titles are included in the user prompt for context."""
    with patch("app.ai.routes._get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "Generated.",
            "model": "test",
            "usage": {},
        })
        mock_get.return_value = mock_client

        enabled_client.post("/api/ai/generate-marketing", json={
            "field": "html_description",
            "book_title": "My Book",
            "chapter_titles": ["The Beginning", "The Middle", "The End"],
        })

        call_args = mock_client.chat.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages") or call_args[0][0]
        user_msg = next(m for m in messages if m["role"] == "user")
        assert "The Beginning" in user_msg["content"]
        assert "The End" in user_msg["content"]
