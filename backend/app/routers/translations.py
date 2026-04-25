"""HTTP surface for PGS-04 translation linking.

Endpoints:

- ``GET  /api/translations/{book_id}`` - list sibling books in
  the same translation group.
- ``POST /api/translations/link`` - group two or more books under
  a shared ``translation_group_id`` (or fold them into an
  existing group).
- ``POST /api/translations/{book_id}/unlink`` - remove a single
  book from its group.

All endpoints are thin: business logic lives in
:mod:`app.services.translation_groups`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book
from app.services import translation_groups

router = APIRouter(prefix="/translations", tags=["translations"])


# --- request/response models ---


class SiblingEntry(BaseModel):
    book_id: str
    title: str
    language: str


class SiblingsResponse(BaseModel):
    book_id: str
    translation_group_id: str | None = None
    siblings: list[SiblingEntry] = Field(default_factory=list)


class LinkRequest(BaseModel):
    book_ids: list[str] = Field(min_length=2, max_length=64)


class LinkResponse(BaseModel):
    translation_group_id: str | None
    linked_book_ids: list[str]


# --- endpoints ---


@router.get("/{book_id}", response_model=SiblingsResponse)
def list_siblings(
    book_id: str,
    db: Session = Depends(get_db),
) -> SiblingsResponse:
    """Return the other books that share this book's translation group.

    Returns ``siblings=[]`` when the book is unlinked or the group
    has no other members. The response always echoes the
    ``translation_group_id`` so the frontend can decide whether to
    render the "Translations:" row at all.
    """
    book = db.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Book not found."
        )
    siblings = translation_groups.list_siblings(db, book_id=book_id)
    return SiblingsResponse(
        book_id=book_id,
        translation_group_id=book.translation_group_id,
        siblings=[
            SiblingEntry(
                book_id=s.book_id, title=s.title, language=s.language
            )
            for s in siblings
        ],
    )


@router.post("/link", response_model=LinkResponse)
def link(
    payload: LinkRequest,
    db: Session = Depends(get_db),
) -> LinkResponse:
    """Group two or more books under a shared translation group.

    Pre-existing group ids fold into the smallest one
    (lexicographic) so a replay is deterministic. Books that do
    not exist in the DB are silently skipped; if fewer than two
    valid books survive validation, returns
    ``{translation_group_id: null, linked_book_ids: []}``.
    """
    valid_ids = [
        b.id
        for b in db.query(Book).filter(Book.id.in_(payload.book_ids)).all()
    ]
    if len(valid_ids) < 2:
        return LinkResponse(translation_group_id=None, linked_book_ids=[])
    group_id = translation_groups.link_books(db, book_ids=valid_ids)
    return LinkResponse(
        translation_group_id=group_id, linked_book_ids=valid_ids
    )


@router.post("/{book_id}/unlink", status_code=status.HTTP_204_NO_CONTENT)
def unlink(
    book_id: str,
    db: Session = Depends(get_db),
) -> None:
    """Remove ``book_id`` from its translation group.

    Idempotent: a book that is already unlinked or that does not
    exist returns 204 without raising. The lone survivor of a
    two-book group is auto-unlinked so the UI does not render an
    empty "Translations:" badge.
    """
    translation_groups.unlink_book(db, book_id=book_id)
