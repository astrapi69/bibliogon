"""Repository for picture-book / comic pages (``Page``).

Persistence-only: the owning-book lookup, ordered listing/retrieval,
next-position, the create/update primitives, a delete that keeps
positions dense, and the flush/commit hooks the two-phase reorder needs.
The book-type "is this pageable?" rule and HTTP mapping stay in the
router.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Page
from app.repositories.base import SQLAlchemyRepository


class PageRepository(ABC):
    """Data-access contract for book pages."""

    @abstractmethod
    def get_book(self, book_id: str) -> Book | None:
        """Return the non-deleted owning book, or ``None``."""

    @abstractmethod
    def list(self, book_id: str) -> Sequence[Page]:
        """Return the book's pages ordered by position ascending."""

    @abstractmethod
    def get(self, book_id: str, page_id: str) -> Page | None:
        """Return the page scoped to ``book_id``, or ``None``."""

    @abstractmethod
    def next_position(self, book_id: str) -> int:
        """Return the position to append the next new page (1-based)."""

    @abstractmethod
    def add(self, page: Page) -> Page:
        """Persist a new page and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, page: Page) -> Page:
        """Persist mutations to a tracked page and return it."""

    @abstractmethod
    def delete_and_compact(self, book_id: str, page: Page) -> None:
        """Delete ``page`` and shift later pages down so positions stay dense."""

    @abstractmethod
    def flush(self) -> None:
        """Flush pending changes without committing (two-phase reorder)."""

    @abstractmethod
    def commit(self) -> None:
        """Commit pending entity mutations (reorder)."""


class SqlAlchemyPageRepository(SQLAlchemyRepository, PageRepository):
    """SQLAlchemy-backed :class:`PageRepository`."""

    def get_book(self, book_id: str) -> Book | None:
        return self._db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()

    def list(self, book_id: str) -> Sequence[Page]:
        return (
            self._db.query(Page).filter(Page.book_id == book_id).order_by(Page.position.asc()).all()
        )

    def get(self, book_id: str, page_id: str) -> Page | None:
        return self._db.query(Page).filter(Page.id == page_id, Page.book_id == book_id).first()

    def next_position(self, book_id: str) -> int:
        max_pos = (
            self._db.query(Page.position)
            .filter(Page.book_id == book_id)
            .order_by(Page.position.desc())
            .first()
        )
        return (max_pos[0] + 1) if max_pos else 1

    def add(self, page: Page) -> Page:
        self._db.add(page)
        self._db.commit()
        self._db.refresh(page)
        return page

    def save(self, page: Page) -> Page:
        self._db.commit()
        self._db.refresh(page)
        return page

    def delete_and_compact(self, book_id: str, page: Page) -> None:
        deleted_position = page.position
        self._db.delete(page)
        self._db.query(Page).filter(
            Page.book_id == book_id, Page.position > deleted_position
        ).update({Page.position: Page.position - 1}, synchronize_session=False)
        self._db.commit()

    def flush(self) -> None:
        self._db.flush()

    def commit(self) -> None:
        self._db.commit()


def get_page_repository(db: Session = Depends(get_db)) -> PageRepository:
    """FastAPI provider yielding the SQLAlchemy page repository."""
    return SqlAlchemyPageRepository(db)
