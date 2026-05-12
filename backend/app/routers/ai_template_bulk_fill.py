"""Bulk AI-fill endpoints with per-item cost-estimate breakdown
and SSE progress streaming.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 9/10. Six
endpoints in one router file, three per type:

- POST /api/articles/bulk-ai-fill/estimate     pre-flight estimate
- POST /api/articles/bulk-ai-fill/start        start async job
- GET  /api/articles/bulk-ai-fill/jobs/{job_id}/stream  SSE
- POST /api/books/bulk-ai-fill/estimate
- POST /api/books/bulk-ai-fill/start
- GET  /api/books/bulk-ai-fill/jobs/{job_id}/stream

The estimate endpoint addresses carry-forward Q6: the response
carries per-item breakdown so the UI can show the user exactly
what each item costs before they confirm. Estimates use the
``app.ai.pricing.estimate_tokens`` heuristic on the real
prompts (built via the same prompt builders the fill worker
will call) plus per-class output-token heuristics; both are
summed across items for the totals.

The start endpoint submits a background job via the existing
``app.job_store`` infrastructure. The job worker reuses
``fill_article_with_ai`` / ``fill_book_with_ai`` from
commits 5 + 7 (refactored in this commit) so per-item
semantics stay identical between single and bulk paths.

The SSE stream mirrors the audiobook precedent. Event types:

- ``start``         {total, field_classes, rate_limit_seconds}
- ``item_start``    {id, index, title}
- ``item_done``     {id, index, updated_fields, skipped_fields,
                     tokens, cost_usd, field_class_errors}
- ``item_skipped``  {id, index, reason}
- ``item_error``    {id, index, error}
- ``done``          {total_items, items_updated, total_tokens,
                     total_cost_usd}
- ``stream_end``    appended automatically by job_store on
                    terminal status

Per S8 the cap is MAX_BULK_AI_FILL = 50, enforced on every
request (start AND estimate) via Pydantic ``max_length``.
Rate-limit pacing reads ``ai.rate_limit_seconds`` from the
merged app config; default 1.0 second between items.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Final

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.pricing import estimate_cost_usd, estimate_tokens
from app.ai.template_schema import extract_body_text
from app.database import SessionLocal, get_db
from app.job_store import job_store
from app.models import Article, Book
from app.routers.article_ai_fill import (
    _FIELD_CLASSES as _ARTICLE_FIELD_CLASSES,
)
from app.routers.article_ai_fill import (
    _inline_image_count,
    fill_article_with_ai,
)
from app.routers.book_ai_fill import (
    _FIELD_CLASSES as _BOOK_FIELD_CLASSES,
)
from app.routers.book_ai_fill import (
    _aggregate_book_body,
    _build_chapter_input,
    fill_book_with_ai,
)

logger = logging.getLogger(__name__)

# Default cap on the number of items per bulk AI-fill request.
# Configurable at runtime via ``ai.bulk.max_ai_fill`` in
# app.yaml (AI-FILL-CAP-CONFIG-01). Stays exported for callers
# that want the documented default without reaching into the
# config. The active runtime cap is resolved per request via
# ``_get_active_bulk_ai_fill_cap()`` so a YAML edit takes
# effect immediately without a restart.
MAX_BULK_AI_FILL: Final = 50
DEFAULT_RATE_LIMIT_SECONDS: Final = 1.0


def _get_active_bulk_ai_fill_cap() -> int:
    """Resolve the active per-batch cap. Reads
    ``ai.bulk.max_ai_fill`` from the merged config; falls back
    to ``MAX_BULK_AI_FILL`` when the key is missing or carries
    an invalid value. Lazy import to keep the routes.py <->
    main.py cycle off the import path."""
    from app.ai.routes import _get_bulk_ai_caps

    return _get_bulk_ai_caps()[0]


def _enforce_bulk_ai_fill_cap(id_count: int) -> None:
    """Raise HTTP 422 when the request exceeds the runtime cap.
    The cap is read inside the handler so a YAML edit takes
    effect on the next request; this is intentionally NOT a
    Pydantic field-level ``max_length`` constraint (the
    constraint would freeze the cap at import time)."""
    cap = _get_active_bulk_ai_fill_cap()
    if id_count > cap:
        raise HTTPException(
            status_code=422,
            detail=f"Request contains {id_count} ids; cap is {cap}",
        )


articles_router = APIRouter(prefix="/articles/bulk-ai-fill", tags=["article-ai-fill"])
books_router = APIRouter(prefix="/books/bulk-ai-fill", tags=["book-ai-fill"])


# ---------------------------------------------------------------------------
# Output-token heuristics per field-class
# ---------------------------------------------------------------------------

# Each value is a "reasonable upper bound" on the LLM's output for
# that class. The estimate is intentionally conservative (lean
# toward over-estimating cost) so a "you will spend $X" dialog is
# never a lower bound surprise after the fact.

_ARTICLE_OUTPUT_TOKENS: dict[str, int] = {
    "seo": 200,
    "tags": 80,
    "topic": 30,
    "excerpt": 100,
    "image_prompts": 600,  # featured + up-to-5 inline
}

_BOOK_OUTPUT_TOKENS_NON_CHAPTER: dict[str, int] = {
    "marketing_copy": 600,
    "tags": 100,
    "description_genre": 220,
    "cover_prompt": 200,
}

# Chapter-summaries scales with chapter count; ~50 tokens per
# one-sentence summary plus the keying overhead.
_BOOK_CHAPTER_SUMMARIES_PER_CHAPTER: Final = 50


# ---------------------------------------------------------------------------
# Config (rate-limit + model lookup)
# ---------------------------------------------------------------------------


def _get_rate_limit_seconds() -> float:
    """Read ``ai.rate_limit_seconds`` from the merged config.
    Default 1.0 second between items per S7."""
    from app.ai.routes import _get_ai_config

    cfg = _get_ai_config()
    raw = cfg.get("rate_limit_seconds", DEFAULT_RATE_LIMIT_SECONDS)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_RATE_LIMIT_SECONDS
    # Negative values fall back to the default; zero means "no
    # delay" and is allowed for tests + power users.
    return value if value >= 0 else DEFAULT_RATE_LIMIT_SECONDS


def _get_configured_model() -> str:
    from app.ai.routes import _get_ai_config

    return str(_get_ai_config().get("model", ""))


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class _BulkFillRequest(BaseModel):
    ids: list[str] = Field(min_length=1)
    field_classes: list[str] = Field(min_length=1)
    force: bool = False
    inline_image_count: int | None = Field(default=None, ge=1, le=10)


class _BulkFillStartResponse(BaseModel):
    job_id: str


# ---------------------------------------------------------------------------
# Loading helpers
# ---------------------------------------------------------------------------


def _load_articles_in_order(ids: list[str], db: Session) -> list[Article]:
    rows = db.query(Article).filter(Article.id.in_(ids)).filter(Article.deleted_at.is_(None)).all()
    by_id = {a.id: a for a in rows}
    missing = [aid for aid in ids if aid not in by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Articles not found: {', '.join(missing[:5])}"
                + ("..." if len(missing) > 5 else "")
            ),
        )
    return [by_id[aid] for aid in ids]


def _load_books_in_order(ids: list[str], db: Session) -> list[Book]:
    rows = db.query(Book).filter(Book.id.in_(ids)).filter(Book.deleted_at.is_(None)).all()
    by_id = {b.id: b for b in rows}
    missing = [bid for bid in ids if bid not in by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Books not found: {', '.join(missing[:5])}" + ("..." if len(missing) > 5 else "")
            ),
        )
    return [by_id[bid] for bid in ids]


def _validate_article_field_classes(field_classes: list[str]) -> None:
    unknown = [c for c in field_classes if c not in _ARTICLE_FIELD_CLASSES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown article field_classes: {unknown}. Valid: {list(_ARTICLE_FIELD_CLASSES)}"
            ),
        )


def _validate_book_field_classes(field_classes: list[str]) -> None:
    unknown = [c for c in field_classes if c not in _BOOK_FIELD_CLASSES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=(f"Unknown book field_classes: {unknown}. Valid: {list(_BOOK_FIELD_CLASSES)}"),
        )


# ---------------------------------------------------------------------------
# Estimate computation
# ---------------------------------------------------------------------------


def _estimate_article_item(
    article: Article,
    body_text: str,
    field_classes: list[str],
    inline_image_count: int | None,
    model: str,
) -> dict[str, Any]:
    """Build a per-class breakdown for one article."""
    inline_count = _inline_image_count(article, inline_image_count)
    per_class: dict[str, dict[str, Any]] = {}
    total_input = 0
    total_output = 0

    for class_name in field_classes:
        spec = _ARTICLE_FIELD_CLASSES[class_name]
        if spec.needs_inline_count:
            system, user = spec.builder(article, body_text, inline_count=inline_count)
        else:
            system, user = spec.builder(article, body_text)
        input_tokens = estimate_tokens(system) + estimate_tokens(user)
        output_tokens = _ARTICLE_OUTPUT_TOKENS.get(class_name, 200)
        cost = estimate_cost_usd(model, input_tokens, output_tokens)
        per_class[class_name] = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
        }
        total_input += input_tokens
        total_output += output_tokens

    item_cost = estimate_cost_usd(model, total_input, total_output)
    return {
        "id": article.id,
        "title": article.title,
        "language": article.language,
        "field_class_calls": len(field_classes),
        "per_class": per_class,
        "estimated_input_tokens": total_input,
        "estimated_output_tokens": total_output,
        "estimated_cost_usd": item_cost,
    }


def _estimate_book_item(
    book: Book,
    body_text: str,
    chapters_input: list[dict[str, str]],
    field_classes: list[str],
    model: str,
) -> dict[str, Any]:
    per_class: dict[str, dict[str, Any]] = {}
    total_input = 0
    total_output = 0

    for class_name in field_classes:
        spec = _BOOK_FIELD_CLASSES[class_name]
        if spec.is_chapter_summaries:
            if not chapters_input:
                # Empty book - the worker skips this class with
                # a per-class error; here we report zero cost.
                per_class[class_name] = {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost_usd": None,
                    "note": "Book has no chapters; class will be skipped",
                }
                continue
            system, user = spec.builder(book, chapters_input)
            output_tokens = len(chapters_input) * _BOOK_CHAPTER_SUMMARIES_PER_CHAPTER
        else:
            system, user = spec.builder(book, body_text)
            output_tokens = _BOOK_OUTPUT_TOKENS_NON_CHAPTER.get(class_name, 200)
        input_tokens = estimate_tokens(system) + estimate_tokens(user)
        cost = estimate_cost_usd(model, input_tokens, output_tokens)
        per_class[class_name] = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
        }
        total_input += input_tokens
        total_output += output_tokens

    item_cost = estimate_cost_usd(model, total_input, total_output)
    return {
        "id": book.id,
        "title": book.title,
        "language": book.language,
        "chapter_count": len(chapters_input),
        "field_class_calls": len(field_classes),
        "per_class": per_class,
        "estimated_input_tokens": total_input,
        "estimated_output_tokens": total_output,
        "estimated_cost_usd": item_cost,
    }


# ---------------------------------------------------------------------------
# Article endpoints
# ---------------------------------------------------------------------------


@articles_router.post("/estimate")
def estimate_article_bulk_fill(
    request: _BulkFillRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Pre-flight estimate. Returns per-item AND total cost so
    the UI can show the user the full breakdown before they
    confirm. Carries the carry-forward Q6 contract: every item
    contributes its own line; the total is the sum."""
    _enforce_bulk_ai_fill_cap(len(request.ids))
    _validate_article_field_classes(request.field_classes)
    articles = _load_articles_in_order(request.ids, db)
    model = _get_configured_model()

    items: list[dict[str, Any]] = []
    total_input = 0
    total_output = 0
    cost_known = False
    total_cost = 0.0

    for article in articles:
        body_text = extract_body_text(article.content_json)
        item = _estimate_article_item(
            article, body_text, request.field_classes, request.inline_image_count, model
        )
        items.append(item)
        total_input += item["estimated_input_tokens"]
        total_output += item["estimated_output_tokens"]
        if item["estimated_cost_usd"] is not None:
            cost_known = True
            total_cost += item["estimated_cost_usd"]

    return {
        "model": model,
        "field_classes": request.field_classes,
        "items": items,
        "totals": {
            "total_items": len(items),
            "total_field_class_calls": len(items) * len(request.field_classes),
            "estimated_input_tokens": total_input,
            "estimated_output_tokens": total_output,
            "estimated_cost_usd": round(total_cost, 4) if cost_known else None,
        },
    }


@articles_router.post("/start", response_model=_BulkFillStartResponse)
async def start_article_bulk_fill(
    request: _BulkFillRequest, db: Session = Depends(get_db)
) -> _BulkFillStartResponse:
    """Submit a bulk AI-fill job. Validates AI is enabled and
    every ID exists, then returns the job_id. Subsequent
    progress lands on the SSE stream endpoint below."""
    from app.ai.routes import _is_ai_enabled

    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")
    _enforce_bulk_ai_fill_cap(len(request.ids))
    _validate_article_field_classes(request.field_classes)
    # Verify every ID resolves; raises 404 with the missing IDs.
    _load_articles_in_order(request.ids, db)

    rate_limit = _get_rate_limit_seconds()

    async def _runner(job_id: str) -> dict[str, Any]:
        return await _run_article_bulk_fill_job(
            job_id,
            list(request.ids),
            list(request.field_classes),
            force=request.force,
            inline_image_count=request.inline_image_count,
            rate_limit_seconds=rate_limit,
        )

    job_id = job_store.submit(_runner)
    return _BulkFillStartResponse(job_id=job_id)


@articles_router.get("/jobs/{job_id}/stream")
async def stream_article_bulk_fill(job_id: str) -> StreamingResponse:
    """SSE stream of bulk-fill job events. Returns 404 if the
    job is unknown so the client can stop polling."""
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


@articles_router.get("/jobs/{job_id}")
def get_article_bulk_fill_job(job_id: str) -> dict[str, Any]:
    """Polling endpoint alternative to the SSE stream. Returns
    the job's current status, progress dict, and (if terminal)
    the result."""
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


# ---------------------------------------------------------------------------
# Book endpoints
# ---------------------------------------------------------------------------


@books_router.post("/estimate")
def estimate_book_bulk_fill(
    request: _BulkFillRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    _enforce_bulk_ai_fill_cap(len(request.ids))
    _validate_book_field_classes(request.field_classes)
    books = _load_books_in_order(request.ids, db)
    model = _get_configured_model()

    items: list[dict[str, Any]] = []
    total_input = 0
    total_output = 0
    cost_known = False
    total_cost = 0.0

    for book in books:
        body_text = _aggregate_book_body(book)
        chapters_input = _build_chapter_input(book)
        item = _estimate_book_item(book, body_text, chapters_input, request.field_classes, model)
        items.append(item)
        total_input += item["estimated_input_tokens"]
        total_output += item["estimated_output_tokens"]
        if item["estimated_cost_usd"] is not None:
            cost_known = True
            total_cost += item["estimated_cost_usd"]

    return {
        "model": model,
        "field_classes": request.field_classes,
        "items": items,
        "totals": {
            "total_items": len(items),
            "total_field_class_calls": len(items) * len(request.field_classes),
            "estimated_input_tokens": total_input,
            "estimated_output_tokens": total_output,
            "estimated_cost_usd": round(total_cost, 4) if cost_known else None,
        },
    }


@books_router.post("/start", response_model=_BulkFillStartResponse)
async def start_book_bulk_fill(
    request: _BulkFillRequest, db: Session = Depends(get_db)
) -> _BulkFillStartResponse:
    from app.ai.routes import _is_ai_enabled

    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")
    _enforce_bulk_ai_fill_cap(len(request.ids))
    _validate_book_field_classes(request.field_classes)
    _load_books_in_order(request.ids, db)

    rate_limit = _get_rate_limit_seconds()

    async def _runner(job_id: str) -> dict[str, Any]:
        return await _run_book_bulk_fill_job(
            job_id,
            list(request.ids),
            list(request.field_classes),
            force=request.force,
            rate_limit_seconds=rate_limit,
        )

    job_id = job_store.submit(_runner)
    return _BulkFillStartResponse(job_id=job_id)


@books_router.get("/jobs/{job_id}/stream")
async def stream_book_bulk_fill(job_id: str) -> StreamingResponse:
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


@books_router.get("/jobs/{job_id}")
def get_book_bulk_fill_job(job_id: str) -> dict[str, Any]:
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


# ---------------------------------------------------------------------------
# Job workers
# ---------------------------------------------------------------------------


async def _run_article_bulk_fill_job(
    job_id: str,
    ids: list[str],
    field_classes: list[str],
    *,
    force: bool,
    inline_image_count: int | None,
    rate_limit_seconds: float,
) -> dict[str, Any]:
    """Article bulk-fill worker. Opens a fresh DB session for
    the duration of the job, processes items in input order,
    paces between items by ``rate_limit_seconds``."""
    from app.ai.routes import _get_client

    client = _get_client()
    items_done: list[dict[str, Any]] = []
    total_tokens = 0
    total_cost = 0.0
    items_updated = 0
    cost_known = False

    job_store.publish_event(
        job_id,
        "start",
        {
            "total": len(ids),
            "field_classes": field_classes,
            "rate_limit_seconds": rate_limit_seconds,
        },
    )

    with SessionLocal() as db:
        for index, article_id in enumerate(ids):
            article = (
                db.query(Article)
                .filter(Article.id == article_id)
                .filter(Article.deleted_at.is_(None))
                .first()
            )
            if article is None:
                job_store.publish_event(
                    job_id,
                    "item_skipped",
                    {"id": article_id, "index": index, "reason": "not-found"},
                )
                items_done.append({"id": article_id, "index": index, "skipped": "not-found"})
                continue

            body_text = extract_body_text(article.content_json)
            if not body_text:
                job_store.publish_event(
                    job_id,
                    "item_skipped",
                    {"id": article_id, "index": index, "reason": "no-content"},
                )
                items_done.append({"id": article_id, "index": index, "skipped": "no-content"})
                continue

            job_store.publish_event(
                job_id,
                "item_start",
                {"id": article_id, "index": index, "title": article.title},
            )

            try:
                item_result = await fill_article_with_ai(
                    article,
                    body_text,
                    field_classes,
                    force=force,
                    inline_image_count=inline_image_count,
                    client=client,
                )
            except Exception as exc:  # noqa: BLE001 - per-item isolation
                logger.exception("Bulk article fill failed on %s", article_id)
                db.rollback()
                job_store.publish_event(
                    job_id,
                    "item_error",
                    {"id": article_id, "index": index, "error": str(exc)},
                )
                items_done.append({"id": article_id, "index": index, "error": str(exc)})
                continue

            if item_result["tokens_used"]:
                db.add(article)
                db.commit()
                db.refresh(article)

            if item_result["updated_fields"]:
                items_updated += 1
            total_tokens += item_result["tokens_used"]
            if item_result["estimated_cost_usd"] is not None:
                cost_known = True
                total_cost += item_result["estimated_cost_usd"]

            job_store.publish_event(
                job_id,
                "item_done",
                {
                    "id": article_id,
                    "index": index,
                    "updated_fields": item_result["updated_fields"],
                    "skipped_fields": item_result["skipped_fields"],
                    "tokens": item_result["tokens_used"],
                    "cost_usd": item_result["estimated_cost_usd"],
                    "field_class_errors": item_result["field_class_errors"],
                },
            )
            items_done.append(item_result)

            if index < len(ids) - 1 and rate_limit_seconds > 0:
                await asyncio.sleep(rate_limit_seconds)

    summary = {
        "total_items": len(ids),
        "items_updated": items_updated,
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 4) if cost_known else None,
    }
    job_store.publish_event(job_id, "done", summary)
    return {"items": items_done, "summary": summary}


async def _run_book_bulk_fill_job(
    job_id: str,
    ids: list[str],
    field_classes: list[str],
    *,
    force: bool,
    rate_limit_seconds: float,
) -> dict[str, Any]:
    from app.ai.routes import _get_client

    client = _get_client()
    items_done: list[dict[str, Any]] = []
    total_tokens = 0
    total_cost = 0.0
    items_updated = 0
    cost_known = False

    job_store.publish_event(
        job_id,
        "start",
        {
            "total": len(ids),
            "field_classes": field_classes,
            "rate_limit_seconds": rate_limit_seconds,
        },
    )

    with SessionLocal() as db:
        for index, book_id in enumerate(ids):
            book = (
                db.query(Book).filter(Book.id == book_id).filter(Book.deleted_at.is_(None)).first()
            )
            if book is None:
                job_store.publish_event(
                    job_id,
                    "item_skipped",
                    {"id": book_id, "index": index, "reason": "not-found"},
                )
                items_done.append({"id": book_id, "index": index, "skipped": "not-found"})
                continue

            body_text = _aggregate_book_body(book)
            chapters_input = _build_chapter_input(book)
            if not body_text and not chapters_input:
                job_store.publish_event(
                    job_id,
                    "item_skipped",
                    {"id": book_id, "index": index, "reason": "no-content"},
                )
                items_done.append({"id": book_id, "index": index, "skipped": "no-content"})
                continue

            job_store.publish_event(
                job_id,
                "item_start",
                {"id": book_id, "index": index, "title": book.title},
            )

            try:
                item_result = await fill_book_with_ai(
                    book,
                    body_text,
                    chapters_input,
                    field_classes,
                    force=force,
                    client=client,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Bulk book fill failed on %s", book_id)
                db.rollback()
                job_store.publish_event(
                    job_id,
                    "item_error",
                    {"id": book_id, "index": index, "error": str(exc)},
                )
                items_done.append({"id": book_id, "index": index, "error": str(exc)})
                continue

            if item_result["tokens_used"]:
                db.add(book)
                db.commit()
                db.refresh(book)

            if item_result["updated_fields"]:
                items_updated += 1
            total_tokens += item_result["tokens_used"]
            if item_result["estimated_cost_usd"] is not None:
                cost_known = True
                total_cost += item_result["estimated_cost_usd"]

            job_store.publish_event(
                job_id,
                "item_done",
                {
                    "id": book_id,
                    "index": index,
                    "updated_fields": item_result["updated_fields"],
                    "skipped_fields": item_result["skipped_fields"],
                    "tokens": item_result["tokens_used"],
                    "cost_usd": item_result["estimated_cost_usd"],
                    "field_class_errors": item_result["field_class_errors"],
                    "dropped_chapter_summaries": item_result["dropped_chapter_summaries"],
                },
            )
            items_done.append(item_result)

            if index < len(ids) - 1 and rate_limit_seconds > 0:
                await asyncio.sleep(rate_limit_seconds)

    summary = {
        "total_items": len(ids),
        "items_updated": items_updated,
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 4) if cost_known else None,
    }
    job_store.publish_event(job_id, "done", summary)
    return {"items": items_done, "summary": summary}


__all__ = ["articles_router", "books_router", "MAX_BULK_AI_FILL"]
