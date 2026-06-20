"""Get Started guide content and sample book creation."""

from typing import Any

# BOOK-TYPES-SSOT-YAML-01 C8: lazy-import the registry inside the
# helper below. Plugin's standalone pytest path (poetry venv
# without the backend installed) can't resolve ``from app.*``
# at module import — by deferring until call time, the import
# succeeds when the backend IS available (production + the
# combined ``make test`` path) and the plugin's standalone tests
# fall back via ImportError (see ``_FALLBACK_BOOK_TYPES``).
_FALLBACK_BOOK_TYPES: frozenset[str] = frozenset(
    {"prose", "picture_book", "comic_book"}
)


def _supported_book_types() -> frozenset[str]:
    """Return the set of supported book_type ids.

    Prefers the BookTypeRegistry (single source of truth — adding a
    new book_type to backend/config/book-types.yaml automatically
    makes it valid here, no separate sync needed). Falls back to
    a frozen tuple of the 3 currently-known ids when the backend
    isn't importable (plugin's standalone tests).
    """
    try:
        from app.services.registries.book_type_registry import book_type_ids
    except ImportError:
        return _FALLBACK_BOOK_TYPES
    ids = book_type_ids()
    # Empty registry (YAML missing / malformed) → safe fallback.
    return ids if ids else _FALLBACK_BOOK_TYPES


def get_guide_steps(config: dict[str, Any], lang: str = "de") -> list[dict[str, str]]:
    """Get onboarding steps localized."""
    steps = config.get("guide", {}).get("steps", [])
    return [
        {
            "id": step["id"],
            "title": _localize(step.get("title", ""), lang),
            "description": _localize(step.get("description", ""), lang),
            "icon": step.get("icon", "circle"),
        }
        for step in steps
    ]


def get_sample_book_data(
    config: dict[str, Any],
    lang: str = "de",
    book_type: str = "prose",
) -> dict[str, Any]:
    """Get sample book data for creation, localized.

    Returns a dict shaped by book_type:
      - prose:    {title, author, language, book_type, description, chapters: [...]}
      - picture_book / comic_book:
                  {title, author, language, book_type, description, pages: [...]}

    Lookup order:
      1. New ``sample_books[book_type]`` dict entry (canonical)
      2. Legacy singular ``sample_book`` (backward-compat with
         pre-MULTIBOOK-TYPES configs + user-overlays)
      3. Empty defaults (title "My First Book", empty chapters / pages)
    """
    if book_type not in _supported_book_types():
        book_type = "prose"

    sample = _resolve_sample(config, book_type)
    return _localize_sample(sample, lang, book_type)


def _resolve_sample(config: dict[str, Any], book_type: str) -> dict[str, Any]:
    """Pick the sample-book dict for the requested book_type.

    Reads from the new ``sample_books:`` dict first; falls back to
    the legacy ``sample_book:`` singular for backward-compat. Returns
    an empty dict when nothing matches (the localiser then fills
    sensible defaults).
    """
    sample_books = config.get("sample_books", {})
    if isinstance(sample_books, dict) and book_type in sample_books:
        return sample_books[book_type]
    # Legacy: pre-MULTIBOOK-TYPES configs only carry "sample_book"
    # (singular) with prose content. Honor it only when the caller
    # asked for prose; picture/comic-book without a sample_books entry
    # falls through to empty defaults.
    if book_type == "prose":
        legacy = config.get("sample_book", {})
        if isinstance(legacy, dict):
            return legacy
    return {}


def _localize_sample(
    sample: dict[str, Any],
    lang: str,
    book_type: str,
) -> dict[str, Any]:
    """Localize a sample-book dict into its API-response shape."""
    out: dict[str, Any] = {
        "title": _localize(sample.get("title", "My First Book"), lang),
        "author": sample.get("author", "Bibliogon"),
        "language": sample.get("language", lang),
        "book_type": sample.get("book_type", book_type),
        "description": _localize(sample.get("description", ""), lang),
    }
    if book_type == "prose":
        out["chapters"] = [
            {
                "title": _localize(ch.get("title", ""), lang),
                "content": _localize(ch.get("content", ""), lang),
            }
            for ch in sample.get("chapters", [])
        ]
    else:
        out["pages"] = [
            _localize_page(page, lang)
            for page in sample.get("pages", [])
        ]
    return out


def _localize_page(page: dict[str, Any], lang: str) -> dict[str, Any]:
    """Localize a single page entry.

    Pages carry a ``layout`` (string, not localized), optional
    ``text_content`` (localized dict), optional ``layout_config``
    (dict passed through verbatim), and optional ``image_asset_id``
    (passed through; samples ship null so the frontend can leave it
    unset).
    """
    out: dict[str, Any] = {
        "layout": page.get("layout", "image_top_text_bottom"),
    }
    if "text_content" in page:
        out["text_content"] = _localize(page["text_content"], lang)
    if "layout_config" in page:
        out["layout_config"] = page["layout_config"]
    if "image_asset_id" in page:
        out["image_asset_id"] = page["image_asset_id"]
    return out


def _localize(value: Any, lang: str) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get(lang, value.get("en", value.get("de", "")))
    return str(value)
