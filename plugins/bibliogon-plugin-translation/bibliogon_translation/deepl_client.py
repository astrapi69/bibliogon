"""DeepL API client for text translation."""

import httpx

# Supported language pairs (source -> targets)
DEEPL_LANGUAGES = {
    "DE": "Deutsch",
    "EN": "English",
    "ES": "Spanish",
    "FR": "French",
    "EL": "Greek",
    "IT": "Italian",
    "NL": "Dutch",
    "PL": "Polish",
    "PT": "Portuguese",
    "RU": "Russian",
    "JA": "Japanese",
    "ZH": "Chinese",
}


class DeepLError(Exception):
    """Error from DeepL API."""


class DeepLClient:
    """Client for the DeepL Translation API.

    Supports both free and pro API keys.
    Free keys use api-free.deepl.com, pro keys use api.deepl.com.
    """

    def __init__(self, api_key: str, free_api: bool = True) -> None:
        self.api_key = api_key
        base = "https://api-free.deepl.com" if free_api else "https://api.deepl.com"
        self.base_url = f"{base}/v2"

    async def translate(
        self,
        text: str,
        target_lang: str,
        source_lang: str | None = None,
        formality: str = "default",
    ) -> dict:
        """Translate text via DeepL API.

        Args:
            text: Text to translate.
            target_lang: Target language code (e.g. "EN", "DE", "FR").
            source_lang: Source language code (auto-detected if None).
            formality: Formality preference ("default", "more", "less", "prefer_more", "prefer_less").

        Returns:
            Dict with translated_text, detected_source_language, and character_count.
        """
        data: dict[str, str] = {
            "text": text,
            "target_lang": target_lang.upper(),
        }
        if source_lang:
            data["source_lang"] = source_lang.upper()
        if formality != "default":
            data["formality"] = formality

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/translate",
                headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                data=data,
                timeout=60.0,
            )
            if response.status_code == 403:
                raise DeepLError("Invalid API key")
            if response.status_code == 456:
                raise DeepLError("Quota exceeded")
            if not response.is_success:
                raise DeepLError(f"DeepL API error: {response.status_code}")
            result = response.json()

        translations = result.get("translations", [])
        if not translations:
            raise DeepLError("No translation returned")

        first = translations[0]
        return {
            "translated_text": first.get("text", ""),
            "detected_source_language": first.get("detected_source_language", source_lang or ""),
            "character_count": len(text),
        }

    async def usage(self) -> dict:
        """Get API usage statistics."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/usage",
                headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                timeout=10.0,
            )
            if not response.is_success:
                raise DeepLError(f"DeepL API error: {response.status_code}")
            return response.json()

    async def languages(self, type_: str = "target") -> list[dict[str, str]]:
        """Get supported languages from DeepL API."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/languages",
                headers={"Authorization": f"DeepL-Auth-Key {self.api_key}"},
                params={"type": type_},
                timeout=10.0,
            )
            if not response.is_success:
                raise DeepLError(f"DeepL API error: {response.status_code}")
            return response.json()
