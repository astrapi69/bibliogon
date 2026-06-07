"""Repository for articles (``Article``).

Persistence-only: filtered + trashed + expired-trash listings, the
any-state and trash-scoped lookups, and the create / update /
soft-delete / hard-delete primitives behind the article CRUD + trash
lifecycle. Status validation, on-disk asset cleanup, AI orchestration,
and the cross-entity reclassify service stay in the router. The tag
filter's JSON-string encoding is a storage-format concern and lives
here.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article
from app.repositories.base import SQLAlchemyRepository


class ArticleRepository(ABC):
    """Data-access contract for articles."""

    @abstractmethod
    def get(self, article_id: str) -> Article | None:
        """Return the article in any state (incl. trashed), or ``None``."""

    @abstractmethod
    def get_trashed(self, article_id: str) -> Article | None:
        """Return the article only if it is currently in the trash."""

    @abstractmethod
    def list(
        self,
        *,
        status: str | None = None,
        series: str | None = None,
        tag: str | None = None,
        topic: str | None = None,
        limit: int | None = None,
    ) -> Sequence[Article]:
        """Return live articles (newest update first) narrowed by filters."""

    @abstractmethod
    def list_trashed(self) -> Sequence[Article]:
        """Return every trashed article, newest-trashed first."""

    @abstractmethod
    def list_expired_trash(self, cutoff: datetime) -> Sequence[Article]:
        """Return trashed articles whose ``deleted_at`` predates ``cutoff``."""

    @abstractmethod
    def add(self, article: Article) -> Article:
        """Persist a new article and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, article: Article) -> Article:
        """Persist mutations to a tracked article and return it."""

    @abstractmethod
    def soft_delete(self, article: Article) -> None:
        """Stamp ``deleted_at`` and commit."""

    @abstractmethod
    def delete(self, article: Article) -> None:
        """Hard-delete a single article."""

    @abstractmethod
    def delete_all(self, articles: Sequence[Article]) -> None:
        """Hard-delete a batch of articles in one commit."""


class SqlAlchemyArticleRepository(SQLAlchemyRepository, ArticleRepository):
    """SQLAlchemy-backed :class:`ArticleRepository`."""

    def get(self, article_id: str) -> Article | None:
        return self._db.query(Article).filter(Article.id == article_id).first()

    def get_trashed(self, article_id: str) -> Article | None:
        return (
            self._db.query(Article)
            .filter(Article.id == article_id, Article.deleted_at.is_not(None))
            .first()
        )

    def list(
        self,
        *,
        status: str | None = None,
        series: str | None = None,
        tag: str | None = None,
        topic: str | None = None,
        limit: int | None = None,
    ) -> Sequence[Article]:
        query = self._db.query(Article).filter(Article.deleted_at.is_(None))
        if status is not None:
            query = query.filter(Article.status == status)
        if series is not None:
            query = query.filter(Article.series == series)
        if topic is not None:
            query = query.filter(Article.topic == topic)
        if tag is not None:
            needle = json.dumps(tag)
            query = query.filter(Article.tags.like(f"%{needle}%"))
        query = query.order_by(Article.updated_at.desc())
        if limit is not None:
            query = query.limit(limit)
        return query.all()

    def list_trashed(self) -> Sequence[Article]:
        return (
            self._db.query(Article)
            .filter(Article.deleted_at.is_not(None))
            .order_by(Article.deleted_at.desc())
            .all()
        )

    def list_expired_trash(self, cutoff: datetime) -> Sequence[Article]:
        return (
            self._db.query(Article)
            .filter(Article.deleted_at.is_not(None), Article.deleted_at < cutoff)
            .all()
        )

    def add(self, article: Article) -> Article:
        self._db.add(article)
        self._db.commit()
        self._db.refresh(article)
        return article

    def save(self, article: Article) -> Article:
        self._db.add(article)
        self._db.commit()
        self._db.refresh(article)
        return article

    def soft_delete(self, article: Article) -> None:
        article.deleted_at = datetime.now(UTC)
        self._db.commit()

    def delete(self, article: Article) -> None:
        self._db.delete(article)
        self._db.commit()

    def delete_all(self, articles: Sequence[Article]) -> None:
        for article in articles:
            self._db.delete(article)
        self._db.commit()


def get_article_repository(db: Session = Depends(get_db)) -> ArticleRepository:
    """FastAPI provider yielding the SQLAlchemy article repository."""
    return SqlAlchemyArticleRepository(db)
