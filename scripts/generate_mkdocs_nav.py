#!/usr/bin/env python3
"""Generate the ``nav:`` block in mkdocs.yml from docs/help/_meta.yaml.

Both the in-app help panel and MkDocs read the same Markdown files.
The navigation structure is defined once in ``_meta.yaml`` and this
script converts it to the format MkDocs expects.

Usage::

    python scripts/generate_mkdocs_nav.py

The script is idempotent: it replaces any existing ``nav:`` block in
``mkdocs.yml`` (or appends one if missing).
"""

from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
META_PATH = PROJECT_ROOT / "docs" / "help" / "_meta.yaml"
MKDOCS_PATH = PROJECT_ROOT / "mkdocs.yml"


def _build_nav(items: list[dict], lang: str = "de") -> list:
    """Convert _meta.yaml navigation items to MkDocs nav format."""
    nav = []
    for item in items:
        title = item.get("title", {})
        label = title.get(lang, title.get("en", title.get("de", "")))
        slug = item.get("slug", "")

        children = item.get("children")
        if children:
            child_nav = []
            for child in children:
                child_title = child.get("title", {})
                child_label = child_title.get(lang, child_title.get("en", ""))
                child_slug = child.get("slug", "")
                child_nav.append({child_label: f"{lang}/{child_slug}.md"})
            nav.append({label: child_nav})
        else:
            nav.append({label: f"{lang}/{slug}.md"})

    return nav


def main() -> None:
    if not META_PATH.exists():
        print(f"ERROR: {META_PATH} not found")
        raise SystemExit(1)

    meta = yaml.safe_load(META_PATH.read_text(encoding="utf-8"))
    default_lang = "de"
    for lang_info in meta.get("languages", []):
        if lang_info.get("default"):
            default_lang = lang_info["code"]
            break

    nav = _build_nav(meta.get("navigation", []), default_lang)

    # Read existing mkdocs.yml
    if not MKDOCS_PATH.exists():
        print(f"ERROR: {MKDOCS_PATH} not found")
        raise SystemExit(1)

    mkdocs_config = yaml.safe_load(MKDOCS_PATH.read_text(encoding="utf-8")) or {}
    mkdocs_config["nav"] = nav

    # Write back, preserving comments as much as possible (yaml.dump
    # does not preserve comments, but mkdocs.yml is mostly generated).
    MKDOCS_PATH.write_text(
        yaml.dump(mkdocs_config, sort_keys=False, allow_unicode=True, default_flow_style=False),
        encoding="utf-8",
    )
    print(f"Generated nav with {len(nav)} top-level entries in {MKDOCS_PATH}")


if __name__ == "__main__":
    main()
