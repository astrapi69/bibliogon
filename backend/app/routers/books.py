from datetime import datetime, timezone

import yaml
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Book
from app.schemas import BookCreate, BookDetail, BookOut, BookUpdate

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
        return config.get("app", {}).get("delete_permanently", False)
    except Exception:
        return False


@router.get("", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)):
    """List all active (non-deleted) books."""
    return (
        db.query(Book)
        .filter(Book.deleted_at.is_(None))
        .order_by(Book.updated_at.desc())
        .all()
    )


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, db: Session = Depends(get_db)):
    book = Book(**payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@router.get("/{book_id}", response_model=BookDetail)
def get_book(book_id: str, db: Session = Depends(get_db)):
    book = (
        db.query(Book)
        .options(joinedload(Book.chapters))
        .filter(Book.id == book_id)
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.patch("/{book_id}", response_model=BookOut)
def update_book(book_id: str, payload: BookUpdate, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
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
        book.deleted_at = datetime.now(timezone.utc)
    db.commit()


# --- Trash ---


@router.get("/trash/list", response_model=list[BookOut])
def list_trash(db: Session = Depends(get_db)):
    """List all books in the trash."""
    return (
        db.query(Book)
        .filter(Book.deleted_at.is_not(None))
        .order_by(Book.deleted_at.desc())
        .all()
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
