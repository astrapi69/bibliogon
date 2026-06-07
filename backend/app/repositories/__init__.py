"""Repository layer — the Service <-> Data boundary.

Routers and service modules depend on the abstract repository
interfaces in this package; concrete SQLAlchemy implementations are
injected via FastAPI ``Depends`` so the persistence backend can be
swapped without touching consumer code. See
``.claude/rules/architecture.md`` ("Repository pattern").
"""

from app.repositories.base import SQLAlchemyRepository

__all__ = ["SQLAlchemyRepository"]
