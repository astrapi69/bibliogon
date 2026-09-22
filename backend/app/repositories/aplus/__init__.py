"""Repositories for the A+ Content plugin's core tables (#891).

Grouped in their own package so plugin-owned persistence does not keep
growing the flat ``app/repositories`` folder (dir-size ratchet, #466).
"""

from app.repositories.aplus.documents import (
    AplusDocumentRepository,
    SqlAlchemyAplusDocumentRepository,
    get_aplus_document_repository,
)

__all__ = [
    "AplusDocumentRepository",
    "SqlAlchemyAplusDocumentRepository",
    "get_aplus_document_repository",
]
