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

#: Book.book_type value the picture-book editor uses (see
#: backend/config/book-types.yaml, id "picture_book"). A picture-book
#: is a children's title by construction, so it is a stronger and
#: more common signal on the live catalog than BISAC (0/44 books on
#: the live library carry a BISAC code at all, per #828's audit).
_PICTURE_BOOK_TYPE = "picture_book"

#: Description columns, in the order ``build_book_context`` prefers them
#: when picking the ONE it feeds to the prompt. The genre heuristic
#: scans all three instead of only the winner (#839).
_DESCRIPTION_FIELDS = ("description", "html_description", "backpage_description")

#: Last-resort text signal, checked in the title, the subtitle and ALL
#: description fields when neither `genre`, `book_type`, nor a JUV BISAC
#: code fired.
#:
#: This is a fallback for a NEW book whose `genre` nobody has filled in
#: yet - it is NOT a safety net. It reads free text an author is free to
#: reword at any time, so a book that depends on it can silently stop
#: being recognised. The reliable tier is `Book.genre`; #854 filled it
#: for the nine children's books in the catalog precisely so the
#: escalation no longer rests on this.
#:
#: Phrases are taken from the real catalog text (#839), not guessed, and
#: each must be specific enough to avoid false positives: bare "kids",
#: "child" or "niños" is too broad, a compound noun phrase is not.
_JUVENILE_TEXT_MARKERS: dict[str, tuple[str, ...]] = {
    "de": (
        "kinderbuch",
        "bilderbuch",
        "für kinder",
        "fuer kinder",
        "zum vorlesen",
    ),
    "en": (
        "children's book",
        "childrens book",
        "picture book",
        "for kids",
        "for children",
    ),
    "fr": (
        "livre pour enfants",
        "livres pour enfants",
        "album jeunesse",
        "livre jeunesse",
        "pour enfants",
        "album illustré",
    ),
    "es": (
        "libro infantil",
        "libros infantiles",
        "cuentos infantiles",
        "cuento infantil",
        "álbum ilustrado",
        "album ilustrado",
        "libro ilustrado",
        "para niños",
        "para ninos",
    ),
}


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


def _looks_like_juvenile_text(*texts: str | None) -> bool:
    """Scan title/subtitle/description for a children's-book marker
    phrase, in any of the supported languages (not just the book's
    own - a German "Kinderbuch" mention in an otherwise-undetected
    book is worth catching regardless of `book.language`)."""
    combined = " ".join(t for t in texts if t).lower()
    if not combined:
        return False
    return any(
        marker in combined for markers in _JUVENILE_TEXT_MARKERS.values() for marker in markers
    )


def _resolve_genre_key(book: Any, bisac_codes: list[str]) -> str | None:
    """Resolve a genre/style key with a fallback chain.

    Order: explicit ``genre`` field > ``book_type == "picture_book"`` >
    a JUV-prefixed BISAC code > a children's-book phrase in the text.

    Only the first tier is reliable. The rest exist because ``genre``
    was empty on all 44 catalog books and BISAC on 0 of them (#828);
    #854 has since filled ``genre`` for the nine children's books, so
    for those the chain stops at the first tier and never reaches the
    text heuristic.

    The text tier reads ALL description fields, not just the one
    ``build_book_context`` resolves for the prompt. That resolution
    takes the FIRST non-empty of description / html_description /
    backpage_description, and scanning only it missed "Das lachende
    Pferd", whose sole marker ("Bilderbuch") sits in
    ``backpage_description`` while ``html_description`` wins the
    resolution (#839).
    """
    genre = getattr(book, "genre", None)
    if genre and genre.strip():
        return genre.strip().lower()
    if getattr(book, "book_type", None) == _PICTURE_BOOK_TYPE:
        return _JUVENILE_GENRE_KEY
    if any(code.upper().startswith(_JUVENILE_BISAC_PREFIX) for code in bisac_codes):
        return _JUVENILE_GENRE_KEY
    if _looks_like_juvenile_text(
        getattr(book, "title", None),
        getattr(book, "subtitle", None),
        *(_to_plain_text(getattr(book, attr, None)) for attr in _DESCRIPTION_FIELDS),
    ):
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
    description_text = _first_non_empty(
        *(getattr(book, attr, None) for attr in _DESCRIPTION_FIELDS)
    )
    return BookContext(
        book_id=book.id,
        title=book.title,
        subtitle=getattr(book, "subtitle", None),
        author=getattr(book, "author", None),
        language=getattr(book, "language", "en") or "en",
        description_text=description_text,
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
