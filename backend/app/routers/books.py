import json
import logging
from datetime import UTC, datetime, timedelta

import yaml
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Book, BookTemplate, Chapter
from app.schemas import (
    BookCreate,
    BookDetail,
    BookFromTemplateCreate,
    BookOut,
    BookUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


def _is_permanent_delete() -> bool:
    """Check app config for delete_permanently setting."""
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("delete_permanently", False))
    except Exception:
        return False


def _allow_books_without_author() -> bool:
    """Check the advanced toggle that gates the NULL-author code path.

    Default off — keeps the historical mandatory-author UX. When the
    user enables it in Settings, the import wizard's defer option
    appears and PATCH/POST against ``books`` accept null/empty as
    'no author yet'.
    """
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("allow_books_without_author", False))
    except Exception:
        return False


def _validate_author(value: str | None, allow_null: bool) -> str | None:
    """Reject NULL/blank author when the toggle is off; coerce blank
    to None when on."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if allow_null:
            return None
        raise HTTPException(
            status_code=400,
            detail=(
                "Author is required. Enable 'Allow books without author' "
                "in Settings to import/save without one."
            ),
        )
    return value.strip() if isinstance(value, str) else value


def _get_trash_auto_delete_config() -> tuple[bool, int]:
    """Get trash auto-delete settings: (enabled, days)."""
    from pathlib import Path

    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"
    if not config_path.exists():
        return False, 30
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        app = config.get("app", {})
        enabled = bool(app.get("trash_auto_delete_enabled", False))
        days = int(app.get("trash_auto_delete_days", 30))
        return enabled, days
    except Exception:
        return False, 30


def cleanup_expired_trash() -> int:
    """Permanently delete books that have been in the trash longer than the configured days.

    Returns the number of deleted books.
    """
    enabled, days = _get_trash_auto_delete_config()
    if not enabled or days <= 0:
        return 0

    from app.database import SessionLocal

    db = SessionLocal()
    try:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        expired = (
            db.query(Book)
            .filter(
                Book.deleted_at.is_not(None),
                Book.deleted_at < cutoff,
            )
            .all()
        )
        count = len(expired)
        for book in expired:
            logger.info(
                "Auto-deleting book: id=%s title=%s deleted_at=%s",
                book.id,
                book.title,
                book.deleted_at,
            )
            db.delete(book)
        if count > 0:
            db.commit()
            logger.info("Auto-deleted %d expired trash items (older than %d days)", count, days)
        return count
    finally:
        db.close()


@router.get("", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)):
    """List all active (non-deleted) books."""
    return db.query(Book).filter(Book.deleted_at.is_(None)).order_by(Book.updated_at.desc()).all()


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["author"] = _validate_author(data.get("author"), _allow_books_without_author())
    book = Book(**data)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.post(
    "/from-template",
    response_model=BookDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_book_from_template(payload: BookFromTemplateCreate, db: Session = Depends(get_db)):
    """Create a new book with chapters pre-filled from a template.

    The book and all its chapters are persisted in a single commit -
    if any chapter insert fails the book insert rolls back with it.
    """
    template = db.query(BookTemplate).filter(BookTemplate.id == payload.template_id).first()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    description = payload.description if payload.description is not None else template.description

    book = Book(
        title=payload.title,
        subtitle=payload.subtitle,
        author=payload.author,
        language=payload.language,
        genre=payload.genre if payload.genre is not None else template.genre,
        series=payload.series,
        series_index=payload.series_index,
        description=description,
    )
    db.add(book)
    db.flush()  # assign book.id for the chapter FKs

    for tpl_chapter in sorted(template.chapters, key=lambda c: c.position):
        db.add(
            Chapter(
                book_id=book.id,
                title=tpl_chapter.title,
                chapter_type=tpl_chapter.chapter_type,
                position=tpl_chapter.position,
                content=tpl_chapter.content or "",
            )
        )

    db.commit()
    db.refresh(book)
    return book


@router.get("/{book_id}", response_model=BookDetail)
def get_book(book_id: str, include_content: bool = True, db: Session = Depends(get_db)):
    """Get a single book with its chapters.

    When include_content=false, chapter content is replaced with an empty
    string to reduce payload size for large books (100+ chapters). The
    frontend fetches individual chapter content on demand.
    """
    book = db.query(Book).options(joinedload(Book.chapters)).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if not include_content:
        # Serialize through Pydantic (handles keywords/skip_types JSON decoding),
        # then strip chapter content to reduce payload.
        result = BookDetail.model_validate(book).model_dump()
        for ch in result.get("chapters", []):
            ch["content"] = ""
        return result
    return book


@router.patch("/{book_id}", response_model=BookOut)
def update_book(book_id: str, payload: BookUpdate, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "author" in update_data:
        update_data["author"] = _validate_author(
            update_data["author"], _allow_books_without_author()
        )
    for key, value in update_data.items():
        # ``audiobook_skip_chapter_types`` and ``keywords`` are exposed as
        # list[str] in the API but stored as JSON-encoded Text columns.
        # Encode here so the rest of the loop stays generic.
        if key in ("audiobook_skip_chapter_types", "keywords") and isinstance(value, list):
            value = json.dumps(value)
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: str, db: Session = Depends(get_db)):
    """Delete a book. Moves to trash by default, permanently if configured."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if _is_permanent_delete():
        db.delete(book)
    else:
        book.deleted_at = datetime.now(UTC)
    db.commit()


# --- Trash ---


@router.get("/trash/list", response_model=list[BookOut])
def list_trash(db: Session = Depends(get_db)):
    """List all books in the trash."""
    return (
        db.query(Book).filter(Book.deleted_at.is_not(None)).order_by(Book.deleted_at.desc()).all()
    )


@router.post("/trash/{book_id}/restore", response_model=BookOut)
def restore_book(book_id: str, db: Session = Depends(get_db)):
    """Restore a book from the trash."""
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_not(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found in trash")
    book.deleted_at = None
    db.commit()
    db.refresh(book)
    return book


@router.delete("/trash/empty", status_code=status.HTTP_204_NO_CONTENT)
def empty_trash(db: Session = Depends(get_db)):
    """Permanently delete all books in the trash."""
    db.query(Book).filter(Book.deleted_at.is_not(None)).delete()
    db.commit()


@router.delete("/trash/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def permanent_delete(book_id: str, db: Session = Depends(get_db)):
    """Permanently delete a book from the trash."""
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_not(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found in trash")
    db.delete(book)
    db.commit()
