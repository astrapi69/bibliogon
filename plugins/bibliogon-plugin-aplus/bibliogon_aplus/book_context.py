"""Book-to-AI-prompt context assembly for A+ Content (#825).

``book`` is duck-typed (any object with the listed attributes) so
this module stays free of a direct SQLAlchemy import - the same
convention as ``app.ai.template_factories``. ``build_book_context``
lazily imports ``app.services.html_text`` (#820's shared module) for
HTML-safe description extraction, so importing this module - or
building a :class:`BookContext` by hand, as the prompt-builder tests
do - never requires ``app`` to be installed; only actually resolving
HTML-shaped source text does. That is also why the tests that DO feed
HTML content through ``build_book_context`` live in backend/tests/
rather than this plugin's isolated venv.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from bibliogon_aplus.schema import MissingFieldFinding

#: BISAC subject codes beginning with this prefix mark a juvenile /
#: children's title. Used as a fallback genre signal when the free-text
#: `genre` field (in practice unpopulated on the live library) is empty.
_JUVENILE_BISAC_PREFIX = "JUV"
_JUVENILE_GENRE_KEY = "kinderbuch"


@dataclass(frozen=True)
class BookContext:
    """Everything the A+ generator needs from a Book row, already
    normalised to plain text and decoded lists."""

    book_id: str
    title: str
    subtitle: str | None
    author: str | None
    language: str
    description_text: str
    genre_key: str | None
    bisac_codes: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)


def _looks_like_html(text: str) -> bool:
    return "<" in text and ">" in text


def _to_plain_text(raw: str | None) -> str:
    if not raw:
        return ""
    if _looks_like_html(raw):
        from app.services.html_text import html_to_plain_text

        return html_to_plain_text(raw)
    return raw.strip()


def _first_non_empty(*values: str | None) -> str:
    for value in values:
        plain = _to_plain_text(value)
        if plain:
            return plain
    return ""


def _decode_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return decoded if isinstance(decoded, list) else []


def _resolve_genre_key(book: Any, bisac_codes: list[str]) -> str | None:
    genre = getattr(book, "genre", None)
    if genre and genre.strip():
        return genre.strip().lower()
    if any(code.upper().startswith(_JUVENILE_BISAC_PREFIX) for code in bisac_codes):
        return _JUVENILE_GENRE_KEY
    return None


def build_book_context(book: Any) -> BookContext:
    """Assemble a :class:`BookContext` from a Book-shaped object.

    Description text is taken from ``description``, then
    ``html_description``, then ``backpage_description`` - the first
    non-empty one, HTML-stripped when the value looks like markup.

    Args:
        book: A Book ORM row, or any object with the same attribute
            names (used by tests).

    Returns:
        The normalised context.
    """
    bisac_codes = _decode_json_list(getattr(book, "bisac_codes", None))
    return BookContext(
        book_id=book.id,
        title=book.title,
        subtitle=getattr(book, "subtitle", None),
        author=getattr(book, "author", None),
        language=getattr(book, "language", "en") or "en",
        description_text=_first_non_empty(
            getattr(book, "description", None),
            getattr(book, "html_description", None),
            getattr(book, "backpage_description", None),
        ),
        genre_key=_resolve_genre_key(book, bisac_codes),
        bisac_codes=bisac_codes,
        categories=_decode_json_list(getattr(book, "categories", None)),
        keywords=_decode_json_list(getattr(book, "keywords", None)),
    )


def find_missing_fields(book: Any) -> list[MissingFieldFinding]:
    """Required-for-generation fields that are empty on ``book``.

    Returns an empty list when generation can proceed. Callers use a
    non-empty result to short-circuit before ever calling the AI -
    the UI can then prompt for exactly these fields.
    """
    missing: list[MissingFieldFinding] = []

    author = getattr(book, "author", None)
    if not author or not author.strip():
        missing.append(
            MissingFieldFinding(
                field="author", reason="An author name is required to generate A+ Content."
            )
        )

    has_description = any(
        _to_plain_text(getattr(book, attr, None))
        for attr in ("description", "html_description", "backpage_description")
    )
    if not has_description:
        missing.append(
            MissingFieldFinding(
                field="description",
                reason=(
                    "At least one description field (Description, Amazon Description, "
                    "or Backpage Description) is required as source material."
                ),
            )
        )

    return missing
