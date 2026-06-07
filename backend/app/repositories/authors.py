"""Repository for the ``authors`` table — reference implementation.

Defines the abstract :class:`AuthorRepository` interface (the contract
the router depends on), its SQLAlchemy implementation, and the
``get_author_repository`` FastAPI provider. No HTTP concepts and no
business rules live here — slug derivation and 404 handling stay in the
router; this module is persistence-only.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Author
from app.repositories.base import SQLAlchemyRepository


class AuthorRepository(ABC):
    """Data-access contract for authors.

    Methods are intent-named and free of ``Session`` primitives so a
    non-SQLAlchemy backend could implement the same interface.
    """

    @abstractmethod
    def get(self, author_id: str) -> Author | None:
        """Return the author with ``author_id``, or ``None``."""

    @abstractmethod
    def list(self, *, search: str | None, limit: int) -> Sequence[Author]:
        """Return authors ordered by name, optionally name-filtered.

        Args:
            search: Case-insensitive substring filter on ``name``;
                ``None`` / blank lists all.
            limit: Maximum number of rows to return.
        """

    @abstractmethod
    def slug_exists(self, slug: str) -> bool:
        """Return whether an author already uses ``slug``."""

    @abstractmethod
    def add(self, author: Author) -> Author:
        """Persist a new ``author`` and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, author: Author) -> Author:
        """Persist mutations to a tracked ``author`` and return it."""

    @abstractmethod
    def delete(self, author: Author) -> None:
        """Hard-delete ``author``."""


class SqlAlchemyAuthorRepository(SQLAlchemyRepository, AuthorRepository):
    """SQLAlchemy-backed :class:`AuthorRepository`."""

    def get(self, author_id: str) -> Author | None:
        return self._db.query(Author).filter(Author.id == author_id).first()

    def list(self, *, search: str | None, limit: int) -> Sequence[Author]:
        query = self._db.query(Author)
        if search and search.strip():
            query = query.filter(Author.name.ilike(f"%{search.strip()}%"))
        return (
            query.order_by(Author.name.asc(), Author.created_at.desc())
            .limit(limit)
            .all()
        )

    def slug_exists(self, slug: str) -> bool:
        return self._db.query(Author).filter(Author.slug == slug).first() is not None

    def add(self, author: Author) -> Author:
        self._db.add(author)
        self._db.commit()
        self._db.refresh(author)
        return author

    def save(self, author: Author) -> Author:
        self._db.commit()
        self._db.refresh(author)
        return author

    def delete(self, author: Author) -> None:
        self._db.delete(author)
        self._db.commit()


def get_author_repository(db: Session = Depends(get_db)) -> AuthorRepository:
    """FastAPI provider yielding the SQLAlchemy author repository."""
    return SqlAlchemyAuthorRepository(db)
