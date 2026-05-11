"""Prompts for the Article AI-template fill workflow.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 3/10. One builder
per field-class. Each builder returns a ``(system_prompt,
user_prompt)`` tuple that the ``POST /api/articles/{id}/ai-fill``
endpoint (commit 5) will pass as a two-message chat sequence.

The split keeps the invariants (respond in YAML, real UTF-8,
use the article's language, leave fields null when uncertain)
in the system prompt where they belong, and the per-call
context (article metadata + body excerpt + expected output
shape) in the user prompt where the LLM expects it.

Distinct from ``backend/app/ai/seo_prompts.py``: that module
serves the existing field-by-field
``/api/articles/{id}/ai/generate-meta`` endpoint, which returns
plain text for one column at a time. The template-fill
workflow returns YAML fragments for an entire field-class at
once, which is why the prompt shapes diverge.
"""

from __future__ import annotations

from typing import Any

# Maximum body excerpt length passed to the LLM. Matches the
# existing seo_prompts._BODY_EXCERPT_LIMIT precedent.
_BODY_EXCERPT_LIMIT = 1500


def _format_article_header(article: Any) -> str:
    """Stable metadata header. Title is always present; other
    fields are skipped when empty so the prompt stays compact."""
    lines = [f"Article title: {article.title}"]
    if getattr(article, "subtitle", None):
        lines.append(f"Subtitle: {article.subtitle}")
    if getattr(article, "topic", None):
        lines.append(f"Topic: {article.topic}")
    if getattr(article, "author", None):
        lines.append(f"Author: {article.author}")
    lines.append(f"Language: {article.language}")
    return "\n".join(lines)


def _excerpt(body: str) -> str:
    """Clamp the plain-text body excerpt. Caller has already
    extracted plain text via ``template_schema.extract_body_text``."""
    return body[:_BODY_EXCERPT_LIMIT]


def _system_prompt(article: Any) -> str:
    """Shared system prompt: rules the LLM follows for any
    article-template field-class. Lives in one place so the
    invariants stay consistent across builders."""
    return f"""You are filling metadata fields for an article in a Bibliogon \
AI template. Follow these rules:

1. Respond with a YAML fragment ONLY. No prose, no markdown
   fences, no commentary outside the YAML.
2. Respond in the article's language: {article.language}. All
   generated text (titles, descriptions, tags) must be in
   that language. Image prompts can stay in English (image
   generators are most reliable with English prompts).
3. Use real UTF-8 characters (umlauts, accents, CJK
   characters). Do NOT escape them and do NOT substitute
   ASCII transliterations.
4. If you cannot generate a field with high confidence,
   return it as null. Do not invent.
5. Output ONLY the fields requested in the user message; do
   not echo unrelated fields."""


# ---------------------------------------------------------------------------
# Field-class builders
# ---------------------------------------------------------------------------


def build_seo_prompt(article: Any, body: str) -> tuple[str, str]:
    """Field-class ``seo``: fills ``seo_title`` and
    ``seo_description``."""
    user = f"""{_format_article_header(article)}

Article body (excerpt):
{_excerpt(body)}

Generate the article's SEO metadata. Output exactly this YAML \
shape and nothing else:

seo_title: "..."          # max 60 chars, front-loaded keyword
seo_description: "..."    # 150-160 chars, value proposition + soft CTA"""
    return _system_prompt(article), user


def build_tags_prompt(article: Any, body: str) -> tuple[str, str]:
    """Field-class ``tags``: fills ``tags`` (list of 5-10
    single-word or hyphenated lowercase strings)."""
    user = f"""{_format_article_header(article)}

Article body (excerpt):
{_excerpt(body)}

Generate 5-10 tags for this article. Each tag is single-word \
or hyphenated, lowercase, in the article's language. Output \
exactly this YAML shape:

tags:
  - "tag-1"
  - "tag-2"
  - "tag-3"
"""
    return _system_prompt(article), user


def build_topic_prompt(article: Any, body: str) -> tuple[str, str]:
    """Field-class ``topic``: fills ``topic`` (single primary
    topic, one word or short phrase)."""
    user = f"""{_format_article_header(article)}

Article body (excerpt):
{_excerpt(body)}

Identify the article's primary topic. One word or a short \
phrase (max 4 words). Output exactly this YAML shape:

topic: "..."
"""
    return _system_prompt(article), user


def build_excerpt_prompt(article: Any, body: str) -> tuple[str, str]:
    """Field-class ``excerpt``: fills ``excerpt`` (200-300 char
    conversational summary)."""
    user = f"""{_format_article_header(article)}

Article body (excerpt):
{_excerpt(body)}

Generate a short conversational excerpt for this article, \
shown on article lists and social-media-share previews. \
Length 200-300 characters. More conversational than an SEO \
description; should hook the reader. Output exactly this \
YAML shape:

excerpt: "..."
"""
    return _system_prompt(article), user


def build_image_prompts_prompt(
    article: Any, body: str, inline_count: int = 3
) -> tuple[str, str]:
    """Field-class ``image_prompts``: fills
    ``featured_image_prompt`` plus ``inline_image_prompts``.

    ``inline_count`` is the heuristic count of body sections
    (capped at 5 in the calling endpoint; default 3 here). The
    user can override via the field-class dialog (Q10
    confirmation)."""
    inline_count = max(1, min(inline_count, 5))
    user = f"""{_format_article_header(article)}

Article body (excerpt):
{_excerpt(body)}

Generate Stable-Diffusion-style image prompts for this \
article. Image prompts may stay in English even when the \
article language differs - image generators are most \
reliable with English prompts.

Each prompt should include:
- style hint (photorealistic, illustration, abstract)
- composition + subject
- mood + lighting
- "no text in image" when appropriate

Output exactly this YAML shape:

featured_image_prompt: |
  <hero image prompt, evokes the article's main theme>
inline_image_prompts:
  - section_hint: "<short label, where this illustration goes>"
    prompt: |
      <SD-style prompt>
  # ... {inline_count} entries total
"""
    return _system_prompt(article), user


__all__ = [
    "build_seo_prompt",
    "build_tags_prompt",
    "build_topic_prompt",
    "build_excerpt_prompt",
    "build_image_prompts_prompt",
]
