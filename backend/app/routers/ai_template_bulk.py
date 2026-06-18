"""Bulk AI-template export and import for Articles and Books.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 8/10. Four
endpoints in one router file (mirrors the ``bulk_delete.py``
precedent of one module / two routers):

- POST /api/articles/bulk-ai-template/export
- POST /api/articles/bulk-ai-template/import
- POST /api/books/bulk-ai-template/export
- POST /api/books/bulk-ai-template/import

Export accepts an explicit ID list (frontend supplies what's
visible after filters; no server-side filter inversion). The
response is a ZIP containing one ``{slug}.biblio.yaml`` per
record; filename collisions are deduplicated with ``-2``,
``-3``, ... suffixes.

Import accepts a ZIP via multipart upload. Each ``.biblio.yaml``
entry is parsed, the target record is looked up by
``reference.id``, and the standard apply pipeline runs (with
chapter-summaries reconciliation on the Book side per commit
6). The response carries the Medium-importer shape:

    {
      imported: [{id, updated_fields, skipped_fields, ...}],
      failed:   [{filename, error}],
    }

Per S8 the request count is capped at MAX_BULK_AI_TEMPLATE = 50
on both export and import. Larger batches are out of scope for
v1; the backlog carries AI-FILL-CAP-CONFIG-01 for raising the
cap once real usage data justifies it.
"""

from __future__ import annotations

import io
import logging
import zipfile
from typing import Any, Final

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.template_schema import (
    ArticleTemplate,
    BookTemplate,
    TemplateSchemaError,
    build_article_template_from_record,
    build_book_template_from_record,
    parse_template_from_yaml,
    serialize_template_to_yaml,
)
from app.database import get_db
from app.models import Article, Book
from app.routers.article_ai_template import _apply_template_to_article
from app.routers.book_ai_template import _apply_template_to_book
from app.services.filename_slug import ascii_filename_slug

logger = logging.getLogger(__name__)

# Default cap on the number of items per bulk AI-template
# request. Configurable at runtime via
# ``ai.bulk.max_ai_template`` in app.yaml
# (AI-FILL-CAP-CONFIG-01). Stays exported for the documented
# default; the active cap is resolved per request.
MAX_BULK_AI_TEMPLATE: Final = 50

articles_router = APIRouter(prefix="/articles/bulk-ai-template", tags=["article-ai-template"])
books_router = APIRouter(prefix="/books/bulk-ai-template", tags=["book-ai-template"])


def _get_active_bulk_ai_template_cap() -> int:
    """Resolve the active per-batch cap. Reads
    ``ai.bulk.max_ai_template`` from the merged config; falls
    back to ``MAX_BULK_AI_TEMPLATE`` when the key is missing or
    carries an invalid value."""
    from app.ai.routes import _get_bulk_ai_caps

    return _get_bulk_ai_caps()[1]


def _enforce_bulk_ai_template_cap(id_count: int) -> None:
    """Raise HTTP 422 when the request exceeds the runtime cap.
    Used by the export endpoints. The import endpoint runs the
    same check inline so it can include the user-facing
    "ZIP contains N templates" phrasing."""
    cap = _get_active_bulk_ai_template_cap()
    if id_count > cap:
        raise HTTPException(
            status_code=422,
            detail=f"Request contains {id_count} ids; cap is {cap}",
        )


class _BulkExportRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dedupe_filenames(filenames: list[str]) -> list[str]:
    """Resolve collisions like ``my-article.biblio.yaml`` ->
    ``my-article.biblio.yaml`` and ``my-article-2.biblio.yaml``.
    Keeps the on-disk slug convention readable for users
    extracting the ZIP."""
    seen: dict[str, int] = {}
    resolved: list[str] = []
    for name in filenames:
        count = seen.get(name, 0)
        if count == 0:
            resolved.append(name)
        else:
            stem, _, ext = name.partition(".biblio.yaml")
            resolved.append(f"{stem}-{count + 1}.biblio.yaml")
        seen[name] = count + 1
    return resolved


def _build_zip(named_yamls: list[tuple[str, str]]) -> bytes:
    """Pack ``[(filename, yaml_text), ...]`` into a ZIP byte
    blob suitable for a single HTTP response. Uses
    ``ZIP_DEFLATED`` for reasonable compression on YAML text."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for filename, yaml_text in named_yamls:
            zf.writestr(filename, yaml_text)
    return buf.getvalue()


def _zip_response(zip_bytes: bytes, archive_name: str) -> Response:
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{archive_name}"',
        },
    )


def _iter_yaml_entries(
    upload_bytes: bytes,
) -> list[tuple[str, str, Exception | None]]:
    """Iterate over .biblio.yaml entries in the uploaded ZIP.
    Returns ``[(filename, text, error_or_None)]``. Non-YAML
    entries are skipped silently. UTF-8 decode failures surface
    as the third tuple element so the caller can record them
    under ``failed``."""
    out: list[tuple[str, str, Exception | None]] = []
    try:
        zf = zipfile.ZipFile(io.BytesIO(upload_bytes))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Upload is not a valid ZIP: {exc}") from exc

    with zf:
        names = [n for n in zf.namelist() if n.endswith(".biblio.yaml")]
        if not names:
            raise HTTPException(
                status_code=400,
                detail="ZIP contains no .biblio.yaml files",
            )
        cap = _get_active_bulk_ai_template_cap()
        if len(names) > cap:
            raise HTTPException(
                status_code=422,
                detail=(f"ZIP contains {len(names)} templates; cap is {cap}"),
            )
        for name in names:
            raw = zf.read(name)
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError as exc:
                out.append((name, "", exc))
                continue
            out.append((name, text, None))
    return out


def _load_articles_by_id(article_ids: list[str], db: Session) -> dict[str, Article]:
    rows = (
        db.query(Article)
        .filter(Article.id.in_(article_ids))
        .filter(Article.deleted_at.is_(None))
        .all()
    )
    return {a.id: a for a in rows}


def _load_books_by_id(book_ids: list[str], db: Session) -> dict[str, Book]:
    rows = db.query(Book).filter(Book.id.in_(book_ids)).filter(Book.deleted_at.is_(None)).all()
    return {b.id: b for b in rows}


# ---------------------------------------------------------------------------
# Article endpoints
# ---------------------------------------------------------------------------


@articles_router.post("/export")
def bulk_export_articles(request: _BulkExportRequest, db: Session = Depends(get_db)) -> Response:
    """Build a ZIP containing one ``.biblio.yaml`` per article
    in the request's ``ids`` list. Missing IDs raise 404 with
    the first few surfaced for diagnosis."""
    _enforce_bulk_ai_template_cap(len(request.ids))
    articles_by_id = _load_articles_by_id(request.ids, db)
    missing = [aid for aid in request.ids if aid not in articles_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Articles not found: {', '.join(missing[:5])}"
            + ("..." if len(missing) > 5 else ""),
        )

    named: list[tuple[str, str]] = []
    raw_filenames: list[str] = []
    for aid in request.ids:
        article = articles_by_id[aid]
        template = build_article_template_from_record(article)
        raw_filenames.append(
            f"{ascii_filename_slug(article.title, fallback='article')}.biblio.yaml"
        )
        yaml_text = serialize_template_to_yaml(template, include_header=True)
        named.append(("", yaml_text))

    resolved = _dedupe_filenames(raw_filenames)
    named = [(resolved[i], named[i][1]) for i in range(len(named))]
    zip_bytes = _build_zip(named)
    return _zip_response(zip_bytes, "articles-ai-templates.zip")


@articles_router.post("/import")
async def bulk_import_articles(
    file: UploadFile = File(...),
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Import every ``.biblio.yaml`` in the uploaded ZIP. The
    target article is looked up by ``reference.id`` inside the
    YAML; entries whose reference points at an unknown article
    end up in ``failed`` with a clear reason."""
    upload_bytes = await file.read()
    if not upload_bytes:
        raise HTTPException(status_code=400, detail="Empty upload")

    entries = _iter_yaml_entries(upload_bytes)
    imported: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for filename, yaml_text, decode_error in entries:
        if decode_error is not None:
            failed.append({"filename": filename, "error": f"UTF-8 decode failed: {decode_error}"})
            continue
        try:
            template = parse_template_from_yaml(yaml_text)
        except TemplateSchemaError as exc:
            failed.append({"filename": filename, "error": str(exc)})
            continue
        if not isinstance(template, ArticleTemplate):
            failed.append(
                {
                    "filename": filename,
                    "error": (
                        f"Template type is {template.type!r}; "
                        "bulk article import accepts only article templates"
                    ),
                }
            )
            continue
        if template.reference is None:
            failed.append(
                {
                    "filename": filename,
                    "error": (
                        "Template has no reference block; "
                        "bulk import requires reference.id to locate the article"
                    ),
                }
            )
            continue

        article = (
            db.query(Article)
            .filter(Article.id == template.reference.id)
            .filter(Article.deleted_at.is_(None))
            .first()
        )
        if article is None:
            failed.append(
                {
                    "filename": filename,
                    "error": f"Article {template.reference.id} not found",
                }
            )
            continue

        updated, skipped = _apply_template_to_article(article, template, force=force)
        if updated:
            db.add(article)
            db.commit()
            db.refresh(article)

        imported.append(
            {
                "filename": filename,
                "article_id": article.id,
                "updated_fields": updated,
                "skipped_fields": list(skipped.keys()),
                "skip_reasons": skipped,
            }
        )

    return {
        "imported": imported,
        "failed": failed,
        "force": force,
    }


# ---------------------------------------------------------------------------
# Book endpoints
# ---------------------------------------------------------------------------


@books_router.post("/export")
def bulk_export_books(request: _BulkExportRequest, db: Session = Depends(get_db)) -> Response:
    _enforce_bulk_ai_template_cap(len(request.ids))
    books_by_id = _load_books_by_id(request.ids, db)
    missing = [bid for bid in request.ids if bid not in books_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Books not found: {', '.join(missing[:5])}"
            + ("..." if len(missing) > 5 else ""),
        )

    named: list[tuple[str, str]] = []
    raw_filenames: list[str] = []
    for bid in request.ids:
        book = books_by_id[bid]
        template = build_book_template_from_record(book)
        raw_filenames.append(f"{ascii_filename_slug(book.title, fallback='book')}.biblio.yaml")
        yaml_text = serialize_template_to_yaml(template, include_header=True)
        named.append(("", yaml_text))

    resolved = _dedupe_filenames(raw_filenames)
    named = [(resolved[i], named[i][1]) for i in range(len(named))]
    zip_bytes = _build_zip(named)
    return _zip_response(zip_bytes, "books-ai-templates.zip")


@books_router.post("/import")
async def bulk_import_books(
    file: UploadFile = File(...),
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    upload_bytes = await file.read()
    if not upload_bytes:
        raise HTTPException(status_code=400, detail="Empty upload")

    entries = _iter_yaml_entries(upload_bytes)
    imported: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for filename, yaml_text, decode_error in entries:
        if decode_error is not None:
            failed.append({"filename": filename, "error": f"UTF-8 decode failed: {decode_error}"})
            continue
        try:
            template = parse_template_from_yaml(yaml_text)
        except TemplateSchemaError as exc:
            failed.append({"filename": filename, "error": str(exc)})
            continue
        if not isinstance(template, BookTemplate):
            failed.append(
                {
                    "filename": filename,
                    "error": (
                        f"Template type is {template.type!r}; "
                        "bulk book import accepts only book templates"
                    ),
                }
            )
            continue
        if template.reference is None:
            failed.append(
                {
                    "filename": filename,
                    "error": (
                        "Template has no reference block; "
                        "bulk import requires reference.id to locate the book"
                    ),
                }
            )
            continue

        book = (
            db.query(Book)
            .filter(Book.id == template.reference.id)
            .filter(Book.deleted_at.is_(None))
            .first()
        )
        if book is None:
            failed.append(
                {
                    "filename": filename,
                    "error": f"Book {template.reference.id} not found",
                }
            )
            continue

        updated, skipped, dropped = _apply_template_to_book(book, template, force=force)
        if updated:
            db.add(book)
            db.commit()
            db.refresh(book)

        imported.append(
            {
                "filename": filename,
                "book_id": book.id,
                "updated_fields": updated,
                "skipped_fields": list(skipped.keys()),
                "skip_reasons": skipped,
                "dropped_chapter_summaries": dropped,
            }
        )

    return {
        "imported": imported,
        "failed": failed,
        "force": force,
    }


__all__ = ["articles_router", "books_router", "MAX_BULK_AI_TEMPLATE"]
