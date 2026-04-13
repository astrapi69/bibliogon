"""Tests for AI provider presets and detection."""

from app.ai.providers import (
    PROVIDER_PRESETS,
    PROVIDER_IDS,
    detect_provider,
    get_provider_preset,
)


def test_all_providers_have_presets():
    """Every provider ID has a matching preset."""
    assert len(PROVIDER_PRESETS) == 5
    for provider_id in PROVIDER_IDS:
        preset = PROVIDER_PRESETS[provider_id]
        assert preset.id == provider_id
        assert preset.label


def test_provider_ids_match_keys():
    """PROVIDER_IDS list matches the dict keys."""
    assert PROVIDER_IDS == list(PROVIDER_PRESETS.keys())


def test_get_provider_preset_known():
    """get_provider_preset returns preset for known providers."""
    preset = get_provider_preset("anthropic")
    assert preset is not None
    assert preset.id == "anthropic"
    assert "anthropic.com" in preset.base_url


def test_get_provider_preset_unknown():
    """get_provider_preset returns None for unknown providers."""
    assert get_provider_preset("nonexistent") is None


def test_detect_provider_anthropic():
    assert detect_provider("https://api.anthropic.com/v1") == "anthropic"


def test_detect_provider_openai():
    assert detect_provider("https://api.openai.com/v1") == "openai"


def test_detect_provider_google():
    assert detect_provider("https://generativelanguage.googleapis.com/v1beta/openai") == "google"


def test_detect_provider_mistral():
    assert detect_provider("https://api.mistral.ai/v1") == "mistral"


def test_detect_provider_lmstudio_default():
    assert detect_provider("http://localhost:1234/v1") == "lmstudio"


def test_detect_provider_lmstudio_ip():
    assert detect_provider("http://127.0.0.1:1234/v1") == "lmstudio"


def test_detect_provider_custom():
    assert detect_provider("http://my-server:8080/v1") == "custom"


def test_anthropic_requires_api_key():
    preset = get_provider_preset("anthropic")
    assert preset is not None
    assert preset.requires_api_key is True


def test_lmstudio_no_api_key_required():
    preset = get_provider_preset("lmstudio")
    assert preset is not None
    assert preset.requires_api_key is False


def test_all_presets_have_base_url():
    for provider_id, preset in PROVIDER_PRESETS.items():
        assert preset.base_url, f"{provider_id} missing base_url"


def test_model_suggestions_are_lists():
    for provider_id, preset in PROVIDER_PRESETS.items():
        assert isinstance(preset.model_suggestions, list), f"{provider_id} suggestions not a list"


def test_cloud_providers_have_model_suggestions():
    """Cloud providers should have at least one model suggestion."""
    for provider_id in ["anthropic", "openai", "google", "mistral"]:
        preset = PROVIDER_PRESETS[provider_id]
        assert len(preset.model_suggestions) > 0, f"{provider_id} has no model suggestions"


def test_lmstudio_has_no_model_suggestions():
    """LM Studio models depend on local setup, so no suggestions."""
    preset = PROVIDER_PRESETS["lmstudio"]
    assert preset.model_suggestions == []
