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


# ---------------------------------------------------------------------------
# Extended unit tests for the new prompt capabilities (v0.20.x)
# ---------------------------------------------------------------------------


def test_build_review_prompt_consistency_focus():
    prompt = _build_review_system_prompt("en", ["consistency"])
    assert "internal consistency" in prompt.lower()
    assert "contradictions" in prompt.lower()


def test_build_review_prompt_beta_reader_focus():
    prompt = _build_review_system_prompt("en", ["beta_reader"])
    assert "beta-reader" in prompt.lower()


def test_build_review_prompt_chapter_type_injection():
    prompt = _build_review_system_prompt(
        "en", ["style"], chapter_type="dedication"
    )
    assert "dedication" in prompt.lower()
    assert "brief" in prompt.lower()


def test_build_review_prompt_unknown_chapter_type_falls_back():
    prompt = _build_review_system_prompt(
        "en", ["style"], chapter_type="nonexistent_type"
    )
    # Falls back to generic prose framing, NOT the typed guidance dict.
    assert "nonexistent_type" in prompt


def test_build_review_prompt_all_eight_languages():
    from app.ai.prompts import LANG_MAP

    assert set(LANG_MAP.keys()) == {"de", "en", "es", "fr", "el", "pt", "tr", "ja"}
    for code, name in LANG_MAP.items():
        prompt = _build_review_system_prompt(code, ["style"])
        assert name in prompt, f"Language {code}/{name} missing from prompt"


def test_non_prose_types_covers_kdp_frontmatter():
    from app.ai.prompts import NON_PROSE_TYPES

    for expected in ("title_page", "copyright", "toc", "imprint", "index"):
        assert expected in NON_PROSE_TYPES


# ---------------------------------------------------------------------------
# Cost estimation helper
# ---------------------------------------------------------------------------


def test_estimate_review_cost_known_model():
    from app.ai.pricing import estimate_review_cost

    input_tokens, output_tokens, cost = estimate_review_cost(
        "gpt-4o-mini", "x" * 4000
    )
    # 4000 chars / 4 = 1000 tokens + 300 system overhead
    assert input_tokens == 1300
    assert output_tokens == 1500
    assert cost is not None and cost > 0


def test_estimate_review_cost_unknown_model_returns_none():
    from app.ai.pricing import estimate_review_cost

    _, _, cost = estimate_review_cost("not-a-real-model", "hello")
    assert cost is None


def test_estimate_endpoint(enabled_client):
    resp = enabled_client.post(
        "/api/ai/review/estimate",
        json={"content": "Some chapter text.", "model": "gpt-4o-mini"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["input_tokens"] > 0
    assert body["cost_usd"] is not None
    assert body["model"] == "gpt-4o-mini"


# ---------------------------------------------------------------------------
# Metadata endpoint
# ---------------------------------------------------------------------------


def test_review_meta_endpoint(enabled_client):
    resp = enabled_client.get("/api/ai/review/meta")
    assert resp.status_code == 200
    body = resp.json()
    assert "style" in body["focus_values"]
    assert "consistency" in body["focus_values"]
    assert "beta_reader" in body["focus_values"]
    assert body["primary_focus"] == ["style", "consistency", "beta_reader"]
    assert "title_page" in body["non_prose_types"]
    assert set(body["languages"]) == {"de", "en", "es", "fr", "el", "pt", "tr", "ja"}


# ---------------------------------------------------------------------------
# Async review flow (job + SSE + persisted Markdown download)
# ---------------------------------------------------------------------------


def test_review_async_returns_job_id(enabled_client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "## Summary\nGood chapter.",
            "model": "test",
            "usage": {"total_tokens": 100},
        })
        mock_get_client.return_value = mock_client

        resp = enabled_client.post(
            "/api/ai/review/async",
            json={
                "content": "Chapter text.",
                "chapter_title": "Hello World",
                "book_id": "testbook123",
                "language": "en",
                "focus": ["style"],
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert "job_id" in body
    assert "review_id" in body
    assert len(body["review_id"]) == 12


def test_review_async_persists_markdown_and_allows_download(
    enabled_client, tmp_path, monkeypatch
):
    """End-to-end: submit async, poll until complete, download the MD."""
    import time

    monkeypatch.chdir(tmp_path)
    with patch("app.ai.routes._get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value={
            "content": "## Summary\nA test review.",
            "model": "test",
            "usage": {"total_tokens": 50},
        })
        mock_get_client.return_value = mock_client

        submit = enabled_client.post(
            "/api/ai/review/async",
            json={
                "content": "Chapter text.",
                "chapter_title": "Test Chapter",
                "book_id": "testbook456",
                "language": "en",
                "focus": ["style"],
            },
        )
        job_id = submit.json()["job_id"]
        review_id = submit.json()["review_id"]

        # Poll until terminal (fast because AsyncMock is instant).
        deadline = time.time() + 3
        while time.time() < deadline:
            poll = enabled_client.get(f"/api/ai/jobs/{job_id}")
            if poll.json()["status"] in ("completed", "failed"):
                break
            time.sleep(0.05)

        assert poll.status_code == 200
        assert poll.json()["status"] == "completed"

        download = enabled_client.get(
            f"/api/ai/review/{review_id}/report.md?book_id=testbook456"
        )
    assert download.status_code == 200
    assert "A test review." in download.text
    assert download.headers["content-type"].startswith("text/markdown")


def test_review_async_requires_ai_enabled(disabled_client):
    resp = disabled_client.post(
        "/api/ai/review/async",
        json={"content": "Chapter text.", "book_id": "x"},
    )
    assert resp.status_code == 403


def test_download_unknown_review_returns_404(enabled_client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    resp = enabled_client.get(
        "/api/ai/review/deadbeef0000/report.md?book_id=nonexistent"
    )
    assert resp.status_code == 404


def test_download_without_book_id_returns_422(enabled_client):
    # FastAPI will reject because book_id is a required query param.
    resp = enabled_client.get("/api/ai/review/any/report.md")
    assert resp.status_code == 422


def test_jobs_endpoint_returns_404_for_unknown_id(enabled_client):
    resp = enabled_client.get("/api/ai/jobs/nonexistentjobid")
    assert resp.status_code == 404
