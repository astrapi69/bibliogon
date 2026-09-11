"""HTTP surface of the promotion plugin (single router, #782).

Routes stay thin: validate, delegate, return. The service raises
``BibliogonError`` subclasses and the global handler maps them, per the
error-handling architecture.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.exceptions import ValidationError
from bibliogon_promotion import service
from bibliogon_promotion.portfolio import FORMATS, STATUSES, PortfolioCsvRow

router = APIRouter(prefix="/promotion", tags=["promotion"])

BookFormat = Literal["ebook", "paperback", "hardcover"]
FormatStatus = Literal["live", "draft", "missing"]


class FormatStateUpdate(BaseModel):
    status: FormatStatus | None = None
    store_url: str | None = Field(default=None, max_length=500)
    asin: str | None = Field(default=None, max_length=20)


class BookPromotionUpdate(BaseModel):
    universal_link: str | None = Field(default=None, max_length=500)


class PortfolioImportRow(BaseModel):
    title: str
    author: str | None = None
    language: str | None = None
    status: str | None = None
    github_url: str | None = None
    github_branch: str | None = None
    universal_link: str | None = None
    links: dict[str, str | None] = Field(default_factory=dict)


class PortfolioImportRequest(BaseModel):
    rows: list[PortfolioImportRow]
    dry_run: bool = True


@router.get("/portfolio")
def list_portfolio(
    language: str | None = Query(default=None),
    author: str | None = Query(default=None),
    gaps_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict:
    """The board: every book with one entry per format, gaps flagged."""
    rows = service.portfolio_rows(db, language=language, author=author, gaps_only=gaps_only)
    return {"formats": list(FORMATS), "statuses": list(STATUSES), "books": rows}


@router.get("/portfolio/{book_id}")
def get_book_portfolio(book_id: str, db: Session = Depends(get_db)) -> dict:
    return service.portfolio_row(db, service.get_book(db, book_id))


@router.put("/portfolio/{book_id}/formats/{book_format}")
def update_format_state(
    book_id: str,
    book_format: BookFormat,
    payload: FormatStateUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """Upsert one format's retail state.

    The ASIN in the payload is written to the book's existing
    ``asin_*`` column, not duplicated into the format row.
    """
    book = service.get_book(db, book_id)
    service.set_format_state(
        db,
        book,
        book_format,
        status=payload.status,
        store_url=payload.store_url,
        asin=payload.asin,
    )
    db.commit()
    return service.portfolio_row(db, book)


@router.patch("/portfolio/{book_id}")
def update_book_promotion(
    book_id: str, payload: BookPromotionUpdate, db: Session = Depends(get_db)
) -> dict:
    book = service.get_book(db, book_id)
    if payload.universal_link is not None:
        book.universal_link = payload.universal_link or None
    db.commit()
    return service.portfolio_row(db, book)


@router.post("/portfolio/import")
def import_portfolio(payload: PortfolioImportRequest, db: Session = Depends(get_db)) -> dict:
    """Apply a batch of portfolio rows, idempotently.

    ``dry_run`` (the default) reports what would change and rolls back,
    mirroring ``make import-books-check``.
    """
    if not payload.rows:
        raise ValidationError("No rows to import")
    rows = [
        PortfolioCsvRow(
            title=row.title,
            author=row.author,
            language=row.language,
            status=row.status,
            github_url=row.github_url,
            github_branch=row.github_branch,
            universal_link=row.universal_link,
            links={book_format: row.links.get(book_format) for book_format in FORMATS},
        )
        for row in payload.rows
    ]
    report = service.apply_csv_rows(db, rows, dry_run=payload.dry_run)
    return report.__dict__
