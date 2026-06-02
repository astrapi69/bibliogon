"""ORM <-> dict serialization for backup files.

Used by both ``backup_export`` (writing) and ``backup_import``
(reading). Books were the original payload (manifest version 1.0);
articles + publications + article-assets joined in version 2.0;
version 3.0 (BACKUP-COMPLETENESS-01) carries every per-book and
per-article child model + the global content (authors + templates)
so a backup -> restore cycle preserves the entire database.

The heavy lifting is done by two generic, introspection-driven
helpers - :func:`serialize_row` and :func:`restore_row` - so a new
column on any model is captured automatically and can never silently
drop out of the backup the way the hand-maintained field lists did
before v3.0.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import class_mapper

from app.models import Article, ArticleAsset, Book, Publication


def serialize_row(obj: Any, *, exclude: frozenset[str] = frozenset()) -> dict[str, Any]:
    """Serialize EVERY mapped column of an ORM row to a JSON-safe dict.

    ``date`` / ``datetime`` values become ISO strings; everything else
    (str, int, bool, None, and JSON columns which are already dict/list)
    passes through. ``exclude`` drops named columns from the output.
    """
    out: dict[str, Any] = {}
    for attr in sa_inspect(obj).mapper.column_attrs:
        if attr.key in exclude:
            continue
        value = getattr(obj, attr.key)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        out[attr.key] = value
    return out


def _coerce(raw: Any, column_type: Any) -> Any:
    """Coerce a JSON value back to the Python type the column expects.

    Only date/datetime need work (they were serialized to ISO strings);
    everything else round-trips through JSON unchanged.
    """
    if raw is None or not isinstance(raw, str):
        return raw
    if isinstance(column_type, DateTime):
        return datetime.fromisoformat(raw)
    if isinstance(column_type, Date):
        return date.fromisoformat(raw)
    return raw


def restore_row[M](
    model_cls: type[M],
    data: dict[str, Any],
    *,
    overrides: dict[str, Any] | None = None,
) -> M:
    """Rebuild an ORM object from a backup dict, column by column.

    Reads only keys that correspond to real columns (extra keys in the
    dict - e.g. legacy ``chapters``/``assets`` arrays embedded in old
    ``book.json`` - are ignored). Absent keys fall back to the model's
    own default. ``overrides`` force specific columns (used to re-point
    a child FK at the parent id we just re-inserted).
    """
    overrides = overrides or {}
    kwargs: dict[str, Any] = {}
    for attr in class_mapper(model_cls).column_attrs:
        key = attr.key
        if key in overrides:
            kwargs[key] = overrides[key]
        elif key in data:
            kwargs[key] = _coerce(data[key], attr.columns[0].type)
    return model_cls(**kwargs)


# --- Book ------------------------------------------------------------------


def serialize_book_for_backup(book: Book) -> dict[str, Any]:
    """Serialize a Book ORM object (every column) for backup/export."""
    return serialize_row(book)


def restore_book_from_data(book_data: dict[str, Any]) -> Book:
    """Create a Book ORM object from backup data dict (every column)."""
    return restore_row(Book, book_data)


# --- Article ---------------------------------------------------------------


def serialize_article_for_backup(article: Article) -> dict[str, Any]:
    """Serialize an Article ORM object (every column) for backup/export.

    Includes ``deleted_at`` so trashed articles round-trip with their
    soft-delete status; mirrors the books-side behaviour.
    """
    return serialize_row(article)


def restore_article_from_data(article_data: dict[str, Any]) -> Article:
    """Create an Article ORM object from backup data dict.

    ARTICLE-TYPES-SSOT-01: legacy .bgb backups (pre-2026-05-29) carry
    ``content_type == "article"`` as the universal default; rewrite to
    ``"blogpost"`` so the restored row matches the new registry shape
    (same backfill as the ``u0e1f2345678`` migration).
    """
    if article_data.get("content_type") == "article":
        article_data = {**article_data, "content_type": "blogpost"}
    return restore_row(Article, article_data)


# --- Publication -----------------------------------------------------------


def serialize_publication_for_backup(pub: Publication) -> dict[str, Any]:
    """Serialize a Publication ORM object (every column) for backup."""
    return serialize_row(pub)


def restore_publication_from_data(pub_data: dict[str, Any]) -> Publication:
    """Create a Publication ORM object from backup data dict."""
    return restore_row(Publication, pub_data)


# --- ArticleAsset ----------------------------------------------------------


def serialize_article_asset_for_backup(asset: ArticleAsset) -> dict[str, Any]:
    """Serialize an ArticleAsset ORM object (every column) for backup.

    The ``path`` is exported for debugging parity with the books-side
    ``Asset`` shape; restore regenerates it into the canonical uploads
    layout but preserves the row id + every other field.
    """
    return serialize_row(asset)
