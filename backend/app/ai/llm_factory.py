"""LLM client factory.

Extracted from ``ai/routes.py`` (God-file split #14, 2026-06-14).
"""

from app.ai.config import _get_ai_config
from app.ai.llm_client import LLMClient


def _get_client() -> LLMClient:
    """Create an LLM client from config."""
    cfg = _get_ai_config()
    return LLMClient(
        base_url=cfg.get("base_url", "http://localhost:1234/v1"),
        model=cfg.get("model", ""),
        temperature=cfg.get("temperature", 0.7),
        max_tokens=cfg.get("max_tokens", 2048),
        api_key=cfg.get("api_key", ""),
        provider=cfg.get("provider", ""),
    )
