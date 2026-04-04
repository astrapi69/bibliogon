"""Tests for LMStudio client module."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

import httpx

from bibliogon_translation.lmstudio_client import LMStudioClient, LMStudioError, LANGUAGE_NAMES


def test_language_names_has_common_languages():
    assert "de" in LANGUAGE_NAMES
    assert "en" in LANGUAGE_NAMES
    assert "fr" in LANGUAGE_NAMES
    assert "es" in LANGUAGE_NAMES
    assert "el" in LANGUAGE_NAMES


def test_client_default_url():
    client = LMStudioClient()
    assert "localhost:1234" in client.base_url


def test_client_custom_url():
    client = LMStudioClient(base_url="http://myserver:8080/v1")
    assert "myserver:8080" in client.base_url


@pytest.mark.asyncio
async def test_translate_success():
    client = LMStudioClient()
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Hello world"}}],
        "model": "llama-3",
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.translate("Hallo Welt", target_lang="en", source_lang="de")
        assert result["translated_text"] == "Hello world"
        assert result["model"] == "llama-3"
        assert result["character_count"] == len("Hallo Welt")


@pytest.mark.asyncio
async def test_translate_connection_error():
    client = LMStudioClient()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        with pytest.raises(LMStudioError, match="Cannot connect"):
            await client.translate("test", target_lang="en")


@pytest.mark.asyncio
async def test_translate_no_choices():
    client = LMStudioClient()
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {"choices": []}

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        with pytest.raises(LMStudioError, match="No translation returned"):
            await client.translate("test", target_lang="en")


@pytest.mark.asyncio
async def test_translate_auto_detect_source():
    client = LMStudioClient()
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Result"}}],
        "model": "default",
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.translate("test", target_lang="de", source_lang="auto")
        assert result["detected_source_language"] == "auto"
        # Verify system prompt mentions auto-detect
        call_kwargs = mock_client.post.call_args
        payload = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
        system_msg = payload["messages"][0]["content"]
        assert "auto-detect" in system_msg


@pytest.mark.asyncio
async def test_health_ok():
    client = LMStudioClient()
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "data": [{"id": "llama-3"}, {"id": "mistral-7b"}]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.health()
        assert result["status"] == "ok"
        assert "llama-3" in result["models"]


@pytest.mark.asyncio
async def test_health_offline():
    client = LMStudioClient()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.health()
        assert result["status"] == "offline"
