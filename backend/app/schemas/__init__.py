from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


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


# --- Book schemas ---


class BookCreate(BaseModel):
    title: str
    subtitle: str | None = None
    author: str
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
    keywords: str | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    # AI-assisted content flag
    ai_assisted: bool | None = None
    # Audiobook / TTS settings
    tts_engine: str | None = None
    tts_voice: str | None = None
    tts_language: str | None = None
    tts_speed: str | None = None
    audiobook_merge: str | None = None
    audiobook_filename: str | None = None


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    subtitle: str | None
    author: str
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
    keywords: str | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    ai_assisted: bool = False
    tts_engine: str | None = None
    tts_voice: str | None = None
    tts_language: str | None = None
    tts_speed: str | None = None
    audiobook_merge: str | None = None
    audiobook_filename: str | None = None
    created_at: datetime
    updated_at: datetime


class BookDetail(BookOut):
    chapters: list["ChapterOut"] = []


# --- Chapter schemas ---


class ChapterCreate(BaseModel):
    title: str
    content: str = ""
    position: int | None = None
    chapter_type: ChapterType = ChapterType.CHAPTER


class ChapterUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    position: int | None = None
    chapter_type: ChapterType | None = None


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
