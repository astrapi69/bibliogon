"""AI API routes for generic LLM interaction."""

import logging
from typing import Any

import yaml
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .llm_client import LLMClient, LLMError
from .providers import PROVIDER_PRESETS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


def _get_ai_config() -> dict[str, Any]:
    """Read AI config from app.yaml."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return {}
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return config.get("ai", {})
    except Exception:
        return {}


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


def _is_ai_enabled() -> bool:
    """Check if AI features are enabled in config."""
    cfg = _get_ai_config()
    return bool(cfg.get("enabled", False))


class ChatRequest(BaseModel):
    """Request for chat completion."""

    messages: list[dict[str, str]] = Field(..., min_length=1)
    model: str = Field(default="")
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=16384)


class GenerateRequest(BaseModel):
    """Request for simple text generation."""

    prompt: str = Field(..., min_length=1)
    system: str = Field(default="")
    model: str = Field(default="")
    temperature: float | None = Field(default=None, ge=0, le=2)


@router.post("/chat")
async def chat_completion(req: ChatRequest) -> dict[str, Any]:
    """Send a chat completion request to the configured LLM server."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")
    client = _get_client()
    try:
        return await client.chat(
            messages=req.messages,
            model=req.model,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/generate")
async def generate_text(req: GenerateRequest) -> dict[str, str]:
    """Simple text generation with optional system prompt."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")
    client = _get_client()
    try:
        content = await client.generate(
            prompt=req.prompt,
            system=req.system,
            model=req.model,
            temperature=req.temperature,
        )
        return {"content": content}
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/models")
async def list_models() -> list[dict[str, str]]:
    """List available models from the LLM server."""
    if not _is_ai_enabled():
        return []
    client = _get_client()
    return await client.list_models()


@router.get("/health")
async def ai_health() -> dict[str, Any]:
    """Check LLM server health."""
    if not _is_ai_enabled():
        return {"status": "disabled"}
    client = _get_client()
    return await client.health()


@router.get("/providers")
async def list_providers() -> list[dict[str, Any]]:
    """List all known AI provider presets."""
    return [preset.model_dump() for preset in PROVIDER_PRESETS.values()]


@router.get("/test-connection")
async def test_connection() -> dict[str, Any]:
    """Test the current AI configuration with a minimal request."""
    if not _is_ai_enabled():
        return {"success": False, "error_key": "disabled", "error_detail": ""}
    client = _get_client()
    success, error_key, error_detail = await client.test_connection()
    return {"success": success, "error_key": error_key, "error_detail": error_detail}
