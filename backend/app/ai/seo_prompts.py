"""Article SEO + tags AI generation prompts.

Used by ``POST /api/articles/{id}/ai/generate-meta``. Each builder
takes the Article row + a plain-text body excerpt and returns a
single-shot LLM prompt. Output rules (length limits, language,
format) are baked into the prompt so the parser side stays simple.

Naming mirrors ``backend/app/ai/prompts.py`` so future article-
level prompts (excerpt, topic suggestion, ...) can land here without
disturbing book-side prompts.
"""

from __future__ import annotations


def _format_metadata_block(article) -> str:
    """Stable header block carrying every article facet useful as
    LLM context. Optional fields are skipped when empty so the
    prompt stays compact."""
    lines = [f"Article title: {article.title}"]
    if article.subtitle:
        lines.append(f"Subtitle: {article.subtitle}")
    if article.topic:
        lines.append(f"Topic: {article.topic}")
    if article.author:
        lines.append(f"Author: {article.author}")
    return "\n".join(lines)


_BODY_EXCERPT_LIMIT = 1500


def _excerpt(body: str) -> str:
    """First N characters of plain-text body. The body is already
    plain text by the time it reaches a prompt builder (caller runs
    the TipTap-JSON -> text extractor); just clamp it."""
    return body[:_BODY_EXCERPT_LIMIT]


def build_seo_title_prompt(article, body: str) -> str:
    return f"""Generate an SEO-optimized title for this article in {article.language}.

{_format_metadata_block(article)}

Article body (excerpt):
{_excerpt(body)}

Requirements:
- Maximum 60 characters
- Engaging without clickbait
- Include the primary keyword from the article
- Match the article's actual content
- Same language as the article: {article.language}

Return only the SEO title, no quotes or explanation."""


def build_seo_description_prompt(article, body: str) -> str:
    return f"""Generate an SEO meta description for this article in {article.language}.

{_format_metadata_block(article)}

Article body (excerpt):
{_excerpt(body)}

Requirements:
- Maximum 160 characters
- Compelling and informative
- Summarize what the reader learns or gains
- Include the primary keyword naturally
- Same language as the article: {article.language}

Return only the description, no quotes or explanation."""


def build_tags_prompt(article, body: str) -> str:
    return f"""Generate 5-7 relevant tags for this article in {article.language}.

{_format_metadata_block(article)}

Article body (excerpt):
{_excerpt(body)}

Requirements:
- 5 to 7 tags total
- Each tag is 1-3 words, descriptive
- Mix of broad topic tags and specific keyword tags
- Suitable for social media + SEO categorisation
- Same language as the article: {article.language}
- No hashtags (no # prefix)

Return tags as a comma-separated list, no quotes, no explanation.
Example: machine learning, neural networks, deep learning, AI ethics, transformer models"""


def parse_tags_from_ai_output(text: str) -> list[str]:
    """Permissive parser for the tag generator's response.

    Real LLM output may come back as:
      ``machine learning, neural networks, deep learning``
      ``- machine learning\n- neural networks``
      ``1. machine learning\n2. neural networks``
      ``"machine learning", "neural networks"``

    The parser handles all four shapes. Caps the result at 10 tags
    even when the prompt asked for 5-7 (defensive: the LLM does not
    always honour the bound).
    """
    text = (text or "").strip()
    if not text:
        return []

    lines = [line.strip().lstrip("-*•0123456789. ") for line in text.split("\n") if line.strip()]

    raw_tags: list[str]
    if len(lines) == 1:
        raw_tags = [t.strip() for t in lines[0].split(",")]
    else:
        raw_tags = [line.strip() for line in lines]

    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in raw_tags:
        # Strip surrounding quotes (some models wrap each tag).
        tag = raw.strip().strip("\"'").strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        cleaned.append(tag)
        if len(cleaned) >= 10:
            break
    return cleaned
