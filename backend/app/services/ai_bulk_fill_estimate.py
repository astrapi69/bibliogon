"""Per-item cost-estimate heuristics for bulk AI-fill.

Extracted from ``routers/ai_template_bulk_fill.py`` (God-file split #7,
2026-06-14). Pure cost computation over Article/Book objects: builds the
real prompts via the same field-class builders the fill worker uses,
runs the ``app.ai.pricing`` token/cost heuristics, and returns a
per-class breakdown. No HTTP, no DB writes.

The output-token values are deliberately conservative upper bounds so a
"you will spend $X" dialog is never a lower-bound surprise.
"""

from typing import Any, Final

from app.ai.pricing import estimate_cost_usd, estimate_tokens
from app.models import Article, Book
from app.routers.article_ai_fill import _FIELD_CLASSES as _ARTICLE_FIELD_CLASSES
from app.routers.article_ai_fill import _inline_image_count
from app.routers.book_ai_fill import _FIELD_CLASSES as _BOOK_FIELD_CLASSES

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


def estimate_article_item(
    article: Article,
    body_text: str,
    field_classes: list[str],
    inline_image_count: int | None,
    model: str,
) -> dict[str, Any]:
    """Build a per-class cost breakdown for one article."""
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


def estimate_book_item(
    book: Book,
    body_text: str,
    chapters_input: list[dict[str, str]],
    field_classes: list[str],
    model: str,
) -> dict[str, Any]:
    """Build a per-class cost breakdown for one book."""
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
