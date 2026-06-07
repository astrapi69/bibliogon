"""Generic bulk-operations repository.

The bulk-delete / bulk-restore endpoints are parametrised by model
(Article / Book / ArticleComment), so they use this generic data-access
helper rather than a per-entity repository. Persistence-only: load a set
of rows by id, delete a row, and commit. The per-id eligibility rules
(soft vs permanent, skip-already-trashed, per-id failure tracking) stay
in the router.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.base import SQLAlchemyRepository


class BulkRepository(ABC):
    """Data-access contract for model-parametrised bulk operations."""

    @abstractmethod
    def get_by_ids(self, model: Any, ids: Sequence[str]) -> list[Any]:
        """Return the rows of ``model`` whose ids are in ``ids`` (any state)."""

    @abstractmethod
    def delete(self, row: Any) -> None:
        """Mark ``row`` for deletion (no commit; the caller batches it)."""

    @abstractmethod
    def commit(self) -> None:
        """Commit the batched mutations in one transaction."""


class SqlAlchemyBulkRepository(SQLAlchemyRepository, BulkRepository):
    """SQLAlchemy-backed :class:`BulkRepository`."""

    def get_by_ids(self, model: Any, ids: Sequence[str]) -> list[Any]:
        if not ids:
            return []
        return self._db.query(model).filter(model.id.in_(list(ids))).all()

    def delete(self, row: Any) -> None:
        self._db.delete(row)

    def commit(self) -> None:
        self._db.commit()


def get_bulk_repository(db: Session = Depends(get_db)) -> BulkRepository:
    """FastAPI provider yielding the SQLAlchemy bulk repository."""
    return SqlAlchemyBulkRepository(db)
