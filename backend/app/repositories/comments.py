"""Repository for article comments (``ArticleComment``).

Persistence-only: filtered listing, trash-scoped lookups, and the
soft-delete / restore / hard-delete primitives behind the comments
trash lifecycle. Per-id bulk bookkeeping and HTTP mapping stay in the
router.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArticleComment
from app.repositories.base import SQLAlchemyRepository


class CommentRepository(ABC):
    """Data-access contract for article comments."""

    @abstractmethod
    def list(
        self,
        *,
        imported_from: str | None,
        orphans_only: bool,
        limit: int,
    ) -> Sequence[ArticleComment]:
        """Return non-deleted comments, newest import first, filtered."""

    @abstractmethod
    def get(self, comment_id: str) -> ArticleComment | None:
        """Return the comment in any state, or ``None``."""

    @abstractmethod
    def get_trashed(self, comment_id: str) -> ArticleComment | None:
        """Return the comment only if it is currently in the trash."""

    @abstractmethod
    def list_trashed(self) -> Sequence[ArticleComment]:
        """Return every trashed comment, newest-trashed first."""

    @abstractmethod
    def get_by_ids(self, ids: Sequence[str]) -> Sequence[ArticleComment]:
        """Return the comments whose ids are in ``ids`` (any state)."""

    @abstractmethod
    def soft_delete(self, comment: ArticleComment) -> None:
        """Stamp ``deleted_at`` and commit."""

    @abstractmethod
    def restore(self, comment: ArticleComment) -> ArticleComment:
        """Clear ``deleted_at``, commit, refresh and return the comment."""

    @abstractmethod
    def delete(self, comment: ArticleComment) -> None:
        """Hard-delete a single comment."""

    @abstractmethod
    def delete_many(self, comments: Sequence[ArticleComment]) -> None:
        """Hard-delete a batch of comments in one commit."""

    @abstractmethod
    def commit(self) -> None:
        """Commit pending entity mutations (e.g. bulk-restore)."""


class SqlAlchemyCommentRepository(SQLAlchemyRepository, CommentRepository):
    """SQLAlchemy-backed :class:`CommentRepository`."""

    def list(
        self,
        *,
        imported_from: str | None,
        orphans_only: bool,
        limit: int,
    ) -> Sequence[ArticleComment]:
        query = self._db.query(ArticleComment).filter(
            ArticleComment.deleted_at.is_(None)
        )
        if imported_from is not None:
            query = query.filter(ArticleComment.imported_from == imported_from)
        if orphans_only:
            query = query.filter(ArticleComment.responds_to_article_id.is_(None))
        return query.order_by(ArticleComment.imported_at.desc()).limit(limit).all()

    def get(self, comment_id: str) -> ArticleComment | None:
        return (
            self._db.query(ArticleComment)
            .filter(ArticleComment.id == comment_id)
            .first()
        )

    def get_trashed(self, comment_id: str) -> ArticleComment | None:
        return (
            self._db.query(ArticleComment)
            .filter(
                ArticleComment.id == comment_id,
                ArticleComment.deleted_at.is_not(None),
            )
            .first()
        )

    def list_trashed(self) -> Sequence[ArticleComment]:
        return (
            self._db.query(ArticleComment)
            .filter(ArticleComment.deleted_at.is_not(None))
            .order_by(ArticleComment.deleted_at.desc())
            .all()
        )

    def get_by_ids(self, ids: Sequence[str]) -> Sequence[ArticleComment]:
        if not ids:
            return []
        return (
            self._db.query(ArticleComment)
            .filter(ArticleComment.id.in_(list(ids)))
            .all()
        )

    def soft_delete(self, comment: ArticleComment) -> None:
        comment.deleted_at = datetime.now(UTC)
        self._db.commit()

    def restore(self, comment: ArticleComment) -> ArticleComment:
        comment.deleted_at = None
        self._db.commit()
        self._db.refresh(comment)
        return comment

    def delete(self, comment: ArticleComment) -> None:
        self._db.delete(comment)
        self._db.commit()

    def delete_many(self, comments: Sequence[ArticleComment]) -> None:
        for comment in comments:
            self._db.delete(comment)
        self._db.commit()

    def commit(self) -> None:
        self._db.commit()


def get_comment_repository(db: Session = Depends(get_db)) -> CommentRepository:
    """FastAPI provider yielding the SQLAlchemy comment repository."""
    return SqlAlchemyCommentRepository(db)
