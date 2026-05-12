"""Article AI-fill endpoint.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 5/10.

``POST /api/articles/{id}/ai-fill`` runs the configured LLM
against an article and fills the requested field-classes. Each
field-class corresponds to one LLM call (one (system_prompt,
user_prompt) pair from ``article_template_prompts``) and one
group of target columns. Force-override semantics match
``article_ai_template`` via the shared ``apply_field``
primitive.

Per-class failure is isolated: when one field-class's LLM call
errors, the response records the error under
``field_class_errors`` and the remaining classes proceed. Token
accounting bumps ``Article.ai_tokens_used`` by the sum of usage
across every call that returned (success or partial) so the
per-article AI-cost dashboard sees the real spend even when
parts of the call failed.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai import article_template_prompts as prompts
from app.ai.pricing import estimate_cost_usd
from app.ai.template_schema import (
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    apply_field,
    extract_body_text,
)
from app.database import get_db
from app.models import Article

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles", tags=["article-ai-fill"])


# ---------------------------------------------------------------------------
# Field-class registry
# ---------------------------------------------------------------------------


# Each spec carries:
# - ``builder``: returns ``(system_prompt, user_prompt)``
# - ``targets``: list of ``(ai_response_key, article_column, is_json_list)``
#   tuples mapping the LLM's expected YAML keys to article columns.
# - ``needs_inline_count``: True only for the image_prompts class which
#   takes an extra ``inline_count`` argument.

_TargetSpec = tuple[str, str, bool]


class _FieldClassSpec:
    __slots__ = ("builder", "targets", "needs_inline_count")

    def __init__(
        self,
        builder: Any,
        targets: list[_TargetSpec],
        *,
        needs_inline_count: bool = False,
    ) -> None:
        self.builder = builder
        self.targets = targets
        self.needs_inline_count = needs_inline_count


_FIELD_CLASSES: dict[str, _FieldClassSpec] = {
    "seo": _FieldClassSpec(
        prompts.build_seo_prompt,
        [
            ("seo_title", "seo_title", False),
            ("seo_description", "seo_description", False),
        ],
    ),
    "tags": _FieldClassSpec(
        prompts.build_tags_prompt,
        [("tags", "tags", True)],
    ),
    "topic": _FieldClassSpec(
        prompts.build_topic_prompt,
        [("topic", "topic", False)],
    ),
    "excerpt": _FieldClassSpec(
        prompts.build_excerpt_prompt,
        [("excerpt", "excerpt", False)],
    ),
    "image_prompts": _FieldClassSpec(
        prompts.build_image_prompts_prompt,
        [
            ("featured_image_prompt", "featured_image_prompt", False),
            ("inline_image_prompts", "inline_image_prompts", True),
        ],
        needs_inline_count=True,
    ),
}


FIELD_CLASS_NAMES = tuple(_FIELD_CLASSES.keys())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_article(article_id: str, db: Session) -> Article:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail=f"Article {article_id} not found")
    return article


def _parse_ai_yaml_fragment(text: str) -> dict[str, Any]:
    """Strip optional markdown code fences and parse the LLM
    output as a YAML mapping. Returns ``{}`` on parse failure
    so the caller can decide that the class produced nothing
    usable - no field gets touched."""
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


def _count_h2_headings(content_json: str | None) -> int:
    """Count ``heading`` nodes with ``attrs.level == 2`` in the
    article's TipTap doc. Used by the inline-image-count
    heuristic when the caller does not override it."""
    if not content_json:
        return 0
    try:
        doc = json.loads(content_json)
    except (ValueError, TypeError):
        return 0
    count = 0

    def walk(node: object) -> None:
        nonlocal count
        if not isinstance(node, dict):
            return
        if node.get("type") == "heading":
            attrs = node.get("attrs")
            if isinstance(attrs, dict) and attrs.get("level") == 2:
                count += 1
        children = node.get("content")
        if isinstance(children, list):
            for child in children:
                walk(child)

    walk(doc)
    return count


def _inline_image_count(article: Article, override: int | None) -> int:
    """Resolve the inline-image-prompt count per Q10: caller's
    override wins; otherwise heuristic = h2 count, floored at 1
    and capped at 5."""
    if override is not None:
        return max(1, min(5, override))
    return max(1, min(5, _count_h2_headings(article.content_json)))


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class _AiFillRequest(BaseModel):
    field_classes: list[str] = Field(
        ...,
        min_length=1,
        description=(
            "List of field-classes to fill. Valid names: "
            "seo, tags, topic, excerpt, image_prompts. Each "
            "class triggers one LLM call."
        ),
    )
    force: bool = Field(
        default=False,
        description=(
            "When false (default), fields that already have a "
            "non-empty value on the article are skipped. When "
            "true, the AI's non-empty values overwrite existing "
            "values. AI-returned null / empty always skips."
        ),
    )
    inline_image_count: int | None = Field(
        default=None,
        ge=1,
        le=10,
        description=(
            "Optional override for the number of inline image "
            "prompts the AI should generate. None means use the "
            "heuristic (one prompt per H2 heading, capped at 5)."
        ),
    )


# ---------------------------------------------------------------------------
# Service function (reused by single-article endpoint + bulk worker)
# ---------------------------------------------------------------------------


async def fill_article_with_ai(
    article: Article,
    body_text: str,
    field_classes: list[str],
    *,
    force: bool,
    inline_image_count: int | None,
    client: Any,
) -> dict[str, Any]:
    """Apply one LLM call per field-class to the given article
    row. Caller owns the DB transaction (the function never
    commits or refreshes). Returns the same response shape as
    the single-article endpoint exposes - the bulk worker
    forwards individual items through here so the per-record
    semantics stay identical between single and bulk paths."""
    from app.ai.llm_client import LLMError  # local import (cyclic)

    inline_count = _inline_image_count(article, inline_image_count)

    all_updated: list[str] = []
    all_skipped: dict[str, str] = {}
    per_class: dict[str, dict[str, Any]] = {}
    class_errors: dict[str, str] = {}
    total_tokens = 0
    total_cost_usd = 0.0
    any_cost_known = False

    for class_name in field_classes:
        spec = _FIELD_CLASSES[class_name]
        if spec.needs_inline_count:
            system_prompt, user_prompt = spec.builder(
                article, body_text, inline_count=inline_count
            )
        else:
            system_prompt, user_prompt = spec.builder(article, body_text)

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
        class_tokens = int(
            usage.get("total_tokens", prompt_tokens + completion_tokens) or 0
        )
        model_name = llm_result.get("model", "")
        class_cost = estimate_cost_usd(model_name, prompt_tokens, completion_tokens)

        class_updated: list[str] = []
        class_skipped: dict[str, str] = {}
        for ai_key, col_name, is_json_list in spec.targets:
            ai_value = ai_yaml.get(ai_key)
            result = apply_field(
                article,
                col_name,
                ai_value,
                force=force,
                is_json_list=is_json_list,
            )
            if result == APPLY_UPDATED:
                class_updated.append(col_name)
                all_updated.append(col_name)
            elif result == APPLY_SKIP_EMPTY:
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
        }
        total_tokens += class_tokens
        if class_cost is not None:
            total_cost_usd += class_cost
            any_cost_known = True

    if total_tokens:
        # Increment ai_tokens_used on the row but let the caller
        # decide when to flush. The single endpoint commits
        # immediately; the bulk worker commits per-item too,
        # via its own session.
        article.ai_tokens_used = (article.ai_tokens_used or 0) + total_tokens

    return {
        "article_id": article.id,
        "updated_fields": all_updated,
        "skipped_fields": list(all_skipped.keys()),
        "skip_reasons": all_skipped,
        "field_class_results": per_class,
        "field_class_errors": class_errors,
        "tokens_used": total_tokens,
        "estimated_cost_usd": round(total_cost_usd, 4) if any_cost_known else None,
        "force": force,
        "inline_image_count": inline_count,
    }


# ---------------------------------------------------------------------------
# Endpoint (thin wrapper around fill_article_with_ai)
# ---------------------------------------------------------------------------


@router.post("/{article_id}/ai-fill")
async def ai_fill_article(
    article_id: str,
    request: _AiFillRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run the configured LLM against the article and fill the
    requested field-classes. Each class is one LLM call;
    per-class failure is isolated so one outage doesn't kill
    the whole batch."""
    from app.ai.routes import _get_client, _is_ai_enabled

    if not _is_ai_enabled():
        raise HTTPException(status_code=403, detail="AI features are disabled")

    unknown = [c for c in request.field_classes if c not in _FIELD_CLASSES]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown field_classes: {unknown}. Valid: {list(_FIELD_CLASSES)}",
        )

    article = _load_article(article_id, db)
    body_text = extract_body_text(article.content_json)
    if not body_text:
        raise HTTPException(
            status_code=400,
            detail="Article has no content to generate from",
        )

    client = _get_client()
    result = await fill_article_with_ai(
        article,
        body_text,
        request.field_classes,
        force=request.force,
        inline_image_count=request.inline_image_count,
        client=client,
    )
    if result["tokens_used"]:
        db.add(article)
        db.commit()
        db.refresh(article)
    return result


__all__ = ["router", "FIELD_CLASS_NAMES", "fill_article_with_ai", "_FIELD_CLASSES"]
