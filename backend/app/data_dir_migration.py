"""One-time migration of project-tree data to the XDG data dir.

Phase 2 of the test-isolation hardening (see ``app.paths``)
moved the canonical data directory from the project tree
(``backend/`` next to the source code) to a platformdirs
location (``~/.local/share/bibliogon`` on Linux/macOS,
``%LOCALAPPDATA%\\bibliogon`` on Windows).

This module ports a v0.25.0 user's existing data into the new
location on first start after the upgrade. It runs before
``init_db()`` so a moved SQLite DB is picked up rather than
recreated empty.

Design rules:

- **Idempotent.** A ``.migration-complete`` marker in the target
  dir short-circuits subsequent runs.
- **Fail loud on conflict.** If both legacy and target paths
  contain data, raise ``RuntimeError`` so the user notices.
  Silent merge would corrupt data.
- **Breadcrumb at old path.** A ``.migrated-YYYY-MM-DD`` file is
  written next to each moved item so users can verify before
  deleting.
- **Skipped in test mode** (``BIBLIOGON_TEST=1``). Tests get a
  fresh tmp data dir; migrating a non-existent legacy tree
  would be wasted work and would also write breadcrumbs into
  the project tree, polluting ``git status``.

Module path is ``app.data_dir_migration`` (NOT
``app.migrations``) to avoid collision with Alembic's
``backend/migrations/`` directory.
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import date
from pathlib import Path

from app.paths import get_data_dir

logger = logging.getLogger(__name__)


_PROJECT_BACKEND_DIR = Path(__file__).resolve().parent.parent
_LEGACY_DB = _PROJECT_BACKEND_DIR / "bibliogon.db"
_LEGACY_UPLOADS = _PROJECT_BACKEND_DIR / "uploads"

MIGRATION_MARKER_FILENAME = ".migration-complete"


def _legacy_paths(target: Path) -> list[tuple[str, Path, Path]]:
    """Return [(label, legacy_path, target_path), ...] for items that
    Phase 2 needs to move."""
    return [
        ("bibliogon.db", _LEGACY_DB, target / "bibliogon.db"),
        ("uploads", _LEGACY_UPLOADS, target / "uploads"),
    ]


def migrate_data_dir_if_needed() -> None:
    """Move data from the project-tree to the canonical data dir.

    No-op in test mode, when the marker is already present, or when
    no legacy data exists. Raises ``RuntimeError`` on conflict
    (both legacy and target hold data for the same item).
    """
    if os.environ.get("BIBLIOGON_TEST") == "1":
        return

    target = get_data_dir()
    marker = target / MIGRATION_MARKER_FILENAME

    if marker.exists():
        return

    items = _legacy_paths(target)
    has_legacy = any(legacy.exists() for _label, legacy, _dst in items)

    if not has_legacy:
        # Fresh install or already-migrated target without the marker.
        # Create the dir, plant the marker, done.
        target.mkdir(parents=True, exist_ok=True)
        marker.touch()
        return

    target.mkdir(parents=True, exist_ok=True)
    suffix = f".migrated-{date.today().isoformat()}"

    for label, legacy, dst in items:
        if not legacy.exists():
            continue
        if dst.exists():
            raise RuntimeError(
                f"Cannot migrate {label}: both legacy ({legacy}) and "
                f"target ({dst}) paths exist. Manual resolution "
                f"required - move data manually or delete one side, "
                f"then restart Bibliogon."
            )
        logger.info("Migrating %s: %s -> %s", label, legacy, dst)
        shutil.move(str(legacy), str(dst))
        breadcrumb = legacy.with_name(legacy.name + suffix)
        try:
            breadcrumb.write_text(
                f"Bibliogon data moved to {dst} on {date.today().isoformat()}.\n"
                f"This file marks the old location. Safe to delete.\n",
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Could not write breadcrumb %s: %s", breadcrumb, exc)

    marker.touch()
    logger.warning(
        "Bibliogon data migrated to %s. Verify and delete legacy "
        "breadcrumbs at the old project-tree paths if desired.",
        target,
    )
