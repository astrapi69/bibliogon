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

# Mirrors backend/config/i18n/*.yaml (8 catalogs).
LANGS = ["de", "en", "es", "fr", "el", "pt", "tr", "ja"]
# Standard always-visible plugins (premium/licensed plugins are hidden until
# licensed and are not seeded).
VISIBLE_PLUGINS = ["export", "help", "getstarted"]

# Make ``app.*`` importable for the registry loaders.
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
    config = _load_yaml(CONFIG_DIR / "app.yaml")
    if not isinstance(config, dict):
        raise SystemExit("ERROR: app.yaml did not parse to a mapping")
    # Never ship secrets in a committed seed file.
    ai = config.get("ai")
    if isinstance(ai, dict) and "api_key" in ai:
        ai["api_key"] = ""
    # The getApp endpoint injects this flag; mirror it for shape parity.
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


def main() -> None:
    print("Generating offline seed data from backend YAML sources...")
    generate_i18n()
    generate_settings()
    generate_book_types()
    generate_content_types()
    generate_plugin_metadata()
    print("Done.")


if __name__ == "__main__":
    main()
