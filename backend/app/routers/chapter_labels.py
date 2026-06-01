"""Per-book chapter labels CRUD (CHAPTER-STATUS-LABELS-01).

A Scrivener-style, user-definable set of named + colored labels owned
by a book. A chapter references at most one label via
``Chapter.label_id``. Sibling of ``chapters.py`` (same
``/books/{book_id}/...`` resource family); follows its local
HTTPException-in-router style for consistency within the family.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter, ChapterLabel
from app.schemas import ChapterLabelCreate, ChapterLabelOut, ChapterLabelUpdate

router = APIRouter(prefix="/books/{book_id}/chapter-labels", tags=["chapter-labels"])


def _get_book_or_404(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _get_label_or_404(book_id: str, label_id: str, db: Session) -> ChapterLabel:
    label = (
        db.query(ChapterLabel)
        .filter(ChapterLabel.id == label_id, ChapterLabel.book_id == book_id)
        .first()
    )
    if not label:
        raise HTTPException(status_code=404, detail="Chapter label not found")
    return label


@router.get("", response_model=list[ChapterLabelOut])
def list_labels(book_id: str, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    return (
        db.query(ChapterLabel)
        .filter(ChapterLabel.book_id == book_id)
        .order_by(ChapterLabel.position.asc())
        .all()
    )


@router.post("", response_model=ChapterLabelOut, status_code=status.HTTP_201_CREATED)
def create_label(book_id: str, payload: ChapterLabelCreate, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    max_pos = (
        db.query(ChapterLabel.position)
        .filter(ChapterLabel.book_id == book_id)
        .order_by(ChapterLabel.position.desc())
        .first()
    )
    label = ChapterLabel(
        book_id=book_id,
        name=payload.name,
        color=payload.color,
        position=(max_pos[0] + 1) if max_pos else 0,
    )
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


@router.patch("/{label_id}", response_model=ChapterLabelOut)
def update_label(
    book_id: str,
    label_id: str,
    payload: ChapterLabelUpdate,
    db: Session = Depends(get_db),
):
    label = _get_label_or_404(book_id, label_id, db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(label, key, value)
    db.commit()
    db.refresh(label)
    return label


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(book_id: str, label_id: str, db: Session = Depends(get_db)):
    label = _get_label_or_404(book_id, label_id, db)
    # Clear the assignment on any chapters using this label before
    # deleting it. The FK is ON DELETE SET NULL too, but this is
    # explicit + robust whether or not SQLite FK enforcement is on.
    db.execute(
        update(Chapter)
        .where(Chapter.label_id == label_id)
        .values(label_id=None)
    )
    db.delete(label)
    db.commit()
    return None
