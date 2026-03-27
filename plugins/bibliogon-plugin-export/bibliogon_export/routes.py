"""FastAPI routes for the export plugin."""

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from .pandoc_runner import PandocError, run_pandoc
from .scaffolder import scaffold_project

router = APIRouter(prefix="/books/{book_id}/export", tags=["export"])

# These will be set by the plugin during activation
_get_db = None
_book_model = None

SUPPORTED_FORMATS = {"epub", "pdf", "docx", "html", "markdown", "project"}

MEDIA_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html",
    "markdown": "text/markdown",
}


def configure(get_db_dep: Any, book_model: Any) -> None:
    """Configure route dependencies. Called by ExportPlugin.activate()."""
    global _get_db, _book_model
    _get_db = get_db_dep
    _book_model = book_model


def _get_book_data(book_id: str, db: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Load book and chapters from DB and return as dicts."""
    from sqlalchemy.orm import joinedload

    if _book_model is None:
        raise HTTPException(status_code=500, detail="Export plugin not properly configured")

    Book = _book_model
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book_data = {
        "title": book.title,
        "subtitle": book.subtitle,
        "author": book.author,
        "language": book.language,
        "series": book.series,
        "series_index": book.series_index,
        "description": book.description,
    }

    chapters_data = []
    for ch in sorted(book.chapters, key=lambda c: c.position):
        content = ch.content
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            pass
        chapters_data.append({
            "title": ch.title,
            "content": content,
            "position": ch.position,
        })

    return book_data, chapters_data


@router.get("/{fmt}")
def export(book_id: str, fmt: str, db: Any = Depends(lambda: None)):
    """Export a book via manuscripta.

    Supported formats: epub, pdf, docx, html, markdown, project (ZIP).

    GET /api/books/{book_id}/export/epub
    GET /api/books/{book_id}/export/pdf
    GET /api/books/{book_id}/export/project
    """
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )

    if _get_db is None:
        raise HTTPException(status_code=500, detail="Export plugin not configured")

    db_gen = _get_db()
    db_session = next(db_gen)
    try:
        book_data, chapters_data = _get_book_data(book_id, db_session)
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_export_"))

    try:
        # Scaffold manuscripta-compatible project structure
        project_dir = scaffold_project(book_data, chapters_data, tmp_dir)

        if fmt == "project":
            zip_path = shutil.make_archive(str(tmp_dir / "project"), "zip", str(project_dir))
            return FileResponse(
                path=zip_path,
                media_type="application/zip",
                filename=f"{project_dir.name}.zip",
            )

        # Export via manuscripta
        import yaml
        config_path = Path("config/plugins/export.yaml")
        config: dict[str, Any] = {}
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

        output_path = run_pandoc(project_dir, fmt, config)

        media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")
        ext = output_path.suffix

        return FileResponse(
            path=str(output_path),
            media_type=media_type,
            filename=f"{project_dir.name}{ext}",
        )
    except PandocError as e:
        raise HTTPException(status_code=500, detail=str(e))
