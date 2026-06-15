"""Shared app.yaml settings reads.

Extracted from ``routers/books.py`` + ``routers/articles.py`` (God-file
split #3, 2026-06-14) to remove the duplicated inline config reads and
the Router->Config layering violation. Each reader reads the project-tree
``backend/config/app.yaml`` directly, preserving the exact pre-split
behaviour (no user-overlay merge). Consumed by the books + articles
routers; a third copy of the allow-books-without-author read in
``import_plugins/overrides.py`` is unified separately (#160).
"""

from pathlib import Path

import yaml


def _app_config_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "config" / "app.yaml"


def is_permanent_delete() -> bool:
    """Return ``app.delete_permanently`` from app.yaml (default False).

    When true the DELETE endpoints hard-delete instead of moving to the
    trash. One switch governs both books and articles.
    """
    config_path = _app_config_path()
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("delete_permanently", False))
    except Exception:
        return False


def allow_books_without_author() -> bool:
    """Return ``app.allow_books_without_author`` from app.yaml (default False).

    Default off keeps the historical mandatory-author UX. When the user
    enables it in Settings, the import wizard's defer option appears and
    PATCH/POST against ``books`` accept null/empty as 'no author yet'.
    """
    config_path = _app_config_path()
    if not config_path.exists():
        return False
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        return bool(config.get("app", {}).get("allow_books_without_author", False))
    except Exception:
        return False


def get_trash_auto_delete_config() -> tuple[bool, int]:
    """Return ``(trash_auto_delete_enabled, trash_auto_delete_days)`` from
    app.yaml (defaults False, 30).

    Books and articles share one switch because the user sets it once for
    the whole trash.
    """
    config_path = _app_config_path()
    if not config_path.exists():
        return False, 30
    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        app = config.get("app", {})
        enabled = bool(app.get("trash_auto_delete_enabled", False))
        days = int(app.get("trash_auto_delete_days", 30))
        return enabled, days
    except Exception:
        return False, 30
