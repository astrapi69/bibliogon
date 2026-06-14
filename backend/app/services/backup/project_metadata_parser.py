"""Metadata parsing and Book construction for project imports.

Split out of ``project_import`` (God-file split #1, 2026-06-14). Converts a
write-book-template ``metadata.yaml`` into a typed :class:`ProjectMetadata`
and builds a :class:`~app.models.Book` ORM row from it. One concern: turning
on-disk project metadata into a persistable Book. Chapter and asset import
live in their own sibling modules.
"""

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
        title=metadata.get("title", project_root.name),
        subtitle=metadata.get("subtitle"),
        author=metadata.get("author", "Unknown"),
        language=_normalize_language(metadata.get("lang", metadata.get("language", "de"))),
        series_name=series_name,
        series_index=series_idx,
        description=metadata.get("description"),
        edition=metadata.get("edition"),
        publisher=metadata.get("publisher"),
        publisher_city=metadata.get("publisher_city"),
        publish_date=metadata.get("date"),
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
            metadata.get("cover-image") or metadata.get("cover_image") or metadata.get("cover")
        ),
        custom_css=_read_custom_css(config_dir, project_root),
    )


def _normalize_language(lang: Any) -> str:
    """``en-US`` -> ``en``; pass-through for already short codes."""
    s = str(lang)
    return s.split("-")[0] if "-" in s else s


def _parse_series(metadata: dict[str, Any]) -> tuple[str | None, int | None]:
    series_raw = metadata.get("series")
    if isinstance(series_raw, dict):
        return series_raw.get("title"), series_raw.get("volume")
    if isinstance(series_raw, str):
        return series_raw, metadata.get("series_index")
    return None, None


def _parse_isbn(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Supports both ``isbn.{ebook,paperback,hardcover}`` and ``identifiers.isbn_*``."""
    isbn_raw = metadata.get("isbn", {})
    identifiers = metadata.get("identifiers", {})

    def pick(key: str, fallback_key: str) -> str | None:
        primary = isbn_raw.get(key) if isinstance(isbn_raw, dict) else None
        return primary or identifiers.get(fallback_key) or None

    return (
        pick("ebook", "isbn_ebook"),
        pick("paperback", "isbn_paperback"),
        pick("hardcover", "isbn_hardcover"),
    )


def _parse_asin(metadata: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    asin_raw = metadata.get("asin", {})
    if not isinstance(asin_raw, dict):
        return None, None, None
    return asin_raw.get("ebook"), asin_raw.get("paperback"), asin_raw.get("hardcover")


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
