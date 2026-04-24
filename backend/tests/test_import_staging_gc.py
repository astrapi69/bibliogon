"""Regression tests for the import-orchestrator staging GC.

Detect stages bytes under ``<TMP>/bibliogon_import_staging/<temp_ref>/``
so a later execute call can re-read them. The TTL is 30 minutes;
``_gc_stale_staging`` runs opportunistically on every detect. These
tests age a staged directory past the TTL by backdating ``mtime`` and
assert the next detect collects it.
"""

from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.import_orchestrator import _STAGING_DIR, _STAGING_TTL_SECONDS


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def test_stale_staged_dir_is_garbage_collected(client: TestClient) -> None:
    # First detect: stages bytes and returns a temp_ref.
    resp = client.post(
        "/api/import/detect",
        files=[("files", ("a.md", b"# A\n\nbody", "text/markdown"))],
    )
    assert resp.status_code == 200
    temp_ref = resp.json()["temp_ref"]
    stage = _STAGING_DIR / temp_ref
    assert stage.is_dir()

    # Backdate the stage directory past the TTL.
    stale_ts = time.time() - _STAGING_TTL_SECONDS - 60
    os.utime(stage, (stale_ts, stale_ts))

    # Another detect triggers _gc_stale_staging which drops the stale tree.
    second = client.post(
        "/api/import/detect",
        files=[("files", ("b.md", b"# B\n\nbody", "text/markdown"))],
    )
    assert second.status_code == 200
    assert not stage.is_dir(), (
        "Stale staged directory should have been collected on the next detect"
    )

    # The new temp_ref is still valid.
    new_temp_ref = second.json()["temp_ref"]
    assert (_STAGING_DIR / new_temp_ref).is_dir()


def test_fresh_stage_survives_gc(client: TestClient) -> None:
    """Fresh stages below the TTL must not be collected when detect runs
    again. Regression against an over-eager GC sweep."""
    first = client.post(
        "/api/import/detect",
        files=[("files", ("a.md", b"# A\n\nbody", "text/markdown"))],
    )
    first_ref = first.json()["temp_ref"]

    second = client.post(
        "/api/import/detect",
        files=[("files", ("b.md", b"# B\n\nbody", "text/markdown"))],
    )
    second_ref = second.json()["temp_ref"]

    assert (_STAGING_DIR / first_ref).is_dir()
    assert (_STAGING_DIR / second_ref).is_dir()


def test_execute_after_ttl_expiry_returns_404(client: TestClient) -> None:
    """A temp_ref that has been collected must not resolve - the client
    has to re-run detect rather than execute against a ghost."""
    resp = client.post(
        "/api/import/detect",
        files=[("files", ("a.md", b"# A\n\nbody", "text/markdown"))],
    )
    temp_ref = resp.json()["temp_ref"]
    stage = _STAGING_DIR / temp_ref
    stale_ts = time.time() - _STAGING_TTL_SECONDS - 60
    os.utime(stage, (stale_ts, stale_ts))

    # Trigger GC via a second detect that targets an unrelated file.
    client.post(
        "/api/import/detect",
        files=[("files", ("b.md", b"# B\n\nbody", "text/markdown"))],
    )
    assert not stage.is_dir()

    execute = client.post(
        "/api/import/execute",
        json={"temp_ref": temp_ref, "overrides": {}, "duplicate_action": "create"},
    )
    assert execute.status_code == 404
