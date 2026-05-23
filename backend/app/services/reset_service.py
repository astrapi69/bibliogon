"""Full system-state reset for the Danger Zone feature.

Wipes every user-created artifact and returns the app to a
first-install-like state. Triggered exclusively through the
HMAC-token-gated endpoint pair at
``backend/app/routers/system.py``.

Reset scope (single source of truth — keep aligned with
``docs/help/{de,en}/settings/danger-zone.md`` if any of these
ever change):

Deleted:
- All 21 SQLite table rows (books, articles, chapters, pages,
  comic_panels, comic_bubbles, publishing state, ARC reviewers,
  comments, authors, audio_voices, plus the four builtin-template
  tables, plus the import-source bookkeeping tables).
- ``<data_dir>/uploads/`` (cover images + asset files).
- ``<data_dir>/tmp/`` (medium-import preview workspaces).
- ``<data_dir>/backup_history.json``.
- ``<data_dir>/config/app.yaml`` (user-overlay).
- ``<data_dir>/config/plugins/*.yaml`` (per-plugin user-overlays).
- ``<data_dir>/plugins/installed/*`` (user-installed plugin ZIPs).
- ``<config_dir>/secrets.yaml`` (drops the AI API key).

Re-seeded after truncation:
- ``book_templates`` + ``book_template_chapters`` (5 builtins).
- ``chapter_templates`` (4 builtins).

Preserved:
- ``.bibliogon-production`` marker (test-isolation tripwire).
- ``.migration-complete`` marker (platformdirs migration
  breadcrumb).
- ``<config_dir>/install.json`` + ``install.log`` +
  ``settings.json`` (launcher-owned metadata).
- ``backend/config/licenses.json`` (project-tree file; licensing
  dormant; outside data_dir).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.database import Base
from app.job_store import job_store
from app.paths import get_data_dir

logger = logging.getLogger(__name__)


def run_reset(
    db: Session,
    *,
    data_dir: Path | None = None,
    secrets_path: Path | None = None,
) -> dict[str, Any]:
    """Execute a full reset against the given session + paths.

    The ``data_dir`` and ``secrets_path`` arguments are injection
    seams for tests. In production callers pass ``None`` and the
    helpers resolve via ``app.paths`` + ``app.main``'s secrets-
    override path.
    """
    if data_dir is None:
        data_dir = get_data_dir()
    if secrets_path is None:
        secrets_path = _resolve_secrets_path()

    jobs_cancelled = job_store.shutdown_all()
    rows_deleted = _truncate_all_tables(db)
    _reseed_builtins(db)
    fs_summary = _wipe_filesystem(data_dir, secrets_path)

    logger.info(
        "System reset complete: jobs_cancelled=%d, rows_deleted=%d, "
        "uploads_cleared=%s, secrets_cleared=%s",
        jobs_cancelled,
        rows_deleted,
        fs_summary["uploads_cleared"],
        fs_summary["secrets_cleared"],
    )
    return {
        "status": "reset",
        "jobs_cancelled": jobs_cancelled,
        "rows_deleted": rows_deleted,
        **fs_summary,
    }


def _truncate_all_tables(db: Session) -> int:
    """Delete every row from every table in reverse-topo order.

    SQLAlchemy's ``Base.metadata.sorted_tables`` returns tables in
    FK-dependency order (parents first). Reversed iteration deletes
    children before parents, avoiding constraint violations even
    when the underlying SQLite engine enforces FKs and even for
    SET-NULL relationships (e.g. ``article_comments`` → ``articles``
    which is orphan-preserving in production but should be fully
    cleared on reset).
    """
    total = 0
    for table in reversed(Base.metadata.sorted_tables):
        result = db.execute(table.delete())
        # SQLAlchemy's CursorResult exposes rowcount, but the typed
        # Result base class does not - cast through getattr so mypy
        # is happy and behaviour matches both shapes (the SQLite
        # backend always returns CursorResult here).
        rowcount = getattr(result, "rowcount", None)
        if rowcount is not None and rowcount > 0:
            total += rowcount
    db.commit()
    return total


def _reseed_builtins(db: Session) -> None:
    """Re-seed builtin templates so the fresh app behaves like first install.

    Mirrors the lifespan-startup behaviour at ``app.main:508-521``.
    Both seed functions are idempotent and re-runnable safely.
    """
    from app.data.builtin_chapter_templates import seed_builtin_chapter_templates
    from app.data.builtin_templates import seed_builtin_templates

    seed_builtin_templates(db)
    seed_builtin_chapter_templates(db)


def _wipe_filesystem(data_dir: Path, secrets_path: Path) -> dict[str, Any]:
    """Delete user-data filesystem artifacts; preserve markers + launcher state."""
    summary: dict[str, Any] = {
        "uploads_cleared": False,
        "tmp_cleared": False,
        "backup_history_cleared": False,
        "config_overlays_cleared": 0,
        "installed_plugins_cleared": 0,
        "secrets_cleared": False,
    }

    summary["uploads_cleared"] = _wipe_and_recreate(data_dir / "uploads")
    summary["tmp_cleared"] = _wipe_and_recreate(data_dir / "tmp")
    summary["backup_history_cleared"] = _unlink_if_exists(data_dir / "backup_history.json")
    summary["config_overlays_cleared"] = _wipe_config_overlays(data_dir / "config")
    summary["installed_plugins_cleared"] = _wipe_installed_plugins(
        data_dir / "plugins" / "installed"
    )
    summary["secrets_cleared"] = _unlink_if_exists(secrets_path)
    return summary


def _wipe_and_recreate(path: Path) -> bool:
    """Recursively delete ``path`` and recreate it as an empty dir."""
    try:
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)
        return True
    except OSError as e:
        logger.warning("Failed to wipe %s: %s", path, e)
        return False


def _unlink_if_exists(path: Path) -> bool:
    """Delete a single file; return True iff it existed and was removed."""
    try:
        if path.exists():
            path.unlink()
            return True
        return False
    except OSError as e:
        logger.warning("Failed to unlink %s: %s", path, e)
        return False


def _wipe_config_overlays(config_dir: Path) -> int:
    """Delete app.yaml + plugins/*.yaml under ``<data_dir>/config/``.

    Returns the count of files removed. The directory structure
    itself is preserved (config/ + config/plugins/) so future
    writes don't need to re-create parents.
    """
    if not config_dir.exists():
        return 0
    count = 0
    app_yaml = config_dir / "app.yaml"
    if _unlink_if_exists(app_yaml):
        count += 1
    plugins_dir = config_dir / "plugins"
    if plugins_dir.exists():
        for yaml_file in plugins_dir.glob("*.yaml"):
            if _unlink_if_exists(yaml_file):
                count += 1
    return count


def _wipe_installed_plugins(installed_dir: Path) -> int:
    """Delete every subdirectory under ``<data_dir>/plugins/installed/``.

    Returns the count of plugin directories removed. The parent
    ``installed/`` directory is preserved so the next install
    operation does not need to recreate it.
    """
    if not installed_dir.exists():
        return 0
    count = 0
    for entry in installed_dir.iterdir():
        if entry.is_dir():
            try:
                shutil.rmtree(entry)
                count += 1
            except OSError as e:
                logger.warning("Failed to remove installed plugin %s: %s", entry, e)
    return count


def _resolve_secrets_path() -> Path:
    """Return the canonical secrets.yaml path used by the override chain.

    Delegates to ``app.main._get_user_override_path`` so the reset
    deletes the SAME file the secret-override chain reads from. The
    underlying logic respects ``XDG_CONFIG_HOME`` on Linux/macOS and
    ``%APPDATA%`` on Windows (see ``app.main`` for details).
    """
    from app.main import _get_user_override_path

    return _get_user_override_path()
