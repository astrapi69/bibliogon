from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter
from app.schemas import ChapterCreate, ChapterOut, ChapterReorder, ChapterUpdate

router = APIRouter(prefix="/books/{book_id}/chapters", tags=["chapters"])


def _get_book_or_404(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.get("", response_model=list[ChapterOut])
def list_chapters(book_id: str, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)
    return (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )


@router.post("", response_model=ChapterOut, status_code=status.HTTP_201_CREATED)
def create_chapter(book_id: str, payload: ChapterCreate, db: Session = Depends(get_db)):
    _get_book_or_404(book_id, db)

    if payload.position is None:
        max_pos = (
            db.query(Chapter.position)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.position.desc())
            .first()
        )
        payload.position = (max_pos[0] + 1) if max_pos else 0

    chapter = Chapter(book_id=book_id, **payload.model_dump())
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/{chapter_id}", response_model=ChapterOut)
def get_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter


@router.patch("/{chapter_id}", response_model=ChapterOut)
def update_chapter(
    book_id: str, chapter_id: str, payload: ChapterUpdate, db: Session = Depends(get_db)
):
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(chapter, key, value)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(book_id: str, chapter_id: str, db: Session = Depends(get_db)):
    chapter = (
        db.query(Chapter)
        .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
        .first()
    )
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    db.delete(chapter)
    db.commit()


@router.put("/reorder", response_model=list[ChapterOut])
def reorder_chapters(
    book_id: str, payload: ChapterReorder, db: Session = Depends(get_db)
):
    _get_book_or_404(book_id, db)
    chapters = (
        db.query(Chapter).filter(Chapter.book_id == book_id).all()
    )
    chapter_map = {c.id: c for c in chapters}

    for position, chapter_id in enumerate(payload.chapter_ids):
        if chapter_id not in chapter_map:
            raise HTTPException(
                status_code=400, detail=f"Chapter {chapter_id} not found in this book"
            )
        chapter_map[chapter_id].position = position

    db.commit()
    return (
        db.query(Chapter)
        .filter(Chapter.book_id == book_id)
        .order_by(Chapter.position)
        .all()
    )
