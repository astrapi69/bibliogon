"""Tests for AI token usage tracking."""

import pytest
import yaml
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.main import app
from app.ai.routes import _track_usage


# ---------------------------------------------------------------------------
# Unit tests for _track_usage
# ---------------------------------------------------------------------------


def test_track_usage_increments_counter():
    """_track_usage increments ai_tokens_used on the book."""
    mock_book = MagicMock()
    mock_book.ai_tokens_used = 100

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_book

    with patch("app.database.SessionLocal", return_value=mock_db):
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)

        _track_usage("book-123", {"prompt_tokens": 50, "completion_tokens": 30, "total_tokens": 80})

    assert mock_book.ai_tokens_used == 180
    mock_db.commit.assert_called_once()


def test_track_usage_uses_total_tokens_if_present():
    """total_tokens takes precedence over summing prompt+completion."""
    mock_book = MagicMock()
    mock_book.ai_tokens_used = 0

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_book

    with patch("app.database.SessionLocal", return_value=mock_db):
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)

        _track_usage("book-123", {"total_tokens": 200})

    assert mock_book.ai_tokens_used == 200


def test_track_usage_skips_when_no_book_id():
    """No DB call when book_id is empty."""
    with patch("app.database.SessionLocal") as mock_session:
        _track_usage("", {"total_tokens": 100})
        mock_session.assert_not_called()


def test_track_usage_skips_when_zero_tokens():
    """No DB call when usage is zero."""
    with patch("app.database.SessionLocal") as mock_session:
        _track_usage("book-123", {"total_tokens": 0})
        mock_session.assert_not_called()


def test_track_usage_never_raises():
    """_track_usage is best-effort - DB errors are swallowed."""
    with patch("app.database.SessionLocal", side_effect=RuntimeError("DB down")):
        # Should not raise
        _track_usage("book-123", {"total_tokens": 100})


def test_track_usage_handles_none_ai_tokens():
    """Handles books where ai_tokens_used is None (legacy data)."""
    mock_book = MagicMock()
    mock_book.ai_tokens_used = None

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_book

    with patch("app.database.SessionLocal", return_value=mock_db):
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)

        _track_usage("book-123", {"total_tokens": 50})

    assert mock_book.ai_tokens_used == 50


def test_track_usage_skips_when_book_not_found():
    """No crash when book doesn't exist."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    with patch("app.database.SessionLocal", return_value=mock_db):
        mock_db.__enter__ = MagicMock(return_value=mock_db)
        mock_db.__exit__ = MagicMock(return_value=False)

        _track_usage("nonexistent-book", {"total_tokens": 100})

    mock_db.commit.assert_not_called()


# ---------------------------------------------------------------------------
# Integration: endpoints return usage and accept book_id
# ---------------------------------------------------------------------------


@pytest.fixture
def enabled_client(tmp_path):
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


def test_generate_returns_usage(enabled_client):
    mock_result = {
        "content": "Generated text",
        "model": "test",
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }

    with patch("app.ai.routes._get_client") as mock_get, \
         patch("app.ai.routes._track_usage") as mock_track:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate", json={
            "prompt": "Hello",
            "book_id": "book-abc",
        })

    assert resp.status_code == 200
    assert resp.json()["usage"]["total_tokens"] == 15
    mock_track.assert_called_once_with("book-abc", {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15})


def test_review_tracks_usage(enabled_client):
    mock_result = {
        "content": "Review text",
        "model": "test",
        "usage": {"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300},
    }

    with patch("app.ai.routes._get_client") as mock_get, \
         patch("app.ai.routes._track_usage") as mock_track:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/review", json={
            "content": "Chapter text.",
            "book_id": "book-xyz",
        })

    assert resp.status_code == 200
    mock_track.assert_called_once_with("book-xyz", {"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300})


def test_marketing_tracks_usage(enabled_client):
    mock_result = {
        "content": "<p>Blurb</p>",
        "model": "test",
        "usage": {"prompt_tokens": 50, "completion_tokens": 100, "total_tokens": 150},
    }

    with patch("app.ai.routes._get_client") as mock_get, \
         patch("app.ai.routes._track_usage") as mock_track:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate-marketing", json={
            "field": "html_description",
            "book_title": "Test Book",
            "book_id": "book-def",
        })

    assert resp.status_code == 200
    mock_track.assert_called_once_with("book-def", {"prompt_tokens": 50, "completion_tokens": 100, "total_tokens": 150})


def test_generate_without_book_id_still_works(enabled_client):
    """Endpoints work fine without book_id (backward compat)."""
    mock_result = {
        "content": "text",
        "model": "test",
        "usage": {"total_tokens": 10},
    }

    with patch("app.ai.routes._get_client") as mock_get, \
         patch("app.ai.routes._track_usage") as mock_track:
        mock_client = AsyncMock()
        mock_client.chat = AsyncMock(return_value=mock_result)
        mock_get.return_value = mock_client

        resp = enabled_client.post("/api/ai/generate", json={
            "prompt": "Hello",
        })

    assert resp.status_code == 200
    # Called with empty book_id, which _track_usage skips
    mock_track.assert_called_once_with("", {"total_tokens": 10})
