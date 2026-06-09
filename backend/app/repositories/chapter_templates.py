"""Repository for chapter templates (``ChapterTemplate``).

Persistence-only: listing/retrieval, name-uniqueness, the id-existence
and child-id lookups that the router's validation needs, and the
create/update/delete primitives. The cycle/self-reference rules and the
JSON child-id encoding stay in the router (business + format concerns).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChapterTemplate
from app.repositories.base import SQLAlchemyRepository


class ChapterTemplateRepository(ABC):
    """Data-access contract for chapter templates."""

    @abstractmethod
    def list(self) -> Sequence[ChapterTemplate]:
        """Return all chapter templates, builtin first then by name."""

    @abstractmethod
    def get(self, template_id: str) -> ChapterTemplate | None:
        """Return the chapter template with ``template_id``, or ``None``."""

    @abstractmethod
    def name_exists(self, name: str) -> bool:
        """Return whether a chapter template already uses ``name``."""

    @abstractmethod
    def existing_ids(self, candidate_ids: Sequence[str]) -> set[str]:
        """Return the subset of ``candidate_ids`` that exist."""

    @abstractmethod
    def child_template_ids_raw(self, template_id: str) -> str | None:
        """Return the stored (JSON-encoded) child-id string for a template."""

    @abstractmethod
    def add(self, template: ChapterTemplate) -> ChapterTemplate:
        """Persist a new chapter template and return it (committed, refreshed)."""

    @abstractmethod
    def save(self, template: ChapterTemplate) -> ChapterTemplate:
        """Persist mutations to a tracked chapter template and return it."""

    @abstractmethod
    def delete(self, template: ChapterTemplate) -> None:
        """Delete ``template``."""


class SqlAlchemyChapterTemplateRepository(SQLAlchemyRepository, ChapterTemplateRepository):
    """SQLAlchemy-backed :class:`ChapterTemplateRepository`."""

    def list(self) -> Sequence[ChapterTemplate]:
        return (
            self._db.query(ChapterTemplate)
            .order_by(ChapterTemplate.is_builtin.desc(), ChapterTemplate.name)
            .all()
        )

    def get(self, template_id: str) -> ChapterTemplate | None:
        return self._db.query(ChapterTemplate).filter(ChapterTemplate.id == template_id).first()

    def name_exists(self, name: str) -> bool:
        return (
            self._db.query(ChapterTemplate).filter(ChapterTemplate.name == name).first() is not None
        )

    def existing_ids(self, candidate_ids: Sequence[str]) -> set[str]:
        if not candidate_ids:
            return set()
        rows = (
            self._db.query(ChapterTemplate.id)
            .filter(ChapterTemplate.id.in_(list(candidate_ids)))
            .all()
        )
        return {row[0] for row in rows}

    def child_template_ids_raw(self, template_id: str) -> str | None:
        row = (
            self._db.query(ChapterTemplate.child_template_ids)
            .filter(ChapterTemplate.id == template_id)
            .first()
        )
        return row[0] if row is not None else None

    def add(self, template: ChapterTemplate) -> ChapterTemplate:
        self._db.add(template)
        self._db.commit()
        self._db.refresh(template)
        return template

    def save(self, template: ChapterTemplate) -> ChapterTemplate:
        self._db.commit()
        self._db.refresh(template)
        return template

    def delete(self, template: ChapterTemplate) -> None:
        self._db.delete(template)
        self._db.commit()


def get_chapter_template_repository(
    db: Session = Depends(get_db),
) -> ChapterTemplateRepository:
    """FastAPI provider yielding the SQLAlchemy chapter-template repository."""
    return SqlAlchemyChapterTemplateRepository(db)
