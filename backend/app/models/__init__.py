import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    PART_INTRO = "part_intro"
    INTERLUDE = "interlude"
    TABLE_OF_CONTENTS = "toc"
    DEDICATION = "dedication"
    PROLOGUE = "prologue"
    INTRODUCTION = "introduction"
    AFTERWORD = "afterword"
    INDEX = "index"
    EPIGRAPH = "epigraph"
    ENDNOTES = "endnotes"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str] = mapped_column(String(300), nullable=False)
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
    html_description: Mapped[str | None] = mapped_column(Text, nullable=True)  # Amazon book description
    backpage_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    backpage_author_bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_css: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI-assisted content flag (for KDP/export metadata)
    ai_assisted: Mapped[bool] = mapped_column(default=False)

    # Audiobook / TTS settings per book
    tts_engine: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tts_voice: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tts_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tts_speed: Mapped[str | None] = mapped_column(String(10), nullable=True)  # e.g. "1.0", "0.75", "1.25"
    # Audiobook merge mode: "separate", "merged", "both" (None -> use plugin default)
    audiobook_merge: Mapped[str | None] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", order_by="Chapter.position"
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
    chapter_type: Mapped[str] = mapped_column(
        String(20), default=ChapterType.CHAPTER.value
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    book: Mapped["Book"] = relationship(back_populates="chapters")

    def __repr__(self) -> str:
        return f"<Chapter {self.id!r} title={self.title!r} type={self.chapter_type}>"


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


class AudioVoice(Base):
    """Cached TTS voice from an engine (e.g. Edge TTS, Google TTS)."""

    __tablename__ = "audio_voices"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    engine: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    voice_id: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def __repr__(self) -> str:
        return f"<AudioVoice {self.voice_id!r} engine={self.engine} lang={self.language}>"
