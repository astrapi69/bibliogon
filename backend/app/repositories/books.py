"""Repository for books (``Book``) and the book aggregate.

Persistence-only: active / trashed / expired-trash listings, the
several scoped lookups, the create / update / soft-delete / hard-delete
primitives, the granular flush/stage/commit hooks the
Book+Chapters aggregate creates need, and the full-graph loader behind
the offline-download endpoint. Author validation, immutable-field
guards, front/back-matter generation, and serialization stay in the
router/service layers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (
    Asset,
    Book,
    Chapter,
    ChapterLabel,
    ComicBubble,
    ComicPanel,
    Page,
    StoryEntity,
    StoryEntityPageLink,
)
from app.repositories.base import SQLAlchemyRepository


class BookRepository(ABC):
    """Data-access contract for books and the book aggregate."""

    @abstractmethod
    def list(self, *, limit: int | None = None) -> Sequence[Book]:
        """Return active (non-deleted) books, newest update first."""

    @abstractmethod
    def get(self, book_id: str) -> Book | None:
        """Return the book in any state, or ``None``."""

    @abstractmethod
    def get_with_chapters(self, book_id: str) -> Book | None:
        """Return the book with chapters eager-loaded, or ``None``."""

    @abstractmethod
    def get_active(self, book_id: str) -> Book | None:
        """Return the book only if it is not soft-deleted."""

    @abstractmethod
    def get_trashed(self, book_id: str) -> Book | None:
        """Return the book only if it is currently in the trash."""

    @abstractmethod
    def list_trashed(self) -> Sequence[Book]:
        """Return every trashed book, newest-trashed first."""

    @abstractmethod
    def list_expired_trash(self, cutoff: datetime) -> Sequence[Book]:
        """Return trashed books whose ``deleted_at`` predates ``cutoff``."""

    @abstractmethod
    def load_book_graph(self, book_id: str) -> dict[str, Any] | None:
        """Return the whole book graph (raw rows) for offline download.

        Keys: ``book`` plus ``chapters`` / ``pages`` / ``comic_panels`` /
        ``comic_bubbles`` / ``story_entities`` /
        ``story_entity_page_links`` / ``chapter_labels`` / ``assets``.
        Returns ``None`` when the book does not exist. Serialization is
        the caller's concern.
        """

    @abstractmethod
    def add(self, book: Book) -> Book:
        """Persist a new book and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, book: Book) -> Book:
        """Persist mutations to a tracked book and return it."""

    @abstractmethod
    def flush_new(self, book: Book) -> Book:
        """Add a new book and flush so its id is populated (no commit)."""

    @abstractmethod
    def stage(self, obj: Any) -> None:
        """Add an aggregate child (e.g. Chapter) without committing."""

    @abstractmethod
    def commit_refresh(self, book: Book) -> Book:
        """Commit staged aggregate changes and refresh the book."""

    @abstractmethod
    def soft_delete(self, book: Book) -> None:
        """Stamp ``deleted_at`` and commit."""

    @abstractmethod
    def delete(self, book: Book) -> None:
        """Hard-delete a single book (FK cascade removes children)."""

    @abstractmethod
    def delete_all(self, books: Sequence[Book]) -> None:
        """Hard-delete a batch of books in one commit."""

    @abstractmethod
    def empty_trash(self) -> None:
        """Hard-delete every trashed book in one statement."""


class SqlAlchemyBookRepository(SQLAlchemyRepository, BookRepository):
    """SQLAlchemy-backed :class:`BookRepository`."""

    def list(self, *, limit: int | None = None) -> Sequence[Book]:
        query = (
            self._db.query(Book).filter(Book.deleted_at.is_(None)).order_by(Book.updated_at.desc())
        )
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def get(self, book_id: str) -> Book | None:
        return self._db.query(Book).filter(Book.id == book_id).first()

    def get_with_chapters(self, book_id: str) -> Book | None:
        return (
            self._db.query(Book)
            .options(joinedload(Book.chapters))
            .filter(Book.id == book_id)
            .first()
        )

    def get_active(self, book_id: str) -> Book | None:
        return self._db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()

    def get_trashed(self, book_id: str) -> Book | None:
        return self._db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_not(None)).first()

    def list_trashed(self) -> Sequence[Book]:
        return (
            self._db.query(Book)
            .filter(Book.deleted_at.is_not(None))
            .order_by(Book.deleted_at.desc())
            .all()
        )

    def list_expired_trash(self, cutoff: datetime) -> Sequence[Book]:
        return (
            self._db.query(Book)
            .filter(Book.deleted_at.is_not(None), Book.deleted_at < cutoff)
            .all()
        )

    def load_book_graph(self, book_id: str) -> dict[str, Any] | None:
        book = self.get(book_id)
        if book is None:
            return None
        chapters = self._db.query(Chapter).filter(Chapter.book_id == book_id).all()
        pages = self._db.query(Page).filter(Page.book_id == book_id).all()
        chapter_ids = [c.id for c in chapters]
        page_ids = [p.id for p in pages]
        panels = (
            self._db.query(ComicPanel).filter(ComicPanel.page_id.in_(page_ids)).all()
            if page_ids
            else []
        )
        panel_ids = [p.id for p in panels]
        bubbles = (
            self._db.query(ComicBubble).filter(ComicBubble.panel_id.in_(panel_ids)).all()
            if panel_ids
            else []
        )
        entities = self._db.query(StoryEntity).filter(StoryEntity.book_id == book_id).all()
        links = (
            self._db.query(StoryEntityPageLink)
            .filter(
                or_(
                    StoryEntityPageLink.page_id.in_(page_ids),
                    StoryEntityPageLink.chapter_id.in_(chapter_ids),
                )
            )
            .all()
            if (page_ids or chapter_ids)
            else []
        )
        labels = self._db.query(ChapterLabel).filter(ChapterLabel.book_id == book_id).all()
        assets = self._db.query(Asset).filter(Asset.book_id == book_id).all()
        return {
            "book": book,
            "chapters": chapters,
            "pages": pages,
            "comic_panels": panels,
            "comic_bubbles": bubbles,
            "story_entities": entities,
            "story_entity_page_links": links,
            "chapter_labels": labels,
            "assets": assets,
        }

    def add(self, book: Book) -> Book:
        self._db.add(book)
        self._db.commit()
        self._db.refresh(book)
        return book

    def save(self, book: Book) -> Book:
        self._db.commit()
        self._db.refresh(book)
        return book

    def flush_new(self, book: Book) -> Book:
        self._db.add(book)
        self._db.flush()
        return book

    def stage(self, obj: Any) -> None:
        self._db.add(obj)

    def commit_refresh(self, book: Book) -> Book:
        self._db.commit()
        self._db.refresh(book)
        return book

    def soft_delete(self, book: Book) -> None:
        book.deleted_at = datetime.now(UTC)
        self._db.commit()

    def delete(self, book: Book) -> None:
        self._db.delete(book)
        self._db.commit()

    def delete_all(self, books: Sequence[Book]) -> None:
        for book in books:
            self._db.delete(book)
        self._db.commit()

    def empty_trash(self) -> None:
        self._db.query(Book).filter(Book.deleted_at.is_not(None)).delete()
        self._db.commit()


def get_book_repository(db: Session = Depends(get_db)) -> BookRepository:
    """FastAPI provider yielding the SQLAlchemy book repository."""
    return SqlAlchemyBookRepository(db)
