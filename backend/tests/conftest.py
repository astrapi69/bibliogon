"""Test harness bootstrap.

CRITICAL: this module sets BIBLIOGON_TEST=1 and TEST_DATABASE_URL
BEFORE any ``app.*`` import. Order matters: app/database.py reads
these env vars at module import time to decide which URL to hand to
SQLAlchemy. If a test module imports app.database before conftest has
set the env, the production DB gets wired up - and the autouse
``setup_db`` fixture below then drops its tables.

A real data-loss incident in April 2026 triggered the addition of the
session-scoped tripwire fixture. See commit history for context.
"""

from __future__ import annotations

import os
import sys

# MUST run before any `from app.* import ...` statement in this file
# or in any test module that pytest collects.
os.environ["BIBLIOGON_TEST"] = "1"
os.environ.setdefault("TEST_DATABASE_URL", "sqlite:///:memory:")

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


@pytest.fixture(autouse=True, scope="session")
def _verify_test_isolation() -> None:
    """Refuse to run the suite if the engine points at a production DB.

    Hard fail here is the last line of defence against re-living the
    data-loss incident. If this assertion fires, the env-var plumbing
    in app/database.py or the import order in this conftest has been
    broken; fix it before shipping anything else.
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


@pytest.fixture(autouse=True)
def setup_db() -> None:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
