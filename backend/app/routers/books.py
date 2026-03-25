from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Book
from app.schemas import BookCreate, BookDetail, BookOut, BookUpdate

router = APIRouter(prefix="/books", tags=["books"])


@router.get("", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)):
    return db.query(Book).order_by(Book.updated_at.desc()).all()


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
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: str, db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    db.delete(book)
    db.commit()
