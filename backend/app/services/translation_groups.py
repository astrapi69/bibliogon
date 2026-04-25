"""PGS-04 translation-group linking primitives.

Books imported from different language branches of the same git
repository - or manually grouped by the user - share a
``Book.translation_group_id``. The group is flat: no master, no
hierarchy. Every member of the group references the same UUID.

This module owns the small DB-state machine for that link:
- :func:`derive_language` - branch-name-driven language detection
  per the PGS-04 spec ("main-XX -> XX", bare "main" -> caller-
  supplied metadata language).
- :func:`link_books` - assign a shared group id to every book in
  ``book_ids``. If any of them already have a group id, the new
  members fold into the existing one (transitive merge).
- :func:`unlink_book` - remove a single book from its group. If
  the group ends up with one member after the removal, that
  member is also unlinked (a "group of one" is meaningless).
- :func:`list_siblings` - return ``[(language, book_id, title)]``
  for the other books in the same group.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Book

logger = logging.getLogger(__name__)


# ``main-XX`` (e.g. ``main-de``) carries language=XX in the suffix.
# Two-letter ISO 639-1 only; richer locale tags ("de-AT") are
# rejected so the suffix stays unambiguous.
_BRANCH_LANG_RE = re.compile(r"^main-([a-z]{2})$", re.IGNORECASE)


@dataclass(frozen=True)
class Sibling:
    book_id: str
    title: str
    language: str


# --- branch-driven language detection ---


def derive_language(branch: str, metadata_language: str | None) -> str | None:
    """Resolve the language for an imported branch.

    Rules per PGS-04 spec:
    - ``main-XX`` -> ``XX`` (lowercased), regardless of metadata.
    - bare ``main`` -> ``metadata_language`` (the import's
      ``metadata.yaml.language`` field).
    - anything else -> ``metadata_language`` as a best-effort
      fallback. The caller's invariant "the user maintains
      metadata.yaml correctly" makes this safe.

    Returns ``None`` only when neither path produces a language;
    callers that require a non-null language should validate
    upstream.
    """
    if not branch:
        return metadata_language
    match = _BRANCH_LANG_RE.match(branch.strip())
    if match:
        return match.group(1).lower()
    return metadata_language


# --- linking ---


def link_books(db: Session, *, book_ids: list[str]) -> str | None:
    """Assign a shared ``translation_group_id`` to every book in
    ``book_ids``.

    Behaviour:
    - With fewer than 2 ids: no-op, returns ``None`` (a group of
      one is not a group).
    - When none of the books are currently grouped: a fresh UUID
      is generated and assigned to all of them.
    - When some books already share a group id: the rest fold into
      the existing group. If multiple existing groups would be
      merged, the lexicographically-smallest existing id wins so
      the merge is deterministic across replays.
    - Books not found in the DB are silently skipped (the caller
      decides whether to validate up front).

    Returns the chosen group id (or ``None`` for a no-op).
    """
    rows = db.query(Book).filter(Book.id.in_(book_ids)).all()
    if len(rows) < 2:
        return None

    existing_ids = sorted({b.translation_group_id for b in rows if b.translation_group_id})
    group_id = existing_ids[0] if existing_ids else uuid.uuid4().hex
    for book in rows:
        book.translation_group_id = group_id
        db.add(book)
    db.commit()
    return group_id


def unlink_book(db: Session, *, book_id: str) -> None:
    """Remove ``book_id`` from its translation group.

    If the group ends up with a single remaining member after the
    removal, that member is also cleared. A "group of one" carries
    no information and would clutter the metadata-editor UI with
    an empty siblings row.
    """
    book = db.get(Book, book_id)
    if book is None or not book.translation_group_id:
        return
    group_id = book.translation_group_id
    book.translation_group_id = None
    db.add(book)
    db.flush()

    remaining = (
        db.query(Book).filter(Book.translation_group_id == group_id).all()
    )
    if len(remaining) == 1:
        # The lone survivor isn't part of a translation pair anymore.
        remaining[0].translation_group_id = None
        db.add(remaining[0])
    db.commit()


def list_siblings(db: Session, *, book_id: str) -> list[Sibling]:
    """Return the OTHER books in the group as ``Sibling`` rows.

    The querying book itself is excluded. Result order is by
    language code (alphabetical), so the metadata editor renders
    a stable badge sequence ("DE / EN / ES / FR ...") regardless
    of insertion order.
    """
    book = db.get(Book, book_id)
    if book is None or not book.translation_group_id:
        return []
    rows = (
        db.query(Book)
        .filter(
            Book.translation_group_id == book.translation_group_id,
            Book.id != book_id,
            Book.deleted_at.is_(None),
        )
        .all()
    )
    siblings = [
        Sibling(
            book_id=row.id,
            title=row.title,
            language=(row.language or ""),
        )
        for row in rows
    ]
    siblings.sort(key=lambda s: (s.language or "~", s.title))
    return siblings
