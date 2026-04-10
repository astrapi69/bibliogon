"""Generic LLM client for OpenAI-compatible APIs (Ollama, LMStudio).

Both Ollama and LMStudio expose the same OpenAI-compatible API at
/v1/chat/completions. This client works with either backend.

Default endpoints:
- LMStudio: http://localhost:1234/v1
- Ollama:   http://localhost:11434/v1
"""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Error from LLM API."""


class LLMClient:
    """Generic OpenAI-compatible LLM client.

    Works with LMStudio, Ollama, and any other OpenAI-compatible server.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:1234/v1",
        model: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        api_key: str = "",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_key = api_key

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Send a chat completion request.

        Args:
            messages: List of {role, content} message dicts.
            model: Override default model.
            temperature: Override default temperature.
            max_tokens: Override default max tokens.

        Returns:
            Dict with content, model, usage.
        """
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.temperature,
            "stream": False,
        }
        if max_tokens or self.max_tokens:
            payload["max_tokens"] = max_tokens or self.max_tokens

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=120.0,
                )
            except httpx.ConnectError:
                raise LLMError(
                    f"KI-Server nicht erreichbar ({self.base_url}). "
                    "Starte LMStudio oder Ollama, oder deaktiviere die KI-Funktion "
                    "in Einstellungen > App > AI."
                )

            if not response.is_success:
                raise LLMError(f"LLM API error: {response.status_code} {response.text[:200]}")

            result = response.json()

        choices = result.get("choices", [])
        if not choices:
            raise LLMError("No response from LLM")

        content = choices[0].get("message", {}).get("content", "").strip()
        return {
            "content": content,
            "model": result.get("model", model or self.model),
            "usage": result.get("usage", {}),
        }

    async def generate(
        self,
        prompt: str,
        system: str = "",
        model: str = "",
        temperature: float | None = None,
    ) -> str:
        """Simple text generation with optional system prompt.

        Returns the generated text string.
        """
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        result = await self.chat(messages, model=model, temperature=temperature)
        return result["content"]

    async def list_models(self) -> list[dict[str, str]]:
        """List available models from the LLM server."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/models",
                    timeout=10.0,
                )
                if response.is_success:
                    data = response.json().get("data", [])
                    return [{"id": m.get("id", ""), "name": m.get("id", "")} for m in data]
                return []
            except httpx.ConnectError:
                return []

    async def health(self) -> dict[str, Any]:
        """Check if the LLM server is running and responsive."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{self.base_url}/models", timeout=5.0)
                if response.is_success:
                    models = response.json().get("data", [])
                    return {
                        "status": "ok",
                        "url": self.base_url,
                        "models": [m.get("id", "") for m in models],
                    }
                return {"status": "error", "error": f"HTTP {response.status_code}"}
            except httpx.ConnectError:
                return {"status": "offline", "url": self.base_url}
