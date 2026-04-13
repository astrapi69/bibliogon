"""Tests for the AI chapter review endpoint."""

import pytest
import yaml
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.ai.routes import _build_review_system_prompt


# ---------------------------------------------------------------------------
# Unit tests for the system prompt builder
# ---------------------------------------------------------------------------


def test_build_review_prompt_default_focus():
    prompt = _build_review_system_prompt("de", ["style", "coherence", "pacing"])
    assert "German" in prompt
    assert "style" in prompt.lower()
    assert "coherence" in prompt.lower()
    assert "pacing" in prompt.lower()


def test_build_review_prompt_english():
    prompt = _build_review_system_prompt("en", ["style"])
    assert "English" in prompt
    assert "style" in prompt.lower()


def test_build_review_prompt_unknown_language():
    prompt = _build_review_system_prompt("ko", ["style"])
    assert "'ko'" in prompt


def test_build_review_prompt_dialogue_focus():
    prompt = _build_review_system_prompt("de", ["dialogue", "tension"])
    assert "dialogue" in prompt.lower()
    assert "tension" in prompt.lower()
    assert "style" not in prompt.lower().split("analyze")[1] if "analyze" in prompt.lower() else True


def test_build_review_prompt_ignores_unknown_focus():
    prompt = _build_review_system_prompt("de", ["style", "nonexistent_focus"])
    assert "style" in prompt.lower()
    assert "nonexistent_focus" not in prompt


def test_build_review_prompt_structure():
    """Prompt requests structured output with summary, strengths, suggestions, overall."""
    prompt = _build_review_system_prompt("en", ["style"])
    assert "Summary" in prompt
    assert "Strengths" in prompt
    assert "Suggestions" in prompt
    assert "Overall" in prompt


def test_build_review_prompt_with_genre():
    prompt = _build_review_system_prompt("en", ["style"], genre="Thriller")
    assert "Thriller" in prompt
    assert "genre" in prompt.lower()


def test_build_review_prompt_without_genre():
    prompt = _build_review_system_prompt("en", ["style"], genre="")
    assert "genre" not in prompt.lower() or "genre is" not in prompt.lower()


# ---------------------------------------------------------------------------
# Integration tests for the review endpoint
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
    """TestClient with AI disabled."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    config_path = config_dir / "app.yaml"
    config_path.write_text(yaml.dump({
        "ai": {"enabled": False},
    }))

    def mock_ai_config():
        with open(config_path, encoding="utf-8") as f:
            return yaml.safe_load(f).get("ai", {})

    with patch("app.ai.routes._get_ai_config", side_effect=mock_ai_config):
        yield TestClient(app)


def test_review_returns_403_when_disabled(disabled_client):
    resp = disabled_client.post("/api/ai/review", json={
        "content": "Some chapter text.",
    })
    assert resp.status_code == 403


def test_review_returns_422_without_content(enabled_client):
    resp = enabled_client.post("/api/ai/review", json={})
    assert resp.status_code == 422


def test_review_returns_422_with_empty_content(enabled_client):
    resp = enabled_client.post("/api/ai/review", json={"content": ""})
    assert resp.status_code == 422


def test_review_success(enabled_client):
    mock_result = {
        "content": "**Summary**: A well-paced chapter.\n**Strengths**: Good dialogue.",
        "model": "test-model",
        "usage": {"prompt_tokens": 100, "completion_tokens": 50},
    }

    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get_client.return_value = mock_client

        resp = enabled_client.post("/api/ai/review", json={
            "content": "The sun rose over the village. Maria stepped outside.",
            "chapter_title": "Chapter 1",
            "book_title": "My Novel",
            "language": "en",
            "focus": ["style", "pacing"],
        })

    assert resp.status_code == 200
    data = resp.json()
    assert "review" in data
    assert "Summary" in data["review"]
    assert data["model"] == "test-model"


def test_review_passes_chapter_context_to_llm(enabled_client):
    """The user prompt includes book title, chapter title, and content."""
    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "Review here.",
            "model": "test",
            "usage": {},
        })
        mock_get_client.return_value = mock_client

        enabled_client.post("/api/ai/review", json={
            "content": "Chapter text here.",
            "chapter_title": "The Beginning",
            "book_title": "My Story",
            "language": "de",
        })

        call_args = mock_client.chat.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages") or call_args[0][0]
        user_msg = next(m for m in messages if m["role"] == "user")
        assert "My Story" in user_msg["content"]
        assert "The Beginning" in user_msg["content"]
        assert "Chapter text here." in user_msg["content"]


def test_review_system_prompt_uses_language(enabled_client):
    """System prompt reflects the requested language."""
    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "Review.",
            "model": "test",
            "usage": {},
        })
        mock_get_client.return_value = mock_client

        enabled_client.post("/api/ai/review", json={
            "content": "Text.",
            "language": "en",
            "focus": ["style"],
        })

        call_args = mock_client.chat.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages") or call_args[0][0]
        system_msg = next(m for m in messages if m["role"] == "system")
        assert "English" in system_msg["content"]


def test_review_system_prompt_includes_genre(enabled_client):
    """When genre is provided, the system prompt mentions it."""
    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "Review.",
            "model": "test",
            "usage": {},
        })
        mock_get_client.return_value = mock_client

        enabled_client.post("/api/ai/review", json={
            "content": "Text.",
            "genre": "Science Fiction",
            "language": "en",
        })

        call_args = mock_client.chat.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages") or call_args[0][0]
        system_msg = next(m for m in messages if m["role"] == "system")
        assert "Science Fiction" in system_msg["content"]


def test_review_returns_502_on_llm_error(enabled_client):
    from app.ai.llm_client import LLMError

    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(side_effect=LLMError("Server not reachable"))
        mock_get_client.return_value = mock_client

        resp = enabled_client.post("/api/ai/review", json={
            "content": "Some text.",
        })

    assert resp.status_code == 502
    assert "Server not reachable" in resp.json()["detail"]


def test_review_default_focus_is_style_coherence_pacing(enabled_client):
    """When no focus is specified, defaults to style, coherence, pacing."""
    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "Review.",
            "model": "test",
            "usage": {},
        })
        mock_get_client.return_value = mock_client

        enabled_client.post("/api/ai/review", json={
            "content": "Text.",
        })

        call_args = mock_client.chat.call_args
        messages = call_args.kwargs.get("messages") or call_args[1].get("messages") or call_args[0][0]
        system_msg = next(m for m in messages if m["role"] == "system")
        assert "style" in system_msg["content"].lower()
        assert "coherence" in system_msg["content"].lower()
        assert "pacing" in system_msg["content"].lower()
