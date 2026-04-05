"""FastAPI routes for the KDP plugin."""

import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from .changelog import add_entry, export_changelog_markdown, get_changelog
from .cover_validator import CoverValidationResult, generate_kdp_metadata, validate_cover
from .metadata_checker import check_metadata_completeness

router = APIRouter(prefix="/kdp", tags=["kdp"])


class MetadataRequest(BaseModel):
    title: str
    subtitle: str | None = None
    author: str
    description: str | None = None
    language: str = "de"
    series: str | None = None
    series_index: int | None = None
    categories: list[str] = []
    keywords: list[str] = []


@router.post("/metadata")
def generate_metadata(request: MetadataRequest) -> dict[str, Any]:
    """Generate KDP-compatible metadata from book data."""
    book_data = {
        "title": request.title,
        "subtitle": request.subtitle,
        "author": request.author,
        "description": request.description,
        "language": request.language,
        "series": request.series,
        "series_index": request.series_index,
    }
    return generate_kdp_metadata(
        book_data,
        categories=request.categories,
        keywords=request.keywords,
    )


@router.post("/validate-cover")
def validate_cover_endpoint(file: UploadFile) -> dict[str, Any]:
    """Validate a cover image against KDP requirements."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    tmp_dir = Path(tempfile.mkdtemp(prefix="kdp_cover_"))
    try:
        tmp_file = tmp_dir / file.filename
        with open(tmp_file, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Use default KDP requirements
        requirements = {
            "min_width": 625,
            "min_height": 1000,
            "max_width": 10000,
            "max_height": 10000,
            "min_dpi": 300,
            "aspect_ratio_min": 1.5,
            "aspect_ratio_max": 1.8,
            "max_file_size_mb": 50,
            "allowed_formats": ["jpg", "jpeg", "tiff", "png"],
        }

        result = validate_cover(tmp_file, requirements)
        return result.to_dict()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.get("/categories")
def list_categories() -> list[str]:
    """List available KDP categories."""
    return [
        "Arts & Photography",
        "Biographies & Memoirs",
        "Business & Money",
        "Children's eBooks",
        "Comics & Graphic Novels",
        "Literature & Fiction",
        "Mystery, Thriller & Suspense",
        "Romance",
        "Science Fiction & Fantasy",
        "Self-Help",
    ]


class CheckMetadataRequest(BaseModel):
    title: str = ""
    subtitle: str | None = None
    author: str = ""
    description: str | None = None
    html_description: str | None = None
    language: str = ""
    keywords: str | None = None
    cover_image: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    publisher: str | None = None
    backpage_description: str | None = None
    chapters: list[dict] = []


@router.post("/check-metadata")
def check_metadata(request: CheckMetadataRequest) -> dict[str, Any]:
    """Check if book metadata is complete for KDP publishing.

    Returns completeness status with errors (blocks publishing)
    and warnings (recommended improvements).
    """
    result = check_metadata_completeness(request.model_dump())
    return result.to_dict()


class ChangelogEntry(BaseModel):
    book_id: str
    version: str
    format: str = "epub"
    book_type: str = "ebook"
    notes: str = ""


@router.post("/changelog")
def add_changelog_entry(entry: ChangelogEntry) -> dict[str, str]:
    """Record a publication event in the book's changelog."""
    return add_entry(
        book_id=entry.book_id,
        version=entry.version,
        format=entry.format,
        book_type=entry.book_type,
        notes=entry.notes,
    )


@router.get("/changelog/{book_id}")
def get_book_changelog(book_id: str) -> list[dict[str, str]]:
    """Get the publication changelog for a book."""
    return get_changelog(book_id)


@router.get("/changelog/{book_id}/export")
def export_book_changelog(book_id: str, title: str = "") -> dict[str, str]:
    """Export the changelog as Markdown text."""
    md = export_changelog_markdown(book_id, title)
    return {"markdown": md, "book_id": book_id}
