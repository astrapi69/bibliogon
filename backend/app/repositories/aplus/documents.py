"""Repository for the editable A+ document per book and language (#891).

Persistence-only: book lookup, list/get/upsert/delete of the document rows
(one per book and language). The router keeps the 404 handling and the JSON
schema validation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AplusDocument, Book
from app.repositories.base import SQLAlchemyRepository


class AplusDocumentRepository(ABC):
    """Data-access contract for editable A+ documents."""

    @abstractmethod
    def get_book(self, book_id: str) -> Book | None:
        """Return the live (not trashed) book, or ``None``."""

    @abstractmethod
    def get(self, book_id: str, language: str) -> AplusDocument | None:
        """Return the document for the book and language, or ``None``."""

    @abstractmethod
    def list_for_book(self, book_id: str) -> Sequence[AplusDocument]:
        """Return every language's document for the book, ordered by language."""

    @abstractmethod
    def upsert(self, book_id: str, language: str, document_json: str) -> AplusDocument:
        """Create or replace the document and return it (committed, refreshed)."""

    @abstractmethod
    def delete(self, document: AplusDocument) -> None:
        """Delete ``document``."""


class SqlAlchemyAplusDocumentRepository(SQLAlchemyRepository, AplusDocumentRepository):
    """SQLAlchemy-backed :class:`AplusDocumentRepository`."""

    def get_book(self, book_id: str) -> Book | None:
        return self._db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()

    def get(self, book_id: str, language: str) -> AplusDocument | None:
        return (
            self._db.query(AplusDocument)
            .filter(AplusDocument.book_id == book_id, AplusDocument.language == language)
            .first()
        )

    def list_for_book(self, book_id: str) -> Sequence[AplusDocument]:
        return (
            self._db.query(AplusDocument)
            .filter(AplusDocument.book_id == book_id)
            .order_by(AplusDocument.language)
            .all()
        )

    def upsert(self, book_id: str, language: str, document_json: str) -> AplusDocument:
        document = self.get(book_id, language)
        if document is None:
            document = AplusDocument(
                book_id=book_id, language=language, document_json=document_json
            )
            self._db.add(document)
        else:
            document.document_json = document_json
        self._db.commit()
        self._db.refresh(document)
        return document

    def delete(self, document: AplusDocument) -> None:
        self._db.delete(document)
        self._db.commit()


def get_aplus_document_repository(db: Session = Depends(get_db)) -> AplusDocumentRepository:
    """FastAPI provider for :class:`AplusDocumentRepository`."""
    return SqlAlchemyAplusDocumentRepository(db)
