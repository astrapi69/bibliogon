"""Pydantic models + version constants for Bibliogon AI templates.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

SCHEMA_VERSION = 1
ARTICLE_PROMPTS_VERSION = "article_v1"
BOOK_PROMPTS_VERSION = "book_v1"


class TemplateSchemaError(ValueError):
    """Raised when a template YAML fails structural validation
    (unknown schema_version, type mismatch, malformed body).
    Distinct from Pydantic's ``ValidationError`` so callers can
    map it to a specific HTTP status."""


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TemplateField(BaseModel):
    """One fillable field. Three keys: human-readable description,
    realistic example, and the current value (null when unset)."""

    description: str
    example: Any = None
    current_value: Any = None


class ArticleReference(BaseModel):
    """Read-only reference block for the per-article export path.
    Omitted for the empty / new-idea template."""

    id: str
    language: str
    body_word_count: int
    body_preview: str


class BookReference(BaseModel):
    """Read-only reference block for the per-book export path.
    Omitted for the empty / new-idea template."""

    id: str
    language: str
    body_word_count: int
    body_preview: str


class ArticleTemplate(BaseModel):
    """Top-level Article template. The field order in this class
    is the field order in the serialized YAML — Pydantic v2
    preserves declaration order in ``model_dump``."""

    type: Literal["article"] = "article"
    schema_version: int = SCHEMA_VERSION
    # Present on per-article export, absent on empty templates.
    reference: ArticleReference | None = None
    # Present at root ONLY on empty templates; per-article
    # templates carry language inside ``reference``.
    language: str | None = None
    # Fillable fields, in the order they appear in the file.
    title: TemplateField
    seo_title: TemplateField
    seo_description: TemplateField
    excerpt: TemplateField
    tags: TemplateField
    topic: TemplateField
    featured_image_prompt: TemplateField
    inline_image_prompts: TemplateField


class BookTemplate(BaseModel):
    """Top-level Book template. Same ordering convention as
    ``ArticleTemplate``."""

    type: Literal["book"] = "book"
    schema_version: int = SCHEMA_VERSION
    reference: BookReference | None = None
    language: str | None = None
    title: TemplateField
    subtitle: TemplateField
    description: TemplateField
    genre: TemplateField
    keywords: TemplateField
    html_description: TemplateField
    backpage_description: TemplateField
    backpage_author_bio: TemplateField
    cover_image_prompt: TemplateField
    chapter_summaries: TemplateField


TemplateModel = ArticleTemplate | BookTemplate


# ---------------------------------------------------------------------------
# Headers (rules-for-AI text)
# ---------------------------------------------------------------------------
