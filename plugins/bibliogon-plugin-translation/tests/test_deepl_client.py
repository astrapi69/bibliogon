"""Tests for DeepL client module."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from bibliogon_translation.deepl_client import DeepLClient, DeepLError, DEEPL_LANGUAGES


def test_deepl_languages_has_common_languages():
    assert "DE" in DEEPL_LANGUAGES
    assert "EN" in DEEPL_LANGUAGES
    assert "FR" in DEEPL_LANGUAGES
    assert "ES" in DEEPL_LANGUAGES
    assert "EL" in DEEPL_LANGUAGES


def test_client_free_api_url():
    client = DeepLClient(api_key="test-key", free_api=True)
    assert "api-free.deepl.com" in client.base_url


def test_client_pro_api_url():
    client = DeepLClient(api_key="test-key", free_api=False)
    assert "api.deepl.com" in client.base_url
    assert "api-free" not in client.base_url


@pytest.mark.asyncio
async def test_translate_success():
    client = DeepLClient(api_key="test-key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_success = True
    mock_response.json.return_value = {
        "translations": [{
            "text": "Hello world",
            "detected_source_language": "DE",
        }]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.translate("Hallo Welt", target_lang="EN")
        assert result["translated_text"] == "Hello world"
        assert result["detected_source_language"] == "DE"
        assert result["character_count"] == len("Hallo Welt")


@pytest.mark.asyncio
async def test_translate_invalid_key():
    client = DeepLClient(api_key="invalid")
    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_response.is_success = False

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        with pytest.raises(DeepLError, match="Invalid API key"):
            await client.translate("test", target_lang="EN")


@pytest.mark.asyncio
async def test_translate_quota_exceeded():
    client = DeepLClient(api_key="test-key")
    mock_response = MagicMock()
    mock_response.status_code = 456
    mock_response.is_success = False

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        with pytest.raises(DeepLError, match="Quota exceeded"):
            await client.translate("test", target_lang="EN")


@pytest.mark.asyncio
async def test_translate_no_translations():
    client = DeepLClient(api_key="test-key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_success = True
    mock_response.json.return_value = {"translations": []}

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        with pytest.raises(DeepLError, match="No translation returned"):
            await client.translate("test", target_lang="EN")


@pytest.mark.asyncio
async def test_translate_with_source_lang_and_formality():
    client = DeepLClient(api_key="test-key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.is_success = True
    mock_response.json.return_value = {
        "translations": [{"text": "Translated", "detected_source_language": "DE"}]
    }

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_class.return_value = mock_client

        result = await client.translate(
            "Test", target_lang="EN", source_lang="DE", formality="more"
        )
        assert result["translated_text"] == "Translated"
        # Verify formality was passed in the request
        call_kwargs = mock_client.post.call_args
        assert "more" in str(call_kwargs)
