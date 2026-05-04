"""Runtime data-path helpers + production marker constants.

Phase 2 of the test-isolation hardening (Phase 1 added the marker
file + conftest tripwire in commit a4cf7cf and the follow-up
filesystem sweep; this module's job in Phase 2 is to swap the
default data root from the project tree to a platformdirs
XDG-conformant location).

Two design constraints carried forward from Phase 1:

1. Paths resolve via either ``BIBLIOGON_DATA_DIR`` env var (highest
   priority - tests, Docker, admin overrides) or platformdirs.
   They do NOT resolve relative to the current working directory;
   the original ``Path("uploads")`` was CWD-relative, the trap
   exposed by the April 2026 data-loss incident.
2. ``get_upload_dir()`` (and friends) is a function call, never a
   module-level constant. Tests that ``monkeypatch`` env vars
   AFTER ``app.*`` import must still see the new value; frozen
   imports defeat that.

Resolver naming convention matches platformdirs (data / config /
cache). All four (``get_data_dir``, ``get_config_dir``,
``get_cache_dir``, plus the convenience ``get_upload_dir`` /
``get_db_path``) live in this module so a future contributor
finds them as a complete set.
"""

from __future__ import annotations

import os
from pathlib import Path

from platformdirs import user_cache_dir, user_config_dir, user_data_dir

PRODUCTION_MARKER_FILENAME = ".bibliogon-production"
APP_NAME = "bibliogon"


def get_data_dir() -> Path:
    """Root directory for runtime data: DB, uploads.

    Resolution order:
    1. ``BIBLIOGON_DATA_DIR`` env var (tests, Docker, admin override)
    2. ``platformdirs.user_data_dir(APP_NAME)``:
       - Linux/macOS: ``~/.local/share/bibliogon``
       - Windows: ``%LOCALAPPDATA%\\bibliogon``
       - Tests: a tmp dir (set by ``backend/tests/conftest.py``).
    """
    if env_dir := os.environ.get("BIBLIOGON_DATA_DIR"):
        return Path(env_dir).expanduser().resolve()
    return Path(user_data_dir(APP_NAME)).resolve()


def get_config_dir() -> Path:
    """Config / secrets directory.

    Resolution order:
    1. ``BIBLIOGON_CONFIG_DIR`` env var
    2. ``platformdirs.user_config_dir(APP_NAME)``:
       - Linux/macOS: ``~/.config/bibliogon``
       - Windows: ``%APPDATA%\\bibliogon``

    Existing override chain for ``secrets.yaml`` (see
    ``docs/configuration.md``) already targets ``~/.config/bibliogon/``;
    this helper just makes the canonical path discoverable next to
    the data and cache resolvers.
    """
    if env_dir := os.environ.get("BIBLIOGON_CONFIG_DIR"):
        return Path(env_dir).expanduser().resolve()
    return Path(user_config_dir(APP_NAME)).resolve()


def get_cache_dir() -> Path:
    """Cache directory: transient artifacts, derived data.

    Resolution order:
    1. ``BIBLIOGON_CACHE_DIR`` env var
    2. ``platformdirs.user_cache_dir(APP_NAME)``:
       - Linux/macOS: ``~/.cache/bibliogon``
       - Windows: ``%LOCALAPPDATA%\\bibliogon\\Cache``

    No current production code consumes this. Added now so the
    resolver set is complete; future cache-able operations can
    target a canonical location without touching this module.
    """
    if env_dir := os.environ.get("BIBLIOGON_CACHE_DIR"):
        return Path(env_dir).expanduser().resolve()
    return Path(user_cache_dir(APP_NAME)).resolve()


def get_upload_dir() -> Path:
    """Upload directory for cover images + article assets.

    Always resolved fresh - never cache the result at module import
    time. Test fixtures setting ``BIBLIOGON_DATA_DIR`` after
    ``app.*`` import still take effect.
    """
    return get_data_dir() / "uploads"


def get_db_path() -> Path:
    """SQLite database file path.

    The ``BIBLIOGON_DB_PATH`` env var still wins (consumed in
    ``app.database``) for backwards compatibility with deployments
    that set it explicitly. This helper provides the default that
    ``database.py`` falls back to when neither ``DATABASE_URL`` nor
    ``BIBLIOGON_DB_PATH`` is set.
    """
    return get_data_dir() / "bibliogon.db"


def mark_data_dir_as_production() -> None:
    """Write the ``.bibliogon-production`` marker into the data dir.

    Called once from the FastAPI lifespan startup. Skipped when the
    process is running in test mode (``BIBLIOGON_TEST=1``); the
    conftest tripwire treats the presence of this marker file as a
    fatal abort signal, so writing it during tests would defeat the
    isolation the marker is meant to enforce.
    """
    if os.environ.get("BIBLIOGON_TEST") == "1":
        return

    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    marker = data_dir / PRODUCTION_MARKER_FILENAME

    if marker.exists():
        return

    marker.write_text(
        "This directory contains production Bibliogon data.\n"
        "Do NOT delete this file. It protects against accidental\n"
        "data loss caused by test runs (see backend/tests/conftest.py).\n",
        encoding="utf-8",
    )
