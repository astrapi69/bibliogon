"""HTTP surface of the A+ Content plugin (single router, #825).

Routes stay thin: validate, delegate, return. The generator raises
``app.ai.llm_client.LLMError`` on network/auth/timeout failure, which
this module maps to ``ExternalServiceError`` (naming the cause, per
the #788 lesson) rather than letting the router leak a raw exception.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace as dataclass_replace
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.ai.config import _is_ai_enabled
from app.ai.llm_client import LLMError
from app.ai.llm_factory import _get_client
from app.database import get_db
from app.exceptions import ExternalServiceError, NotFoundError, ValidationError
from app.models import AplusContent, AplusDocument, Book
from app.repositories.aplus_documents import (
    AplusDocumentRepository,
    get_aplus_document_repository,
)
from bibliogon_aplus.book_context import build_book_context, find_missing_fields
from bibliogon_aplus.generator import compute_source_hash, generate_package
from bibliogon_aplus.image_prompts import with_rendered_prompts
from bibliogon_aplus.rules import SUPPORTED_LANGUAGES, get_ruleset
from bibliogon_aplus.schema import (
    AplusDocumentBody,
    AplusDocumentResponse,
    AplusPackage,
    MissingFieldsResponse,
)

router = APIRouter(prefix="/aplus", tags=["aplus"])


def _load_book(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.deleted_at.is_(None)).first()
    if book is None:
        raise NotFoundError(f"Book {book_id} not found")
    return book


def _cached_row(db: Session, book_id: str, language: str) -> AplusContent | None:
    return (
        db.query(AplusContent)
        .filter(AplusContent.book_id == book_id, AplusContent.language == language)
        .first()
    )


@router.post("/{book_id}/generate")
async def generate_aplus_content(
    book_id: str,
    language: str | None = Query(default=None),
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict:
    """Generate (or return the cached) A+ Content package.

    Returns either the generated/cached package, or a
    :class:`MissingFieldsResponse` when the book is missing a
    required field - no AI call happens in that case.

    Each image slot's ``rendered`` prompt string is derived on the way
    out (``with_rendered_prompts``) and never persisted (#865).
    """
    if not _is_ai_enabled():
        raise ValidationError("AI features are disabled")

    book = _load_book(book_id, db)
    missing = find_missing_fields(book)
    if missing:
        return MissingFieldsResponse(book_id=book_id, missing_fields=missing).model_dump()

    rules = get_ruleset()
    context = build_book_context(book)
    resolved_language = language or context.language
    if resolved_language not in SUPPORTED_LANGUAGES:
        raise ValidationError(
            f"Unsupported language {resolved_language!r}; expected one of {SUPPORTED_LANGUAGES}"
        )
    if resolved_language != context.language:
        context = dataclass_replace(context, language=resolved_language)

    source_hash = compute_source_hash(context, rules.version)

    if not force:
        cached = _cached_row(db, book_id, resolved_language)
        if cached and cached.source_hash == source_hash and cached.ruleset_version == rules.version:
            return with_rendered_prompts(json.loads(cached.content_json))

    client = _get_client()
    try:
        package = await generate_package(
            context, language=resolved_language, rules=rules, client=client
        )
    except LLMError as exc:
        raise ExternalServiceError("AI provider", str(exc)) from exc

    row = _cached_row(db, book_id, resolved_language)
    package_json = package.model_dump_json()
    if row is None:
        row = AplusContent(
            book_id=book_id,
            language=resolved_language,
            ruleset_version=rules.version,
            source_hash=source_hash,
            model_name=package.meta.model,
            content_json=package_json,
        )
        db.add(row)
    else:
        row.ruleset_version = rules.version
        row.source_hash = source_hash
        row.model_name = package.meta.model
        row.content_json = package_json
        row.updated_at = datetime.now(UTC)
    db.commit()

    return with_rendered_prompts(package.model_dump())


@router.get("/{book_id}")
def get_aplus_content(
    book_id: str,
    language: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the last generated package for the book (+ language).

    404 when nothing has ever been generated for that combination.
    The stored JSON is returned as stored, plus the derived
    ``rendered`` prompt per image slot where the row carries one.
    """
    book = _load_book(book_id, db)
    resolved_language = language or book.language or "en"
    row = _cached_row(db, book_id, resolved_language)
    if row is None:
        raise NotFoundError(
            f"No A+ Content generated yet for book {book_id} in language {resolved_language!r}"
        )
    return with_rendered_prompts(json.loads(row.content_json))


LANGUAGE_PATTERN = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$")
"""A BCP-47-ish language tag: manual A+ documents are not limited to the
AI ruleset's languages, but the value still becomes part of a lookup key
and must not carry anything but a plain tag."""


def _document_language(book: Book, language: str | None) -> str:
    resolved = language if language is not None else (book.language or "en")
    if not LANGUAGE_PATTERN.match(resolved):
        raise ValidationError(f"Invalid language tag {resolved!r} for an A+ document")
    return resolved


def _document_book(repo: AplusDocumentRepository, book_id: str) -> Book:
    book = repo.get_book(book_id)
    if book is None:
        raise NotFoundError(f"Book {book_id} not found")
    return book


def _document_response(document: AplusDocument) -> dict:
    body = AplusDocumentBody.model_validate_json(document.document_json)
    return AplusDocumentResponse(
        **body.model_dump(),
        book_id=document.book_id,
        language=document.language,
        updated_at=(document.updated_at or document.created_at).isoformat(),
    ).model_dump()


@router.get("/{book_id}/documents")
def list_aplus_documents(
    book_id: str,
    repo: AplusDocumentRepository = Depends(get_aplus_document_repository),
) -> list[dict]:
    """Every language's editable A+ document for the book (full-data backup)."""
    _document_book(repo, book_id)
    return [_document_response(document) for document in repo.list_for_book(book_id)]


@router.get("/{book_id}/document")
def get_aplus_document(
    book_id: str,
    language: str | None = Query(default=None),
    repo: AplusDocumentRepository = Depends(get_aplus_document_repository),
) -> dict:
    """Return the author's editable A+ document (#891); 404 when none exists yet."""
    book = _document_book(repo, book_id)
    resolved_language = _document_language(book, language)
    document = repo.get(book_id, resolved_language)
    if document is None:
        raise NotFoundError(
            f"No A+ document yet for book {book_id} in language {resolved_language!r}"
        )
    return _document_response(document)


@router.put("/{book_id}/document")
def save_aplus_document(
    book_id: str,
    body: AplusDocumentBody,
    language: str | None = Query(default=None),
    repo: AplusDocumentRepository = Depends(get_aplus_document_repository),
) -> dict:
    """Create or replace the editable A+ document for the book and language."""
    book = _document_book(repo, book_id)
    resolved_language = _document_language(book, language)
    document = repo.upsert(book_id, resolved_language, body.model_dump_json())
    return _document_response(document)


@router.delete("/{book_id}/document", status_code=204)
def delete_aplus_document(
    book_id: str,
    language: str | None = Query(default=None),
    repo: AplusDocumentRepository = Depends(get_aplus_document_repository),
) -> Response:
    """Delete the editable A+ document for the book and language, if any."""
    book = _document_book(repo, book_id)
    document = repo.get(book_id, _document_language(book, language))
    if document is not None:
        repo.delete(document)
    return Response(status_code=204)


__all__ = ["router", "AplusPackage"]
