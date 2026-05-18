"""End-to-end tests for the Medium-import v2 async dry-run import
endpoint (ASYNC-IMPORT-PROGRESS-01 Phase 1).

The endpoint under test:

  POST /api/medium-import/import/async/{preview_id}
    -> 202 + {job_id, status: "pending"}
    -> backend submits the import as an asyncio task
    -> per-post events flow through the existing
       /api/export/jobs/{id}/stream SSE endpoint (reused per Q2)
    -> final ImportResult lands in job.result, fetchable via
       GET /api/export/jobs/{id}

These tests poll ``GET /api/export/jobs/{id}`` rather than driving
the SSE stream directly - the TestClient doesn't surface server-
sent events in a way that's tractable to assert on. The polling
contract (status + events + result fields) is the same contract
the SSE endpoint replays per the canonical job_store pattern.

The cooperative-cancellation contract is tested in the plugin's
own test_preview.py (``test_import_zip_cooperative_cancellation_
stops_between_posts``). Adding an integration-level cancel test
here would require carefully timing a DELETE against an in-flight
async task through the TestClient, which is hard to make
non-flaky; the per-orchestrator test is sufficient.

Plugin routes are mounted by the FastAPI lifespan; using ``with
TestClient(app) as c:`` is mandatory (see lessons-learned).
"""

from __future__ import annotations

import io
import time
import zipfile
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article

_REPO_ROOT = next(
    p
    for p in Path(__file__).resolve().parents
    if (p / "plugins" / "bibliogon-plugin-medium-import").is_dir()
)
FIXTURES_DIR = (
    _REPO_ROOT
    / "plugins"
    / "bibliogon-plugin-medium-import"
    / "tests"
    / "fixtures"
)


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(autouse=True)
def _reap_preview_cache() -> Iterator[None]:
    """Mirror the autouse fixture from test_medium_import_preview.py
    to keep the preview-cache state isolated between tests."""
    from bibliogon_medium_import.preview import get_default_cache

    cache = get_default_cache()
    try:
        cache_dir = cache._cache_dir()
        for f in cache_dir.glob("*.zip"):
            try:
                f.unlink()
            except OSError:
                pass
    except OSError:
        pass
    yield
    try:
        cache_dir = cache._cache_dir()
        for f in cache_dir.glob("*.zip"):
            try:
                f.unlink()
            except OSError:
                pass
    except OSError:
        pass


def _build_zip(filenames: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            html = (FIXTURES_DIR / name).read_bytes()
            zf.writestr(f"posts/{name}", html)
    return buf.getvalue()


def _post_preview(client: TestClient, zip_bytes: bytes) -> dict:
    files = {"file": ("medium-export.zip", io.BytesIO(zip_bytes), "application/zip")}
    return client.post("/api/medium-import/preview", files=files).json()


def _fake_download_patch():
    """The image downloader returns synthetic rewrites so the
    import doesn't actually fetch from cdn-images-1.medium.com."""
    from bibliogon_medium_import.image_downloader import DownloadResult

    def _fake(images, article_id, **kwargs):  # noqa: ANN001
        rewrites = {
            img.src: f"/api/articles/{article_id}/assets/file/dummy.jpg"
            for img in images
            if img.src
        }
        return DownloadResult(url_rewrites=rewrites, saved_filenames=[], warnings=[])

    return patch("bibliogon_medium_import.importer.download_images", _fake)


def _poll_for_terminal_status(
    client: TestClient, job_id: str, timeout: float = 30.0
) -> dict:
    """Poll GET /api/export/jobs/{id} until status reaches a
    terminal state (completed/failed/cancelled). Returns the final
    job snapshot. The poll cadence is fast (50ms) because the
    medium-import jobs in tests are quick (~ms each). Bumps to a
    timeout error if the job doesn't terminate in the budget."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/api/export/jobs/{job_id}")
        if resp.status_code != 200:
            pytest.fail(
                f"GET /api/export/jobs/{job_id} returned {resp.status_code}: "
                f"{resp.text[:200]}"
            )
        body = resp.json()
        if body["status"] in ("completed", "failed", "cancelled"):
            return body
        time.sleep(0.05)
    pytest.fail(f"Job {job_id} did not reach a terminal status within {timeout}s")


def _start_async_import(
    client: TestClient, preview_id: str, selected: list[str]
) -> dict:
    return client.post(
        f"/api/medium-import/import/async/{preview_id}",
        json={"selected_filenames": selected},
    ).json()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_async_endpoint_returns_202_and_job_id(client: TestClient) -> None:
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    with _fake_download_patch():
        resp = client.post(
            f"/api/medium-import/import/async/{preview['preview_id']}",
            json={"selected_filenames": ["01_oldest_tech.html"]},
        )
    assert resp.status_code == 202
    body = resp.json()
    assert isinstance(body["job_id"], str) and body["job_id"]
    assert body["status"] == "pending"


def test_async_job_runs_to_completion_and_publishes_full_event_sequence(
    client: TestClient, db: Session
) -> None:
    """Submit a 2-post job, poll until done, assert the recorded
    events match the contracted sequence and the final result
    payload mirrors the sync endpoint's ImportZipResponse shape."""
    preview = _post_preview(
        client, _build_zip(["01_oldest_tech.html", "03_english_recent_with_code.html"])
    )
    with _fake_download_patch():
        started = _start_async_import(
            client,
            preview["preview_id"],
            ["01_oldest_tech.html", "03_english_recent_with_code.html"],
        )
        final = _poll_for_terminal_status(client, started["job_id"])

    assert final["status"] == "completed"
    types = [e["type"] for e in final["events"]]
    # Exact-order check: start, then for each post a (post_start ->
    # post_done) pair, then done, then stream_end.
    assert types[0] == "start"
    assert types[-1] == "stream_end"
    assert types[-2] == "done"
    assert types.count("post_start") == 2
    # In the integration test the DB writes succeed, so each post
    # lands as post_done (no errored).
    assert types.count("post_done") == 2
    assert types.count("post_errored") == 0

    # start event carries total.
    start_event = next(e for e in final["events"] if e["type"] == "start")
    assert start_event["data"] == {"total": 2}

    # done event carries the summary counts.
    done_event = next(e for e in final["events"] if e["type"] == "done")
    assert done_event["data"]["imported_count"] == 2
    assert done_event["data"]["errored_count"] == 0

    # The 2 articles really landed in the DB.
    assert (
        db.query(Article)
        .filter(Article.canonical_url.like("%medium.com%"))
        .count()
        >= 2
    )


def test_async_job_reaps_preview_cache_on_success(client: TestClient) -> None:
    """After a successful async import the preview_id must be gone -
    a subsequent sync POST against it returns 404."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    with _fake_download_patch():
        started = _start_async_import(
            client, preview["preview_id"], ["01_oldest_tech.html"]
        )
        final = _poll_for_terminal_status(client, started["job_id"])
    assert final["status"] == "completed"

    # Cache reaped: any subsequent reference to preview_id (sync or
    # async) 404s.
    sync_retry = client.post(
        f"/api/medium-import/import/{preview['preview_id']}",
        json={"selected_filenames": ["01_oldest_tech.html"]},
    )
    assert sync_retry.status_code == 404


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


def test_async_unknown_preview_id_returns_404(client: TestClient) -> None:
    resp = client.post(
        "/api/medium-import/import/async/does-not-exist",
        json={"selected_filenames": ["foo.html"]},
    )
    assert resp.status_code == 404
    assert "expired" in resp.json()["detail"].lower()


def test_async_empty_selection_returns_400(client: TestClient) -> None:
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    resp = client.post(
        f"/api/medium-import/import/async/{preview['preview_id']}",
        json={"selected_filenames": []},
    )
    assert resp.status_code == 400
    # Cache stays intact for retry (mirrors the sync endpoint).
    retry = client.post(
        f"/api/medium-import/import/async/{preview['preview_id']}",
        json={"selected_filenames": ["01_oldest_tech.html"]},
    )
    assert retry.status_code == 202


def test_async_job_result_endpoint_returns_full_import_response(
    client: TestClient,
) -> None:
    """After ``stream_end`` arrives, the frontend fetches the full
    ImportZipResponse via ``GET /api/medium-import/jobs/{id}/result``
    (the existing generic /api/export/jobs/{id} polling endpoint
    doesn't surface the worker's structured return value)."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))
    with _fake_download_patch():
        started = _start_async_import(
            client, preview["preview_id"], ["01_oldest_tech.html"]
        )
        final = _poll_for_terminal_status(client, started["job_id"])
    assert final["status"] == "completed"

    result_resp = client.get(
        f"/api/medium-import/jobs/{started['job_id']}/result"
    )
    assert result_resp.status_code == 200
    body = result_resp.json()
    # Shape mirrors the sync /import/{preview_id} response - same
    # Pydantic model.
    assert body["imported_count"] == 1
    assert body["errored_count"] == 0
    assert body["skipped_count"] == 0
    assert len(body["imported"]) == 1
    assert body["imported"][0]["title"] == "Migrate a maven project to Gradle"


def test_async_job_result_endpoint_404_on_unknown_job(client: TestClient) -> None:
    resp = client.get("/api/medium-import/jobs/never-existed/result")
    assert resp.status_code == 404


def test_async_job_result_endpoint_409_when_not_completed(
    client: TestClient,
) -> None:
    """Mid-flight or failed jobs return 409 so the frontend can
    decide whether to retry-poll or surface an error. We force the
    failed case via the synthetic worker failure path."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))

    async def _exploding_import_zip(*args, **kwargs):  # noqa: ANN001, ANN002
        raise RuntimeError("synthetic worker failure")

    with patch(
        "bibliogon_medium_import.routes.import_zip", _exploding_import_zip
    ):
        started = _start_async_import(
            client, preview["preview_id"], ["01_oldest_tech.html"]
        )
        final = _poll_for_terminal_status(client, started["job_id"])
    assert final["status"] == "failed"

    resp = client.get(f"/api/medium-import/jobs/{started['job_id']}/result")
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "job_not_completed"
    assert detail["status"] == "failed"


def test_async_job_keeps_cache_on_worker_failure(client: TestClient) -> None:
    """When the worker raises, the job lands in FAILED and the
    preview_id stays usable so the user can retry without re-
    uploading. Mirrors the sync endpoint's failure contract."""
    preview = _post_preview(client, _build_zip(["01_oldest_tech.html"]))

    # Patch import_zip to raise. This fires inside the async worker
    # so the job_store wrapper catches it and flips the job to FAILED.
    async def _exploding_import_zip(*args, **kwargs):  # noqa: ANN001, ANN002
        raise RuntimeError("synthetic worker failure")

    with patch(
        "bibliogon_medium_import.routes.import_zip", _exploding_import_zip
    ):
        started = _start_async_import(
            client, preview["preview_id"], ["01_oldest_tech.html"]
        )
        final = _poll_for_terminal_status(client, started["job_id"])

    assert final["status"] == "failed"
    assert "synthetic worker failure" in (final.get("error") or "")

    # Preview cache still alive: a sync retry against the same
    # preview_id succeeds with 200 (cache was NOT reaped on failure).
    with _fake_download_patch():
        retry = client.post(
            f"/api/medium-import/import/{preview['preview_id']}",
            json={"selected_filenames": ["01_oldest_tech.html"]},
        )
    assert retry.status_code == 200
