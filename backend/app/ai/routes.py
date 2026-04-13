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


class ReviewRequest(BaseModel):
    """Request for AI-assisted chapter review."""

    content: str = Field(..., min_length=1, description="Chapter text to review")
    chapter_title: str = Field(default="", description="Title of the chapter")
    book_title: str = Field(default="", description="Title of the book")
    language: str = Field(default="de", description="Language code (de, en, ...)")
    focus: list[str] = Field(
        default_factory=lambda: ["style", "coherence", "pacing"],
        description="Review focus areas: style, coherence, pacing, dialogue, tension",
    )


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


def _build_review_system_prompt(language: str, focus: list[str]) -> str:
    """Build the system prompt for chapter review based on language and focus areas."""
    focus_descriptions = {
        "style": "writing style (word choice, sentence variety, readability, voice consistency)",
        "coherence": "coherence and structure (logical flow, paragraph transitions, argument clarity)",
        "pacing": "pacing (scene length balance, tension curve, slow or rushed sections)",
        "dialogue": "dialogue quality (natural speech, character voice distinction, said-bookisms)",
        "tension": "narrative tension (stakes, conflict escalation, reader engagement)",
    }
    focus_list = "\n".join(
        f"- {focus_descriptions.get(f, f)}" for f in focus if f in focus_descriptions
    )

    lang_instruction = ""
    if language == "de":
        lang_instruction = "The chapter is in German. Write your review in German."
    elif language == "en":
        lang_instruction = "The chapter is in English. Write your review in English."
    else:
        lang_instruction = f"The chapter is in language '{language}'. Write your review in that language."

    return f"""You are a professional book editor reviewing a chapter manuscript.

{lang_instruction}

Analyze the chapter for these aspects:
{focus_list}

Structure your review as follows:
1. **Summary**: One sentence summarizing the chapter's content.
2. **Strengths**: 2-3 specific things done well (with brief quotes or references).
3. **Suggestions**: 3-5 concrete, actionable improvements. For each suggestion:
   - State what the issue is
   - Explain why it matters
   - Suggest how to fix it
4. **Overall**: One sentence overall assessment.

Be constructive and specific. Refer to actual passages in the text. Avoid generic advice like "show don't tell" without pointing to a specific instance. Do not rewrite the chapter - give editorial feedback the author can act on."""


@router.post("/review")
async def review_chapter(req: ReviewRequest) -> dict[str, Any]:
    """AI-assisted chapter review for style, coherence, and pacing."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    client = _get_client()
    system_prompt = _build_review_system_prompt(req.language, req.focus)

    user_prompt_parts = []
    if req.book_title:
        user_prompt_parts.append(f"Book: {req.book_title}")
    if req.chapter_title:
        user_prompt_parts.append(f"Chapter: {req.chapter_title}")
    user_prompt_parts.append(f"\n---\n\n{req.content}")
    user_prompt = "\n".join(user_prompt_parts)

    try:
        result = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2048,
        )
        return {
            "review": result["content"],
            "model": result.get("model", ""),
            "usage": result.get("usage", {}),
        }
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/test-connection")
async def test_connection() -> dict[str, Any]:
    """Test the current AI configuration with a minimal request."""
    if not _is_ai_enabled():
        return {"success": False, "error_key": "disabled", "error_detail": ""}
    client = _get_client()
    success, error_key, error_detail = await client.test_connection()
    return {"success": success, "error_key": error_key, "error_detail": error_detail}
