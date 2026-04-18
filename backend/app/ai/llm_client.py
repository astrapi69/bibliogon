"""Generic LLM client for OpenAI-compatible APIs and Anthropic.

Supports five provider types:
- OpenAI, Google (Gemini), Mistral, LM Studio: OpenAI-compatible endpoint
- Anthropic: native /v1/messages endpoint with request/response adapter

Default endpoints:
- LMStudio: http://localhost:1234/v1
- Ollama:   http://localhost:11434/v1
"""

import logging
from typing import Any

import httpx

from .providers import detect_provider

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """Error from LLM API."""


class LLMClient:
    """Multi-provider LLM client.

    Works with OpenAI-compatible servers (OpenAI, Gemini, Mistral, LM Studio)
    and Anthropic's native /v1/messages API.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:1234/v1",
        model: str = "",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        api_key: str = "",
        provider: str = "",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.api_key = api_key
        self.provider = provider or detect_provider(self.base_url)

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
        if self.provider == "anthropic":
            return await self._chat_anthropic(
                messages, model=model, temperature=temperature, max_tokens=max_tokens
            )
        return await self._chat_openai_compatible(
            messages, model=model, temperature=temperature, max_tokens=max_tokens
        )

    async def _chat_openai_compatible(
        self,
        messages: list[dict[str, str]],
        model: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Standard OpenAI Chat Completions format."""
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
            except httpx.ConnectError as e:
                raise LLMError(
                    f"KI-Server nicht erreichbar ({self.base_url}). "
                    "Starte LMStudio oder Ollama, oder deaktiviere die KI-Funktion "
                    "in Einstellungen > App > AI."
                ) from e

            if response.status_code == 401:
                raise LLMError("API-Schluessel ungueltig oder fehlend.")
            if response.status_code == 429:
                raise LLMError("Rate Limit erreicht. Bitte warten.")
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

    async def _chat_anthropic(
        self,
        messages: list[dict[str, str]],
        model: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Anthropic /v1/messages adapter.

        Converts OpenAI-style messages to Anthropic format and back.
        """
        resolved_model = model or self.model
        resolved_temp = temperature if temperature is not None else self.temperature
        resolved_max = max_tokens or self.max_tokens or 2048

        # Split system message from conversation messages
        system_text = ""
        conversation: list[dict[str, str]] = []
        for msg in messages:
            if msg.get("role") == "system":
                system_text = msg.get("content", "")
            else:
                conversation.append({"role": msg["role"], "content": msg.get("content", "")})

        # Anthropic requires at least one user message
        if not conversation:
            conversation = [{"role": "user", "content": ""}]

        payload: dict[str, Any] = {
            "model": resolved_model,
            "messages": conversation,
            "max_tokens": resolved_max,
            "temperature": resolved_temp,
        }
        if system_text:
            payload["system"] = system_text

        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=headers,
                    timeout=120.0,
                )
            except httpx.ConnectError as e:
                raise LLMError(
                    f"KI-Server nicht erreichbar ({self.base_url}). "
                    "Pruefe die Anthropic API-Verbindung."
                ) from e

            if response.status_code == 401:
                raise LLMError("API-Schluessel ungueltig oder fehlend.")
            if response.status_code == 429:
                raise LLMError("Rate Limit erreicht. Bitte warten.")
            if not response.is_success:
                raise LLMError(f"Anthropic API error: {response.status_code} {response.text[:200]}")

            result = response.json()

        # Extract text from Anthropic content blocks
        content_blocks = result.get("content", [])
        text_parts = [
            block.get("text", "") for block in content_blocks if block.get("type") == "text"
        ]
        content = "\n".join(text_parts).strip()

        # Map Anthropic usage to OpenAI-style usage
        anthropic_usage = result.get("usage", {})
        usage = {
            "prompt_tokens": anthropic_usage.get("input_tokens", 0),
            "completion_tokens": anthropic_usage.get("output_tokens", 0),
            "total_tokens": (
                anthropic_usage.get("input_tokens", 0)
                + anthropic_usage.get("output_tokens", 0)
            ),
        }

        return {
            "content": content,
            "model": result.get("model", resolved_model),
            "usage": usage,
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
        return str(result["content"])

    async def list_models(self) -> list[dict[str, str]]:
        """List available models from the LLM server.

        Note: Anthropic does not expose a /models endpoint.
        For Anthropic, returns the configured model suggestions from the preset.
        """
        if self.provider == "anthropic":
            from .providers import get_provider_preset

            preset = get_provider_preset("anthropic")
            if preset:
                return [{"id": m, "name": m} for m in preset.model_suggestions]
            return []

        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=headers,
                    timeout=10.0,
                )
                if response.is_success:
                    data = response.json().get("data", [])
                    return [{"id": m.get("id", ""), "name": m.get("id", "")} for m in data]
                return []
            except httpx.ConnectError:
                return []

    async def health(self) -> dict[str, Any]:
        """Check if the LLM server is running and responsive.

        Returns a dict with 'status' and optional 'error' detail.
        Status values: ok, auth_error, rate_limited, offline, timeout,
        model_not_found, invalid_request, server_error, error.
        """
        if self.provider == "anthropic":
            return await self._health_anthropic()

        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=headers,
                    timeout=5.0,
                )
                return self._classify_response(response)
            except httpx.ConnectError:
                return {"status": "offline", "url": self.base_url}
            except httpx.TimeoutException:
                return {"status": "timeout", "error": "Request timed out"}
            except httpx.HTTPError as exc:
                return {"status": "error", "error": str(exc)}

    async def _health_anthropic(self) -> dict[str, Any]:
        """Health check for Anthropic using a minimal messages request."""
        if not self.api_key:
            return {"status": "auth_error", "error": "Kein API-Schluessel konfiguriert"}

        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": self.model or "claude-haiku-4-5-20251001",
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 1,
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/messages",
                    json=payload,
                    headers=headers,
                    timeout=10.0,
                )
                if response.is_success:
                    return {"status": "ok", "url": self.base_url, "models": []}
                return self._classify_response(response)
            except httpx.ConnectError:
                return {"status": "offline", "url": self.base_url}
            except httpx.TimeoutException:
                return {"status": "timeout", "error": "Request timed out"}
            except httpx.HTTPError as exc:
                return {"status": "error", "error": str(exc)}

    @staticmethod
    def _classify_response(response: httpx.Response) -> dict[str, Any]:
        """Map an HTTP error response to a structured status dict."""
        status_code = response.status_code

        if response.is_success:
            models = response.json().get("data", [])
            return {
                "status": "ok",
                "models": [m.get("id", "") for m in models] if isinstance(models, list) else [],
            }

        # Extract detail from JSON body if available
        detail = ""
        try:
            body = response.json()
            detail = (
                body.get("error", {}).get("message", "")
                if isinstance(body.get("error"), dict)
                else body.get("detail", body.get("message", ""))
            )
        except Exception:
            detail = response.text[:200]

        if status_code in (401, 403):
            return {"status": "auth_error", "error": detail or "API key invalid"}
        if status_code == 429:
            return {"status": "rate_limited", "error": detail or "Rate limit reached"}
        if status_code == 404:
            return {"status": "model_not_found", "error": detail or "Model not found"}
        if status_code == 400:
            return {"status": "invalid_request", "error": detail or "Bad request"}
        if status_code == 408:
            return {"status": "timeout", "error": detail or "Request timed out"}
        if status_code >= 500:
            return {"status": "server_error", "error": detail or f"Server error (HTTP {status_code})"}

        return {"status": "error", "error": detail or f"HTTP {status_code}"}

    async def test_connection(self) -> tuple[bool, str, str]:
        """Minimal test call.

        Returns:
            (success, error_key, error_detail).
            error_key: ok, auth_error, rate_limited, offline, timeout,
                       model_not_found, invalid_request, server_error, error.
            error_detail: human-readable detail from the provider (empty on success).
        """
        result = await self.health()
        status = result.get("status", "error")
        detail = result.get("error", "")
        if status == "ok":
            return (True, "", "")
        return (False, status, detail)
