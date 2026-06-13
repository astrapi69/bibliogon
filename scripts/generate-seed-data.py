#!/usr/bin/env python3
"""Generate offline-PWA seed JSON from the backend YAML single-source-of-truth.

The static GitHub Pages build has no backend, so DexieStorage must seed its
tables on first init with the same data the `/api` endpoints would return:
i18n catalogs, default settings, book-types, content-types, plugin metadata.

This script reads the canonical backend config and writes JSON to
``frontend/src/storage/seed/`` whose shapes mirror the API responses exactly:

  - i18n catalogs    -> raw YAML dict (same as GET /api/i18n/{lang})
  - settings         -> backend/config/app.yaml + _secrets_managed_externally
                        (secrets blanked), matching GET /api/settings/app defaults
  - book-types       -> {id: BookTypeDef} via the real loader (Pydantic defaults
                        applied), matching GET /api/book-types
  - content-types    -> {id: ContentTypeDef} via the real loader, matching
                        GET /api/content-types
  - plugin metadata  -> the standard visible plugins, matching the
                        GET /api/settings/plugins/discovered shape

Run via ``make generate-seed-data`` (backend poetry env, so ``app.*`` imports
resolve). Re-run and commit the JSON whenever a backend i18n catalog, the
app.yaml defaults, or a type registry changes - this is a manual step, the
JSON is a committed derived artifact so the pure frontend / GH-Pages build
needs no Python.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
CONFIG_DIR = BACKEND_DIR / "config"
SEED_DIR = REPO_ROOT / "frontend" / "src" / "storage" / "seed"
DOCS_HELP_ROOT = REPO_ROOT / "docs" / "help"

LANGS = ["de", "en", "es", "fr", "el", "pt", "tr", "ja"]
VISIBLE_PLUGINS = ["export", "help", "getstarted"]

# Locales that actually carry authored help-doc markdown trees. Other
# locales fall back to the default at lookup time (mirrors the backend
# `_resolve_locale`).
DOCS_LOCALES = ["de", "en"]
DOCS_DEFAULT_LOCALE = "de"
SAMPLE_BOOK_TYPES = ["prose", "picture_book", "comic_book"]


def _localize_field(value: object, lang: str) -> str:
    """Resolve a `{de: ..., en: ...}` localized field to a single string.

    Mirrors the backend `_localize` helpers in the help + getstarted
    plugins (lang -> en -> de fallback chain).
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get(lang) or value.get("en") or value.get("de") or "")
    return "" if value is None else str(value)

sys.path.insert(0, str(BACKEND_DIR))


def _load_yaml(path: Path) -> object:
    if not path.exists():
        raise SystemExit(f"ERROR: seed source missing: {path}")
    with open(path, encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if data is None:
        raise SystemExit(f"ERROR: seed source is empty: {path}")
    return data


def _write_json(name: str, data: object) -> None:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    path = SEED_DIR / name
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"  wrote {path.relative_to(REPO_ROOT)}")


def generate_i18n() -> None:
    for lang in LANGS:
        catalog = _load_yaml(CONFIG_DIR / "i18n" / f"{lang}.yaml")
        _write_json(f"seed-i18n-{lang}.json", catalog)


def generate_settings() -> None:
    """Emit the offline settings seed from app.yaml.

    Blanks the AI api_key so no secret ships in the committed seed, blanks the
    author defaults so a developer's local (gitignored) app.yaml never leaks
    personal data into the public seed, and adds the
    ``_secrets_managed_externally`` flag the getApp endpoint injects so the seed
    matches the API response shape. The offline build starts with an empty
    author profile, matching app.yaml.example.
    """
    config = _load_yaml(CONFIG_DIR / "app.yaml")
    if not isinstance(config, dict):
        raise SystemExit("ERROR: app.yaml did not parse to a mapping")
    ai = config.get("ai")
    if isinstance(ai, dict) and "api_key" in ai:
        ai["api_key"] = ""
    author = config.get("author")
    if isinstance(author, dict):
        author["name"] = ""
        author["pen_names"] = []
    config["_secrets_managed_externally"] = False
    _write_json("seed-settings.json", config)


def generate_book_types() -> None:
    from app.services.book_type_registry import load_book_types

    data = {
        type_id: definition.model_dump(mode="json")
        for type_id, definition in load_book_types().items()
    }
    if not data:
        raise SystemExit("ERROR: load_book_types() returned nothing")
    _write_json("seed-book-types.json", data)


def generate_content_types() -> None:
    from app.services.content_type_registry import load_content_types

    data = {
        type_id: definition.model_dump(mode="json")
        for type_id, definition in load_content_types().items()
    }
    if not data:
        raise SystemExit("ERROR: load_content_types() returned nothing")
    _write_json("seed-content-types.json", data)


def generate_story_entity_types() -> None:
    from app.services.story_entity_registry import load_story_entity_types

    data = {
        type_id: definition.model_dump(mode="json")
        for type_id, definition in load_story_entity_types().items()
    }
    if not data:
        raise SystemExit("ERROR: load_story_entity_types() returned nothing")
    _write_json("seed-story-entity-types.json", data)


def generate_plugin_metadata() -> None:
    plugins = []
    for name in VISIBLE_PLUGINS:
        meta = _load_yaml(CONFIG_DIR / "plugins" / f"{name}.yaml")
        block = meta.get("plugin", {}) if isinstance(meta, dict) else {}
        plugins.append(
            {
                "name": name,
                "has_config": True,
                "enabled": True,
                "loaded": True,
                "license_tier": "core",
                "has_license": True,
                "display_name": block.get("display_name") or {},
                "description": block.get("description") or {},
                "version": block.get("version"),
                "filter_reason": None,
                "load_error_message": None,
                "activated_at": None,
                "last_config_change": None,
                "source": "bundled",
            }
        )
    _write_json("seed-plugin-metadata.json", plugins)


def generate_help() -> None:
    """Emit the legacy `/help` page content (shortcuts + faq + about).

    Mirrors the help plugin's `get_shortcuts` / `get_faq` / `get_about`
    so the `/help` page renders offline. Shortcuts + FAQ are localized
    per catalog language; `about` is the same static dict the backend
    returns.
    """
    config = _load_yaml(CONFIG_DIR / "plugins" / "help.yaml")
    if not isinstance(config, dict):
        raise SystemExit("ERROR: help.yaml did not parse to a mapping")
    shortcuts_src = config.get("shortcuts", []) or []
    faq_src = config.get("faq", []) or []
    shortcuts = {
        lang: [
            {"keys": s["keys"], "action": _localize_field(s.get("action", ""), lang)}
            for s in shortcuts_src
        ]
        for lang in LANGS
    }
    faq = {
        lang: [
            {
                "question": _localize_field(item.get("question", ""), lang),
                "answer": _localize_field(item.get("answer", ""), lang),
            }
            for item in faq_src
        ]
        for lang in LANGS
    }
    about = {
        "name": "Bibliogon",
        "description": "Open-source book authoring platform",
        "website": "https://github.com/astrapi69/bibliogon",
        "license": "MIT",
    }
    _write_json("seed-help.json", {"shortcuts": shortcuts, "faq": faq, "about": about})


def _resolve_help_nav(items: object, locale: str) -> list[dict[str, object]]:
    """Flatten the multilingual nav tree to a single locale.

    Mirrors the help plugin's `_resolve_nav`.
    """
    result: list[dict[str, object]] = []
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict):
            continue
        entry: dict[str, object] = {
            "title": _localize_field(item.get("title", {}), locale),
            "slug": item.get("slug", ""),
            "icon": item.get("icon", ""),
        }
        children = item.get("children")
        if children:
            entry["children"] = _resolve_help_nav(children, locale)
        result.append(entry)
    return result


def generate_help_docs() -> None:
    """Emit the docs-based help content (navigation tree + markdown pages).

    For each locale that has an authored doc tree, walks
    ``docs/help/<locale>/**/*.md`` and bundles every page's raw Markdown
    plus the resolved navigation tree from ``_meta.yaml``. The offline
    HelpPanel renders these directly; search runs client-side over them.
    """
    meta = _load_yaml(DOCS_HELP_ROOT / "_meta.yaml")
    nav_src = meta.get("navigation", []) if isinstance(meta, dict) else []
    for locale in DOCS_LOCALES:
        locale_dir = DOCS_HELP_ROOT / locale
        pages: dict[str, dict[str, object]] = {}
        for md_file in sorted(locale_dir.rglob("*.md")):
            slug = (
                str(md_file.relative_to(locale_dir).with_suffix(""))
                .replace("\\", "/")
            )
            pages[slug] = {
                "slug": slug,
                "locale": locale,
                "content": md_file.read_text(encoding="utf-8"),
                # Offline pages have no meaningful mtime; the consumer
                # only displays content, so a stable 0 keeps the seed
                # deterministic across regenerations.
                "last_modified": 0,
            }
        _write_json(
            f"seed-help-docs-{locale}.json",
            {"navigation": _resolve_help_nav(nav_src, locale), "pages": pages},
        )


def _localize_sample(sample: object, lang: str, book_type: str) -> dict[str, object]:
    """Mirror the getstarted plugin's `_localize_sample`."""
    src = sample if isinstance(sample, dict) else {}
    out: dict[str, object] = {
        "title": _localize_field(src.get("title", "My First Book"), lang),
        "author": src.get("author", "Bibliogon"),
        "language": src.get("language", lang),
        "book_type": src.get("book_type", book_type),
        "description": _localize_field(src.get("description", ""), lang),
    }
    if book_type == "prose":
        out["chapters"] = [
            {
                "title": _localize_field(ch.get("title", ""), lang),
                "content": _localize_field(ch.get("content", ""), lang),
            }
            for ch in src.get("chapters", []) or []
        ]
    else:
        pages = []
        for page in src.get("pages", []) or []:
            entry: dict[str, object] = {
                "layout": page.get("layout", "image_top_text_bottom"),
            }
            if "text_content" in page:
                entry["text_content"] = _localize_field(page["text_content"], lang)
            if "layout_config" in page:
                entry["layout_config"] = page["layout_config"]
            if "image_asset_id" in page:
                entry["image_asset_id"] = page["image_asset_id"]
            pages.append(entry)
        out["pages"] = pages
    return out


def generate_getstarted() -> None:
    """Emit the onboarding guide steps + per-book-type sample books.

    Mirrors the getstarted plugin's `get_guide_steps` /
    `get_sample_book_data` so `/get-started` renders + creates demo
    books offline.
    """
    config = _load_yaml(CONFIG_DIR / "plugins" / "getstarted.yaml")
    if not isinstance(config, dict):
        raise SystemExit("ERROR: getstarted.yaml did not parse to a mapping")
    steps = (config.get("guide", {}) or {}).get("steps", []) or []
    guide = {
        lang: [
            {
                "id": step["id"],
                "title": _localize_field(step.get("title", ""), lang),
                "description": _localize_field(step.get("description", ""), lang),
                "icon": step.get("icon", "circle"),
            }
            for step in steps
        ]
        for lang in LANGS
    }
    sample_src = config.get("sample_books", {}) or {}
    sample_books = {
        lang: {
            bt: _localize_sample(sample_src.get(bt, {}), lang, bt)
            for bt in SAMPLE_BOOK_TYPES
        }
        for lang in LANGS
    }
    _write_json(
        "seed-getstarted.json", {"guide": guide, "sampleBooks": sample_books}
    )


def main() -> None:
    print("Generating offline seed data from backend YAML sources...")
    generate_i18n()
    generate_settings()
    generate_book_types()
    generate_content_types()
    generate_story_entity_types()
    generate_plugin_metadata()
    generate_help()
    generate_help_docs()
    generate_getstarted()
    print("Done.")


if __name__ == "__main__":
    main()
