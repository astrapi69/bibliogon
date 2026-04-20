"""AI API routes for generic LLM interaction."""

import json
import logging
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.job_store import JobStatus, job_store

from .llm_client import LLMClient, LLMError
from .pricing import estimate_review_cost
from .prompts import (
    CHAPTER_TYPE_GUIDANCE,
    FOCUS_DESCRIPTIONS,
    LANG_MAP,
    NON_PROSE_TYPES,
    build_review_system_prompt,
)
from .providers import PROVIDER_PRESETS
from .review_store import (
    find_report,
    new_review_id,
    slugify,
    write_report,
)

logger = logging.getLogger(__name__)


def _track_usage(book_id: str, usage: dict[str, int]) -> None:
    """Increment ai_tokens_used on a book. Best-effort, never raises."""
    total = usage.get("total_tokens", 0) or (
        usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
    )
    if not total or not book_id:
        return
    try:
        from app.database import SessionLocal
        from app.models import Book

        with SessionLocal() as db:
            book = db.query(Book).filter(Book.id == book_id).first()
            if book:
                book.ai_tokens_used = (book.ai_tokens_used or 0) + total
                db.commit()
    except Exception:
        logger.debug("Failed to track AI usage for book %s", book_id, exc_info=True)


router = APIRouter(prefix="/ai", tags=["ai"])


def _get_ai_config() -> dict[str, Any]:
    """Read AI config from app.yaml."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return {}
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        ai_config = config.get("ai", {})
        return ai_config if isinstance(ai_config, dict) else {}
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
    book_id: str = Field(default="", description="Book ID for usage tracking")


class ReviewRequest(BaseModel):
    """Request for AI-assisted chapter review."""

    content: str = Field(..., min_length=1, description="Chapter text to review")
    chapter_id: str = Field(
        default="", description="Chapter id, used for report filename slug fallback"
    )
    chapter_title: str = Field(default="", description="Title of the chapter")
    chapter_type: str = Field(
        default="chapter",
        description="Chapter type (ChapterType enum value) for tailored review guidance",
    )
    book_title: str = Field(default="", description="Title of the book")
    genre: str = Field(default="", description="Book genre for tone-appropriate feedback")
    language: str = Field(
        default="de", description="Language code (de, en, es, fr, el, pt, tr, ja)"
    )
    focus: list[str] = Field(
        default_factory=lambda: ["style", "coherence", "pacing"],
        description=(
            "Review focus areas: style, coherence, pacing, dialogue, tension, "
            "consistency, beta_reader"
        ),
    )
    book_id: str = Field(default="", description="Book ID for usage tracking + report storage")


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
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/generate")
async def generate_text(req: GenerateRequest) -> dict[str, Any]:
    """Simple text generation with optional system prompt."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")
    client = _get_client()
    messages: list[dict[str, str]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.append({"role": "user", "content": req.prompt})
    try:
        result = await client.chat(
            messages=messages,
            model=req.model,
            temperature=req.temperature,
        )
        usage = result.get("usage", {})
        _track_usage(req.book_id, usage)
        return {"content": result["content"], "usage": usage}
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


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


def _build_review_system_prompt(
    language: str,
    focus: list[str],
    genre: str = "",
    chapter_type: str = "chapter",
) -> str:
    """Backwards-compatible alias for `prompts.build_review_system_prompt`.

    Kept so existing imports (`from app.ai.routes import
    _build_review_system_prompt`) keep working; new call sites should
    import from `app.ai.prompts` directly.
    """
    return build_review_system_prompt(language, focus, genre, chapter_type)


@router.post("/review")
async def review_chapter(req: ReviewRequest) -> dict[str, Any]:
    """AI-assisted chapter review for style, coherence, and pacing."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    client = _get_client()
    system_prompt = build_review_system_prompt(
        req.language, req.focus, genre=req.genre, chapter_type=req.chapter_type
    )

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
        usage = result.get("usage", {})
        _track_usage(req.book_id, usage)
        return {
            "review": result["content"],
            "model": result.get("model", ""),
            "usage": usage,
        }
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


class MarketingRequest(BaseModel):
    """Request for AI-generated marketing text."""

    field: str = Field(
        ...,
        description="Which field to generate: html_description, backpage_description, backpage_author_bio, keywords",
    )
    book_title: str = Field(..., min_length=1)
    author: str = Field(default="")
    genre: str = Field(default="")
    language: str = Field(default="de")
    description: str = Field(default="", description="Existing book description for context")
    chapter_titles: list[str] = Field(
        default_factory=list, description="Chapter titles for context"
    )
    existing_text: str = Field(default="", description="Current field value to refine")
    book_id: str = Field(default="", description="Book ID for usage tracking")


_MARKETING_PROMPTS: dict[str, str] = {
    "html_description": """Write a compelling book description for an online book store (e.g. Amazon KDP).

Rules:
- Use simple HTML: <p>, <b>, <i>, <br> tags only. No headings, no lists.
- 150-300 words.
- Start with a hook that grabs attention.
- Describe the premise without spoilers.
- End with a question or teaser that makes the reader want to buy.
- Do NOT include the title or author name in the description.
- Write in {language}.""",
    "backpage_description": """Write a back cover description for a printed book.

Rules:
- Plain text, no HTML.
- 80-150 words (must fit on a physical back cover).
- Concise, punchy, enticing.
- Write in {language}.""",
    "backpage_author_bio": """Write a short author biography for the back cover of a book.

Rules:
- Plain text, no HTML.
- 50-100 words.
- Third person ("The author..." / "Der Autor...").
- Professional but warm tone.
- If no specific details are provided, write a plausible generic bio based on the genre.
- Write in {language}.""",
    "keywords": """Generate 7 Amazon KDP keywords (search terms) for this book.

Rules:
- Return ONLY a JSON array of strings, e.g. ["keyword 1", "keyword 2", ...]
- Each keyword can be a phrase (2-4 words are ideal for Amazon).
- Focus on what readers would search for.
- Include genre terms, theme terms, and comparable-title terms.
- No duplicates, no single-character entries.
- Write keywords in {language}.""",
}


def _build_marketing_prompt(field: str, req: MarketingRequest) -> tuple[str, str]:
    """Build system and user prompts for marketing text generation."""
    lang_name = LANG_MAP.get(req.language, req.language)

    system = _MARKETING_PROMPTS[field].replace("{language}", lang_name)

    parts = [f"Title: {req.book_title}"]
    if req.author:
        parts.append(f"Author: {req.author}")
    if req.genre:
        parts.append(f"Genre: {req.genre}")
    if req.description:
        parts.append(f"Description: {req.description}")
    if req.chapter_titles:
        parts.append(f"Chapter titles: {', '.join(req.chapter_titles[:20])}")
    if req.existing_text:
        parts.append(f"\nCurrent text to improve:\n{req.existing_text}")

    return system, "\n".join(parts)


@router.post("/generate-marketing")
async def generate_marketing(req: MarketingRequest) -> dict[str, Any]:
    """Generate marketing text (blurb, backpage, bio, keywords) for a book."""
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    if req.field not in _MARKETING_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown field: {req.field}. Must be one of: {', '.join(_MARKETING_PROMPTS)}",
        )

    client = _get_client()
    system_prompt, user_prompt = _build_marketing_prompt(req.field, req)

    try:
        result = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1024,
        )
        usage = result.get("usage", {})
        _track_usage(req.book_id, usage)
        return {
            "content": result["content"],
            "field": req.field,
            "model": result.get("model", ""),
            "usage": usage,
        }
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/test-connection")
async def test_connection() -> dict[str, Any]:
    """Test the current AI configuration with a minimal request."""
    if not _is_ai_enabled():
        return {"success": False, "error_key": "disabled", "error_detail": ""}
    client = _get_client()
    success, error_key, error_detail = await client.test_connection()
    return {"success": success, "error_key": error_key, "error_detail": error_detail}


# ---------------------------------------------------------------------------
# Async review flow (persistent Markdown reports + SSE progress)
# ---------------------------------------------------------------------------


class ReviewCostEstimateRequest(BaseModel):
    """Request payload for the cost-estimate helper."""

    content: str = Field(..., min_length=1)
    model: str = Field(default="")


@router.post("/review/estimate")
def estimate_review(req: ReviewCostEstimateRequest) -> dict[str, Any]:
    """Rough input/output token and USD cost estimate for a review call.

    Used by the UI to show "Start Review (~N tokens, ~$X)" on the
    start button before the call runs. Always responds 200; missing
    model or unknown model returns `cost_usd: null`.
    """
    model = req.model or _get_ai_config().get("model", "")
    input_tokens, output_tokens, cost = estimate_review_cost(model, req.content)
    return {
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost,
    }


@router.get("/review/meta")
def review_meta() -> dict[str, Any]:
    """UI-facing metadata: focus values, non-prose types, supported languages.

    Frontend uses this to drive the radio buttons, warning logic, and
    (future) language selector without hardcoding the lists.
    """
    return {
        "focus_values": sorted(FOCUS_DESCRIPTIONS.keys()),
        "primary_focus": ["style", "consistency", "beta_reader"],
        "non_prose_types": sorted(NON_PROSE_TYPES),
        "languages": sorted(LANG_MAP.keys()),
        "chapter_types": sorted(CHAPTER_TYPE_GUIDANCE.keys()),
    }


async def _run_review_job(
    job_id: str,
    req: ReviewRequest,
    review_id: str,
) -> dict[str, Any]:
    """Background worker: call the LLM, persist the Markdown, publish events."""
    job_store.publish_event(
        job_id,
        "review_start",
        {"focus": req.focus, "chapter_type": req.chapter_type, "language": req.language},
    )

    client = _get_client()
    system_prompt = build_review_system_prompt(
        req.language, req.focus, genre=req.genre, chapter_type=req.chapter_type
    )

    user_prompt_parts = []
    if req.book_title:
        user_prompt_parts.append(f"Book: {req.book_title}")
    if req.chapter_title:
        user_prompt_parts.append(f"Chapter: {req.chapter_title}")
    user_prompt_parts.append(f"\n---\n\n{req.content}")
    user_prompt = "\n".join(user_prompt_parts)

    job_store.publish_event(job_id, "review_llm_call", {"model": ""})

    try:
        result = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2048,
        )
    except LLMError as exc:
        job_store.publish_event(job_id, "review_error", {"error": str(exc)})
        raise

    review_markdown = result["content"]
    usage = result.get("usage", {})
    _track_usage(req.book_id, usage)

    chapter_slug = slugify(req.chapter_title or req.chapter_id or review_id)
    if req.book_id:
        path = write_report(req.book_id, review_id, chapter_slug, review_markdown)
        download_url = f"/api/ai/review/{review_id}/report.md?book_id={req.book_id}"
    else:
        # No book context - skip persistence; inline-only review.
        path = None
        download_url = None

    job_store.publish_event(
        job_id,
        "review_done",
        {
            "review_id": review_id,
            "download_url": download_url,
            "filename": path.name if path else None,
        },
    )
    return {
        "review_id": review_id,
        "review": review_markdown,
        "model": result.get("model", ""),
        "usage": usage,
        "download_url": download_url,
        "filename": path.name if path else None,
    }


@router.post("/review/async")
async def review_chapter_async(req: ReviewRequest) -> dict[str, str]:
    """Submit an AI review as a background job and return a job_id.

    Progress and the final report land on
    `GET /api/ai/jobs/{job_id}/stream` (SSE). The persisted Markdown
    is downloadable from `/api/ai/review/{review_id}/report.md`.
    """
    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    review_id = new_review_id()

    async def _runner(job_id: str) -> dict[str, Any]:
        return await _run_review_job(job_id, req, review_id)

    job_id = job_store.submit(_runner)
    return {"job_id": job_id, "review_id": review_id}


@router.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    """Poll a review job's current status, progress, and (if terminal) result."""
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "status": job.status.value,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
    }


@router.get("/jobs/{job_id}/stream")
async def stream_review_job(job_id: str) -> StreamingResponse:
    """SSE stream of review job events; mirrors the export plugin pattern."""
    if job_store.get(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator() -> Any:
        async for event in job_store.subscribe(job_id):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/jobs/{job_id}", status_code=204)
def cancel_review_job(job_id: str) -> None:
    """Cancel a running review job."""
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Job already finished")
    job_store.cancel(job_id)


@router.get("/review/{review_id}/report.md")
def download_review_report(review_id: str, book_id: str) -> FileResponse:
    """Download a persisted review as Markdown."""
    if not book_id:
        raise HTTPException(status_code=422, detail="book_id query parameter is required")
    path = find_report(book_id, review_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Review report not found")
    return FileResponse(
        path=str(path),
        media_type="text/markdown",
        filename=path.name,
    )
