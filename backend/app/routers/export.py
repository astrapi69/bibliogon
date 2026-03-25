from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.export_service import ExportError, export_book

router = APIRouter(prefix="/books/{book_id}/export", tags=["export"])


@router.get("/{fmt}")
def export(book_id: str, fmt: str, db: Session = Depends(get_db)):
    """
    Export a book as EPUB or PDF.

    GET /api/books/{book_id}/export/epub
    GET /api/books/{book_id}/export/pdf
    """
    if fmt not in ("epub", "pdf"):
        raise HTTPException(status_code=400, detail="Format must be 'epub' or 'pdf'")

    try:
        output_path = export_book(db, book_id, fmt)
    except ExportError as e:
        raise HTTPException(status_code=500, detail=str(e))

    media_type = (
        "application/epub+zip" if fmt == "epub" else "application/pdf"
    )

    return FileResponse(
        path=str(output_path),
        media_type=media_type,
        filename=f"book.{fmt}",
    )
