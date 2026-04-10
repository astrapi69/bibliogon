"""Tests for the generic LLM client."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.ai.llm_client import LLMClient, LLMError


@pytest.fixture
def client():
    return LLMClient(base_url="http://localhost:1234/v1", model="test-model")


@pytest.mark.asyncio
async def test_chat_success(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Hello world"}}],
        "model": "test-model",
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }

    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        result = await client.chat([{"role": "user", "content": "Hi"}])
        assert result["content"] == "Hello world"
        assert result["model"] == "test-model"


@pytest.mark.asyncio
async def test_chat_connection_error(client):
    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        with pytest.raises(LLMError, match="nicht erreichbar"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_chat_no_choices(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"choices": []}

    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        with pytest.raises(LLMError, match="No response"):
            await client.chat([{"role": "user", "content": "Hi"}])


@pytest.mark.asyncio
async def test_generate_with_system_prompt(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Generated text"}}],
        "model": "test-model",
    }

    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        result = await client.generate("Write a poem", system="You are a poet")
        assert result == "Generated text"
        # Verify system message was included
        call_kwargs = mock_http.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        assert payload["messages"][0]["role"] == "system"
        assert payload["messages"][1]["role"] == "user"


@pytest.mark.asyncio
async def test_list_models_success(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "data": [{"id": "llama3"}, {"id": "mistral"}]
    }

    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        models = await client.list_models()
        assert len(models) == 2
        assert models[0]["id"] == "llama3"


@pytest.mark.asyncio
async def test_list_models_offline(client):
    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        models = await client.list_models()
        assert models == []


@pytest.mark.asyncio
async def test_health_ok(client):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"data": [{"id": "llama3"}]}

    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        result = await client.health()
        assert result["status"] == "ok"
        assert "llama3" in result["models"]


@pytest.mark.asyncio
async def test_health_offline(client):
    with patch("httpx.AsyncClient") as mock_class:
        mock_http = AsyncMock()
        mock_http.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_class.return_value = mock_http

        result = await client.health()
        assert result["status"] == "offline"


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
