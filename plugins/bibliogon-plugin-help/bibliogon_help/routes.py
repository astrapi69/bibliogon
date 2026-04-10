"""FastAPI routes for the help plugin.

Serves documentation from the ``docs/help/`` directory tree. Content is
authored as Markdown files organized by locale (``docs/help/de/``,
``docs/help/en/``). The navigation structure comes from ``docs/help/_meta.yaml``.

Three main endpoints:

- ``GET /help/navigation/{locale}`` - hierarchical nav tree
- ``GET /help/page/{locale}/{slug}`` - raw Markdown for a single page
- ``GET /help/search/{locale}?q=...`` - fulltext search with snippets

Legacy endpoints (shortcuts, faq, about) are preserved for backward
compatibility but will be removed once the frontend migrates to the
new help panel.
"""

import logging
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException

from .content import get_about, get_faq, get_shortcuts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/help", tags=["help"])

_config: dict[str, Any] = {}

# Resolve docs root relative to the plugin location.
# Layout: plugins/bibliogon-plugin-help/bibliogon_help/routes.py
#   -> 4 levels up -> bibliogon/ -> docs/help/
_PLUGIN_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _PLUGIN_DIR.parent.parent
DOCS_ROOT = _PROJECT_ROOT / "docs" / "help"


def set_config(config: dict[str, Any]) -> None:
    global _config
    _config = config


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_meta() -> dict[str, Any]:
    """Load and parse ``_meta.yaml``. Cached per-call (file is tiny)."""
    meta_path = DOCS_ROOT / "_meta.yaml"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Help navigation not configured (_meta.yaml missing)")
    return yaml.safe_load(meta_path.read_text(encoding="utf-8")) or {}


def _default_locale(meta: dict[str, Any]) -> str:
    """Return the code of the default language from ``_meta.yaml``."""
    for lang in meta.get("languages", []):
        if lang.get("default"):
            return lang["code"]
    return "de"


def _available_locales(meta: dict[str, Any]) -> set[str]:
    return {lang["code"] for lang in meta.get("languages", [])}


def _resolve_locale(locale: str, meta: dict[str, Any]) -> str:
    """Return ``locale`` if available, else the default."""
    if locale in _available_locales(meta):
        return locale
    return _default_locale(meta)


def _resolve_nav(items: list[dict[str, Any]], locale: str) -> list[dict[str, Any]]:
    """Flatten the multi-lingual nav tree into single-locale dicts."""
    result = []
    for item in items:
        title_map = item.get("title", {})
        title = title_map.get(locale, title_map.get("de", title_map.get("en", "")))
        entry: dict[str, Any] = {
            "title": title,
            "slug": item.get("slug", ""),
            "icon": item.get("icon", ""),
        }
        children = item.get("children")
        if children:
            entry["children"] = _resolve_nav(children, locale)
        result.append(entry)
    return result


def _validate_slug(slug: str) -> None:
    """Reject path-traversal attempts."""
    if ".." in slug or slug.startswith("/") or "\\" in slug:
        raise HTTPException(status_code=400, detail="Invalid slug")


# ---------------------------------------------------------------------------
# New docs-based endpoints
# ---------------------------------------------------------------------------

@router.get("/navigation/{locale}")
def get_navigation(locale: str) -> list[dict[str, Any]]:
    """Return the hierarchical navigation tree for a locale."""
    meta = _load_meta()
    resolved = _resolve_locale(locale, meta)
    return _resolve_nav(meta.get("navigation", []), resolved)


@router.get("/page/{locale}/{slug:path}")
def get_page(locale: str, slug: str) -> dict[str, Any]:
    """Return raw Markdown content for a documentation page.

    Falls back to the default locale if the requested translation
    does not exist yet.
    """
    _validate_slug(slug)
    meta = _load_meta()
    resolved_locale = _resolve_locale(locale, meta)

    actual_locale = resolved_locale
    page_path = DOCS_ROOT / actual_locale / f"{slug}.md"

    # Fallback to default locale
    if not page_path.exists():
        fallback = _default_locale(meta)
        if fallback != actual_locale:
            page_path = DOCS_ROOT / fallback / f"{slug}.md"
            actual_locale = fallback

    if not page_path.exists():
        raise HTTPException(status_code=404, detail=f"Page not found: {slug}")

    # Verify the resolved path stays inside DOCS_ROOT (defense-in-depth)
    try:
        page_path.resolve().relative_to(DOCS_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid slug")

    content = page_path.read_text(encoding="utf-8")
    return {
        "slug": slug,
        "locale": actual_locale,
        "content": content,
        "last_modified": page_path.stat().st_mtime,
    }


@router.get("/search/{locale}")
def search_docs(locale: str, q: str = "") -> dict[str, list[dict[str, Any]]]:
    """Simple fulltext search across all Markdown files for a locale.

    Returns up to 20 results sorted by match count, each with a
    context snippet around the first match.
    """
    if not q or len(q) < 2:
        return {"results": []}

    meta = _load_meta()
    resolved = _resolve_locale(locale, meta)
    locale_dir = DOCS_ROOT / resolved
    if not locale_dir.exists():
        return {"results": []}

    q_lower = q.lower()
    results: list[dict[str, Any]] = []

    for md_file in locale_dir.rglob("*.md"):
        try:
            content = md_file.read_text(encoding="utf-8")
        except OSError:
            continue

        if q_lower not in content.lower():
            continue

        slug = str(md_file.relative_to(locale_dir).with_suffix("")).replace("\\", "/")

        # Extract the first line that looks like a heading for the title
        title = slug
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped.startswith("#"):
                title = stripped.lstrip("#").strip()
                break

        # Context snippet around the first match
        idx = content.lower().find(q_lower)
        start = max(0, idx - 80)
        end = min(len(content), idx + len(q) + 120)
        snippet = content[start:end].strip()
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."

        results.append({
            "slug": slug,
            "title": title,
            "snippet": snippet,
            "score": content.lower().count(q_lower),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    return {"results": results[:20]}


# ---------------------------------------------------------------------------
# Legacy endpoints (backward compatibility)
# ---------------------------------------------------------------------------

@router.get("/shortcuts")
def shortcuts(lang: str = "de") -> list[dict[str, str]]:
    """Get keyboard shortcuts."""
    return get_shortcuts(_config, lang)


@router.get("/faq")
def faq(lang: str = "de") -> list[dict[str, str]]:
    """Get FAQ entries (legacy, use /help/page/{locale}/faq instead)."""
    return get_faq(_config, lang)


@router.get("/about")
def about() -> dict[str, str]:
    """Get about information."""
    return get_about()
