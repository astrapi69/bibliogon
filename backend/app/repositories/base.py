"""Base class for SQLAlchemy-backed repositories."""

from __future__ import annotations

from sqlalchemy.orm import Session


class SQLAlchemyRepository:
    """Holds the SQLAlchemy session for a concrete repository.

    Concrete repositories extend this together with their entity's
    abstract interface and translate intent-named methods into session
    operations. Centralising the session here keeps the commit/refresh
    convention identical across repositories and is the only place in
    the Service layer allowed to touch a ``Session``.

    Args:
        db: The request-scoped SQLAlchemy session (from ``get_db``).
    """

    def __init__(self, db: Session) -> None:
        self._db = db
