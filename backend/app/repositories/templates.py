"""Repository for book templates (``BookTemplate``).

Persistence-only: eager-loaded listing/retrieval, name-uniqueness
lookup, and the create/update/delete primitives. Builtin read-only
guards and HTTP status mapping stay in the router.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import BookTemplate
from app.repositories.base import SQLAlchemyRepository


class BookTemplateRepository(ABC):
    """Data-access contract for book templates."""

    @abstractmethod
    def list(self) -> Sequence[BookTemplate]:
        """Return all templates (builtin first, then by name), chapters eager-loaded."""

    @abstractmethod
    def get(self, template_id: str) -> BookTemplate | None:
        """Return the template with chapters eager-loaded, or ``None``."""

    @abstractmethod
    def name_exists(self, name: str) -> bool:
        """Return whether a template already uses ``name``."""

    @abstractmethod
    def add(self, template: BookTemplate) -> BookTemplate:
        """Persist a new template and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, template: BookTemplate) -> BookTemplate:
        """Persist mutations to a tracked template and return it."""

    @abstractmethod
    def delete(self, template: BookTemplate) -> None:
        """Delete ``template``."""

    @abstractmethod
    def flush(self) -> None:
        """Flush pending changes (e.g. collection clears) without committing."""


class SqlAlchemyBookTemplateRepository(SQLAlchemyRepository, BookTemplateRepository):
    """SQLAlchemy-backed :class:`BookTemplateRepository`."""

    def list(self) -> Sequence[BookTemplate]:
        return (
            self._db.query(BookTemplate)
            .options(joinedload(BookTemplate.chapters))
            .order_by(BookTemplate.is_builtin.desc(), BookTemplate.name)
            .all()
        )

    def get(self, template_id: str) -> BookTemplate | None:
        return (
            self._db.query(BookTemplate)
            .options(joinedload(BookTemplate.chapters))
            .filter(BookTemplate.id == template_id)
            .first()
        )

    def name_exists(self, name: str) -> bool:
        return (
            self._db.query(BookTemplate).filter(BookTemplate.name == name).first()
            is not None
        )

    def add(self, template: BookTemplate) -> BookTemplate:
        self._db.add(template)
        self._db.commit()
        self._db.refresh(template)
        return template

    def save(self, template: BookTemplate) -> BookTemplate:
        self._db.commit()
        self._db.refresh(template)
        return template

    def delete(self, template: BookTemplate) -> None:
        self._db.delete(template)
        self._db.commit()

    def flush(self) -> None:
        self._db.flush()


def get_book_template_repository(
    db: Session = Depends(get_db),
) -> BookTemplateRepository:
    """FastAPI provider yielding the SQLAlchemy book-template repository."""
    return SqlAlchemyBookTemplateRepository(db)
