"""Bibliogon AI-template schema facade (``.biblio.yaml``).

A Bibliogon AI template is a self-contained, self-explanatory YAML file
describing one Article or Book and the metadata fields an AI assistant
(or a human author) can fill in for it. Every fillable field carries a
``description`` + ``example`` alongside its ``current_value``, and the
top-of-file header carries the rules-for-AI text, so the same artefact
works for the built-in AI workflow, the custom-endpoint workflow
(LM Studio / Ollama), and the external-roundtrip workflow (paste into
Claude.ai / ChatGPT and get the filled YAML back).

God-file split #10 (2026-06-14): the implementation moved into focused
modules (``template_models`` / ``template_headers`` / ``template_body`` /
``template_apply`` / ``template_yaml`` / ``template_factories``). This
module stays the stable import surface - all consumers import from
``app.ai.template_schema`` and the ``__all__`` below re-exports every
public symbol unchanged.
"""

from app.ai.template_apply import (
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    apply_field,
    is_column_populated,
    is_template_value_empty,
)
from app.ai.template_body import extract_body_preview, extract_body_text
from app.ai.template_factories import (
    build_article_template_from_record,
    build_book_template_from_record,
    build_empty_article_template,
    build_empty_book_template,
)
from app.ai.template_headers import ARTICLE_HEADER, BOOK_HEADER
from app.ai.template_models import (
    ARTICLE_PROMPTS_VERSION,
    BOOK_PROMPTS_VERSION,
    SCHEMA_VERSION,
    ArticleReference,
    ArticleTemplate,
    BookReference,
    BookTemplate,
    TemplateField,
    TemplateModel,
    TemplateSchemaError,
)
from app.ai.template_yaml import parse_template_from_yaml, serialize_template_to_yaml

__all__ = [
    "SCHEMA_VERSION",
    "ARTICLE_PROMPTS_VERSION",
    "BOOK_PROMPTS_VERSION",
    "ARTICLE_HEADER",
    "BOOK_HEADER",
    "TemplateField",
    "ArticleReference",
    "BookReference",
    "ArticleTemplate",
    "BookTemplate",
    "TemplateModel",
    "TemplateSchemaError",
    "extract_body_text",
    "extract_body_preview",
    "serialize_template_to_yaml",
    "parse_template_from_yaml",
    "build_empty_article_template",
    "build_empty_book_template",
    "build_article_template_from_record",
    "build_book_template_from_record",
    "apply_field",
    "is_template_value_empty",
    "is_column_populated",
    "APPLY_UPDATED",
    "APPLY_SKIP_EMPTY",
    "APPLY_SKIP_POPULATED",
]
