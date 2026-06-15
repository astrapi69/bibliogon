"""Async bulk AI-fill job workers with SSE progress events.

Extracted from ``routers/ai_template_bulk_fill.py`` (God-file split #7,
2026-06-14). Each worker opens a fresh DB session for the job's
duration, processes items in input order, paces between items by the
``rate_limit_seconds`` the caller resolved, and publishes progress to
``job_store``. Per-item failures are isolated (logged + ``item_error``
event) so one bad item never aborts the batch.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.ai.template_schema import extract_body_text
from app.database import SessionLocal
from app.job_store import job_store
from app.models import Article, Book
from app.routers.article_ai_fill import fill_article_with_ai
from app.routers.book_ai_fill import (
    _aggregate_book_body,
    _build_chapter_input,
    fill_book_with_ai,
)

logger = logging.getLogger(__name__)


async def run_article_bulk_fill_job(
    job_id: str,
    ids: list[str],
    field_classes: list[str],
    *,
    force: bool,
    inline_image_count: int | None,
    rate_limit_seconds: float,
) -> dict[str, Any]:
    """Article bulk-fill worker. Opens a fresh DB session for the
    duration of the job, processes items in input order, paces between
    items by ``rate_limit_seconds``."""
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


async def run_book_bulk_fill_job(
    job_id: str,
    ids: list[str],
    field_classes: list[str],
    *,
    force: bool,
    rate_limit_seconds: float,
) -> dict[str, Any]:
    """Book bulk-fill worker. Mirror of the article worker; also reports
    ``dropped_chapter_summaries`` per item."""
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
