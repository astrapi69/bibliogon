"""Tests for the multi-provider LLM client."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.ai.llm_client import LLMClient, LLMError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return LLMClient(base_url="http://localhost:1234/v1", model="test-model")


@pytest.fixture
def anthropic_client():
    return LLMClient(
        base_url="https://api.anthropic.com/v1",
        model="claude-sonnet-4-20250514",
        api_key="sk-ant-test",
        provider="anthropic",
    )


def _mock_http(post_return=None, get_return=None, post_side_effect=None, get_side_effect=None):
    """Helper to build an httpx.AsyncClient mock."""
    mock = AsyncMock()
    if post_side_effect:
        mock.post = AsyncMock(side_effect=post_side_effect)
    elif post_return:
        mock.post = AsyncMock(return_value=post_return)
    if get_side_effect:
        mock.get = AsyncMock(side_effect=get_side_effect)
    elif get_return:
        mock.get = AsyncMock(return_value=get_return)
    mock.__aenter__ = AsyncMock(return_value=mock)
    mock.__aexit__ = AsyncMock(return_value=False)
    return mock


# ---------------------------------------------------------------------------
# OpenAI-compatible path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_success(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Hello world"}}],
        "model": "test-model",
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result["content"] == "Hello world"
        assert result["model"] == "test-model"


@pytest.mark.asyncio
async def test_chat_connection_error(client):
    with patch("httpx.AsyncClient", return_value=_mock_http(post_side_effect=httpx.ConnectError("refused"))):
        with pytest.raises(LLMError, match="nicht erreichbar"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_chat_auth_error(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        with pytest.raises(LLMError, match="ungültig"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_chat_rate_limit(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 429
    mock_response.text = "Too Many Requests"

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        with pytest.raises(LLMError, match="Rate Limit"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_chat_no_choices(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {"choices": []}

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        with pytest.raises(LLMError, match="No response"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_generate_with_system_prompt(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Generated text"}}],
        "model": "test-model",
    }

    mock_http = _mock_http(post_return=mock_response)
    with patch("httpx.AsyncClient", return_value=mock_http):
        result = await client.generate("Write a poem", system="You are a poet")
        assert result == "Generated text"
        call_kwargs = mock_http.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["messages"][0]["role"] == "system"
        assert payload["messages"][1]["role"] == "user"


# ---------------------------------------------------------------------------
# Anthropic adapter
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_anthropic_chat_success(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": [{"type": "text", "text": "Hello from Claude"}],
        "model": "claude-sonnet-4-20250514",
        "usage": {"input_tokens": 8, "output_tokens": 5},
    }

    mock_http = _mock_http(post_return=mock_response)
    with patch("httpx.AsyncClient", return_value=mock_http):
        result = await anthropic_client.chat([{"role": "user", "content": "Hi"}])
        assert result["content"] == "Hello from Claude"
        assert result["usage"]["prompt_tokens"] == 8
        assert result["usage"]["completion_tokens"] == 5
        assert result["usage"]["total_tokens"] == 13

        # Verify Anthropic-specific headers
        call_kwargs = mock_http.post.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers")
        assert headers["x-api-key"] == "sk-ant-test"
        assert "anthropic-version" in headers


@pytest.mark.asyncio
async def test_anthropic_system_message_extracted(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": [{"type": "text", "text": "response"}],
        "model": "claude-sonnet-4-20250514",
        "usage": {"input_tokens": 10, "output_tokens": 3},
    }

    mock_http = _mock_http(post_return=mock_response)
    with patch("httpx.AsyncClient", return_value=mock_http):
        await anthropic_client.chat([
            {"role": "system", "content": "You are helpful"},
            {"role": "user", "content": "Hi"},
        ])

        call_kwargs = mock_http.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        # System should be top-level, not in messages
        assert payload["system"] == "You are helpful"
        assert all(m["role"] != "system" for m in payload["messages"])


@pytest.mark.asyncio
async def test_anthropic_sends_to_messages_endpoint(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": [{"type": "text", "text": "ok"}],
        "model": "claude-sonnet-4-20250514",
        "usage": {"input_tokens": 1, "output_tokens": 1},
    }

    mock_http = _mock_http(post_return=mock_response)
    with patch("httpx.AsyncClient", return_value=mock_http):
        await anthropic_client.chat([{"role": "user", "content": "test"}])

        call_args = mock_http.post.call_args
        url = call_args[0][0] if call_args[0] else call_args.kwargs.get("url", "")
        assert "/messages" in str(url)


@pytest.mark.asyncio
async def test_anthropic_auth_error(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.text = "Invalid API key"

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        with pytest.raises(LLMError, match="ungültig"):
            await anthropic_client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_anthropic_rate_limit(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 429
    mock_response.text = "Rate limited"

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        with pytest.raises(LLMError, match="Rate Limit"):
            await anthropic_client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_anthropic_connection_error(anthropic_client):
    with patch("httpx.AsyncClient", return_value=_mock_http(post_side_effect=httpx.ConnectError("refused"))):
        with pytest.raises(LLMError, match="nicht erreichbar"):
            await anthropic_client.chat([{"role": "user", "content": "Hi"}])


# ---------------------------------------------------------------------------
# Provider detection
# ---------------------------------------------------------------------------

def test_provider_auto_detected_from_base_url():
    client = LLMClient(base_url="https://api.anthropic.com/v1")
    assert client.provider == "anthropic"


def test_provider_explicit_overrides_detection():
    client = LLMClient(base_url="https://api.anthropic.com/v1", provider="custom")
    assert client.provider == "custom"


def test_provider_lmstudio_default():
    client = LLMClient()
    assert client.provider == "lmstudio"


# ---------------------------------------------------------------------------
# list_models
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_models_success(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "data": [{"id": "llama3"}, {"id": "mistral"}]
    }

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        models = await client.list_models()
        assert len(models) == 2
        assert models[0]["id"] == "llama3"


@pytest.mark.asyncio
async def test_list_models_offline(client):
    with patch("httpx.AsyncClient", return_value=_mock_http(get_side_effect=httpx.ConnectError("refused"))):
        models = await client.list_models()
        assert models == []


@pytest.mark.asyncio
async def test_list_models_anthropic_returns_presets(anthropic_client):
    """Anthropic has no /models endpoint, returns preset suggestions instead."""
    models = await anthropic_client.list_models()
    assert len(models) > 0
    model_ids = [m["id"] for m in models]
    assert "claude-sonnet-4-20250514" in model_ids


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_ok(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"id": "llama3"}]}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        result = await client.health()
        assert result["status"] == "ok"
        assert "llama3" in result["models"]


@pytest.mark.asyncio
async def test_health_offline(client):
    with patch("httpx.AsyncClient", return_value=_mock_http(get_side_effect=httpx.ConnectError("refused"))):
        result = await client.health()
        assert result["status"] == "offline"


@pytest.mark.asyncio
async def test_health_auth_error(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.json.return_value = {}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        result = await client.health()
        assert result["status"] == "auth_error"


@pytest.mark.asyncio
async def test_anthropic_health_success(anthropic_client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "content": [{"type": "text", "text": "h"}],
        "usage": {"input_tokens": 1, "output_tokens": 1},
    }

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        result = await anthropic_client.health()
        assert result["status"] == "ok"


@pytest.mark.asyncio
async def test_anthropic_health_no_key():
    client = LLMClient(
        base_url="https://api.anthropic.com/v1",
        provider="anthropic",
        api_key="",
    )
    result = await client.health()
    assert result["status"] == "auth_error"


@pytest.mark.asyncio
async def test_anthropic_health_offline(anthropic_client):
    with patch("httpx.AsyncClient", return_value=_mock_http(post_side_effect=httpx.ConnectError("refused"))):
        result = await anthropic_client.health()
        assert result["status"] == "offline"


# ---------------------------------------------------------------------------
# test_connection
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_test_connection_success(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": [{"id": "test"}]}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        success, error_key, detail = await client.test_connection()
        assert success is True
        assert error_key == ""
        assert detail == ""


@pytest.mark.asyncio
async def test_test_connection_offline(client):
    with patch("httpx.AsyncClient", return_value=_mock_http(get_side_effect=httpx.ConnectError("refused"))):
        success, error_key, detail = await client.test_connection()
        assert success is False
        assert error_key == "offline"


@pytest.mark.asyncio
async def test_test_connection_timeout(client):
    with patch("httpx.AsyncClient", return_value=_mock_http(get_side_effect=httpx.ReadTimeout("timed out"))):
        success, error_key, detail = await client.test_connection()
        assert success is False
        assert error_key == "timeout"


@pytest.mark.asyncio
async def test_test_connection_auth_error(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 401
    mock_response.json.return_value = {"error": {"message": "Invalid API key"}}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        success, error_key, detail = await client.test_connection()
        assert success is False
        assert error_key == "auth_error"
        assert "Invalid API key" in detail


@pytest.mark.asyncio
async def test_test_connection_model_not_found(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 404
    mock_response.json.return_value = {"error": {"message": "model 'foo' not found"}}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        success, error_key, detail = await client.test_connection()
        assert success is False
        assert error_key == "model_not_found"


@pytest.mark.asyncio
async def test_test_connection_server_error(client):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 502
    mock_response.json.return_value = {"message": "Bad Gateway"}

    with patch("httpx.AsyncClient", return_value=_mock_http(get_return=mock_response)):
        success, error_key, detail = await client.test_connection()
        assert success is False
        assert error_key == "server_error"


@pytest.mark.asyncio
async def test_test_connection_detail_passthrough(anthropic_client):
    """Error detail from the provider is passed through to the caller."""
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 400
    mock_response.json.return_value = {"error": {"message": "max_tokens: must be at least 1"}}

    with patch("httpx.AsyncClient", return_value=_mock_http(post_return=mock_response)):
        success, error_key, detail = await anthropic_client.test_connection()
        assert success is False
        assert error_key == "invalid_request"
        assert "max_tokens" in detail


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

def test_client_defaults():
    c = LLMClient()
    assert "1234" in c.base_url
    assert c.temperature == 0.7
    assert c.max_tokens == 2048


def test_client_custom_config():
    c = LLMClient(
        base_url="http://myserver:8080/v1",
        model="gpt-4",
        temperature=0.1,
        api_key="sk-123",
    )
    assert "myserver" in c.base_url
    assert c.model == "gpt-4"
    assert c.api_key == "sk-123"
