"""AI provider presets and configuration schema.

Each preset defines the base URL, default model, and model suggestions
for a supported AI provider. Users can override any value.
"""

from pydantic import BaseModel, Field


class ProviderPreset(BaseModel):
    """Preset configuration for a known AI provider."""

    id: str
    label: str
    base_url: str
    default_model: str
    model_suggestions: list[str] = Field(default_factory=list)
    requires_api_key: bool = True
    note: str = ""


PROVIDER_PRESETS: dict[str, ProviderPreset] = {
    "anthropic": ProviderPreset(
        id="anthropic",
        label="Anthropic (Claude)",
        base_url="https://api.anthropic.com/v1",
        default_model="claude-sonnet-4-20250514",
        model_suggestions=[
            "claude-opus-4-20250514",
            "claude-sonnet-4-20250514",
            "claude-haiku-4-5-20251001",
        ],
    ),
    "openai": ProviderPreset(
        id="openai",
        label="OpenAI (GPT)",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o",
        model_suggestions=["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    ),
    "google": ProviderPreset(
        id="google",
        label="Google (Gemini)",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        default_model="gemini-2.0-flash",
        model_suggestions=["gemini-2.0-flash", "gemini-1.5-pro"],
    ),
    "mistral": ProviderPreset(
        id="mistral",
        label="Mistral",
        base_url="https://api.mistral.ai/v1",
        default_model="mistral-large-latest",
        model_suggestions=[
            "mistral-large-latest",
            "mistral-medium-latest",
            "mistral-small-latest",
        ],
    ),
    "lmstudio": ProviderPreset(
        id="lmstudio",
        label="LM Studio (lokal)",
        base_url="http://localhost:1234/v1",
        default_model="",
        model_suggestions=[],
        requires_api_key=False,
        note="Lokal laufend, kein API-Schlüssel nötig. Modelle werden vom LM Studio Server bereitgestellt.",
    ),
}

PROVIDER_IDS = list(PROVIDER_PRESETS.keys())


def get_provider_preset(provider_id: str) -> ProviderPreset | None:
    """Return the preset for a provider, or None if unknown."""
    return PROVIDER_PRESETS.get(provider_id)


def detect_provider(base_url: str) -> str:
    """Guess the provider from a base URL. Returns 'custom' if unknown."""
    url_lower = base_url.lower().rstrip("/")
    for provider_id, preset in PROVIDER_PRESETS.items():
        if preset.base_url.rstrip("/").lower() in url_lower:
            return provider_id
    if "localhost:1234" in url_lower or "127.0.0.1:1234" in url_lower:
        return "lmstudio"
    return "custom"
