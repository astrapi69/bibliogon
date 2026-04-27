import json
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Enums ---


class ChapterType(str, Enum):
    CHAPTER = "chapter"
    PREFACE = "preface"
    FOREWORD = "foreword"
    ACKNOWLEDGMENTS = "acknowledgments"
    ABOUT_AUTHOR = "about_author"
    APPENDIX = "appendix"
    BIBLIOGRAPHY = "bibliography"
    GLOSSARY = "glossary"
    EPILOGUE = "epilogue"
    IMPRINT = "imprint"
    NEXT_IN_SERIES = "next_in_series"
    PART = "part"
    PART_INTRO = "part_intro"
    INTERLUDE = "interlude"
    TABLE_OF_CONTENTS = "toc"
    DEDICATION = "dedication"
    PROLOGUE = "prologue"
    INTRODUCTION = "introduction"
    AFTERWORD = "afterword"
    FINAL_THOUGHTS = "final_thoughts"
    INDEX = "index"
    EPIGRAPH = "epigraph"
    ENDNOTES = "endnotes"
    ALSO_BY_AUTHOR = "also_by_author"
    EXCERPT = "excerpt"
    CALL_TO_ACTION = "call_to_action"
    HALF_TITLE = "half_title"
    TITLE_PAGE = "title_page"
    COPYRIGHT = "copyright"
    SECTION = "section"
    CONCLUSION = "conclusion"


# --- Book schemas ---


class BookCreate(BaseModel):
    title: str
    subtitle: str | None = None
    author: str | None = None
    language: str = "de"
    genre: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None


class BookUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    author: str | None = None
    language: str | None = None
    genre: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None
    # Publishing metadata
    edition: str | None = None
    publisher: str | None = None
    publisher_city: str | None = None
    publish_date: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    isbn_hardcover: str | None = None
    asin_ebook: str | None = None
    asin_paperback: str | None = None
    asin_hardcover: str | None = None
    keywords: list[str] | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    # AI-assisted content flag
    ai_assisted: bool | None = None
    ai_tokens_used: int | None = None

    @field_validator("keywords", mode="before")
    @classmethod
    def _coerce_keywords_in(cls, value: Any) -> Any:
        # Accept legacy callers that still send a JSON-encoded string or
        # a comma-separated string. Empty entries and duplicates (case
        # insensitive, order preserved) are dropped.
        if value is None:
            return None
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    value = parsed
                else:
                    value = [raw]
            except json.JSONDecodeError:
                value = [part.strip() for part in raw.split(",")]
        if not isinstance(value, list):
            return value
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = str(item).strip()
            if not text:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
        return cleaned

    # Audiobook / TTS settings
    tts_engine: str | None = None
    tts_voice: str | None = None
    tts_language: str | None = None
    tts_speed: str | None = None
    audiobook_merge: str | None = None
    audiobook_filename: str | None = None
    audiobook_overwrite_existing: bool | None = None
    audiobook_skip_chapter_types: list[str] | None = None
    # ms-tools per-book threshold overrides
    ms_tools_max_sentence_length: int | None = None
    ms_tools_repetition_window: int | None = None
    ms_tools_max_filler_ratio: float | None = None


class BookFromTemplateCreate(BaseModel):
    """Payload for ``POST /api/books/from-template``.

    ``template_id`` selects the source template. ``description`` is
    optional: when omitted the server falls back to the template's
    description.
    """

    template_id: str
    title: str
    author: str
    language: str = "en"
    subtitle: str | None = None
    genre: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    subtitle: str | None
    author: str | None
    language: str
    genre: str | None = None
    series: str | None
    series_index: int | None
    description: str | None
    edition: str | None = None
    publisher: str | None = None
    publisher_city: str | None = None
    publish_date: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    isbn_hardcover: str | None = None
    asin_ebook: str | None = None
    asin_paperback: str | None = None
    asin_hardcover: str | None = None
    keywords: list[str] = []
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    ai_assisted: bool = False
    ai_tokens_used: int = 0
    tts_engine: str | None = None
    tts_voice: str | None = None
    tts_language: str | None = None
    tts_speed: str | None = None
    audiobook_merge: str | None = None
    audiobook_filename: str | None = None
    audiobook_overwrite_existing: bool = False
    audiobook_skip_chapter_types: list[str] = []
    ms_tools_max_sentence_length: int | None = None
    ms_tools_repetition_window: int | None = None
    ms_tools_max_filler_ratio: float | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("audiobook_skip_chapter_types", "keywords", mode="before")
    @classmethod
    def _decode_json_list(cls, value: Any) -> list[str]:
        """Decode a JSON-encoded Text column into a list for the API.

        Both ``Book.audiobook_skip_chapter_types`` and ``Book.keywords``
        are stored as JSON text. When Pydantic loads from ORM the value
        comes in as a string and needs to be parsed before the
        ``list[str]`` type check.
        """
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
            return []
        return []


class BookDetail(BookOut):
    chapters: list["ChapterOut"] = []


# --- Chapter schemas ---


class ChapterCreate(BaseModel):
    title: str
    content: str = ""
    position: int | None = None
    chapter_type: ChapterType = ChapterType.CHAPTER


class ChapterUpdate(BaseModel):
    """PATCH body for chapter updates.

    `version` is required and must match the current `Chapter.version`
    on the server. Mismatch -> 409 with the current server state so the
    frontend can offer conflict resolution.
    """

    version: int
    title: str | None = None
    content: str | None = None
    position: int | None = None
    chapter_type: ChapterType | None = None


class ChapterFork(BaseModel):
    """PS-13 body for ``POST /chapters/{id}/fork``.

    Clones the user's local edit into a NEW chapter inserted directly
    after the source chapter; the source chapter is left untouched (it
    keeps whatever content the server already has). Used by
    ConflictResolutionDialog as a third option alongside Keep/Discard:
    the user preserves their unsaved work without overwriting the
    server's version.
    """

    #: TipTap JSON the editor was about to save (string-serialised).
    content: str
    #: Optional title for the new chapter. When omitted the backend
    #: appends a localisation-neutral suffix to the source title (the
    #: frontend translates it before sending in practice).
    title: str | None = None


class ChapterSummary(BaseModel):
    """Chapter metadata without content (for book detail listings)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    title: str
    position: int
    chapter_type: str
    version: int


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    title: str
    content: str
    position: int
    chapter_type: str
    created_at: datetime
    updated_at: datetime
    version: int


class ChapterVersionSummary(BaseModel):
    """Version metadata for the list view (no content)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    title: str
    version: int
    created_at: datetime


class ChapterVersionRead(ChapterVersionSummary):
    """Full version with content (for preview and restore)."""

    content: str


class ChapterReorder(BaseModel):
    """List of chapter IDs in the desired order."""

    chapter_ids: list[str]


# --- Asset schemas ---


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    filename: str
    asset_type: str
    path: str
    uploaded_at: datetime


# --- Book template schemas ---


class BookTemplateChapterSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    position: int
    title: str
    chapter_type: ChapterType = ChapterType.CHAPTER
    content: str | None = None


class BookTemplateCreate(BaseModel):
    name: str
    description: str
    genre: str
    language: str = "en"
    is_builtin: bool = False
    chapters: list[BookTemplateChapterSchema]

    @field_validator("chapters")
    @classmethod
    def _require_chapters(
        cls, value: list[BookTemplateChapterSchema]
    ) -> list[BookTemplateChapterSchema]:
        if not value:
            raise ValueError("chapters must not be empty")
        return value


class BookTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    genre: str | None = None
    language: str | None = None
    chapters: list[BookTemplateChapterSchema] | None = None


class BookTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    genre: str
    language: str
    is_builtin: bool
    created_at: datetime
    updated_at: datetime
    chapters: list[BookTemplateChapterSchema] = []


# --- Chapter template schemas ---


class ChapterTemplateCreate(BaseModel):
    name: str
    description: str
    chapter_type: ChapterType = ChapterType.CHAPTER
    content: str | None = None
    language: str = "en"
    is_builtin: bool = False


class ChapterTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    chapter_type: ChapterType | None = None
    content: str | None = None
    language: str | None = None


class ChapterTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    chapter_type: str
    content: str | None
    language: str
    is_builtin: bool
    created_at: datetime
    updated_at: datetime


# --- Article schemas (AR-01 Phase 1) ---


_ARTICLE_STATUSES = ("draft", "published", "archived")


class ArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str = Field(default="en", min_length=2, max_length=10)


class ArticleUpdate(BaseModel):
    """PATCH body. All fields optional; only provided fields update."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, min_length=2, max_length=10)
    content_json: str | None = None
    status: str | None = None
    # AR-02 Phase 2 SEO fields. ArticleEditor sidebar PATCHes these
    # through the same endpoint as content_json + title.
    canonical_url: str | None = Field(default=None, max_length=500)
    featured_image_url: str | None = Field(default=None, max_length=500)
    excerpt: str | None = None
    tags: list[str] | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _ARTICLE_STATUSES:
            raise ValueError(f"status must be one of {_ARTICLE_STATUSES}, got {v!r}")
        return v


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    subtitle: str | None
    author: str | None
    language: str
    content_type: str
    content_json: str
    status: str
    canonical_url: str | None = None
    featured_image_url: str | None = None
    excerpt: str | None = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def _decode_tags(cls, value: Any) -> list[str]:
        """Tags column is JSON-text. Decode to list[str] for the API."""
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [str(v) for v in parsed]
            return []
        return []


# AR-02 Phase 2 SEO update payload. Patches the canonical SEO fields
# on the Article itself (publications inherit unless overridden in
# their own platform_metadata blob).
class ArticleSeoUpdate(BaseModel):
    canonical_url: str | None = Field(default=None, max_length=500)
    featured_image_url: str | None = Field(default=None, max_length=500)
    excerpt: str | None = None
    tags: list[str] | None = None


# --- Publication schemas (AR-02 Phase 2) ---


_PUBLICATION_STATUSES = (
    "planned",
    "scheduled",
    "published",
    "out_of_sync",
    "archived",
)


class PublicationCreate(BaseModel):
    platform: str = Field(min_length=1, max_length=50)
    is_promo: bool = False
    platform_metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    scheduled_at: datetime | None = None


class PublicationUpdate(BaseModel):
    """PATCH body. All fields optional."""

    status: str | None = None
    platform_metadata: dict[str, Any] | None = None
    scheduled_at: datetime | None = None
    published_at: datetime | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _PUBLICATION_STATUSES:
            raise ValueError(f"status must be one of {_PUBLICATION_STATUSES}, got {v!r}")
        return v


class MarkPublishedRequest(BaseModel):
    """Body for ``POST /publications/{id}/mark-published``.

    The router snapshots Article.content_json into
    Publication.content_snapshot_at_publish, sets status='published',
    and stores published_at + the platform-side URL (via
    platform_metadata.published_url).
    """

    published_url: str | None = None
    published_at: datetime | None = None


class PublicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    article_id: str
    platform: str
    is_promo: bool
    status: str
    platform_metadata: dict[str, Any] = {}
    content_snapshot_at_publish: str | None
    scheduled_at: datetime | None
    published_at: datetime | None
    last_verified_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("platform_metadata", mode="before")
    @classmethod
    def _decode_metadata(cls, value: Any) -> dict[str, Any]:
        """platform_metadata column is JSON-text. Decode to dict."""
        if value is None or value == "":
            return {}
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}


class PlatformSchemaOut(BaseModel):
    """Per-platform schema as exposed via the API. Mirrors the YAML
    shape so the frontend can render forms directly."""

    display_name: str
    required_metadata: list[str] = []
    optional_metadata: list[str] = []
    max_tags: int | None = None
    max_chars_per_post: int | None = None
    publishing_method: str = "manual"
    notes: str | None = None
