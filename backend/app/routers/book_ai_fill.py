"""Book AI-fill endpoint.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 7/10. Mirrors
``article_ai_fill`` for the Book model, with two book-specific
twists:

- The body excerpt passed to prompt builders is aggregated
  plain text across all chapters (no single ``content_json``
  to extract from; books are chapter trees).
- The ``chapter_summaries`` field-class hands the prompt
  builder a per-chapter list (``[{chapter_id, title,
  excerpt}]``) so the AI can summarize each chapter
  individually. The returned list is run through the same
  reconciliation pipeline as the per-book import endpoint
  (commit 6) so AI-fabricated chapter_ids are dropped before
  any column write.
"""

from __future__ import annotations

import logging
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai import book_template_prompts as prompts
from app.ai.pricing import estimate_cost_usd
from app.ai.template_schema import (
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    apply_field,
    extract_body_text,
)
from app.database import get_db
from app.models import Book
from app.routers.book_ai_template import reconcile_chapter_summaries

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["book-ai-fill"])


# ---------------------------------------------------------------------------
# Field-class registry
# ---------------------------------------------------------------------------


_TargetSpec = tuple[str, str, bool]


class _FieldClassSpec:
    __slots__ = ("builder", "targets", "is_chapter_summaries")

    def __init__(
        self,
        builder: Any,
        targets: list[_TargetSpec],
        *,
        is_chapter_summaries: bool = False,
    ) -> None:
        self.builder = builder
        self.targets = targets
        self.is_chapter_summaries = is_chapter_summaries


_FIELD_CLASSES: dict[str, _FieldClassSpec] = {
    "marketing_copy": _FieldClassSpec(
        prompts.build_marketing_copy_prompt,
        [
            ("backpage_description", "backpage_description", False),
            ("backpage_author_bio", "backpage_author_bio", False),
            ("html_description", "html_description", False),
        ],
    ),
    "tags": _FieldClassSpec(
        prompts.build_tags_prompt,
        [("keywords", "keywords", True)],
    ),
    "description_genre": _FieldClassSpec(
        prompts.build_description_genre_prompt,
        [
            ("description", "description", False),
            ("genre", "genre", False),
        ],
    ),
    "cover_prompt": _FieldClassSpec(
        prompts.build_cover_prompt,
        [("cover_image_prompt", "cover_image_prompt", False)],
    ),
    "chapter_summaries": _FieldClassSpec(
        prompts.build_chapter_summaries_prompt,
        [("chapter_summaries", "chapter_summaries", True)],
        is_chapter_summaries=True,
    ),
}


FIELD_CLASS_NAMES = tuple(_FIELD_CLASSES.keys())

# Cap on per-chapter excerpt length when assembling the chapter-
# summaries prompt input. Keeps the prompt compact for books with
# many or long chapters. Mirrors the constant in
# ``book_template_prompts.build_chapter_summaries_prompt``.
_CHAPTER_EXCERPT_LIMIT = 600


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_book(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    return book


def _parse_ai_yaml_fragment(text: str) -> dict[str, Any]:
    if not text:
        return {}
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        parsed = yaml.safe_load(cleaned)
    except yaml.YAMLError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _aggregate_book_body(book: Book) -> str:
    """Concatenate chapter plain text into a single excerpt the
    AI can reason about. Caller clamps to the prompt's body
    limit; this just produces the raw input."""
    parts: list[str] = []
    for chapter in book.chapters:
        chapter_text = extract_body_text(chapter.content)
        if chapter_text:
            parts.append(chapter_text)
    return "\n\n".join(parts)


def _build_chapter_input(book: Book) -> list[dict[str, str]]:
    """Build the per-chapter ``[{chapter_id, title, excerpt}]``
    input expected by ``build_chapter_summaries_prompt``."""
    items: list[dict[str, str]] = []
    for chapter in book.chapters:
        text = extract_body_text(chapter.content)[:_CHAPTER_EXCERPT_LIMIT]
        items.append(
            {
                "chapter_id": chapter.id,
                "title": chapter.title,
                "excerpt": text,
            }
        )
    return items


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class _AiFillRequest(BaseModel):
    field_classes: list[str] = Field(
        ...,
        min_length=1,
        description=(
            "List of field-classes to fill. Valid names: "
            "marketing_copy, tags, description_genre, "
            "cover_prompt, chapter_summaries."
        ),
    )
    force: bool = False


# ---------------------------------------------------------------------------
# Service function (reused by single-book endpoint + bulk worker)
# ---------------------------------------------------------------------------


async def fill_book_with_ai(
    book: Book,
    body_text: str,
    chapters_input: list[dict[str, str]],
    field_classes: list[str],
    *,
    force: bool,
    client: Any,
) -> dict[str, Any]:
    """Apply one LLM call per field-class to the given book row.
    Caller owns the DB transaction. Returns the same response
    shape as the single-book endpoint - the bulk worker forwards
    individual items through here."""
    from app.ai.llm_client import LLMError

    all_updated: list[str] = []
    all_skipped: dict[str, str] = {}
    per_class: dict[str, dict[str, Any]] = {}
    class_errors: dict[str, str] = {}
    dropped_chapter_summaries: list[dict[str, Any]] = []
    total_tokens = 0
    total_cost_usd = 0.0
    any_cost_known = False

    for class_name in field_classes:
        spec = _FIELD_CLASSES[class_name]
        if spec.is_chapter_summaries:
            if not chapters_input:
                # Empty book - nothing to summarize. Surface a
                # per-class error so the caller can distinguish
                # this from an LLM failure.
                class_errors[class_name] = "Book has no chapters to summarize"
                per_class[class_name] = {
                    "updated": [],
                    "skipped": {},
                    "tokens": 0,
                    "cost_usd": None,
                    "error": class_errors[class_name],
                }
                continue
            system_prompt, user_prompt = spec.builder(book, chapters_input)
        else:
            system_prompt, user_prompt = spec.builder(book, body_text)

        try:
            llm_result = await client.chat(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.6,
            )
        except LLMError as exc:
            logger.warning("AI-fill LLM error for class %s: %s", class_name, exc)
            class_errors[class_name] = str(exc)
            per_class[class_name] = {
                "updated": [],
                "skipped": {},
                "tokens": 0,
                "cost_usd": None,
                "error": str(exc),
            }
            continue

        ai_yaml = _parse_ai_yaml_fragment(llm_result.get("content", ""))
        usage = llm_result.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        class_tokens = int(usage.get("total_tokens", prompt_tokens + completion_tokens) or 0)
        model_name = llm_result.get("model", "")
        class_cost = estimate_cost_usd(model_name, prompt_tokens, completion_tokens)

        class_updated: list[str] = []
        class_skipped: dict[str, str] = {}
        class_dropped: list[dict[str, Any]] = []

        for ai_key, col_name, is_json_list in spec.targets:
            ai_value = ai_yaml.get(ai_key)

            if spec.is_chapter_summaries and isinstance(ai_value, list):
                reconciled, dropped = reconcile_chapter_summaries(book, ai_value)
                class_dropped = dropped
                dropped_chapter_summaries.extend(dropped)
                ai_value = reconciled

            result = apply_field(
                book,
                col_name,
                ai_value,
                force=force,
                is_json_list=is_json_list,
            )
            if result == APPLY_UPDATED:
                class_updated.append(col_name)
                all_updated.append(col_name)
            elif result == APPLY_SKIP_EMPTY:
                # Distinct skip reason when chapter_summaries
                # was fully dropped: see commit 6 rationale.
                if spec.is_chapter_summaries and class_dropped:
                    class_skipped[col_name] = "all-entries-dropped"
                    all_skipped[col_name] = "all-entries-dropped"
                else:
                    class_skipped[col_name] = APPLY_SKIP_EMPTY
                    all_skipped[col_name] = APPLY_SKIP_EMPTY
            elif result == APPLY_SKIP_POPULATED:
                class_skipped[col_name] = APPLY_SKIP_POPULATED
                all_skipped[col_name] = APPLY_SKIP_POPULATED

        per_class[class_name] = {
            "updated": class_updated,
            "skipped": class_skipped,
            "tokens": class_tokens,
            "cost_usd": class_cost,
            "error": None,
            "dropped_chapter_summaries": class_dropped if spec.is_chapter_summaries else [],
        }
        total_tokens += class_tokens
        if class_cost is not None:
            total_cost_usd += class_cost
            any_cost_known = True

    if total_tokens:
        book.ai_tokens_used = (book.ai_tokens_used or 0) + total_tokens

    return {
        "book_id": book.id,
        "updated_fields": all_updated,
        "skipped_fields": list(all_skipped.keys()),
        "skip_reasons": all_skipped,
        "field_class_results": per_class,
        "field_class_errors": class_errors,
        "dropped_chapter_summaries": dropped_chapter_summaries,
        "tokens_used": total_tokens,
        "estimated_cost_usd": round(total_cost_usd, 4) if any_cost_known else None,
        "force": force,
    }


# ---------------------------------------------------------------------------
# Endpoint (thin wrapper around fill_book_with_ai)
# ---------------------------------------------------------------------------


@router.post("/{book_id}/ai-fill")
async def ai_fill_book(
    book_id: str,
    request: _AiFillRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run the configured LLM against the book and fill the
    requested field-classes. Per-class failure is isolated."""
    from app.ai.routes import _get_client, _is_ai_enabled

    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    unknown = [c for c in request.field_classes if c not in _FIELD_CLASSES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown field_classes: {unknown}. Valid: {list(_FIELD_CLASSES)}",
        )

    book = _load_book(book_id, db)
    body_text = _aggregate_book_body(book)
    chapters_input = _build_chapter_input(book)
    if not body_text and not chapters_input:
        raise HTTPException(
            status_code=400,
            detail="Book has no chapter content to generate from",
        )

    client = _get_client()
    result = await fill_book_with_ai(
        book,
        body_text,
        chapters_input,
        request.field_classes,
        force=request.force,
        client=client,
    )
    if result["tokens_used"]:
        db.add(book)
        db.commit()
        db.refresh(book)
    return result


__all__ = [
    "router",
    "FIELD_CLASS_NAMES",
    "fill_book_with_ai",
    "_FIELD_CLASSES",
    "_aggregate_book_body",
    "_build_chapter_input",
]
