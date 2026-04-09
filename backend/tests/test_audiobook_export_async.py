"""Regression tests for the asynchronous audiobook export contract.

These tests exist because the audiobook export silently regressed back
to a synchronous response that gave no progress feedback. They lock in
that:

1. The legacy ``GET /api/books/{id}/export/audiobook`` route returns
   HTTP 410 - audiobook export is async only.
2. ``POST /api/books/{id}/export/async/audiobook`` returns a job_id
   and the job actually carries progress events as it runs.
3. The job_store records ``start``, ``chapter_done``, ``done`` events
   and folds them into the ``progress`` dict the polling endpoint
   exposes.

Edge TTS is patched - we never make a real network call. The tests use
``with TestClient(app)`` so the FastAPI lifespan handler runs and the
plugin manager actually mounts the export router (without that, the
export routes are 404 in tests).
"""

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.job_store import JobStatus, job_store
from app.main import app


@pytest.fixture(scope="module")
def client():
    """Module-scoped client whose lifespan triggers plugin discovery."""
    with TestClient(app) as c:
        yield c


def _create_book_with_chapters(client: TestClient, n: int = 3) -> str:
    r = client.post("/api/books", json={"title": "Audio Async Test", "author": "T"})
    assert r.status_code == 201
    book_id = r.json()["id"]
    for i in range(n):
        client.post(
            f"/api/books/{book_id}/chapters",
            json={
                "title": f"Chapter {i + 1}",
                "content": json.dumps({
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": f"Body {i + 1}."}],
                    }],
                }),
                "chapter_type": "chapter",
            },
        )
    return book_id


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


async def _wait_for_job_async(job_id: str, timeout: float = 5.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        job = job_store.get(job_id)
        if job is None:
            return
        if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
            return
        if asyncio.get_event_loop().time() > deadline:
            raise TimeoutError(f"Job {job_id} did not finish in {timeout}s")
        await asyncio.sleep(0.05)


def _wait_for_job(job_id: str, timeout: float = 5.0) -> None:
    """Block until the job leaves the running state.

    Runs the wait coroutine on a fresh event loop so it works whether
    or not pytest already has one active.
    """
    asyncio.new_event_loop().run_until_complete(_wait_for_job_async(job_id, timeout))


def _fake_tts_engine() -> AsyncMock:
    """An AsyncMock TTS engine whose synthesize() writes a tiny placeholder."""
    async def fake_synth(text, output_path, voice="", language="de", rate=""):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"fake mp3")

    engine = AsyncMock()
    engine.synthesize = fake_synth
    return engine


# --- The regression guard the user explicitly asked for ---


def test_sync_audiobook_route_returns_410(client):
    """The synchronous GET route must NEVER hand back an MP3.

    Audiobook generation can take minutes; doing it on the request thread
    is the bug we are guarding against. The endpoint must respond with
    410 Gone and tell the caller to use the async path.
    """
    book_id = _create_book_with_chapters(client, 1)
    try:
        r = client.get(f"/api/books/{book_id}/export/audiobook")
        assert r.status_code == 410
        body = r.json()
        assert "async" in body["detail"].lower()
        assert "/export/async/audiobook" in body["detail"]
    finally:
        _cleanup(client, book_id)


def test_async_audiobook_returns_job_id_not_file(client):
    """POST starts a job and returns a job_id, not the binary."""
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_tts_engine()):
            r = client.post(f"/api/books/{book_id}/export/async/audiobook")
            assert r.status_code == 200
            body = r.json()
            assert "job_id" in body
            assert body["status"] == "pending"
    finally:
        _cleanup(client, book_id)


def test_async_audiobook_job_emits_progress_events(client):
    """A finished job must have start + per-chapter + done in its event log."""
    book_id = _create_book_with_chapters(client, 2)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_tts_engine()):
            r = client.post(f"/api/books/{book_id}/export/async/audiobook")
            job_id = r.json()["job_id"]

            _wait_for_job(job_id)

            job = job_store.get(job_id)
            assert job is not None
            assert job.status == JobStatus.COMPLETED, f"Job error: {job.error}"

            event_types = [e["type"] for e in job.events]
            assert "start" in event_types
            assert event_types.count("chapter_start") == 2
            assert event_types.count("chapter_done") == 2
            assert "done" in event_types
            assert "ready" in event_types
            assert event_types[-1] == "stream_end"

            assert job.progress["total_chapters"] == 2
            assert job.progress["current_chapter"] == 2
    finally:
        _cleanup(client, book_id)


def test_polling_endpoint_exposes_progress_and_events(client):
    """GET /api/export/jobs/{id} returns progress + recent events for pollers."""
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_tts_engine()):
            job_id = client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"]
            _wait_for_job(job_id)

            r = client.get(f"/api/export/jobs/{job_id}")
            assert r.status_code == 200
            body = r.json()
            assert body["status"] == "completed"
            assert body["progress"]["total_chapters"] == 1
            assert isinstance(body["events"], list)
            assert any(e["type"] == "start" for e in body["events"])
            assert "download_url" in body
    finally:
        _cleanup(client, book_id)


def test_sse_stream_yields_events_then_stream_end(client):
    """The SSE endpoint must replay events and end with stream_end."""
    book_id = _create_book_with_chapters(client, 2)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_tts_engine()):
            job_id = client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"]
            _wait_for_job(job_id)

            with client.stream("GET", f"/api/export/jobs/{job_id}/stream") as response:
                assert response.status_code == 200
                assert "text/event-stream" in response.headers["content-type"]

                events: list[dict] = []
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        events.append(json.loads(line[len("data: "):]))

            event_types = [e["type"] for e in events]
            assert "start" in event_types
            assert "chapter_done" in event_types
            assert "ready" in event_types
            assert event_types[-1] == "stream_end"
    finally:
        _cleanup(client, book_id)


def test_sse_stream_unknown_job_returns_404(client):
    r = client.get("/api/export/jobs/does-not-exist/stream")
    assert r.status_code == 404
