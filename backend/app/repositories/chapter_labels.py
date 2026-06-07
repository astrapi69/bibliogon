"""Repository for per-book chapter labels (CHAPTER-STATUS-LABELS-01).

Persistence-only: book/label existence lookups, ordered listing, next
position, and a delete that also clears ``Chapter.label_id`` assignments
(a data-integrity concern, not a business rule). The router keeps the
HTTP 404 handling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter, ChapterLabel
from app.repositories.base import SQLAlchemyRepository


class ChapterLabelRepository(ABC):
    """Data-access contract for a book's chapter labels."""

    @abstractmethod
    def book_exists(self, book_id: str) -> bool:
        """Return whether a book with ``book_id`` exists."""

    @abstractmethod
    def get(self, book_id: str, label_id: str) -> ChapterLabel | None:
        """Return the label scoped to ``book_id``, or ``None``."""

    @abstractmethod
    def list(self, book_id: str) -> Sequence[ChapterLabel]:
        """Return the book's labels ordered by position ascending."""

    @abstractmethod
    def next_position(self, book_id: str) -> int:
        """Return the position to assign the next new label."""

    @abstractmethod
    def add(self, label: ChapterLabel) -> ChapterLabel:
        """Persist a new label and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, label: ChapterLabel) -> ChapterLabel:
        """Persist mutations to a tracked label and return it."""

    @abstractmethod
    def delete(self, label: ChapterLabel) -> None:
        """Delete ``label`` and clear it from any chapters using it."""


class SqlAlchemyChapterLabelRepository(SQLAlchemyRepository, ChapterLabelRepository):
    """SQLAlchemy-backed :class:`ChapterLabelRepository`."""

    def book_exists(self, book_id: str) -> bool:
        return self._db.query(Book).filter(Book.id == book_id).first() is not None

    def get(self, book_id: str, label_id: str) -> ChapterLabel | None:
        return (
            self._db.query(ChapterLabel)
            .filter(ChapterLabel.id == label_id, ChapterLabel.book_id == book_id)
            .first()
        )

    def list(self, book_id: str) -> Sequence[ChapterLabel]:
        return (
            self._db.query(ChapterLabel)
            .filter(ChapterLabel.book_id == book_id)
            .order_by(ChapterLabel.position.asc())
            .all()
        )

    def next_position(self, book_id: str) -> int:
        max_pos = (
            self._db.query(ChapterLabel.position)
            .filter(ChapterLabel.book_id == book_id)
            .order_by(ChapterLabel.position.desc())
            .first()
        )
        return (max_pos[0] + 1) if max_pos else 0

    def add(self, label: ChapterLabel) -> ChapterLabel:
        self._db.add(label)
        self._db.commit()
        self._db.refresh(label)
        return label

    def save(self, label: ChapterLabel) -> ChapterLabel:
        self._db.commit()
        self._db.refresh(label)
        return label

    def delete(self, label: ChapterLabel) -> None:
        self._db.execute(
            update(Chapter).where(Chapter.label_id == label.id).values(label_id=None)
        )
        self._db.delete(label)
        self._db.commit()


def get_chapter_label_repository(
    db: Session = Depends(get_db),
) -> ChapterLabelRepository:
    """FastAPI provider yielding the SQLAlchemy chapter-label repository."""
    return SqlAlchemyChapterLabelRepository(db)
