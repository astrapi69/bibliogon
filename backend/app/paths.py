"""Runtime data-path helpers + production marker constants.

Phase 1 of the test-isolation hardening (the DB half landed in
``a4cf7cf``; this module adds the filesystem half).

Two design constraints:

1. Paths resolve relative to ``__file__`` rather than the current
   working directory. The original ``Path("uploads")`` was
   CWD-relative, which is exactly the trap the April 2026
   data-loss incident exposed - a test launched from the project
   root would have written into the production ``uploads/``.
2. ``get_upload_dir()`` is a function call, never a module-level
   constant. Tests that ``monkeypatch`` ``BIBLIOGON_DATA_DIR``
   AFTER ``app.*`` import must still see the new value; frozen
   imports defeat that.

Phase 2 will swap the default for ``platformdirs.user_data_dir``;
this module keeps the project-root-relative default for now.
"""

from __future__ import annotations

import os
from pathlib import Path


PRODUCTION_MARKER_FILENAME = ".bibliogon-production"


def get_data_dir() -> Path:
    """Root directory for runtime data (uploads, future per-app state).

    Resolution order:
    1. ``BIBLIOGON_DATA_DIR`` env var (tests, Docker, manual override)
    2. Existing default: the ``backend/`` directory where
       ``bibliogon.db`` already lives.
    """
    if env_dir := os.environ.get("BIBLIOGON_DATA_DIR"):
        return Path(env_dir).expanduser().resolve()

    # ``__file__`` -> backend/app/paths.py
    # ``parent.parent`` -> backend/
    return Path(__file__).resolve().parent.parent


def get_upload_dir() -> Path:
    """Upload directory for cover images + article assets.

    Always resolved fresh - never cache the result at module import
    time. Test fixtures setting ``BIBLIOGON_DATA_DIR`` after
    ``app.*`` import still take effect.
    """
    return get_data_dir() / "uploads"
