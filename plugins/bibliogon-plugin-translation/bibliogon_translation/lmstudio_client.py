"""LMStudio client for local LLM translation.

LMStudio exposes an OpenAI-compatible API at localhost:1234/v1.
This client uses the chat completions endpoint for translation.
"""

import httpx


class LMStudioError(Exception):
    """Error from LMStudio API."""


# System prompt template for translation
_SYSTEM_PROMPT = (
    "You are a professional translator. Translate the following text "
    "from {source_lang} to {target_lang}. "
    "Preserve all formatting, paragraph structure, and meaning. "
    "Only output the translated text, nothing else."
)

LANGUAGE_NAMES = {
    "de": "German",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "el": "Greek",
    "it": "Italian",
    "nl": "Dutch",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "zh": "Chinese",
}


class LMStudioClient:
    """Client for LMStudio's OpenAI-compatible local API.

    Translates text using a locally running LLM model.
    Default endpoint: http://localhost:1234/v1
    """

    def __init__(
        self,
        base_url: str = "http://localhost:1234/v1",
        model: str = "default",
        temperature: float = 0.3,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature

    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
    ) -> dict:
        """Translate text via local LLM.

        Args:
            text: Text to translate.
            target_lang: Target language code (e.g. "en", "de").
            source_lang: Source language code ("auto" for auto-detect).

        Returns:
            Dict with translated_text and model used.
        """
        source_name = LANGUAGE_NAMES.get(source_lang.lower(), source_lang)
        target_name = LANGUAGE_NAMES.get(target_lang.lower(), target_lang)

        if source_lang == "auto":
            source_name = "the source language (auto-detect)"

        system_prompt = _SYSTEM_PROMPT.format(
            source_lang=source_name,
            target_lang=target_name,
        )

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            "temperature": self.temperature,
            "stream": False,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    timeout=120.0,
                )
            except httpx.ConnectError:
                raise LMStudioError(
                    "Cannot connect to LMStudio. Is it running at " + self.base_url + "?"
                )
            if not response.is_success:
                raise LMStudioError(f"LMStudio API error: {response.status_code}")
            result = response.json()

        choices = result.get("choices", [])
        if not choices:
            raise LMStudioError("No translation returned from LLM")

        translated = choices[0].get("message", {}).get("content", "").strip()
        return {
            "translated_text": translated,
            "detected_source_language": source_lang,
            "model": result.get("model", self.model),
            "character_count": len(text),
        }

    async def health(self) -> dict:
        """Check if LMStudio is running and responsive."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/models",
                    timeout=5.0,
                )
                if response.is_success:
                    models = response.json().get("data", [])
                    return {
                        "status": "ok",
                        "models": [m.get("id", "") for m in models],
                    }
                return {"status": "error", "error": f"HTTP {response.status_code}"}
            except httpx.ConnectError:
                return {"status": "offline", "error": "LMStudio not running"}
