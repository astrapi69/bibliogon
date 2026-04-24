"""Shared override-application logic for import handlers.

The wizard's Step 3 sends a flat dict of overrides keyed by Book
column name. Each handler's ``execute()`` calls
:func:`apply_book_overrides` to merge them into the newly-created
Book row. Null-skip semantics:

- ``None`` means the user deselected the field. The override is
  skipped; the column keeps whatever value the handler wrote (or
  the column's SQLAlchemy default).
- A non-None value sets the column.
- Keys NOT in ``BOOK_IMPORT_OVERRIDE_KEYS`` raise ``KeyError`` so
  the handler fails loudly instead of silently dropping a
  user-visible override.

Title and author are special: empty/blank values for these are
rejected with :class:`MandatoryFieldMissing`, which the router
maps to HTTP 400. The validation runs before any DB write.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Book

#: All Book columns the wizard can override. Mirrors the Metadata
#: Editor's field list. Adding a new user-editable column to Book:
#: add it here, add a form row in BookMetadataEditor + PreviewPanel.
BOOK_IMPORT_OVERRIDE_KEYS: frozenset[str] = frozenset({
    "title", "subtitle", "author", "language",
    "series", "series_index", "genre",
    "description", "edition", "publisher", "publisher_city", "publish_date",
    "isbn_ebook", "isbn_paperback", "isbn_hardcover",
    "asin_ebook", "asin_paperback", "asin_hardcover",
    "keywords",
    "html_description", "backpage_description", "backpage_author_bio",
    "cover_image", "custom_css",
})

#: Meta-overrides that don't map to Book columns. Handlers consume
#: these before delegating the rest to :func:`apply_book_overrides`.
#: ``primary_cover`` names a cover filename to promote to
#: book.cover_image when multiple covers exist.
META_OVERRIDE_KEYS: frozenset[str] = frozenset({
    "primary_cover",
})

#: Fields that must be non-empty strings. The wizard's UI enforces
#: this on the client side; the server rejects bad payloads too so
#: a buggy or hostile client cannot bypass the check.
MANDATORY_FIELDS: frozenset[str] = frozenset({"title", "author"})


class MandatoryFieldMissing(ValueError):
    """A required field was deselected or blanked in the overrides."""

    def __init__(self, field: str) -> None:
        self.field = field
        super().__init__(f"{field} is required and cannot be empty")


def validate_overrides(
    overrides: dict[str, Any], *, detected: dict[str, Any] | None = None
) -> None:
    """Reject unknown keys and empty mandatory fields.

    ``detected`` is the fallback source; if the user did not edit a
    mandatory field the overrides dict may not carry it, in which
    case we accept the detected value. Pass ``None`` for
    ``detected`` to require the overrides to carry title + author
    itself.
    """
    allowed = BOOK_IMPORT_OVERRIDE_KEYS | META_OVERRIDE_KEYS
    unknown = set(overrides) - allowed
    if unknown:
        raise KeyError(
            f"Overrides not allowed for Book import: {sorted(unknown)}"
        )
    for field in MANDATORY_FIELDS:
        # Explicit null or blank string -> reject.
        if field in overrides:
            value = overrides[field]
            if value is None or (isinstance(value, str) and not value.strip()):
                raise MandatoryFieldMissing(field)
            continue
        # Field not in overrides: fall back to detected.
        if detected is None:
            raise MandatoryFieldMissing(field)
        fallback = detected.get(field)
        if fallback is None or (
            isinstance(fallback, str) and not fallback.strip()
        ):
            raise MandatoryFieldMissing(field)


def apply_book_overrides(
    session: Session, book_id: str, overrides: dict[str, Any]
) -> None:
    """Apply a flat overrides dict to the book row.

    Null values are skipped (the user deselected the field; keep
    whatever the handler already wrote). Unknown keys raise.
    Keywords are re-serialized to JSON because the column stores a
    JSON-encoded list; the wizard sends a real list.

    Mandatory-field validation is the ROUTER's job (so a bad
    payload never reaches the handler). The handler runs on the
    assumption that overrides have already been validated against
    the detected project.
    """
    if not overrides:
        return
    allowed = BOOK_IMPORT_OVERRIDE_KEYS | META_OVERRIDE_KEYS
    unknown = set(overrides) - allowed
    if unknown:
        raise KeyError(
            f"Overrides not allowed for Book import: {sorted(unknown)}"
        )
    book = session.query(Book).filter(Book.id == book_id).first()
    if book is None:
        return
    for key, value in overrides.items():
        if key in META_OVERRIDE_KEYS:
            # Meta overrides (primary_cover, ...) don't map to Book
            # columns; handlers consume them before calling here.
            continue
        if value is None:
            # User deselected; keep the handler's value / column default.
            continue
        if key == "keywords":
            if isinstance(value, list):
                value = json.dumps(value)
            elif not isinstance(value, str):
                value = json.dumps([str(value)])
        setattr(book, key, value)
