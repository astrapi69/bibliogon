"""Repository for article publications (``Publication``).

Persistence-only: the owning-article lookup (for 404s), per-article
listing/retrieval, and the create/update/delete primitives. Drift
detection, platform-metadata validation, and HTTP status mapping stay
in the router.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article, Publication
from app.repositories.base import SQLAlchemyRepository


class PublicationRepository(ABC):
    """Data-access contract for article publications."""

    @abstractmethod
    def get_article(self, article_id: str) -> Article | None:
        """Return the owning article, or ``None``."""

    @abstractmethod
    def get(self, article_id: str, pub_id: str) -> Publication | None:
        """Return the publication scoped to ``article_id``, or ``None``."""

    @abstractmethod
    def list(self, article_id: str) -> Sequence[Publication]:
        """Return the article's publications ordered by creation time."""

    @abstractmethod
    def add(self, pub: Publication) -> Publication:
        """Persist a new publication and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, pub: Publication) -> Publication:
        """Persist mutations to a tracked publication and return it."""

    @abstractmethod
    def delete(self, pub: Publication) -> None:
        """Delete ``pub``."""


class SqlAlchemyPublicationRepository(SQLAlchemyRepository, PublicationRepository):
    """SQLAlchemy-backed :class:`PublicationRepository`."""

    def get_article(self, article_id: str) -> Article | None:
        return self._db.query(Article).filter(Article.id == article_id).first()

    def get(self, article_id: str, pub_id: str) -> Publication | None:
        return (
            self._db.query(Publication)
            .filter(Publication.id == pub_id, Publication.article_id == article_id)
            .first()
        )

    def list(self, article_id: str) -> Sequence[Publication]:
        return (
            self._db.query(Publication)
            .filter(Publication.article_id == article_id)
            .order_by(Publication.created_at)
            .all()
        )

    def add(self, pub: Publication) -> Publication:
        self._db.add(pub)
        self._db.commit()
        self._db.refresh(pub)
        return pub

    def save(self, pub: Publication) -> Publication:
        self._db.add(pub)
        self._db.commit()
        self._db.refresh(pub)
        return pub

    def delete(self, pub: Publication) -> None:
        self._db.delete(pub)
        self._db.commit()


def get_publication_repository(
    db: Session = Depends(get_db),
) -> PublicationRepository:
    """FastAPI provider yielding the SQLAlchemy publication repository."""
    return SqlAlchemyPublicationRepository(db)
