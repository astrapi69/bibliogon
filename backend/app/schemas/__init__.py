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


# --- Book schemas ---


class BookCreate(BaseModel):
    title: str
    subtitle: str | None = None
    author: str
    language: str = "de"
    series: str | None = None
    series_index: int | None = None
    description: str | None = None


class BookUpdate(BaseModel):
    title: str | None = None
    subtitle: str | None = None
    author: str | None = None
    language: str | None = None
    series: str | None = None
    series_index: int | None = None
    description: str | None = None


class BookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    subtitle: str | None
    author: str
    language: str
    series: str | None
    series_index: int | None
    description: str | None
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
