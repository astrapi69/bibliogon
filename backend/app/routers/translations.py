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
from app.services.translation_import import (
    CloneFailedError,
    NoMatchingBranchesError,
    import_translation_group,
)

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


class MultiBranchImportRequest(BaseModel):
    git_url: str = Field(min_length=1, max_length=2000)


class ImportedBookEntry(BaseModel):
    book_id: str
    branch: str
    language: str | None
    title: str


class SkippedBranchEntry(BaseModel):
    """PGS-04-FU-01: per-branch skip surface.

    Lets the wizard render "Branch X could not be imported because Y"
    instead of swallowing the error in the backend log. ``reason`` is
    a stable slug the frontend switches on for i18n; ``detail`` is the
    raw exception message (truncated server-side) for diagnostics +
    the GitHub-issue body.
    """

    branch: str
    reason: str  # "no_wbt_layout" | "import_failed"
    detail: str


class MultiBranchImportResponse(BaseModel):
    translation_group_id: str | None
    books: list[ImportedBookEntry]
    #: PGS-04-FU-01: branches the importer could not turn into books.
    #: Empty list means every branch imported cleanly. Wizard renders
    #: an "Attention required" section per entry.
    skipped: list[SkippedBranchEntry] = []


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found.")
    siblings = translation_groups.list_siblings(db, book_id=book_id)
    return SiblingsResponse(
        book_id=book_id,
        translation_group_id=book.translation_group_id,
        siblings=[
            SiblingEntry(book_id=s.book_id, title=s.title, language=s.language) for s in siblings
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
    valid_ids = [b.id for b in db.query(Book).filter(Book.id.in_(payload.book_ids)).all()]
    if len(valid_ids) < 2:
        return LinkResponse(translation_group_id=None, linked_book_ids=[])
    group_id = translation_groups.link_books(db, book_ids=valid_ids)
    return LinkResponse(translation_group_id=group_id, linked_book_ids=valid_ids)


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


@router.post("/import-multi-branch", response_model=MultiBranchImportResponse)
def import_multi_branch(
    payload: MultiBranchImportRequest,
    db: Session = Depends(get_db),
) -> MultiBranchImportResponse:
    """Clone the repo once, import every ``main``/``main-XX`` branch
    as a Bibliogon book, and link them under one translation group.

    Returns the new ``translation_group_id`` plus a per-book
    summary the wizard renders post-import. Per-branch failures
    log + skip (so one broken branch does not lose the others);
    the whole call only fails when the clone itself fails (502)
    or no matching branches are found (415).
    """
    try:
        result = import_translation_group(db, git_url=payload.git_url)
    except CloneFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except NoMatchingBranchesError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc

    return MultiBranchImportResponse(
        translation_group_id=result.translation_group_id,
        books=[
            ImportedBookEntry(
                book_id=b.book_id,
                branch=b.branch,
                language=b.language,
                title=b.title,
            )
            for b in result.books
        ],
        skipped=[
            SkippedBranchEntry(
                branch=s.branch,
                reason=s.reason,
                detail=s.detail,
            )
            for s in result.skipped
        ],
    )
