"""Per-book chapter labels CRUD (CHAPTER-STATUS-LABELS-01).

A Scrivener-style, user-definable set of named + colored labels owned
by a book. A chapter references at most one label via
``Chapter.label_id``. Sibling of ``chapters.py`` (same
``/books/{book_id}/...`` resource family); follows its local
HTTPException-in-router style for consistency within the family.

Data access goes through :class:`ChapterLabelRepository`; the router
holds only the HTTP 404 handling.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.models import ChapterLabel
from app.repositories.chapter_labels import (
    ChapterLabelRepository,
    get_chapter_label_repository,
)
from app.schemas import ChapterLabelCreate, ChapterLabelOut, ChapterLabelUpdate

router = APIRouter(prefix="/books/{book_id}/chapter-labels", tags=["chapter-labels"])


def _ensure_book(book_id: str, repo: ChapterLabelRepository) -> None:
    """Raise 404 when ``book_id`` does not exist."""
    if not repo.book_exists(book_id):
        raise HTTPException(status_code=404, detail="Book not found")


def _get_label_or_404(book_id: str, label_id: str, repo: ChapterLabelRepository) -> ChapterLabel:
    label = repo.get(book_id, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Chapter label not found")
    return label


@router.get("", response_model=list[ChapterLabelOut])
def list_labels(
    book_id: str,
    repo: ChapterLabelRepository = Depends(get_chapter_label_repository),
):
    _ensure_book(book_id, repo)
    return list(repo.list(book_id))


@router.post("", response_model=ChapterLabelOut, status_code=status.HTTP_201_CREATED)
def create_label(
    book_id: str,
    payload: ChapterLabelCreate,
    repo: ChapterLabelRepository = Depends(get_chapter_label_repository),
):
    _ensure_book(book_id, repo)
    label = ChapterLabel(
        book_id=book_id,
        name=payload.name,
        color=payload.color,
        position=repo.next_position(book_id),
    )
    return repo.add(label)


@router.patch("/{label_id}", response_model=ChapterLabelOut)
def update_label(
    book_id: str,
    label_id: str,
    payload: ChapterLabelUpdate,
    repo: ChapterLabelRepository = Depends(get_chapter_label_repository),
):
    label = _get_label_or_404(book_id, label_id, repo)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(label, key, value)
    return repo.save(label)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(
    book_id: str,
    label_id: str,
    repo: ChapterLabelRepository = Depends(get_chapter_label_repository),
):
    label = _get_label_or_404(book_id, label_id, repo)
    repo.delete(label)
    return None
