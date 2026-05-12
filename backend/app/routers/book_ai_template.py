"""Book AI-template endpoints.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 6/10. Mirrors
``article_ai_template`` for the Book model. Three endpoints:

- ``GET  /api/books/{book_id}/ai-template`` — export
- ``POST /api/books/{book_id}/ai-template`` — import
- ``GET  /api/ai-templates/book?language=en`` — empty / new-idea

The Book side differs from Article in one place: the
``chapter_summaries`` field undergoes reconciliation before
``apply_field`` runs. Each incoming entry is matched to a
chapter row by ``chapter_id`` (preferred); the fallback is a
whitespace-normalized case-insensitive ``title`` match,
documented as lenient per S4 to handle the small
Schreibweise-Variationen that surface when users edit YAMLs
manually. Unmatched entries are dropped and reported in the
response so the caller knows why a summary did not land.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.ai.template_schema import (
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    BookTemplate,
    TemplateSchemaError,
    apply_field,
    build_book_template_from_record,
    build_empty_book_template,
    parse_template_from_yaml,
    serialize_template_to_yaml,
)
from app.database import get_db
from app.models import Book
from app.schemas import BookOut

logger = logging.getLogger(__name__)

books_router = APIRouter(prefix="/books", tags=["book-ai-template"])
empty_router = APIRouter(prefix="/ai-templates", tags=["ai-template-empty"])


# ---------------------------------------------------------------------------
# Field map (template field name -> book column, is_json_list)
# ---------------------------------------------------------------------------

# chapter_summaries is intentionally excluded from this map; it
# receives custom reconciliation handling in
# ``_apply_template_to_book`` before apply_field runs.
BOOK_TEMPLATE_FIELD_MAP: list[tuple[str, str, bool]] = [
    ("title", "title", False),
    ("subtitle", "subtitle", False),
    ("description", "description", False),
    ("genre", "genre", False),
    ("keywords", "keywords", True),
    ("html_description", "html_description", False),
    ("backpage_description", "backpage_description", False),
    ("backpage_author_bio", "backpage_author_bio", False),
    ("cover_image_prompt", "cover_image_prompt", False),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _slugify(title: str) -> str:
    """ASCII-safe filename slug. Mirrors the article-side helper
    so per-book exports land with predictable filenames."""
    folded = unicodedata.normalize("NFKD", title)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^\w\s-]", "", ascii_only).strip()
    cleaned = re.sub(r"[\s_-]+", "-", cleaned)
    return cleaned.lower() or "book"


def _load_book(book_id: str, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    return book


def _normalize_title(title: str) -> str:
    """Whitespace-normalized, lowercased title for the lenient
    chapter-title fallback match. Per S4 the lenient comparison
    catches Schreibweise-Variationen ("The First Survey" vs.
    "The  first survey ") that exact-match would reject. The
    leniency is intentional - documented here so the chapter-
    summaries reconciliation stays consistent across revisions."""
    return re.sub(r"\s+", " ", title.strip()).lower()


def reconcile_chapter_summaries(
    book: Book, incoming: list[Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Match incoming chapter_summaries entries to book
    chapters. Returns ``(reconciled, dropped)``. Reconciled
    entries carry the canonical ``chapter_id`` from the matched
    chapter row; dropped entries are returned separately so the
    response can surface them as "no-matching-chapter" or
    "summary-empty"."""
    chapters_by_id = {c.id: c for c in book.chapters}
    chapters_by_title = {_normalize_title(c.title): c for c in book.chapters}

    reconciled: list[dict[str, Any]] = []
    dropped: list[dict[str, Any]] = []

    if not isinstance(incoming, list):
        return reconciled, dropped

    for raw_entry in incoming:
        if not isinstance(raw_entry, dict):
            dropped.append({"reason": "not-a-mapping", "entry": raw_entry})
            continue

        summary = raw_entry.get("summary")
        if summary is None or not str(summary).strip():
            dropped.append({"reason": "summary-empty", "entry": raw_entry})
            continue

        ch_id = raw_entry.get("chapter_id")
        matched = chapters_by_id.get(ch_id) if ch_id else None
        if matched is None:
            title = raw_entry.get("title")
            if title:
                matched = chapters_by_title.get(_normalize_title(str(title)))

        if matched is None:
            dropped.append(
                {
                    "reason": "no-matching-chapter",
                    "chapter_id": ch_id,
                    "title": raw_entry.get("title"),
                }
            )
            continue

        reconciled.append(
            {
                "chapter_id": matched.id,
                "title": matched.title,
                "summary": str(summary).strip(),
            }
        )

    return reconciled, dropped


def _apply_template_to_book(
    book: Book, template: BookTemplate, *, force: bool
) -> tuple[list[str], dict[str, str], list[dict[str, Any]]]:
    """Apply a parsed book template to a Book row. Returns
    ``(updated_fields, skipped_with_reasons, dropped_chapter_summaries)``.
    Caller owns the DB transaction."""
    updated: list[str] = []
    skipped: dict[str, str] = {}

    for tpl_field, col_name, is_json_list in BOOK_TEMPLATE_FIELD_MAP:
        new_value = getattr(template, tpl_field).current_value
        result = apply_field(
            book, col_name, new_value, force=force, is_json_list=is_json_list
        )
        if result == APPLY_UPDATED:
            updated.append(tpl_field)
        elif result == APPLY_SKIP_EMPTY:
            skipped[tpl_field] = APPLY_SKIP_EMPTY
        elif result == APPLY_SKIP_POPULATED:
            skipped[tpl_field] = APPLY_SKIP_POPULATED

    # Chapter summaries: reconcile first, then apply as JSON list.
    raw_summaries = template.chapter_summaries.current_value or []
    reconciled, dropped = reconcile_chapter_summaries(book, raw_summaries)
    result = apply_field(
        book,
        "chapter_summaries",
        reconciled,
        force=force,
        is_json_list=True,
    )
    if result == APPLY_UPDATED:
        updated.append("chapter_summaries")
    elif result == APPLY_SKIP_EMPTY:
        # All entries dropped and the AI value was already empty.
        # Distinguish "value-is-empty" (caller submitted nothing)
        # from "all-entries-dropped" (caller submitted unmatched
        # entries) so the UI can surface the right message.
        if dropped:
            skipped["chapter_summaries"] = "all-entries-dropped"
        else:
            skipped["chapter_summaries"] = APPLY_SKIP_EMPTY
    elif result == APPLY_SKIP_POPULATED:
        skipped["chapter_summaries"] = APPLY_SKIP_POPULATED

    return updated, skipped, dropped


def _build_yaml_response(yaml_text: str, slug: str) -> Response:
    return Response(
        content=yaml_text,
        media_type="text/yaml; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}.biblio.yaml"',
        },
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@books_router.get("/{book_id}/ai-template")
def export_book_template(
    book_id: str, db: Session = Depends(get_db)
) -> Response:
    """Export the book as a ``.biblio.yaml`` template with
    reference block carrying id, language, body_word_count and
    a 500-word body preview aggregated from all chapters."""
    book = _load_book(book_id, db)
    template = build_book_template_from_record(book)
    yaml_text = serialize_template_to_yaml(template, include_header=True)
    return _build_yaml_response(yaml_text, _slugify(book.title))


@books_router.post("/{book_id}/ai-template")
async def import_book_template(
    book_id: str,
    request: Request,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Import a filled book template. chapter_summaries entries
    are reconciled against the book's chapter rows before being
    written - matched by chapter_id, fallback to whitespace-
    normalized case-insensitive title. Unmatched entries are
    dropped and reported under ``dropped_chapter_summaries``."""
    book = _load_book(book_id, db)

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body")
    try:
        yaml_text = raw_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"Request body is not valid UTF-8: {exc}"
        ) from exc

    try:
        template = parse_template_from_yaml(yaml_text)
    except TemplateSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(template, BookTemplate):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Template type is {template.type!r}; this endpoint accepts "
                "only book templates"
            ),
        )

    updated, skipped, dropped = _apply_template_to_book(book, template, force=force)

    if updated:
        db.add(book)
        db.commit()
        db.refresh(book)

    return {
        "book_id": book.id,
        "updated_fields": updated,
        "skipped_fields": list(skipped.keys()),
        "skip_reasons": skipped,
        "dropped_chapter_summaries": dropped,
        "force": force,
    }


@books_router.post(
    "/from-ai-template",
    status_code=201,
    response_model=BookOut,
)
async def create_book_from_ai_template(
    request: Request,
    db: Session = Depends(get_db),
) -> Book:
    """Create a new Book from a filled ``.biblio.yaml`` template
    (the "New from template" workflow for books). Symmetric with
    the Article side: parse YAML, validate it's a BookTemplate,
    require title.current_value to be a non-empty string,
    create the row, then run all template fields through
    ``_apply_template_to_book`` with force=True.

    Author is sourced from the per-book template structure when
    that lands (a future schema extension); for now, the new
    book starts with author=None, which is accepted when
    ``app.allow_books_without_author`` is true in Settings and
    rejected with the standard 400 otherwise. Users on the
    default config can either flip the setting in Settings or
    set the author via the editor after creation."""
    from app.routers.books import (
        _allow_books_without_author,
        _validate_author,
    )

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body")
    try:
        yaml_text = raw_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Request body is not valid UTF-8: {exc}",
        ) from exc

    try:
        template = parse_template_from_yaml(yaml_text)
    except TemplateSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(template, BookTemplate):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Template type is {template.type!r}; this endpoint "
                "accepts only book templates"
            ),
        )

    title_value = template.title.current_value
    if not isinstance(title_value, str) or not title_value.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Book template's title field has no current_value; "
                "set a title in the template before importing it as a new book"
            ),
        )

    language = "en"
    if template.reference is not None and template.reference.language:
        language = template.reference.language
    elif template.language:
        language = template.language

    # Standard author validation: None is accepted when the
    # advanced setting allows it, else 400 with the same message
    # used by ``POST /api/books``. The template format doesn't
    # carry author today; deferring is fine.
    author = _validate_author(None, _allow_books_without_author())

    book = Book(title=title_value.strip(), language=language, author=author)
    db.add(book)
    db.flush()

    _apply_template_to_book(book, template, force=True)

    db.commit()
    db.refresh(book)
    return book


@empty_router.get("/book")
def empty_book_template(
    language: str = Query(
        default="en",
        min_length=2,
        max_length=10,
        description=(
            "Language code propagated to the root-level "
            "`language:` key. No reference block (new-idea "
            "workflow). The paired 'New from template' Book-"
            "creation endpoint ships in Session 2."
        ),
    ),
) -> Response:
    template = build_empty_book_template(language=language)
    yaml_text = serialize_template_to_yaml(template, include_header=True)
    safe_lang = re.sub(r"[^a-z0-9-]", "-", language.lower()) or "lang"
    slug = f"new-book-{safe_lang}"
    return _build_yaml_response(yaml_text, slug)


__all__ = [
    "books_router",
    "empty_router",
    "BOOK_TEMPLATE_FIELD_MAP",
    "reconcile_chapter_summaries",
]
