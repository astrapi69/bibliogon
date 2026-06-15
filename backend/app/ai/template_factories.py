"""Empty + per-record AI-template factories.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

import json
from typing import Any

from app.ai.template_body import extract_body_preview, extract_body_text
from app.ai.template_models import SCHEMA_VERSION, ArticleTemplate, BookTemplate

# Realistic English examples baked into the empty templates so the
# AI has something concrete to anchor on. The user-facing prompts
# modules (article_template_prompts.py, book_template_prompts.py)
# carry richer per-field-class examples; what lives here is the
# minimal set the empty template needs to be self-explanatory on
# its own.


def _article_field_specs() -> dict[str, dict[str, Any]]:
    return {
        "title": {
            "description": (
                "The article's main title. Should be specific, capture interest, "
                "and accurately reflect content."
            ),
            "example": "Fake News: A Threat to Society",
            "current_value": None,
        },
        "seo_title": {
            "description": (
                "Search-engine-optimized title, maximum 60 characters. "
                "Front-load the primary keyword. Often identical to the main "
                "title, but can differ for SEO reasons."
            ),
            "example": "Fake News and Misinformation: Society's Modern Threat",
            "current_value": None,
        },
        "seo_description": {
            "description": (
                "Meta-description shown in search results. 150-160 characters. "
                "Describe the value proposition with a subtle call-to-action."
            ),
            "example": (
                "Discover how fake news shapes public opinion and learn five "
                "practical strategies to identify misinformation. Essential "
                "reading for media literacy."
            ),
            "current_value": None,
        },
        "excerpt": {
            "description": (
                "Short summary (200-300 characters) shown on article lists "
                "and as social-media-share preview. More conversational than "
                "the SEO description."
            ),
            "example": (
                "Fake news isn't just an internet problem - it shapes elections, "
                "public health responses, and the basic trust that holds "
                "societies together. Here's what's really at stake."
            ),
            "current_value": None,
        },
        "tags": {
            "description": (
                "5-10 tags, single-word or hyphenated, lowercase. Reflects the "
                "topics covered. Used for search and grouping."
            ),
            "example": [
                "misinformation",
                "media-literacy",
                "fact-checking",
                "social-media",
                "public-discourse",
            ],
            "current_value": [],
        },
        "topic": {
            "description": (
                "Single primary topic (one word or short phrase). Bibliogon "
                "uses this to group articles by theme."
            ),
            "example": "Media Literacy",
            "current_value": None,
        },
        "featured_image_prompt": {
            "description": (
                "Stable-Diffusion-style prompt for the article's hero image. "
                "Include style hint (photorealistic, illustration, abstract), "
                "composition, mood, and lighting. Add 'no text in image' when "
                "appropriate."
            ),
            "example": (
                "A close-up photograph of a person reading a newspaper with the "
                "headline blurred, modern realistic photography style, cool blue "
                "lighting suggesting an analytical mood, slight depth of field, "
                "no text in image"
            ),
            "current_value": None,
        },
        "inline_image_prompts": {
            "description": (
                "Prompts for illustrations within the article body, one per "
                "major section (typically h2-headed). Each entry has "
                "{section_hint, prompt}. The section_hint is a short label "
                "telling the AI where the illustration goes; the prompt is "
                "the actual image-generation prompt."
            ),
            "example": [
                {
                    "section_hint": "Introduction - the problem",
                    "prompt": (
                        "Multiple newspaper headlines overlapping, some "
                        "crumpled, mixed with smartphone screens showing "
                        "social media notifications, dramatic shadow "
                        "lighting, editorial photo style, no text"
                    ),
                },
                {
                    "section_hint": "Spread mechanism",
                    "prompt": (
                        "Abstract network visualization with red nodes "
                        "pulsing outward, dark background, suggesting viral "
                        "misinformation spread, generative-art style, no text"
                    ),
                },
            ],
            "current_value": [],
        },
    }


def _book_field_specs() -> dict[str, dict[str, Any]]:
    return {
        "title": {
            "description": (
                "The book's main title. Should be memorable, genre-appropriate, "
                "and discoverable in search."
            ),
            "example": "The Last Cartographer",
            "current_value": None,
        },
        "subtitle": {
            "description": (
                "Optional subtitle. Often used for non-fiction to specify the "
                "topic or angle; for fiction, sometimes a tagline."
            ),
            "example": "A Practical Guide to Map-Making in the Age of GPS",
            "current_value": None,
        },
        "description": {
            "description": (
                "Short plain-text book description (1-2 paragraphs). Used "
                "internally; the Amazon HTML description is generated "
                "separately."
            ),
            "example": (
                "A field guide for the modern cartographer, drawing on "
                "fifteen years of experience mapping urban wildlife corridors."
            ),
            "current_value": None,
        },
        "genre": {
            "description": (
                "Primary genre. Single word or short phrase. Used for marketplace categorization."
            ),
            "example": "Non-Fiction / Reference",
            "current_value": None,
        },
        "keywords": {
            "description": (
                "5-10 keywords, single-word or hyphenated, lowercase. Used "
                "for SEO and marketplace search."
            ),
            "example": [
                "cartography",
                "field-guide",
                "urban-wildlife",
                "map-making",
                "non-fiction",
            ],
            "current_value": [],
        },
        "html_description": {
            "description": (
                "Amazon-style HTML book description. Allowed tags: b, i, br, "
                "p, h2, ul, li. Hook in the first paragraph; benefits as a "
                "list; soft call-to-action at the end. Around 200-300 words."
            ),
            "example": (
                "<p><b>How do you map what doesn't want to be mapped?</b></p>"
                "<p>The Last Cartographer follows fifteen years of fieldwork "
                "tracking wildlife through urban environments...</p>"
            ),
            "current_value": None,
        },
        "backpage_description": {
            "description": (
                "Back-cover blurb. 100-200 words. Hook -> conflict -> stakes. No spoilers."
            ),
            "example": (
                "When the city decided to pave over the last green corridor, "
                "Marta took her notebooks and went looking for what was about "
                "to disappear..."
            ),
            "current_value": None,
        },
        "backpage_author_bio": {
            "description": (
                "Short author bio for the back cover. 50-100 words. Third "
                "person. Credentials + a personal note."
            ),
            "example": (
                "Marta Rivers is a field biologist and amateur cartographer "
                "based in Lisbon. She has been mapping urban wildlife "
                "corridors for over fifteen years..."
            ),
            "current_value": None,
        },
        "cover_image_prompt": {
            "description": (
                "Stable-Diffusion-style prompt for the book cover. Specify "
                "mood, color palette, dominant subject. Book covers are "
                "usually portrait orientation (6x9 inches). Add 'no text in "
                "image' when appropriate (text is overlaid separately)."
            ),
            "example": (
                "Hand-drawn vintage map of a city park overlaid with faint "
                "wildlife tracks, muted earth-tones, parchment texture, "
                "portrait composition, soft natural lighting, no text in "
                "image"
            ),
            "current_value": None,
        },
        "chapter_summaries": {
            "description": (
                "One-sentence summary per chapter, used for marketing copy "
                "and the table-of-contents page. Each entry has "
                "{chapter_id, title, summary}. Match summaries to chapters "
                "by chapter_id (preferred) or title; do NOT add entries for "
                "chapters not in the list."
            ),
            "example": [
                {
                    "chapter_id": "abc123",
                    "title": "The First Survey",
                    "summary": (
                        "Marta arrives in Lisbon and lays out the methodology for the survey."
                    ),
                },
            ],
            "current_value": [],
        },
    }


def build_empty_article_template(language: str = "en") -> ArticleTemplate:
    """Construct the empty / new-idea Article template. No
    ``reference`` block; ``language`` lives at root so the
    'file alone tells the AI what language to respond in'
    invariant holds."""
    data: dict[str, Any] = {"type": "article", "schema_version": SCHEMA_VERSION}
    data["language"] = language
    data.update(_article_field_specs())
    return ArticleTemplate.model_validate(data)


def build_empty_book_template(language: str = "en") -> BookTemplate:
    """Construct the empty / new-idea Book template."""
    data: dict[str, Any] = {"type": "book", "schema_version": SCHEMA_VERSION}
    data["language"] = language
    data.update(_book_field_specs())
    return BookTemplate.model_validate(data)


# ---------------------------------------------------------------------------
# Per-record factories
# ---------------------------------------------------------------------------


def _decode_json_list(raw: str | None) -> list[Any]:
    """Decode a JSON-list-stored-as-text column back to a list.
    Empty / NULL / malformed -> empty list (Bibliogon convention
    for these columns; see lessons-learned)."""
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return decoded if isinstance(decoded, list) else []


def build_article_template_from_record(
    article: Any, *, body_word_limit: int = 500
) -> ArticleTemplate:
    """Construct an Article template populated with the live
    values of the given DB record. ``article`` is the
    ``app.models.Article`` instance; typed ``Any`` here to keep
    this module free of SQLAlchemy imports."""
    specs = _article_field_specs()

    # current_value population from the record.
    specs["title"]["current_value"] = article.title or None
    specs["seo_title"]["current_value"] = article.seo_title or None
    specs["seo_description"]["current_value"] = article.seo_description or None
    specs["excerpt"]["current_value"] = article.excerpt or None
    specs["tags"]["current_value"] = _decode_json_list(article.tags)
    specs["topic"]["current_value"] = article.topic or None
    specs["featured_image_prompt"]["current_value"] = article.featured_image_prompt or None
    specs["inline_image_prompts"]["current_value"] = _decode_json_list(article.inline_image_prompts)

    preview, word_count = extract_body_preview(article.content_json, word_limit=body_word_limit)
    data: dict[str, Any] = {
        "type": "article",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": article.id,
            "language": article.language,
            "body_word_count": word_count,
            "body_preview": preview,
        },
    }
    data.update(specs)
    return ArticleTemplate.model_validate(data)


def build_book_template_from_record(book: Any, *, body_word_limit: int = 500) -> BookTemplate:
    """Construct a Book template populated with the live values
    of the given DB record. ``book`` is the ``app.models.Book``
    instance."""
    specs = _book_field_specs()

    specs["title"]["current_value"] = book.title or None
    specs["subtitle"]["current_value"] = book.subtitle or None
    specs["description"]["current_value"] = book.description or None
    specs["genre"]["current_value"] = book.genre or None
    specs["keywords"]["current_value"] = _decode_json_list(book.keywords)
    specs["html_description"]["current_value"] = book.html_description or None
    specs["backpage_description"]["current_value"] = book.backpage_description or None
    specs["backpage_author_bio"]["current_value"] = book.backpage_author_bio or None
    specs["cover_image_prompt"]["current_value"] = book.cover_image_prompt or None
    specs["chapter_summaries"]["current_value"] = _decode_json_list(book.chapter_summaries)

    chapter_texts = [_chapter_to_text(c) for c in book.chapters]
    joined = "\n\n".join(t for t in chapter_texts if t)
    if not joined:
        preview, word_count = "", 0
    else:
        words = joined.split()
        word_count = len(words)
        preview = (
            joined
            if word_count <= body_word_limit
            else " ".join(words[:body_word_limit]) + " [...]"
        )

    data: dict[str, Any] = {
        "type": "book",
        "schema_version": SCHEMA_VERSION,
        "reference": {
            "id": book.id,
            "language": book.language,
            "body_word_count": word_count,
            "body_preview": preview,
        },
    }
    data.update(specs)
    return BookTemplate.model_validate(data)


def _chapter_to_text(chapter: Any) -> str:
    """Extract plain text from a Chapter row. Books store
    chapters as TipTap JSON in ``Chapter.content`` (same
    convention as ``Article.content_json``), so the same
    walker applies."""
    return extract_body_text(chapter.content)
