"""Repository for chapters (``Chapter``) and their version aggregate.

Persistence-only: book-existence check, chapter listing/retrieval,
position management, the create/update/delete primitives, and the
ChapterVersion sub-resource (stage/add/list/get/delete + the automatic-
version retention trim). Optimistic-lock checks, snapshot construction,
TOC validation, line-diffing, writing-progress recording, and AI-review
cleanup stay in the router/service layers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, Chapter, ChapterVersion
from app.repositories.base import SQLAlchemyRepository


class ChapterRepository(ABC):
    """Data-access contract for chapters and their versions."""

    @abstractmethod
    def book_exists(self, book_id: str) -> bool:
        """Return whether a book with ``book_id`` exists."""

    @abstractmethod
    def list(self, book_id: str) -> Sequence[Chapter]:
        """Return the book's chapters ordered by position ascending."""

    @abstractmethod
    def get(self, book_id: str, chapter_id: str) -> Chapter | None:
        """Return the chapter scoped to ``book_id``, or ``None``."""

    @abstractmethod
    def next_position(self, book_id: str) -> int:
        """Return the position to append the next new chapter."""

    @abstractmethod
    def bump_positions_from(self, book_id: str, from_position: int) -> None:
        """Shift positions >= ``from_position`` up by one (no commit)."""

    @abstractmethod
    def add(self, chapter: Chapter) -> Chapter:
        """Persist a new chapter and return it (committed, refreshed)."""

    @abstractmethod
    def commit_refresh(self, chapter: Chapter) -> Chapter:
        """Commit staged changes (chapter + any staged version) and refresh."""

    @abstractmethod
    def delete(self, chapter: Chapter) -> None:
        """Hard-delete a chapter (FK cascade removes its versions)."""

    @abstractmethod
    def commit(self) -> None:
        """Commit pending entity mutations (e.g. reorder)."""

    @abstractmethod
    def stage_version(self, version: ChapterVersion) -> None:
        """Add a version snapshot without committing (batched with a save)."""

    @abstractmethod
    def add_version(self, version: ChapterVersion) -> ChapterVersion:
        """Persist a standalone (manual) snapshot and return it."""

    @abstractmethod
    def list_versions(self, chapter_id: str) -> Sequence[ChapterVersion]:
        """Return a chapter's versions, newest version first."""

    @abstractmethod
    def get_version(self, book_id: str, chapter_id: str, version_id: str) -> ChapterVersion | None:
        """Return a version scoped to both chapter and owning book."""

    @abstractmethod
    def get_version_in_chapter(self, chapter_id: str, version_id: str) -> ChapterVersion | None:
        """Return a version scoped to its chapter (no book join)."""

    @abstractmethod
    def delete_version(self, version: ChapterVersion) -> None:
        """Hard-delete a single version."""

    @abstractmethod
    def trim_auto_versions(self, chapter_id: str, keep: int) -> None:
        """Keep only the last ``keep`` automatic versions for a chapter."""


class SqlAlchemyChapterRepository(SQLAlchemyRepository, ChapterRepository):
    """SQLAlchemy-backed :class:`ChapterRepository`."""

    def book_exists(self, book_id: str) -> bool:
        return self._db.query(Book).filter(Book.id == book_id).first() is not None

    def list(self, book_id: str) -> Sequence[Chapter]:
        return (
            self._db.query(Chapter)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.position)
            .all()
        )

    def get(self, book_id: str, chapter_id: str) -> Chapter | None:
        return (
            self._db.query(Chapter)
            .filter(Chapter.id == chapter_id, Chapter.book_id == book_id)
            .first()
        )

    def next_position(self, book_id: str) -> int:
        max_pos = (
            self._db.query(Chapter.position)
            .filter(Chapter.book_id == book_id)
            .order_by(Chapter.position.desc())
            .first()
        )
        return (max_pos[0] + 1) if max_pos else 0

    def bump_positions_from(self, book_id: str, from_position: int) -> None:
        self._db.query(Chapter).filter(
            Chapter.book_id == book_id,
            Chapter.position >= from_position,
        ).update({Chapter.position: Chapter.position + 1}, synchronize_session=False)

    def add(self, chapter: Chapter) -> Chapter:
        self._db.add(chapter)
        self._db.commit()
        self._db.refresh(chapter)
        return chapter

    def commit_refresh(self, chapter: Chapter) -> Chapter:
        self._db.commit()
        self._db.refresh(chapter)
        return chapter

    def delete(self, chapter: Chapter) -> None:
        self._db.delete(chapter)
        self._db.commit()

    def commit(self) -> None:
        self._db.commit()

    def stage_version(self, version: ChapterVersion) -> None:
        self._db.add(version)

    def add_version(self, version: ChapterVersion) -> ChapterVersion:
        self._db.add(version)
        self._db.commit()
        self._db.refresh(version)
        return version

    def list_versions(self, chapter_id: str) -> Sequence[ChapterVersion]:
        return (
            self._db.query(ChapterVersion)
            .filter(ChapterVersion.chapter_id == chapter_id)
            .order_by(ChapterVersion.version.desc())
            .all()
        )

    def get_version(self, book_id: str, chapter_id: str, version_id: str) -> ChapterVersion | None:
        return (
            self._db.query(ChapterVersion)
            .join(Chapter, ChapterVersion.chapter_id == Chapter.id)
            .filter(
                ChapterVersion.id == version_id,
                ChapterVersion.chapter_id == chapter_id,
                Chapter.book_id == book_id,
            )
            .first()
        )

    def get_version_in_chapter(self, chapter_id: str, version_id: str) -> ChapterVersion | None:
        return (
            self._db.query(ChapterVersion)
            .filter(
                ChapterVersion.id == version_id,
                ChapterVersion.chapter_id == chapter_id,
            )
            .first()
        )

    def delete_version(self, version: ChapterVersion) -> None:
        self._db.delete(version)
        self._db.commit()

    def trim_auto_versions(self, chapter_id: str, keep: int) -> None:
        self._db.execute(
            text(
                "DELETE FROM chapter_versions "
                "WHERE chapter_id = :cid AND is_manual = 0 AND id NOT IN ("
                "  SELECT id FROM chapter_versions "
                "  WHERE chapter_id = :cid AND is_manual = 0 "
                "  ORDER BY created_at DESC, version DESC "
                "  LIMIT :keep"
                ")"
            ),
            {"cid": chapter_id, "keep": keep},
        )
        self._db.commit()


def get_chapter_repository(db: Session = Depends(get_db)) -> ChapterRepository:
    """FastAPI provider yielding the SQLAlchemy chapter repository."""
    return SqlAlchemyChapterRepository(db)
