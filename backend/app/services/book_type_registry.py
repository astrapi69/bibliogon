"""BookTypeRegistry — single source of truth for book_type metadata.

Reads ``backend/config/book-types.yaml`` once at startup and exposes:

- :func:`load_book_types` — full {id: BookTypeDef} mapping
- :func:`get_book_type` — lookup by id
- :func:`book_type_ids` — set of valid ids
- :func:`pageable_book_types` — ids whose content_model == "pages"
- :func:`book_types_with_capability` — ids where a named capability
  flag is True

Cached via ``@lru_cache(maxsize=1)``. Tests that monkeypatch the
YAML path MUST register a yield-based autouse fixture clearing the
cache in BOTH setup AND teardown (per the "Module-level caches
survive test boundaries" lessons-learned rule).

Filed by BOOK-TYPES-SSOT-YAML-01 (2026-05-24).
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "book-types.yaml"


class BookTypeCapabilities(BaseModel):
    """Per-type capability flags. Negative-default semantics: any
    unspecified capability is False. New book types must opt-in
    explicitly — safe-by-default."""

    model_config = ConfigDict(extra="forbid")

    ebook_export: bool = False
    paperback_export: bool = False
    hardcover_export: bool = False
    audiobook_export: bool = False
    template_catalog: bool = False
    kdp_package_supported: bool = False


class BookTypeDef(BaseModel):
    """One book-type entry from the YAML registry."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label_key: str
    description_key: str
    # i18n key for the per-type create label (Dashboard SplitButton
    # primary button) / default new-document title. ``None`` (key
    # omitted) falls back to the generic ``ui.dashboard.new_book``.
    # Mirrors ContentTypeDef.default_title_key.
    default_title_key: str | None = None
    icon: str
    content_model: str  # "chapters" | "pages"
    editor_component: str
    capabilities: BookTypeCapabilities
    dashboard_create_visible: bool = True
    immutable_after_create: bool = True
    default_page_size: str | None = None


@lru_cache(maxsize=1)
def load_book_types() -> dict[str, BookTypeDef]:
    """Return the full {id: BookTypeDef} mapping.

    Cached for the lifetime of the process. Tests that need a fresh
    read MUST call ``load_book_types.cache_clear()`` in both setup
    and teardown of any fixture that fakes the registry.
    """
    if not _REGISTRY_PATH.is_file():
        logger.warning("Book-types registry file not found at %s", _REGISTRY_PATH)
        return {}
    with _REGISTRY_PATH.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        logger.warning("book-types YAML root is not a mapping")
        return {}
    entries = raw.get("book_types") or []
    if not isinstance(entries, list):
        logger.warning("book-types 'book_types' key must be a list")
        return {}
    result: dict[str, BookTypeDef] = {}
    for entry in entries:
        try:
            parsed = BookTypeDef.model_validate(entry)
        except Exception as exc:  # noqa: BLE001 — log + skip on
            #  malformed entry; loud warning instead of import-time
            #  crash so the app still boots.
            logger.error(
                "Skipping malformed book-type entry: %s (error: %s)",
                entry,
                exc,
            )
            continue
        result[parsed.id] = parsed
    return result


def get_book_type(type_id: str) -> BookTypeDef | None:
    """Return one book-type's definition, or None if unknown."""
    return load_book_types().get(type_id)


def book_type_ids() -> frozenset[str]:
    """Return the set of valid book-type ids."""
    return frozenset(load_book_types().keys())


def pageable_book_types() -> frozenset[str]:
    """Return ids of book types whose content_model is 'pages'.

    Replaces the hardcoded ``PAGEABLE_BOOK_TYPES`` in
    ``backend/app/routers/pages.py``.
    """
    return frozenset(t.id for t in load_book_types().values() if t.content_model == "pages")


def book_types_with_capability(capability: str) -> frozenset[str]:
    """Return ids of book types whose named capability flag is True.

    Example: ``book_types_with_capability("ebook_export")`` returns
    every id whose ``capabilities.ebook_export`` is True.
    """
    result: list[str] = []
    for bt in load_book_types().values():
        if getattr(bt.capabilities, capability, False):
            result.append(bt.id)
    return frozenset(result)


def immutable_book_field_ids() -> frozenset[str]:
    """Return ids of book types where ``immutable_after_create`` is
    True. Used by the books PATCH handler to gate the
    ``book_type`` field rejection."""
    return frozenset(t.id for t in load_book_types().values() if t.immutable_after_create)
