import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_id() -> str:
    return uuid.uuid4().hex


class ChapterType(str, enum.Enum):
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


class Book(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str | None] = mapped_column(String(300), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="de")
    series: Mapped[str | None] = mapped_column(String(300), nullable=True)
    series_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Publishing metadata
    edition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(300), nullable=True)
    publisher_city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    publish_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isbn_ebook: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isbn_paperback: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isbn_hardcover: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asin_ebook: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asin_paperback: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asin_hardcover: Mapped[str | None] = mapped_column(String(20), nullable=True)
    keywords: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    html_description: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Amazon book description
    backpage_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    backpage_author_bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_css: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI-assisted content flag (for KDP/export metadata)
    ai_assisted: Mapped[bool] = mapped_column(default=False)
    # Cumulative AI token usage for this book (prompt + completion tokens)
    ai_tokens_used: Mapped[int] = mapped_column(default=0)

    # Audiobook / TTS settings per book
    tts_engine: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_voice: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tts_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tts_speed: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )  # e.g. "1.0", "0.75", "1.25"
    # Audiobook merge mode: "separate", "merged", "both" (None -> use plugin default)
    audiobook_merge: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Custom audiobook output filename (without extension). None -> derive from book title.
    audiobook_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # When True, the next audiobook export regenerates every chapter and
    # skips the "audiobook already exists" confirm dialog. Replaces the
    # former plugin-global ``audiobook.settings.overwrite_existing`` flag.
    audiobook_overwrite_existing: Mapped[bool] = mapped_column(default=False)
    # JSON-encoded list of chapter type strings to skip during audiobook
    # generation, e.g. ``["toc", "imprint", "index"]``. Replaces the
    # former plugin-global ``audiobook.settings.skip_types`` list. Empty
    # string or NULL means "use the audiobook generator's built-in
    # SKIP_TYPES fallback". Same Text-as-JSON pattern as ``keywords``.
    audiobook_skip_chapter_types: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PGS-04: shared id across translations of the same book. NULL when
    # the book is not linked to any others. Auto-populated on multi-branch
    # git imports; user-settable via the Settings link/unlink UI for
    # books imported separately. Flat cross-link - no master/translation
    # hierarchy, every book in the group references the same id.
    translation_group_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    # ms-tools per-book threshold overrides. None -> fall back to plugin defaults.
    ms_tools_max_sentence_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ms_tools_repetition_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ms_tools_max_filler_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", order_by="Chapter.position"
    )
    import_source: Mapped["BookImportSource | None"] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        uselist=False,
    )
    assets: Mapped[list["Asset"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Book {self.id!r} title={self.title!r}>"


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chapter_type: Mapped[str] = mapped_column(String(20), default=ChapterType.CHAPTER.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
    # Optimistic-lock version counter. Incremented by the PATCH handler
    # on every successful content write (commit 6). Starts at 1.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    book: Mapped["Book"] = relationship(back_populates="chapters")

    def __repr__(self) -> str:
        return (
            f"<Chapter {self.id!r} title={self.title!r} type={self.chapter_type} v={self.version}>"
        )


class ChapterVersion(Base):
    """Immutable snapshot of a chapter at a point in time.

    Populated by the PATCH /chapters handler right before it bumps
    `Chapter.version`. Retention policy: trim to the last N per
    chapter (N=20) after each insert. Used by the Restore flow and
    crash-recovery workflows that need to look further back than the
    TipTap in-session undo stack.
    """

    __tablename__ = "chapter_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    chapter_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<ChapterVersion chapter={self.chapter_id!r} v={self.version}>"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    book: Mapped["Book"] = relationship(back_populates="assets")

    def __repr__(self) -> str:
        return f"<Asset {self.id!r} filename={self.filename!r} type={self.asset_type}>"


class BookImportSource(Base):
    """Origin record for an imported book.

    Written by the orchestrator's execute step; read by the detect
    step so the preview panel can show "This book appears to already
    be imported (as <title>, created <date>)" with Cancel / Overwrite /
    Create-as-Copy options. Without this table, re-imports silently
    create duplicate books (bug class documented in the cover-import
    debugging sessions).
    """

    __tablename__ = "book_import_sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Source identifier format is plugin-specific:
    #   ``sha256:<hex>``      for content-addressable ZIPs / files
    #   ``git:<normalized>``  for git URLs
    #   ``signature:<...>``   for folder/single-file content signatures
    source_identifier: Mapped[str] = mapped_column(String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    format_name: Mapped[str] = mapped_column(String(50), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    book: Mapped["Book"] = relationship(back_populates="import_source")

    def __repr__(self) -> str:
        return (
            f"<BookImportSource book={self.book_id!r} "
            f"identifier={self.source_identifier!r} type={self.source_type}>"
        )


class GitSyncMapping(Base):
    """plugin-git-sync per-book sync state (PGS-02).

    Written when the wizard completes a git import that landed in
    plugin-git-sync's persistent clone area. Read by the
    "Commit to Repo" path so the plugin can locate the on-disk
    clone, regenerate the WBT structure into it via the
    plugin-export scaffolder, and commit + optionally push.
    """

    __tablename__ = "git_sync_mappings"

    book_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("books.id", ondelete="CASCADE"),
        primary_key=True,
    )
    repo_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    branch: Mapped[str] = mapped_column(
        String(200), nullable=False, default="main", server_default="main"
    )
    last_imported_commit_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    local_clone_path: Mapped[str] = mapped_column(String(2000), nullable=False)
    last_committed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<GitSyncMapping book={self.book_id!r} url={self.repo_url!r} branch={self.branch!r}>"
        )


class BookTemplate(Base):
    """Reusable book structure that pre-fills a new book with chapters.

    Builtin templates ship with the app (``is_builtin=True``) and are
    read-only for the user; user-created templates can be edited and
    deleted.
    """

    __tablename__ = "book_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    genre: Mapped[str] = mapped_column(String(100), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    chapters: Mapped[list["BookTemplateChapter"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="BookTemplateChapter.position",
    )

    def __repr__(self) -> str:
        return f"<BookTemplate {self.id!r} name={self.name!r} builtin={self.is_builtin}>"


class BookTemplateChapter(Base):
    __tablename__ = "book_template_chapters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    template_id: Mapped[str] = mapped_column(
        ForeignKey("book_templates.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    chapter_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ChapterType.CHAPTER.value
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)

    template: Mapped["BookTemplate"] = relationship(back_populates="chapters")

    def __repr__(self) -> str:
        return (
            f"<BookTemplateChapter {self.id!r} title={self.title!r} "
            f"type={self.chapter_type} pos={self.position}>"
        )


class ChapterTemplate(Base):
    """Reusable single-chapter structure (Interview, FAQ, Recipe, ...).

    Parallel to ``BookTemplate`` but for one chapter instead of a
    whole book. Builtins ship with the app (``is_builtin=True``) and
    are read-only for the user.
    """

    __tablename__ = "chapter_templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    chapter_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ChapterType.CHAPTER.value
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return (
            f"<ChapterTemplate {self.id!r} name={self.name!r} "
            f"type={self.chapter_type} builtin={self.is_builtin}>"
        )


class AudioVoice(Base):
    """Cached TTS voice from an engine (e.g. Edge TTS, Google TTS)."""

    __tablename__ = "audio_voices"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    engine: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    voice_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    quality: Mapped[str] = mapped_column(String(30), nullable=False, default="standard")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def __repr__(self) -> str:
        return f"<AudioVoice {self.voice_id!r} engine={self.engine} lang={self.language}>"


class Article(Base):
    """Standalone long-form article.

    Phase 1 (shipped): single TipTap document + minimal metadata +
    draft/published/archived lifecycle.

    Phase 2 (this revision): canonical SEO fields used as defaults
    inherited by per-platform Publications, plus a one-to-many
    relationship to Publication.

    `content_type` defaults to `"article"`; the column exists so a
    future Blogpost / Tweet differentiation can land without a
    schema change. Phase 1+2 only writes `"article"`.
    """

    __tablename__ = "articles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str | None] = mapped_column(String(300), nullable=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, default="article")
    # TipTap JSON serialised to a string. Matches the Chapter.content
    # convention (Bibliogon stores TipTap JSON as Text rather than the
    # SQLAlchemy JSON type so the diff/version-history paths work the
    # same way for both entities).
    content_json: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    # AR-02 Phase 2 SEO defaults. Publications inherit these unless
    # the platform_metadata blob overrides per-platform.
    canonical_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    featured_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-encoded list[str]. Mirrors Book.keywords convention.
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # AR-02 Phase 2.1: primary category + dedicated SEO title/desc.
    # ``topic`` is settings-managed (config/app.yaml: topics: list)
    # and stored as a free string here so legacy values from a deleted
    # settings entry survive. ``seo_title`` and ``seo_description`` are
    # the SEO-only versions of ``title`` and ``excerpt`` - they default
    # to those fields at publish time when left empty.
    topic: Mapped[str | None] = mapped_column(String(100), nullable=True)
    seo_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    seo_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    publications: Mapped[list["Publication"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        order_by="Publication.created_at",
    )

    assets: Mapped[list["ArticleAsset"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        order_by="ArticleAsset.uploaded_at",
    )

    def __repr__(self) -> str:
        return f"<Article {self.id!r} title={self.title!r} status={self.status}>"


class ArticleAsset(Base):
    """Uploaded asset attached to an :class:`Article`.

    UX-FU-02: parallel of :class:`Asset` for articles. Featured-image
    uploads land here; the article's ``featured_image_url`` column
    points at the served path so existing downstream consumers
    (Open-Graph snippets, platform_metadata fallbacks) keep working.
    """

    __tablename__ = "article_assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    article_id: Mapped[str] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"),
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False, default="featured_image")
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    article: Mapped["Article"] = relationship(back_populates="assets")

    def __repr__(self) -> str:
        return (
            f"<ArticleAsset {self.id!r} filename={self.filename!r} "
            f"type={self.asset_type}>"
        )


class Publication(Base):
    """Per-platform outbound piece linked to an :class:`Article`.

    Each row is one publication on one platform: either the main
    article publication or a promo post (``is_promo=True``) that
    links back to a primary publication.

    Drift detection. ``content_snapshot_at_publish`` records the
    article's ``content_json`` at the moment the user marked the
    publication ``published``. The drift check compares the snapshot
    against the article's current ``content_json``; mismatch flips
    the effective status to ``out_of_sync`` until the user runs
    "verify live" (which refreshes ``last_verified_at``) or
    re-snapshots via mark-published.

    Platform metadata. Stored as JSON-serialised string for forward
    compatibility with new platforms; validated against
    ``platform_schemas.yaml`` at the API layer (AR-02 Part 3).
    """

    __tablename__ = "publications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    article_id: Mapped[str] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    is_promo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    # JSON-encoded dict per platform_schemas.yaml. Stored as Text for
    # the same reason content_json is - keeps the diff path simple.
    platform_metadata: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # JSON-encoded TipTap doc snapshot at the moment of publish. Null
    # until status first hits ``published``.
    content_snapshot_at_publish: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    article: Mapped["Article"] = relationship(back_populates="publications")

    def __repr__(self) -> str:
        return (
            f"<Publication {self.id!r} article={self.article_id} "
            f"platform={self.platform} status={self.status}>"
        )
