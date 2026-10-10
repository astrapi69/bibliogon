"""Metadata parsing and Book construction for project imports.

Split out of ``project_import`` (God-file split #1, 2026-06-14). Converts a
write-book-template ``metadata.yaml`` into a typed :class:`ProjectMetadata`
and builds a :class:`~app.models.Book` ORM row from it. One concern: turning
on-disk project metadata into a persistable Book. Chapter and asset import
live in their own sibling modules.
"""

import datetime
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.models import Book
from app.services.backup.markdown_utils import read_file_if_exists
from app.services.backup.project_stylesheet_loader import _read_custom_css


@dataclass
class ProjectMetadata:
    """All fields needed to construct a Book from a write-book-template project."""

    title: str
    subtitle: str | None = None
    author: str = "Unknown"
    language: str = "de"
    series_name: str | None = None
    series_index: int | None = None
    description: str | None = None
    edition: str | None = None
    publisher: str | None = None
    publisher_city: str | None = None
    publish_date: str | None = None
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    isbn_hardcover: str | None = None
    asin_ebook: str | None = None
    asin_paperback: str | None = None
    asin_hardcover: str | None = None
    keywords: str | None = None
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None
    cover_image: str | None = None
    custom_css: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)


def _scalar(value: Any) -> str | None:
    """One YAML scalar as a string, or None when there is nothing in it.

    YAML types what it reads: ``date: 2026-03-01`` is a
    ``datetime.date``, ``edition: 2`` is an ``int``, and an unquoted
    13-digit ISBN is an ``int`` too. Every field below is declared
    ``str | None`` on ``ProjectMetadata`` and on ``DetectedProject``,
    so an untyped pass-through made the detect endpoint answer HTTP 500
    for a project whose metadata.yaml carried a publication date -
    which is the natural way to write one and the shape Pandoc metadata
    uses (#1091).

    A date renders in ISO form, which is what the user wrote and what
    the metadata round-trips back to. ``str()`` would agree for a date
    and disagree for a datetime, which it renders with a space where
    ISO wants a T.

    None and whitespace-only collapse to None rather than to the string
    "None" - the same trap #1086 closed in the A+ generator, in a
    second file.

    A container is not a scalar, so a list or a mapping where one of
    these fields belongs collapses to None rather than to its Python
    repr (#1103). Without that, ``title: [a, b]`` imported a book whose
    title was the literal ``['a', 'b']`` - visible on the dashboard, in
    the editor header and in every export, which is quieter than the
    500 #1091 produced and therefore worse. The readers that WANT a
    container (``series``, ``isbn``, ``asin``, ``identifiers``,
    ``keywords``, ``author``) index into it first and call this on the
    leaf, so they are unaffected.
    """
    if value is None:
        return None
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, (list, tuple, set, dict)):
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: Any) -> int | None:
    """One YAML scalar as an int, or None when it is not one.

    ``series_index`` is declared ``int | None``, so a volume written as
    a word ("volume: zwei") has to become None rather than break the
    response the way an untyped date did.
    """
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _read_metadata_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        # Project exports wrap metadata.yaml in Pandoc-style
        # `---` / `---` document markers, producing a stream of one
        # real document followed by an empty trailing document. Use
        # safe_load_all and pick the first non-empty document so both
        # shapes (bare + Pandoc-wrapped) work.
        for document in yaml.safe_load_all(f):
            if document:
                return document if isinstance(document, dict) else {}
    return {}


def _parse_project_metadata(metadata: dict[str, Any], project_root: Path) -> ProjectMetadata:
    """Convert a parsed metadata.yaml dict into a typed ProjectMetadata."""
    series_name, series_idx = _parse_series(metadata)
    isbn_ebook, isbn_pb, isbn_hc = _parse_isbn(metadata)
    asin_ebook, asin_pb, asin_hc = _parse_asin(metadata)

    config_dir = project_root / "config"
    return ProjectMetadata(
        # Every string field goes through `_scalar`, because YAML types
        # what it reads and these are all declared `str | None` (#1091).
        title=_scalar(metadata.get("title")) or project_root.name,
        subtitle=_scalar(metadata.get("subtitle")),
        author=_parse_author(metadata.get("author")),
        language=_normalize_language(metadata.get("lang", metadata.get("language", "de"))),
        series_name=series_name,
        series_index=series_idx,
        description=_scalar(metadata.get("description")),
        edition=_scalar(metadata.get("edition")),
        publisher=_scalar(metadata.get("publisher")),
        publisher_city=_scalar(metadata.get("publisher_city")),
        publish_date=_scalar(metadata.get("date")),
        isbn_ebook=isbn_ebook,
        isbn_paperback=isbn_pb,
        isbn_hardcover=isbn_hc,
        asin_ebook=asin_ebook,
        asin_paperback=asin_pb,
        asin_hardcover=asin_hc,
        keywords=_parse_keywords(metadata),
        html_description=read_file_if_exists(config_dir / "book-description.html"),
        # write-book-template renamed these sidecars from the legacy
        # ``cover-back-page-*`` form to ``backpage-*``. Try the current
        # convention first; fall back to the legacy form so older
        # exports still import cleanly. See GH#17.
        backpage_description=(
            read_file_if_exists(config_dir / "backpage-description.md")
            or read_file_if_exists(config_dir / "cover-back-page-description.md")
        ),
        backpage_author_bio=(
            read_file_if_exists(config_dir / "backpage-author-description.md")
            or read_file_if_exists(config_dir / "cover-back-page-author-introduction.md")
        ),
        # write-book-template / Pandoc ship this under the hyphenated
        # ``cover-image`` key; older Bibliogon exports and custom YAMLs
        # use the snake_case variant. Accept both plus a plain ``cover``
        # fallback so a metadata.yaml written by hand still lands a cover.
        cover_image=(
            _scalar(metadata.get("cover-image"))
            or _scalar(metadata.get("cover_image"))
            or _scalar(metadata.get("cover"))
        ),
        custom_css=_read_custom_css(config_dir, project_root),
    )


def _parse_author(author_raw: Any) -> str:
    """Normalize the metadata.yaml ``author`` field to one string (#761).

    Real-world shapes: a plain string, a Pandoc-style list of strings,
    or a list of mappings carrying ``name`` (+ role/affiliation). List
    entries join with ", "; unusable values fall back to "Unknown".
    """
    if isinstance(author_raw, str) and author_raw.strip():
        return author_raw.strip()
    if isinstance(author_raw, dict):
        author_raw = [author_raw]
    if isinstance(author_raw, list):
        names = []
        for entry in author_raw:
            if isinstance(entry, str) and entry.strip():
                names.append(entry.strip())
            elif isinstance(entry, dict):
                name = str(entry.get("name") or "").strip()
                if name:
                    names.append(name)
        if names:
            return ", ".join(names)
    return "Unknown"


def _normalize_language(lang: Any) -> str:
    """``en-US`` -> ``en``; pass-through for already short codes."""
    s = str(lang)
    return s.split("-")[0] if "-" in s else s


def _parse_series(metadata: dict[str, Any]) -> tuple[str | None, int | None]:
    series_raw = metadata.get("series")
    if isinstance(series_raw, dict):
        return _scalar(series_raw.get("title")), _optional_int(series_raw.get("volume"))
    if series_raw is not None and not isinstance(series_raw, (list, dict)):
        return _scalar(series_raw), _optional_int(metadata.get("series_index"))
    return None, None


def _parse_isbn(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Supports both ``isbn.{ebook,paperback,hardcover}`` and ``identifiers.isbn_*``."""
    isbn_raw = metadata.get("isbn", {})
    identifiers = metadata.get("identifiers", {})

    def pick(key: str, fallback_key: str) -> str | None:
        primary = isbn_raw.get(key) if isinstance(isbn_raw, dict) else None
        fallback = identifiers.get(fallback_key) if isinstance(identifiers, dict) else None
        return _scalar(primary) or _scalar(fallback)

    return (
        pick("ebook", "isbn_ebook"),
        pick("paperback", "isbn_paperback"),
        pick("hardcover", "isbn_hardcover"),
    )


def _parse_asin(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    asin_raw = metadata.get("asin", {})
    if not isinstance(asin_raw, dict):
        return None, None, None
    return (
        _scalar(asin_raw.get("ebook")),
        _scalar(asin_raw.get("paperback")),
        _scalar(asin_raw.get("hardcover")),
    )


def _parse_keywords(metadata: dict[str, Any]) -> str | None:
    keywords_raw = metadata.get("keywords", [])
    if isinstance(keywords_raw, list) and keywords_raw:
        return json.dumps(keywords_raw)
    return None


def _build_book(meta: ProjectMetadata) -> Book:
    return Book(
        title=meta.title,
        subtitle=meta.subtitle,
        author=meta.author,
        language=meta.language,
        series=meta.series_name,
        series_index=meta.series_index,
        description=meta.description,
        edition=meta.edition,
        publisher=meta.publisher,
        publisher_city=meta.publisher_city,
        publish_date=meta.publish_date,
        isbn_ebook=meta.isbn_ebook,
        isbn_paperback=meta.isbn_paperback,
        isbn_hardcover=meta.isbn_hardcover,
        asin_ebook=meta.asin_ebook,
        asin_paperback=meta.asin_paperback,
        asin_hardcover=meta.asin_hardcover,
        keywords=meta.keywords,
        html_description=meta.html_description,
        backpage_description=meta.backpage_description,
        backpage_author_bio=meta.backpage_author_bio,
        cover_image=meta.cover_image,
        custom_css=meta.custom_css,
    )
