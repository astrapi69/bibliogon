"""Test harness bootstrap.

CRITICAL: this module sets BIBLIOGON_TEST=1, TEST_DATABASE_URL and
BIBLIOGON_DATA_DIR BEFORE any ``app.*`` import. Order matters:

- ``app/database.py`` reads ``BIBLIOGON_TEST`` / ``TEST_DATABASE_URL``
  at module import time to decide which URL to hand to SQLAlchemy.
  Without this, a test module importing ``app.database`` before the
  conftest could wire up the production DB; the autouse ``setup_db``
  fixture below would then drop its tables.
- ``app/paths.py`` reads ``BIBLIOGON_DATA_DIR`` lazily via
  ``get_data_dir()``, but seeding it here means every test sees
  the same tmp path even if they never call the helper directly.

A real data-loss incident in April 2026 (commit ``a4cf7cf``) triggered
the addition of the session-scoped DB tripwire. The filesystem half of
the same hardening landed in this session; the marker file written by
``app.paths.mark_data_dir_as_production`` lets the tripwire fail loud
if a test ever points ``BIBLIOGON_DATA_DIR`` at a path that contains
real data.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# MUST run before any `from app.* import ...` statement in this file
# or in any test module that pytest collects.
os.environ["BIBLIOGON_TEST"] = "1"
os.environ.setdefault("TEST_DATABASE_URL", "sqlite:///:memory:")

# Filesystem isolation: redirect every ``get_upload_dir()`` resolution
# into a process-scoped tmp dir. The session fixture below upgrades
# this to a tmp_path_factory-managed directory so pytest's own
# cleanup runs at end of session; the env var here is set early so
# any module-import-time path resolution still hits a tmp location.
if "BIBLIOGON_DATA_DIR" not in os.environ:
    os.environ["BIBLIOGON_DATA_DIR"] = tempfile.mkdtemp(
        prefix="bibliogon-test-data-"
    )

# 41+ test modules open a FastAPI TestClient, each of which triggers the
# app lifespan startup path. Starlette's TestClient recurses through its
# receive loop on each startup; combined with the async thread-runner
# wrapper this consumes ~25 frames per lifespan. Default limit 1000 ==
# ~40 concurrent lifespans cap. The suite now exceeds that threshold,
# which surfaces as RecursionError in downstream test modules whose
# tests individually pass in isolation. Raising the limit is a
# test-infra concession, not a production setting.
sys.setrecursionlimit(5000)

import pytest  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.paths import (  # noqa: E402
    PRODUCTION_MARKER_FILENAME,
    get_data_dir,
    get_upload_dir,
)


@pytest.fixture(autouse=True, scope="session")
def _verify_test_isolation() -> None:
    """Refuse to run the suite if it would touch production data.

    Two tripwires:

    1. DB: engine URL must not contain ``bibliogon.db``.
    2. Filesystem: the resolved data directory must not contain a
       ``.bibliogon-production`` marker (written by the FastAPI
       lifespan in non-test mode; see ``app.paths``).

    Hard fail here is the last line of defence against re-living the
    April 2026 data-loss incident.
    """
    url = str(engine.url)
    assert "bibliogon.db" not in url, (
        f"FATAL: tests refuse to run against production DB: {url}. "
        f"Fix: ensure BIBLIOGON_TEST=1 is set before any app import."
    )
    assert ":memory:" in url or "/tmp/" in url or url.endswith("test.db"), (
        f"FATAL: engine URL {url} does not look like a test DB. "
        f"Allow it explicitly in tests/conftest.py if intentional."
    )

    data_dir = get_data_dir()
    marker = data_dir / PRODUCTION_MARKER_FILENAME
    if marker.exists():
        pytest.exit(
            "\n"
            "FATAL: test run would touch production data.\n"
            "\n"
            f"  Data directory:  {data_dir}\n"
            f"  Marker found:    {marker}\n"
            "\n"
            "Tests must never access production data.\n"
            "Fix:\n"
            "  - Set BIBLIOGON_DATA_DIR explicitly to a test path,\n"
            "  - or run make test from a clean environment.\n",
            returncode=2,
        )

    # Make sure the upload subtree exists for the rest of the run.
    get_upload_dir().mkdir(parents=True, exist_ok=True)
    # Sanity: BIBLIOGON_DATA_DIR points somewhere temporary.
    resolved = Path(os.environ["BIBLIOGON_DATA_DIR"]).resolve()
    assert "test" in resolved.name.lower() or resolved.parts[1:2] == ("tmp",), (
        f"FATAL: BIBLIOGON_DATA_DIR={resolved} does not look like a test "
        f"path. Set it explicitly to a /tmp/... directory."
    )


@pytest.fixture(autouse=True)
def setup_db() -> None:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
