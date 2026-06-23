import json
import re
from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Bug 9: BISAC subject heading code format. 3 uppercase letters
# identifying the subject prefix (FIC, BIO, SCI, etc.) followed by
# 6 digits identifying the leaf subject within that prefix. The
# regex is the format check ONLY — Bibliogon does NOT bundle the
# BISG catalogue so we can't validate that the code actually exists
# (per D3, free-text + format-validation MVP; bundled lookup is
# the deferred ``BISAC-DATABASE-LOOKUP-01`` P5 item). The format
# check catches the most common typo class (transposed letter /
# digit, lowercase, wrong segment length).
BISAC_CODE_RE = re.compile(r"^[A-Z]{3}[0-9]{6}$")


def _reject_control_chars(value: str, field: str) -> str:
    """Reject NUL + other C0 control characters in a single-line text field.

    SQLite does not enforce ``String(n)`` length and happily stores NUL
    bytes, which later poison filename derivation and C-string consumers
    (QA L5). Single-line metadata (titles) should carry no control chars;
    tab / newline / carriage-return are allowed through for tolerance.
    """
    for ch in value:
        if ord(ch) < 0x20 and ch not in "\t\n\r":
            raise ValueError(f"{field} must not contain control characters")
    return value


# Hex color regex for ``Page.mood_color`` (PICTURE-BOOK-STORYBOARD-
# VIEW-01). Matches ``#RRGGBB`` only — no 3-char shorthand, no alpha
# channel, no named colors. Picker UIs always emit the 6-digit form.
MOOD_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

# Story-structure tag for ``Page.story_beat`` / ``Chapter.story_beat``
# (PICTURE-BOOK-STORYBOARD-VIEW-01 + STORY-BIBLE-STORYBOARD-INTEGRATION-01
# C3). Six fixed values constrain future beat-sheet templates
# (Save-the-Cat, Hero's Journey, Three-Act). Stored as ``String(20)`` in
# the DB; validated as Literal at the Pydantic layer per the existing
# ``Page.layout`` precedent (no SQL ENUM). Defined here (top of module)
# because both the Chapter schemas and the Page schemas reference it.
StoryBeat = Literal[
    "setup",
    "inciting",
    "rising",
    "climax",
    "falling",
    "resolution",
]

# Per-chapter drafting workflow status (CHAPTER-STATUS-LABELS-01).
# Fixed four-value enum (Scrivener-style To Do / First Draft / Revised
# / Final). Stored as ``String(20)`` in the DB; Literal-validated at the
# Pydantic layer per the ``Chapter.story_beat`` precedent. None = no
# status set.
ChapterStatus = Literal[
    "todo",
    "first_draft",
    "revised",
    "final",
]

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


# Phase-4 discriminator. Flat (no umbrella + sub_type pair). Each
# visual book_type is owned by its own plugin:
#   "prose"        - chapter-based core path.
#   "picture_book" - plugin-kinderbuch. v1 active.
#   "comic_book"   - reserved for future plugin-comics; the value is
#                    defined here so a comics plugin can ship its
#                    panels + speech_bubbles migration WITHOUT
#                    re-migrating this column.
BookType = Literal["prose", "picture_book", "comic_book"]


# PUBLICATION-STATUS-BOOK-PARITY-01 (2026-05-29). Shared
# publication-lifecycle enum. Both Article.status and Book.status
# use the same 4 values; centralised here so a future status
# change propagates to both surfaces in one edit. The name
# ``_PUBLISHING_LIFECYCLE`` is deliberately distinct from
# ``_PUBLICATION_STATUSES`` (per-platform Publication entity at
# line 976) which has a 5-value Platform-publication enum
# (planned / scheduled / published / out_of_sync / archived).
_PUBLISHING_LIFECYCLE = ("draft", "ready", "published", "archived")
PublicationStatus = Literal["draft", "ready", "published", "archived"]


class CollectionItem(BaseModel):
    """One manual chapter collection (CHAPTER-COLLECTIONS-01).

    A named, ordered set of chapter ids. Stored as a JSON list on
    ``Book.collections``; ``chapter_ids`` are not FK-validated here (a
    stale id is harmless - the UI simply skips chapters it cannot find).
    """

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    chapter_ids: list[str] = Field(default_factory=list)
    # Optional swatch colour for visual distinction in the Outliner
    # ("Kampfszenen" = red, "Backstory" = blue). Hex, matching the
    # ChapterLabel / mood_color convention; NULL = no colour.
    color: str | None = Field(default=None, max_length=7)

    @field_validator("color")
    @classmethod
    def _validate_collection_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("color must be a hex color code like #RRGGBB")
        return value


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = None
    author: str | None = None
    language: str = "de"
    genre: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None
    # EXPOSE-BUCHIDEE-METADATA-01: optional author-design metadata.
    # See Book model field-comment for the distinction between
    # ``book_idea`` (short premise), ``expose`` (long-form Exposé),
    # and ``description`` (short blurb).
    book_idea: str | None = None
    expose: str | None = None
    # Default "prose" keeps existing clients backward-compatible: any
    # caller that omits book_type creates a prose book.
    book_type: BookType = "prose"
    # PUBLICATION-STATUS-BOOK-PARITY-01: optional on create;
    # defaults to "draft" via the column default when omitted.
    # Same 4 values as Article.status.
    status: PublicationStatus | None = None

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str) -> str:
        return _reject_control_chars(value, "title")


class BookUpdate(BaseModel):
    # Phase-4 immutability rule: book_type is immutable after
    # creation. It is deliberately ABSENT from this schema so any
    # PATCH payload that includes it is silently dropped by Pydantic's
    # default extra='ignore' behaviour. A loud 400 on explicit attempts
    # is enforced in the books PATCH handler before this schema is
    # constructed (see app/routers/books.py).
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = None
    author: str | None = None
    language: str | None = None
    genre: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None
    # Writing goals (WRITING-GOALS-PROGRESS-TRACKING-01). word_target:
    # per-book aggregate target; word_target_deadline: optional draft
    # deadline (ISO date string -> date).
    word_target: int | None = Field(default=None, ge=0)
    word_target_deadline: date | None = None
    # EXPOSE-BUCHIDEE-METADATA-01: author-design metadata.
    book_idea: str | None = None
    expose: str | None = None
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
    # Bug 9: subject categorisation. ``categories`` is free-text
    # (KDP-style names + any string the user types); ``bisac_codes``
    # is format-validated against ``BISAC_CODE_RE`` per entry, raising
    # 422 on the offending row. Both follow the same JSON-text-as-list
    # storage as ``keywords``.
    categories: list[str] | None = None
    bisac_codes: list[str] | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    # Project-level notes scratchpad (CHAPTER-SYNOPSIS-NOTES-01).
    notes: str | None = Field(default=None, max_length=20000)
    # STORY-BIBLE-RELATIONSHIP-GRAPH-01 C5: persisted relationship-graph
    # node positions {entity_id: {x, y}}.
    graph_layout: dict | None = None
    collections: list[CollectionItem] | None = None
    # BOOK-REPOSITORY-URL-FIELD-01: manual repo URL for books not
    # imported via plugin-git-sync. See Book model field-comment +
    # docs/ROADMAP.md "Book Metadata Extensions" entry. Empty string
    # is coerced to None so an emptied UI field clears the value.
    repository_url: str | None = None
    # AI-assisted content flag
    ai_assisted: bool | None = None
    ai_tokens_used: int | None = None
    # PUBLICATION-STATUS-BOOK-PARITY-01: publication-lifecycle
    # column. Optional on PATCH; backend only writes when provided.
    status: PublicationStatus | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str | None) -> str | None:
        if v is not None and v not in _PUBLISHING_LIFECYCLE:
            raise ValueError(f"status must be one of {_PUBLISHING_LIFECYCLE}, got {v!r}")
        return v

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str | None) -> str | None:
        return value if value is None else _reject_control_chars(value, "title")

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

    # Bug 9: categories accept the same JSON-string / comma-list /
    # list input shapes as keywords. Dedup is case-insensitive +
    # trim-aware so "Fiction" and " fiction " collapse to one entry.
    @field_validator("categories", mode="before")
    @classmethod
    def _coerce_categories_in(cls, value: Any) -> Any:
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

    # Bug 9: BISAC codes get the same coercion shape PLUS a per-entry
    # format check against the 9-char ``[A-Z]{3}[0-9]{6}`` pattern.
    # Lowercase letters are auto-uppercased (BISAC codes are
    # canonically uppercase but users typing them by hand often type
    # lowercase); the resulting uppercased form is then re-checked.
    # An invalid entry raises ValueError → Pydantic 422 with the
    # offending code in the error detail so the user can see exactly
    # what failed.
    @field_validator("bisac_codes", mode="before")
    @classmethod
    def _coerce_bisac_codes_in(cls, value: Any) -> Any:
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
            text = str(item).strip().upper()
            if not text:
                continue
            if not BISAC_CODE_RE.match(text):
                raise ValueError(
                    f"Invalid BISAC code {text!r}. Expected 3 uppercase "
                    f"letters followed by 6 digits (e.g. FIC022020)."
                )
            if text in seen:
                continue
            seen.add(text)
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


# --- BookFromArticles schemas (article-to-book conversion, Phase 1) ---


class BookFromArticlesSortStrategy(str, Enum):
    """Sort strategy for article-to-chapter ordering."""

    DATE_ASC = "date_asc"
    DATE_DESC = "date_desc"
    TITLE_ASC = "title_asc"
    TITLE_DESC = "title_desc"
    MANUAL = "manual"


class BookFromArticlesFrontMatter(BaseModel):
    """Optional front-matter chapters prepended before article chapters.

    Each ``include_*`` flag gates one chapter; the matching ``*_title``
    overrides the server's English default; the matching ``*_text`` becomes
    the chapter body (wrapped as a single-paragraph TipTap doc).
    Title-Page has no text input — the user customises the cover/title
    chapter via the Book-Editor afterwards.

    Order at generation time: Title-Page -> Dedication -> Introduction
    (standard publishing convention).
    """

    include_title_page: bool = False
    title_page_title: str | None = Field(default=None, max_length=500)

    include_dedication: bool = False
    dedication_title: str | None = Field(default=None, max_length=500)
    dedication_text: str | None = None

    include_introduction: bool = False
    introduction_title: str | None = Field(default=None, max_length=500)
    introduction_text: str | None = None


class BookFromArticlesBackMatter(BaseModel):
    """Optional back-matter chapters appended after article chapters.

    Order at generation time: Acknowledgments -> Author Bio
    (Author Bio is conventionally the last back-matter item).
    """

    include_acknowledgments: bool = False
    acknowledgments_title: str | None = Field(default=None, max_length=500)
    acknowledgments_text: str | None = None

    include_author_bio: bool = False
    author_bio_title: str | None = Field(default=None, max_length=500)
    author_bio_text: str | None = None


class BookFromArticlesChapterSettings(BaseModel):
    """Settings governing the article-to-chapter mapping.

    Notes on dropped fields: ``preserve_article_id_metadata`` was in
    the original Pre-Inspection spec but there is no
    ``Chapter.source_article_id`` column to hold the value, which would
    make it a kwarg-without-behaviour (forbidden by the lessons-learned
    "End-to-end behavior tests" rule). Reintroduce alongside the
    schema migration that adds the reverse-link column
    (``CONVERT-TO-BOOK-REVERSE-LINK-01``, P5).
    """

    use_article_title_as_chapter_title: bool = True


class BookFromArticlesCreate(BaseModel):
    """Payload for ``POST /api/books/from-articles``.

    Selected Articles are copied into a new Book as Chapters. Original
    Articles are left untouched (decoupled lifecycle by design — see
    the article-to-book design notes in the Phase 1 commit).

    Sort strategies operate on the resolved Article rows:
    - ``date_*`` uses :attr:`Article.original_published_at` (earliest
      publication date) with fallback to ``created_at`` for native
      Bibliogon articles that have no publications.
    - ``title_*`` is a case-insensitive lexical sort.
    - ``manual`` requires ``manual_order`` to be a permutation of
      ``article_ids``.
    """

    article_ids: list[str] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str = Field(default="en", min_length=2, max_length=10)
    series: str | None = Field(default=None, max_length=300)
    series_index: int | None = None
    keywords: list[str] = Field(default_factory=list)
    cover_image: str | None = Field(default=None, max_length=500)
    sort_strategy: BookFromArticlesSortStrategy = BookFromArticlesSortStrategy.DATE_ASC
    manual_order: list[str] | None = None
    front_matter: BookFromArticlesFrontMatter | None = None
    back_matter: BookFromArticlesBackMatter | None = None
    chapter_settings: BookFromArticlesChapterSettings = Field(
        default_factory=BookFromArticlesChapterSettings
    )


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
    # Writing goals (WRITING-GOALS-PROGRESS-TRACKING-01).
    word_target: int | None = None
    word_target_deadline: date | None = None
    # EXPOSE-BUCHIDEE-METADATA-01: author-design metadata. Same
    # nullable Text storage as ``description``.
    book_idea: str | None = None
    expose: str | None = None
    # Phase-4 discriminator. Defaults to "prose" for back-compat with
    # existing pre-migration rows.
    book_type: str = "prose"
    # PUBLICATION-STATUS-BOOK-PARITY-01. Publication-lifecycle
    # column; mirrors Article.status. Defaults to "draft" for
    # back-compat with pre-migration rows (the migration backfills
    # the column server-side, but Pydantic needs a default for
    # API responses constructed from non-DB sources).
    status: str = "draft"
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
    # Bug 9: subject categorisation. Same JSON-text-as-list convention
    # as keywords. The ``_decode_json_list`` validator below is
    # registered against both new fields so the storage Text value
    # parses cleanly into list[str] for the API response.
    categories: list[str] = []
    bisac_codes: list[str] = []
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    # Project-level notes scratchpad (CHAPTER-SYNOPSIS-NOTES-01).
    notes: str | None = None
    # Manual chapter collections (CHAPTER-COLLECTIONS-01).
    collections: list[CollectionItem] | None = None
    # BOOK-REPOSITORY-URL-FIELD-01: optional git repo URL. The
    # BookMetadataEditor reads this directly when no GitSyncMapping
    # exists; when a mapping exists, the UI prefers the mapping's
    # repo_url for display (read-only) and ignores this column.
    repository_url: str | None = None
    # UNIVERSAL-AI-TEMPLATE-01 Session 1 columns. Same JSON-text-as-list
    # convention as keywords for chapter_summaries.
    cover_image_prompt: str | None = None
    chapter_summaries: list[dict] = []
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

    @field_validator(
        "audiobook_skip_chapter_types",
        "keywords",
        "categories",
        "bisac_codes",
        mode="before",
    )
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

    @field_validator("chapter_summaries", mode="before")
    @classmethod
    def _decode_chapter_summaries(cls, value: Any) -> list[dict]:
        """chapter_summaries column is JSON-text storing
        ``[{chapter_id, title, summary}]``. Decode for the API."""
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [v for v in value if isinstance(v, dict)]
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [v for v in parsed if isinstance(v, dict)]
            return []
        return []


class BookDetail(BookOut):
    chapters: list["ChapterOut"] = []
    # STORY-BIBLE-RELATIONSHIP-GRAPH-01 C5: persisted relationship-graph
    # node positions {entity_id: {x, y}}. NULL = use the auto-layout.
    graph_layout: dict | None = None


# --- Chapter schemas ---


class ChapterCreate(BaseModel):
    title: str
    content: str = ""
    position: int | None = None
    chapter_type: ChapterType = ChapterType.CHAPTER
    # Storyboard annotation fields (STORY-BIBLE-STORYBOARD-INTEGRATION-01
    # C3). Mirror the Page storyboard fields; accepted on create for
    # forward-compat with importers that pre-populate them.
    notes: str | None = None
    story_beat: StoryBeat | None = None
    mood_color: str | None = Field(default=None, max_length=7)
    act_group: str | None = Field(default=None, max_length=100)
    status: ChapterStatus | None = None
    label_id: str | None = Field(default=None, max_length=32)
    target_words: int | None = Field(default=None, ge=0)
    synopsis: str | None = Field(default=None, max_length=2000)
    # Per-chapter Inspector notes (additive enhancement). Distinct from the
    # Storyboard ``notes`` sticky above and from project-wide ``Book.notes``.
    inspector_notes: str | None = Field(default=None, max_length=20000)

    @field_validator("mood_color")
    @classmethod
    def _validate_mood_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("mood_color must be a hex color code like #RRGGBB")
        return value


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
    # Storyboard annotation fields (STORY-BIBLE-STORYBOARD-INTEGRATION-01
    # C3). All optional; ``exclude_unset=True`` in the PATCH handler means
    # unsent fields are NOT overwritten to NULL.
    notes: str | None = None
    story_beat: StoryBeat | None = None
    mood_color: str | None = Field(default=None, max_length=7)
    act_group: str | None = Field(default=None, max_length=100)
    status: ChapterStatus | None = None
    label_id: str | None = Field(default=None, max_length=32)
    target_words: int | None = Field(default=None, ge=0)
    synopsis: str | None = Field(default=None, max_length=2000)
    # Per-chapter Inspector notes (additive enhancement). All optional;
    # ``exclude_unset=True`` in the PATCH handler means an unsent field is
    # NOT overwritten to NULL.
    inspector_notes: str | None = Field(default=None, max_length=20000)

    @field_validator("mood_color")
    @classmethod
    def _validate_mood_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("mood_color must be a hex color code like #RRGGBB")
        return value


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
    # Storyboard annotation fields (STORY-BIBLE-STORYBOARD-INTEGRATION-01
    # C3). Always returned (NULL when unset); plain String/Text columns
    # round-trip directly. story_beat returns the raw String value (no
    # Literal enforcement on read so legacy rows still serialize cleanly).
    notes: str | None = None
    story_beat: str | None = None
    mood_color: str | None = None
    act_group: str | None = None
    # Drafting workflow (CHAPTER-STATUS-LABELS-01). status returns the
    # raw String (no Literal enforcement on read so legacy rows
    # serialize cleanly); label_id is the assigned ChapterLabel id (the
    # client maps it to name+color via the book's chapter-labels list).
    status: str | None = None
    label_id: str | None = None
    target_words: int | None = None
    synopsis: str | None = None
    # Per-chapter Inspector notes (additive enhancement). Always returned
    # (NULL when unset); plain Text column round-trips directly.
    inspector_notes: str | None = None


class WritingSessionOut(BaseModel):
    """One day's net words written (WRITING-GOALS-PROGRESS-TRACKING-01)."""

    model_config = ConfigDict(from_attributes=True)

    day: date
    words_written: int


class WritingStatsSummaryOut(BaseModel):
    """Global writing-history summary over a window (WRITING-HISTORY-STATS-01)."""

    model_config = ConfigDict(from_attributes=True)

    total_words: int
    days_active: int
    avg_per_active_day: int
    best_day: WritingSessionOut | None
    current_streak: int
    longest_streak: int
    daily: list[WritingSessionOut]


class WritingBookStatsOut(BaseModel):
    """Per-book writing totals + daily series (WRITING-HISTORY-STATS-01)."""

    model_config = ConfigDict(from_attributes=True)

    book_id: str
    book_title: str
    total_words: int
    daily: list[WritingSessionOut]


class WritingChapterStatsOut(BaseModel):
    """Per-chapter writing total (WRITING-HISTORY-STATS-01)."""

    model_config = ConfigDict(from_attributes=True)

    chapter_id: str | None
    chapter_title: str
    total_words: int


class ChapterLabelCreate(BaseModel):
    """Create body for a per-book chapter label (CHAPTER-STATUS-LABELS-01)."""

    name: str = Field(min_length=1, max_length=100)
    color: str = Field(max_length=7)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str) -> str:
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("color must be a hex color code like #RRGGBB")
        return value


class ChapterLabelUpdate(BaseModel):
    """PATCH body for a chapter label; all fields optional."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=7)
    position: int | None = None

    @field_validator("color")
    @classmethod
    def _validate_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("color must be a hex color code like #RRGGBB")
        return value


class ChapterLabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    name: str
    color: str
    position: int


class ChapterVersionSummary(BaseModel):
    """Version metadata for the list view (no content)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    title: str
    version: int
    name: str | None = None
    is_manual: bool = False
    created_at: datetime


class ChapterVersionRead(ChapterVersionSummary):
    """Full version with content (for preview and restore)."""

    content: str


class ChapterSnapshotCreate(BaseModel):
    """Body for ``POST /chapters/{id}/snapshots`` (CHAPTER-SNAPSHOTS-01).

    Takes a Scrivener-style manual snapshot of the chapter's CURRENT
    saved state. The optional ``name`` is a free-text label the user
    gives the snapshot ("Before restructure"); when omitted the
    snapshot is kept but unnamed.
    """

    name: str | None = None

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class ChapterVersionDiffLine(BaseModel):
    """One line of a snapshot-vs-current diff."""

    #: One of ``unchanged`` / ``added`` / ``removed``. ``added`` means
    #: the line is present in the CURRENT chapter but not the snapshot;
    #: ``removed`` means it was in the snapshot but is gone now.
    type: str
    text: str


class ChapterVersionDiff(BaseModel):
    """Line-oriented diff between a stored version and the current
    chapter content (CHAPTER-SNAPSHOTS-01)."""

    version_id: str
    title_changed: bool
    snapshot_title: str
    current_title: str
    lines: list[ChapterVersionDiffLine]


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


class ArticleAssetOut(BaseModel):
    """UX-FU-02: parallel of AssetOut for article-scoped uploads."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    article_id: str
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
    # TM-04b sub-item 3: list of child ChapterTemplate ids that, when
    # the template is applied, are inserted in order. Empty list (or
    # None) means single-chapter mode (legacy default).
    child_template_ids: list[str] | None = None


class ChapterTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    chapter_type: ChapterType | None = None
    content: str | None = None
    language: str | None = None
    child_template_ids: list[str] | None = None


class ChapterTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    chapter_type: str
    content: str | None
    language: str
    is_builtin: bool
    child_template_ids: list[str] | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("child_template_ids", mode="before")
    @classmethod
    def _decode_child_ids(cls, value: object) -> object:
        """Accept either a JSON-stringified list (from the DB column)
        or a real list (when constructed in code). Empty / null become
        ``None`` so callers can branch on a falsy value."""
        if value is None or value == "":
            return None
        if isinstance(value, list):
            return value or None
        if isinstance(value, str):
            import json as _json

            try:
                parsed = _json.loads(value)
            except (TypeError, ValueError):
                return None
            return parsed or None
        return value


# --- Article schemas (AR-01 Phase 1) ---


# Back-compat alias: existing call-sites grep for
# ``_ARTICLE_STATUSES``. Points at the hoisted
# ``_PUBLISHING_LIFECYCLE`` constant defined near the top of
# the module.
_ARTICLE_STATUSES = _PUBLISHING_LIFECYCLE

# ARTICLE-TYPES-SSOT-01: must stay in sync with
# backend/config/content-types.yaml. The verification test
# (test_content_type_registry.py::test_literal_matches_registry)
# fails loudly on drift.
ContentType = Literal[
    "blogpost",
    "tutorial",
    "review",
    "essay",
    "newsletter",
    "interview",
    "listicle",
    "short_story",
    "article",
]


class ArticleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str = Field(default="en", min_length=2, max_length=10)
    # ARTICLE-TYPES-SSOT-01. Optional on create; defaults to
    # "blogpost" via the column default when omitted.
    content_type: ContentType | None = None
    article_metadata: dict[str, Any] | None = None

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str) -> str:
        return _reject_control_chars(value, "title")


class ArticleUpdate(BaseModel):
    """PATCH body. All fields optional; only provided fields update."""

    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    author: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, min_length=2, max_length=10)
    content_json: str | None = None
    status: str | None = None

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str | None) -> str | None:
        return value if value is None else _reject_control_chars(value, "title")

    # AR-02 Phase 2 SEO fields. ArticleEditor sidebar PATCHes these
    # through the same endpoint as content_json + title.
    canonical_url: str | None = Field(default=None, max_length=500)
    featured_image_url: str | None = Field(default=None, max_length=500)
    excerpt: str | None = None
    tags: list[str] | None = None
    # AR-02 Phase 2.1
    topic: str | None = Field(default=None, max_length=100)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = None
    # Bulk-export filter; flat free-string per Book.series convention.
    series: str | None = Field(default=None, max_length=300)
    # ARTICLE-TYPES-SSOT-01. Article-type discriminator + per-type
    # extra fields. ``content_type`` validated against the
    # registry via Pydantic Literal; ``article_metadata`` is a free
    # JSON object (per-type extra fields defined in
    # content-types.yaml).
    content_type: ContentType | None = None
    article_metadata: dict[str, Any] | None = None

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
    # ARTICLE-TYPES-SSOT-01. Per-type extra fields. Stored as
    # JSON-text on the column; decoded to a dict for the API.
    article_metadata: dict[str, Any] = {}
    content_json: str
    status: str
    canonical_url: str | None = None
    featured_image_url: str | None = None
    excerpt: str | None = None
    tags: list[str] = []
    topic: str | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    series: str | None = None
    # UNIVERSAL-AI-TEMPLATE-01 Session 1 columns. Mirror the
    # tags-style JSON decoder so consumers see a decoded list,
    # not a JSON string.
    featured_image_prompt: str | None = None
    inline_image_prompts: list[dict] = []
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    # Cumulative AI token usage attributable to this article. Default
    # 0 keeps backwards compatibility with rows seeded before the
    # column existed.
    ai_tokens_used: int = 0
    # Earliest Publication.published_at across all publications of
    # this article; None when no publication has a published_at set.
    # Computed at serialization time via Article.original_published_at
    # property; not a DB column. Frontend prefers this over
    # updated_at for date display so imported articles show the
    # canonical Medium publish date instead of the import timestamp.
    original_published_at: datetime | None = None
    # MEDIUM-COMMENTS-UI-01. Number of non-soft-deleted comments
    # linked to this article. Computed via Article.comments_count
    # property; not a DB column. Drives the dashboard tile's
    # count badge without an N+1 fetch from
    # GET /api/articles/{id}/comments. Defaults to 0 so callers
    # never have to defensively check for missing key.
    comments_count: int = 0

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

    @field_validator("article_metadata", mode="before")
    @classmethod
    def _decode_article_metadata(cls, value: Any) -> dict[str, Any]:
        """``article_metadata`` is JSON-text on the column. Decode to
        dict for the API. NULL / empty-string / malformed all
        collapse to an empty dict so consumers never have to
        defensively check for None."""
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

    @field_validator("inline_image_prompts", mode="before")
    @classmethod
    def _decode_inline_image_prompts(cls, value: Any) -> list[dict]:
        """inline_image_prompts column is JSON-text storing
        ``[{section_hint, prompt}]``. Decode for the API."""
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [v for v in value if isinstance(v, dict)]
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [v for v in parsed if isinstance(v, dict)]
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


# --- Page schemas (Phase 4 Session 2, picture-book plugin) ---


# Page layout names. The first 5 entries are picture-book layouts;
# ``comic_panel_grid`` is the comic-book layout (added in
# PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01). Comic-book pages store
# the grid template (single_panel / grid_2x2 / grid_3x3) in
# ``Page.layout_config.comic_grid_template``; the layout key itself
# only signals "this page is rendered by the comic walker". Plugin-
# comics owns its own ``comic_panels`` + ``comic_bubbles`` tables;
# the shared ``pages`` table just discriminates the page's renderer.
PageLayout = Literal[
    "speech_bubble",
    "image_top_text_bottom",
    "image_left_text_right",
    "image_full_text_overlay",
    "text_only",
    "comic_panel_grid",
    # Picture-Book Layout Expansion Phase 1 (2026-05-28). Single-
    # image layouts that mirror existing geometry. Subsequent
    # commits add the PageCanvas branches, walker CSS, picker
    # entries, and i18n; this commit only extends the Literal so
    # the validation surface accepts the new strings.
    "image_bottom_text_top",
    "image_right_text_left",
    "image_full_no_text",
    # Picture-Book Layout Expansion Phase 2 (2026-05-28). Multi-
    # image layouts using the M1 storage strategy: PRIMARY image
    # stays on Page.image_asset_id (zero migration); SECONDARY
    # image lives in layout_config[layout].secondary_image_asset_id
    # via the readSecondaryImageAssetId / writeSecondaryImageAssetId
    # helpers (frontend) + _read_secondary_image_asset_id (walker).
    # Subsequent commits (C2..C5) add per-layout PageCanvas
    # branches, walker CSS, picker entries, and LayoutConfig
    # bodies; this commit only extends the Literal so the
    # validation surface accepts the new strings.
    "two_images_text_center",
    "split_horizontal",
    "split_vertical",
    "image_border_text_center",
    # Picture-Book Layout Expansion Phase 3 (2026-05-28). Collage:
    # N freely-positioned images + N optional text regions, each
    # at absolute percentage-based coords. M1 rich-JSON storage in
    # ``layout_config.collage.{images, text_regions, background_color}``;
    # zero schema migration. C1 ships read-only rendering;
    # interactivity (drag-to-position, CRUD, z-index) follows in
    # C2..C4. C5 adds the PDF walker branch; C6 i18n + smoke.
    "collage",
]


class PageCreate(BaseModel):
    """Payload for POST /api/books/{id}/pages.

    Position is NOT in the create payload: a new page appends to the
    end of the book (next available position). Use POST .../reorder
    to move pages around after creation.

    ``text_content`` is layout-discriminated by the FRONTEND (PB-PHASE4
    Session 4c-B-1 D2 decision): Tier-Property layouts (speech_bubble +
    image_full_text_overlay) send plain string; TipTap layouts
    (image_top_text_bottom + image_left_text_right + text_only) send
    a JSON-serialized TipTap doc as a string. The backend stores both
    shapes transparently in the same column — see ``Page`` model
    docstring for the storage convention.
    """

    layout: PageLayout
    text_content: str | None = None
    image_asset_id: str | None = None
    # JSON-encoded layout-specific configuration. Keys are layout-
    # dependent (anchor_position + opacity for speech_bubble;
    # image_position + image_fit for image_top_text_bottom; etc.).
    # Passed through verbatim to the DB; renderer reads at render time.
    # Renamed from speech_bubble_config in PB-PHASE4 Session 4c.
    layout_config: dict[str, Any] | None = None
    # Storyboard annotation fields (PICTURE-BOOK-STORYBOARD-VIEW-01).
    # Edited from the Storyboard view (Session 2 of the feature);
    # accepted on create for forward-compat with importers that pre-
    # populate them.
    notes: str | None = None
    story_beat: StoryBeat | None = None
    mood_color: str | None = Field(default=None, max_length=7)
    act_group: str | None = Field(default=None, max_length=100)

    @field_validator("mood_color")
    @classmethod
    def _validate_mood_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("mood_color must be a hex color code like #RRGGBB")
        return value


class PageUpdate(BaseModel):
    """Payload for PATCH /api/books/{id}/pages/{page_id}.

    Position is NOT mutable through this schema. Use POST .../reorder
    for position changes so the entire reorder runs in one atomic
    transaction instead of a series of single-row PATCHes that each
    leave a partially-reordered state visible.
    """

    layout: PageLayout | None = None
    text_content: str | None = None
    image_asset_id: str | None = None
    layout_config: dict[str, Any] | None = None
    # Storyboard annotation fields (PICTURE-BOOK-STORYBOARD-VIEW-01).
    # All optional; ``exclude_unset=True`` semantics in the router
    # mean unsent fields are NOT overwritten to NULL.
    notes: str | None = None
    story_beat: StoryBeat | None = None
    mood_color: str | None = Field(default=None, max_length=7)
    act_group: str | None = Field(default=None, max_length=100)

    @field_validator("mood_color")
    @classmethod
    def _validate_mood_color(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not MOOD_COLOR_RE.match(value):
            raise ValueError("mood_color must be a hex color code like #RRGGBB")
        return value


class PageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    position: int
    layout: str
    text_content: str | None = None
    image_asset_id: str | None = None
    # layout_config is stored as JSON-encoded Text in the DB. Decoded
    # for the API per the books.keywords / chapter_summaries
    # convention. Renamed from speech_bubble_config in PB-PHASE4
    # Session 4c when the column was generalized beyond Layout-A.
    layout_config: dict[str, Any] | None = None
    # Storyboard annotation fields (PICTURE-BOOK-STORYBOARD-VIEW-01).
    # Always returned (NULL when unset); no decode logic — plain
    # String / Text columns round-trip directly. story_beat returns
    # the raw String value (no Literal enforcement on read so legacy
    # rows with unexpected values still serialize cleanly).
    notes: str | None = None
    story_beat: str | None = None
    mood_color: str | None = None
    act_group: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("layout_config", mode="before")
    @classmethod
    def _decode_layout_config(cls, value: Any) -> dict[str, Any] | None:
        if value is None or value == "":
            return None
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return None
            return parsed if isinstance(parsed, dict) else None
        return None


class PagesReorder(BaseModel):
    """List of page IDs in the desired order.

    Same shape as ChapterReorder. The route handler runs the position
    updates in a single transaction so a partial failure leaves no
    rows half-reordered.
    """

    page_ids: list[str]


# --- Comic-book schemas (plugin-comics Session 2) ---
#
# Two plugin-owned tables (comic_panels + comic_bubbles) per the
# Session 1 sharing decision (comic_book pages live in the existing
# ``pages`` table with Book.book_type discriminator). All comic
# enums + JSON validation live here at the Pydantic layer, NOT in
# the DB schema — matches the Chapter.chapter_type + Page.layout
# convention.

# 6 bubble-type variants per comic-foundation.md:321-324.
BubbleType = Literal[
    "speech",
    "thought",
    "narration",
    "shout",
    "whisper",
    "sound_effect",
]

# Tail-direction enum: 8 compass octants + none + auto.
# ``auto`` defers to the renderer (picks the nearest panel edge).
BubbleTailDirection = Literal[
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
    "none",
    "auto",
]


class ComicPanelCreate(BaseModel):
    """Payload for POST .../pages/{page_id}/panels.

    Position is server-assigned (appended to the page's panel list).
    ``bounds`` is required — every panel must position itself within
    the page's content area.
    """

    bounds: dict[str, Any]  # {x_pct, y_pct, width_pct, height_pct}
    image_asset_id: str | None = None
    panel_config: dict[str, Any] | None = None


class ComicPanelUpdate(BaseModel):
    """Payload for PATCH .../comic-panels/{panel_id}.

    Position-bulk-reorder still goes through a future bulk endpoint
    (mirrors PagesReorder convention); but ``position`` IS accepted
    in single-panel update path to support the panel-overflow
    handler (COMIC-PANEL-OVERFLOW-HANDLER-01, 2026-05-28) — when a
    panel moves from one page to another, the receiving page may
    need to assign the panel a fresh position index. Bulk reorder
    of multiple panels at once stays out of scope.

    ``page_id`` is also accepted to enable the same overflow
    handler's "Move to new pages" path: the panel migrates to a
    new page (same book), bubbles + image_asset_id follow via the
    ORM relationship. Router validates page_id belongs to the same
    book to prevent cross-book panel migrations.
    """

    bounds: dict[str, Any] | None = None
    image_asset_id: str | None = None
    panel_config: dict[str, Any] | None = None
    page_id: str | None = None
    position: int | None = None


class ComicPanelOut(BaseModel):
    """Response shape for comic_panels rows.

    JSON-as-Text columns (``bounds`` + ``panel_config``) are decoded
    on read per the existing ``Page.layout_config`` convention.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    position: int
    image_asset_id: str | None = None
    bounds: dict[str, Any]
    panel_config: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("bounds", mode="before")
    @classmethod
    def _decode_bounds(cls, value: Any) -> dict[str, Any]:
        # bounds is NOT NULL at the DB layer; defensive on shape only.
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value:
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @field_validator("panel_config", mode="before")
    @classmethod
    def _decode_panel_config(cls, value: Any) -> dict[str, Any] | None:
        if value is None or value == "":
            return None
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return None
            return parsed if isinstance(parsed, dict) else None
        return None


class ComicPanelsReorder(BaseModel):
    """List of panel IDs in the desired order for one comic page.

    Mirrors ``PagesReorder`` (COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 1).
    ``panel_ids`` must contain exactly the page's current panel IDs;
    the route runs a two-phase position update in one transaction so a
    partial failure leaves no panels half-reordered.
    """

    panel_ids: list[str]


def _validate_bubble_anchor(value: dict[str, Any]) -> dict[str, Any]:
    """Bound a bubble anchor's ``x_pct`` / ``y_pct`` to [0, 100].

    The anchor is the bubble's top-left corner as a percentage of the
    panel; the PDF/editor place it at ``left: {x_pct}%; top: {y_pct}%``.
    Out-of-range values (a bypassed client clamp, a hand-crafted PATCH)
    would render the bubble off-canvas, so reject them at the API
    boundary. Keys other than x_pct/y_pct (e.g. a preset wrapper) pass
    through untouched. QA finding L2.
    """
    for key in ("x_pct", "y_pct"):
        if key in value:
            coord = value[key]
            if not isinstance(coord, (int, float)) or isinstance(coord, bool):
                raise ValueError(f"anchor.{key} must be a number")
            if not 0 <= coord <= 100:
                raise ValueError(f"anchor.{key} must be between 0 and 100, got {coord}")
    return value


class ComicBubbleCreate(BaseModel):
    """Payload for POST .../comic-panels/{panel_id}/bubbles.

    Position is server-assigned (appended). Tail fields default per
    the migration server_default values (matched here for round-trip
    consistency between API contract + DB schema).
    """

    bubble_type: BubbleType
    anchor: dict[str, Any]  # {x_pct, y_pct} OR preset string wrapper
    width_pct: int = Field(default=30, ge=10, le=100)
    height_pct: int = Field(default=20, ge=5, le=100)
    tail_direction: BubbleTailDirection = "none"
    tail_position_pct: int = Field(default=50, ge=0, le=100)
    tail_length_px: int = Field(default=16, ge=0, le=64)
    bubble_config: dict[str, Any] | None = None
    text_content: str | None = None

    @field_validator("anchor")
    @classmethod
    def _check_anchor(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_bubble_anchor(value)


class ComicBubbleUpdate(BaseModel):
    """Payload for PATCH .../comic-bubbles/{bubble_id}."""

    bubble_type: BubbleType | None = None
    anchor: dict[str, Any] | None = None
    width_pct: int | None = Field(default=None, ge=10, le=100)
    height_pct: int | None = Field(default=None, ge=5, le=100)
    tail_direction: BubbleTailDirection | None = None
    tail_position_pct: int | None = Field(default=None, ge=0, le=100)
    tail_length_px: int | None = Field(default=None, ge=0, le=64)
    bubble_config: dict[str, Any] | None = None
    text_content: str | None = None

    @field_validator("anchor")
    @classmethod
    def _check_anchor(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return value if value is None else _validate_bubble_anchor(value)


class ComicBubbleOut(BaseModel):
    """Response shape for comic_bubbles rows. JSON-as-Text
    decoded on read for ``anchor`` + ``bubble_config``; tail fields
    are siblings (real columns) per comic-foundation.md:289-291.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    panel_id: str
    position: int
    bubble_type: str
    anchor: dict[str, Any]
    width_pct: int
    height_pct: int
    tail_direction: str
    tail_position_pct: int
    tail_length_px: int
    bubble_config: dict[str, Any] | None = None
    text_content: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("anchor", mode="before")
    @classmethod
    def _decode_anchor(cls, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value:
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @field_validator("bubble_config", mode="before")
    @classmethod
    def _decode_bubble_config(cls, value: Any) -> dict[str, Any] | None:
        if value is None or value == "":
            return None
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return None
            return parsed if isinstance(parsed, dict) else None
        return None


# --- Author schemas (Bug 8 Phase 1) ---


class AuthorCreate(BaseModel):
    """Payload for ``POST /api/authors``.

    ``slug`` is server-generated from ``name`` (lowercase +
    hyphenated, German umlauts transliterated, NFKD-fold for
    other diacritics). On collision the router appends a
    numeric suffix.
    """

    name: str = Field(min_length=1, max_length=300)
    bio: str | None = None
    is_profile_author: bool = False


class AuthorUpdate(BaseModel):
    """Payload for ``PATCH /api/authors/{id}``.

    ``slug`` is immutable after create — name edits do NOT
    regenerate it. Keeping the slug stable protects any future
    URL routing that points at ``/authors/{slug}``.
    """

    name: str | None = Field(default=None, min_length=1, max_length=300)
    bio: str | None = None
    is_profile_author: bool | None = None


class AuthorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    bio: str | None
    is_profile_author: bool
    created_at: datetime
    updated_at: datetime


# --- KDP Publishing Wizard Phase 2 (C5) ---------------------------

RoyaltyPlan = Literal["35", "70"]


class BookPublishingStateRead(BaseModel):
    """Response shape for ``GET / PATCH /api/kdp/publishing-state/{book_id}``.

    JSON-as-Text columns (``prices`` + ``launch_checklist_state``)
    are decoded on read per the existing ``Page.layout_config``
    convention. ``arc_reviewers`` is populated on read via the
    relationship; empty list when no reviewers have been added.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    royalty_plan: RoyaltyPlan | None = None
    kdp_select_enrolled: bool
    kdp_select_enrollment_date: datetime | None = None
    expanded_distribution: bool
    prices: dict[str, Any]
    launch_checklist_state: dict[str, Any]
    publication_target_date: str | None = None
    last_kdp_upload_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    arc_reviewers: list["ArcReviewerOut"] = Field(default_factory=list)

    @field_validator("prices", mode="before")
    @classmethod
    def _decode_prices(cls, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value:
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @field_validator("launch_checklist_state", mode="before")
    @classmethod
    def _decode_checklist(cls, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value:
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}


class BookPublishingStateUpdate(BaseModel):
    """Payload for ``PATCH /api/kdp/publishing-state/{book_id}``.

    All fields optional. Upsert semantics: missing row → created;
    existing row → updated with the non-unset fields. ``prices``
    and ``launch_checklist_state`` accept dict input + the service
    layer JSON-encodes for storage.
    """

    royalty_plan: RoyaltyPlan | None = None
    kdp_select_enrolled: bool | None = None
    kdp_select_enrollment_date: datetime | None = None
    expanded_distribution: bool | None = None
    prices: dict[str, Any] | None = None
    launch_checklist_state: dict[str, Any] | None = None
    publication_target_date: str | None = None
    last_kdp_upload_at: datetime | None = None


class BookPublishingStateGetResponse(BaseModel):
    """Wrapped GET response carrying both the state row (nullable)
    and the related Book's ``updated_at`` for client-side conflict
    detection (per Track 5: yellow re-validate banner when
    ``state.updated_at < book.updated_at``).
    """

    book_id: str
    book_updated_at: datetime
    state: BookPublishingStateRead | None = None


# --- ARC Reviewer (C6) -------------------------------------------

ReviewStatus = Literal["invited", "sent", "received", "reviewed", "declined"]


class ArcReviewerCreate(BaseModel):
    """Payload for ``POST .../publishing-state/{book_id}/reviewers``.

    Server-assigns ``id`` + ``review_status="invited"`` +
    ``invited_at=now``. Optional ``reviewer_email`` per A16 (email
    integration is out-of-scope v1; reviewers may be known only by
    name).
    """

    reviewer_name: str = Field(min_length=1, max_length=300)
    reviewer_email: str | None = Field(default=None, max_length=320)


class ArcReviewerUpdate(BaseModel):
    """Payload for ``PATCH .../publishing-state/{book_id}/reviewers/{id}``.

    All fields optional. ``review_status`` validated via Literal
    enum (422 on unknown value). When status transitions to
    ``reviewed``, the service auto-stamps ``reviewed_at``.
    """

    review_status: ReviewStatus | None = None
    copy_version: str | None = Field(default=None, max_length=50)
    review_permalink: str | None = Field(default=None, max_length=2000)
    review_text_excerpt: str | None = None
    reviewed_at: datetime | None = None


class ArcReviewerOut(BaseModel):
    """Response shape for ``arc_reviewers`` rows."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    publishing_state_id: str
    reviewer_name: str
    reviewer_email: str | None
    review_status: str
    copy_version: str | None
    review_permalink: str | None
    review_text_excerpt: str | None
    invited_at: datetime | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- Story Bible (STORY-BIBLE-PLUGIN-01 Session 2) ---

# The five Story Bible entity types. Discriminator for the single
# StoryEntity table; the per-type metadata fields live in the SSoT
# at backend/config/story-bible-entities.yaml. Keep this Literal in
# sync with the yaml — test_story_entity_registry.py
# ::test_literal_matches_registry fails loudly on drift.
STORY_ENTITY_TYPES: tuple[str, ...] = (
    "character",
    "setting",
    "plot_point",
    "item",
    "lore",
)
StoryEntityType = Literal["character", "setting", "plot_point", "item", "lore"]


def _decode_entity_metadata(value: Any) -> dict[str, Any] | None:
    """Decode the JSON-as-Text ``entity_metadata`` column on read."""
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


# Entity-to-entity relationship type (STORY-BIBLE C10). Six fixed
# values constrain the relationship-line colour mapping in Arc View
# (ally=green, rival=red, family=blue, mentor=purple, romantic=pink,
# neutral=grey). Stored inside the JSON ``relationships`` blob;
# validated as Literal at the Pydantic layer.
RelationshipType = Literal[
    "ally",
    "rival",
    "family",
    "mentor",
    "romantic",
    "neutral",
]


class StoryEntityRelationship(BaseModel):
    """One directed relationship from an entity to another entity in
    the same book (STORY-BIBLE C10).

    Stored as an element of the JSON ``relationships`` list on
    ``StoryEntity``. ``target_entity_id`` references another
    ``story_entities`` row; the route layer validates it exists in the
    same book (no DB FK — the relationships live inside a JSON blob,
    same convention as entity_metadata)."""

    target_entity_id: str = Field(..., min_length=1)
    relationship_type: RelationshipType
    description: str | None = None


def _decode_relationships(value: Any) -> list[dict[str, Any]] | None:
    """Decode the JSON-as-Text ``relationships`` column on read."""
    if value is None or value == "":
        return None
    if isinstance(value, list):
        return [v for v in value if isinstance(v, dict)]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, list):
            return [v for v in parsed if isinstance(v, dict)]
        return None
    return None


class StoryEntityCreate(BaseModel):
    """Payload for POST .../story-bible/books/{book_id}/entities.

    Position is server-assigned (appended within the entity_type).
    ``description`` is the TipTap JSON document serialised as a
    string; ``entity_metadata`` is the per-type extra-field object.
    """

    entity_type: StoryEntityType
    name: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    entity_metadata: dict[str, Any] | None = None
    image_asset_id: str | None = None
    # Entity-to-entity relationships (STORY-BIBLE C10). Target ids are
    # validated against the same book at the route layer.
    relationships: list[StoryEntityRelationship] | None = None


class StoryEntityUpdate(BaseModel):
    """Partial update for a Story Bible entity."""

    entity_type: StoryEntityType | None = None
    name: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    entity_metadata: dict[str, Any] | None = None
    image_asset_id: str | None = None
    position: int | None = None
    relationships: list[StoryEntityRelationship] | None = None


class StoryEntityOut(BaseModel):
    """Response shape for ``story_entities`` rows."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    entity_type: str
    name: str
    description: str | None = None
    entity_metadata: dict[str, Any] | None = None
    image_asset_id: str | None = None
    position: int
    # Entity-to-entity relationships (STORY-BIBLE C10). Decoded from the
    # JSON-as-Text column; NULL when unset.
    relationships: list[StoryEntityRelationship] | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("entity_metadata", mode="before")
    @classmethod
    def _decode_metadata(cls, value: Any) -> dict[str, Any] | None:
        return _decode_entity_metadata(value)

    @field_validator("relationships", mode="before")
    @classmethod
    def _decode_rels(cls, value: Any) -> list[dict[str, Any]] | None:
        return _decode_relationships(value)


class StoryEntityRelationshipResolved(BaseModel):
    """A relationship with the target entity resolved to a full object
    (STORY-BIBLE C10). Returned by
    ``GET .../entities/{entity_id}/relationships``."""

    relationship_type: str
    description: str | None = None
    target: StoryEntityOut


class StoryEntityAutoDetectProposal(BaseModel):
    """One proposed entity-appearance link found by the auto-detector
    (STORY-BIBLE C14). The entity's name occurs in a chapter's / page's
    text and no link exists yet. Exactly one of page_id / chapter_id is
    set, mirroring StoryEntityPageLink."""

    entity_id: str
    entity_name: str
    entity_type: str
    page_id: str | None = None
    chapter_id: str | None = None
    #: Human label for the target page/chapter (e.g. "Page 3" or the
    #: chapter title) — display only.
    ref_label: str
    #: Number of case-insensitive name occurrences in that text.
    occurrences: int


class StoryEntityLinkCreate(BaseModel):
    """Payload for POST /api/story-bible/links — link an entity to a
    page (picture/comic books) or a chapter (prose books).

    Exactly one of ``page_id`` / ``chapter_id`` must be set; the route
    validates this and that the referenced rows exist.
    """

    entity_id: str = Field(..., min_length=1)
    page_id: str | None = None
    chapter_id: str | None = None
    role: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class StoryEntityLinkOut(BaseModel):
    """Response shape for a ``story_entity_page_links`` row, with the
    linked entity embedded so the page->entities direction (storyboard
    badges) has the entity name + type without a second fetch."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_id: str
    page_id: str | None = None
    chapter_id: str | None = None
    role: str | None = None
    notes: str | None = None
    created_at: datetime
    entity: StoryEntityOut
