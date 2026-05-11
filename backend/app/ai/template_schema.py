"""Pydantic schemas, YAML serializer, and parser for Bibliogon
AI templates (``.biblio.yaml``).

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 2/10.

A Bibliogon AI template is a self-contained, self-explanatory
YAML file describing one Article or Book and the metadata
fields an AI assistant (or a human author) can fill in for it.
The file is designed to travel without Bibliogon context: any
AI that reads YAML can understand from the file alone what
goes where, because every fillable field carries a
``description`` and an ``example`` alongside its
``current_value``.

The top-of-file comment block (``ARTICLE_HEADER`` /
``BOOK_HEADER``) carries the rules-for-AI text — fill only
``current_value``, respond in the article's language, use real
UTF-8 characters, leave fields null when uncertain. These rules
are embedded in the file rather than passed as a system prompt
so the same artefact works for the built-in AI workflow, the
custom-endpoint workflow (LM Studio / Ollama), and the
external-roundtrip workflow (paste the YAML into Claude.ai or
ChatGPT and get the filled YAML back).
"""

from __future__ import annotations

import json
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ValidationError

# ---------------------------------------------------------------------------
# Schema version
# ---------------------------------------------------------------------------

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

_RULES_BLOCK = """\
# RULES FOR AI ASSISTANTS:
#
# 1. Fill ONLY the `current_value` keys. Do not modify the
#    `description` or `example` keys - they are documentation
#    for you to read, not output to produce.
# 2. If `current_value` already has a value, leave it alone
#    unless the user explicitly asks for re-generation.
# 3. Return valid YAML. No commentary outside YAML comments.
# 4. Use real UTF-8 characters (ae oe ue ss umlauts, accents,
#    CJK characters). Do NOT escape them and do NOT substitute
#    ASCII transliterations.
# 5. Respond in the article's language. If `reference.language`
#    is set, use that. If only `language` at root is set (empty
#    new-idea template), use that. Default to English if
#    neither is present.
# 6. If you cannot generate a field with high confidence,
#    leave its `current_value` null. Do not invent.
# 7. Do not change `type`, `schema_version`, `reference`, or
#    `language` at root. They are file metadata, not content."""

ARTICLE_HEADER = f"""\
# ============================================================
# Bibliogon Article Template (schema v{SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Article and the
# metadata fields you can fill in for it.
#
{_RULES_BLOCK}
#
# ============================================================
"""

BOOK_HEADER = f"""\
# ============================================================
# Bibliogon Book Template (schema v{SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Book and the
# metadata fields you can fill in for it.
#
{_RULES_BLOCK}
#
# Note for Books: the `chapter_summaries` field is a list of
# objects, one per existing chapter. Match summaries to
# chapters by `chapter_id` (preferred) or `title`. Do not add
# new chapter entries; only fill the `summary` field of
# existing ones.
#
# ============================================================
"""


# ---------------------------------------------------------------------------
# Body-preview extraction (moved from app.routers.articles)
# ---------------------------------------------------------------------------


def extract_body_text(tiptap_json: str | None) -> str:
    """Walk a serialised TipTap doc and return concatenated plain
    text. Returns ``""`` on parse failure so the caller can
    decide what "empty" means. Origin: moved from
    ``app.routers.articles._extract_plain_text`` so the AI
    template module owns the helper that produces its own
    body preview."""
    if not tiptap_json:
        return ""
    try:
        doc = json.loads(tiptap_json)
    except (ValueError, TypeError):
        return ""

    parts: list[str] = []

    def walk(node: object) -> None:
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str):
            parts.append(text)
        children = node.get("content")
        if isinstance(children, list):
            for child in children:
                walk(child)

    walk(doc)
    return "\n".join(p for p in parts if p).strip()


def extract_body_preview(
    tiptap_json: str | None, word_limit: int = 500
) -> tuple[str, int]:
    """Return ``(preview, total_word_count)`` for the body.

    The preview is the first ``word_limit`` words of the body
    plus a ``[...]`` ellipsis when truncation occurred. The
    total word count reflects the full body, not the preview -
    callers want to surface the full size so the AI knows how
    much context the preview represents."""
    text = extract_body_text(tiptap_json)
    if not text:
        return "", 0
    words = text.split()
    total = len(words)
    if total <= word_limit:
        return text, total
    return " ".join(words[:word_limit]) + " [...]", total


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Field-application primitives (shared by article + book routers)
# ---------------------------------------------------------------------------

# Reasons returned by ``apply_field`` for the skipped path.
APPLY_SKIP_EMPTY = "value-is-empty"
APPLY_SKIP_POPULATED = "field-already-populated"
APPLY_UPDATED = "updated"


def is_template_value_empty(value: Any) -> bool:
    """An AI- or template-supplied value is "empty" (=> always
    skip on apply) when it is None, an empty / whitespace-only
    string, or an empty list."""
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, list) and len(value) == 0:
        return True
    return False


def is_column_populated(raw: Any, *, is_json_list: bool) -> bool:
    """True when the current article/book column is non-empty;
    force=false should preserve it. JSON-text-as-list columns
    are decoded before the length check; string columns use a
    truthy / non-whitespace check."""
    if is_json_list:
        if not raw:
            return False
        try:
            decoded = json.loads(raw)
        except (ValueError, TypeError):
            return False
        return isinstance(decoded, list) and len(decoded) > 0
    if raw is None:
        return False
    if isinstance(raw, str):
        return bool(raw.strip())
    return bool(raw)


def apply_field(
    record: Any,
    column_name: str,
    new_value: Any,
    *,
    force: bool,
    is_json_list: bool,
) -> str:
    """Apply a single field to an article/book record. Returns
    one of ``APPLY_UPDATED``, ``APPLY_SKIP_EMPTY``,
    ``APPLY_SKIP_POPULATED``. Caller owns the DB transaction.

    Force-override semantics (S6):
    - ``new_value`` empty: always skip, regardless of force.
    - Existing column populated + ``force=False``: skip.
    - Otherwise: write. JSON-list columns serialize via
      ``json.dumps`` so the on-disk text-as-list shape stays
      consistent with the rest of Bibliogon's conventions."""
    if is_template_value_empty(new_value):
        return APPLY_SKIP_EMPTY
    existing = getattr(record, column_name)
    if not force and is_column_populated(existing, is_json_list=is_json_list):
        return APPLY_SKIP_POPULATED
    if is_json_list:
        setattr(record, column_name, json.dumps(new_value))
    else:
        setattr(record, column_name, new_value)
    return APPLY_UPDATED


_OPTIONAL_ROOT_KEYS = ("reference", "language")


def serialize_template_to_yaml(
    template: TemplateModel, include_header: bool = True
) -> str:
    """Render a template as YAML. With ``include_header=True``
    (default) the top-of-file rules-for-AI comment block is
    prepended; otherwise pure YAML body is returned (used by
    bulk-export ZIP tests that diff content without header
    noise).

    Field order is preserved via Pydantic's declaration order +
    ``sort_keys=False``. The three-keys-per-field contract
    (``description`` + ``example`` + ``current_value``) is
    preserved verbatim - we do NOT use ``exclude_none``
    blanket-wide because that would drop ``current_value: null``
    from unset fields and break the "every field has three keys"
    invariant. Instead, only the optional ROOT-level keys
    (``reference`` and ``language``) are dropped when None, so
    empty templates skip the reference block cleanly while
    per-field current_value=null stays in the output."""
    body = template.model_dump()
    for key in _OPTIONAL_ROOT_KEYS:
        if body.get(key) is None:
            body.pop(key, None)
    yaml_body = yaml.safe_dump(
        body,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    if not include_header:
        return yaml_body
    header = ARTICLE_HEADER if isinstance(template, ArticleTemplate) else BOOK_HEADER
    return header + "\n" + yaml_body


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def parse_template_from_yaml(yaml_str: str) -> TemplateModel:
    """Parse a template YAML string into an ``ArticleTemplate``
    or ``BookTemplate`` dispatched on the ``type`` discriminator.
    Comments are silently dropped by PyYAML; the rules-for-AI
    header survives only via the regenerated header at export
    time (documented in lessons-learned).

    Raises:
        TemplateSchemaError: on malformed YAML, missing or
            unknown ``type``, or unsupported ``schema_version``.
    """
    try:
        body = yaml.safe_load(yaml_str)
    except yaml.YAMLError as exc:
        raise TemplateSchemaError(f"Malformed YAML: {exc}") from exc

    if not isinstance(body, dict):
        raise TemplateSchemaError("Template root must be a mapping")

    schema_version = body.get("schema_version")
    if schema_version != SCHEMA_VERSION:
        raise TemplateSchemaError(
            f"Unsupported schema_version {schema_version!r}; expected {SCHEMA_VERSION}"
        )

    type_ = body.get("type")
    if type_ == "article":
        model_cls: type[TemplateModel] = ArticleTemplate
    elif type_ == "book":
        model_cls = BookTemplate
    else:
        raise TemplateSchemaError(
            f"Unknown template type {type_!r}; expected 'article' or 'book'"
        )

    try:
        return model_cls.model_validate(body)
    except ValidationError as exc:
        raise TemplateSchemaError(f"Template structure invalid: {exc}") from exc


# ---------------------------------------------------------------------------
# Empty-template factories
# ---------------------------------------------------------------------------

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
                "Primary genre. Single word or short phrase. Used for "
                "marketplace categorization."
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
                "Back-cover blurb. 100-200 words. Hook -> conflict -> stakes. "
                "No spoilers."
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
                        "Marta arrives in Lisbon and lays out the methodology "
                        "for the survey."
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
    specs["featured_image_prompt"]["current_value"] = (
        article.featured_image_prompt or None
    )
    specs["inline_image_prompts"]["current_value"] = _decode_json_list(
        article.inline_image_prompts
    )

    preview, word_count = extract_body_preview(
        article.content_json, word_limit=body_word_limit
    )
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


def build_book_template_from_record(
    book: Any, *, body_word_limit: int = 500
) -> BookTemplate:
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
    specs["chapter_summaries"]["current_value"] = _decode_json_list(
        book.chapter_summaries
    )

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
