"""Tests for the async job store."""

import asyncio
import time

import pytest

from app.job_store import Job, JobStatus, JobStore


def test_create_job():
    store = JobStore()
    job = store.create()
    assert job.id
    assert job.status == JobStatus.PENDING
    assert job.error is None


def test_get_job():
    store = JobStore()
    job = store.create()
    found = store.get(job.id)
    assert found is not None
    assert found.id == job.id


def test_get_nonexistent():
    store = JobStore()
    assert store.get("nonexistent") is None


def test_update_status():
    store = JobStore()
    job = store.create()
    store.update(job.id, JobStatus.RUNNING)
    assert store.get(job.id).status == JobStatus.RUNNING

    store.update(job.id, JobStatus.COMPLETED, result={"path": "/tmp/test.epub"})
    j = store.get(job.id)
    assert j.status == JobStatus.COMPLETED
    assert j.result["path"] == "/tmp/test.epub"
    assert j.completed_at is not None


def test_update_failed():
    store = JobStore()
    job = store.create()
    store.update(job.id, JobStatus.FAILED, error="Pandoc crashed")
    j = store.get(job.id)
    assert j.status == JobStatus.FAILED
    assert j.error == "Pandoc crashed"


def test_cleanup_expired():
    store = JobStore(ttl_seconds=0)  # Immediate expiry
    job = store.create()
    store.update(job.id, JobStatus.COMPLETED)
    # Force completed_at to be in the past
    store.get(job.id).completed_at = time.time() - 1

    # Creating a new job triggers cleanup
    store.create()
    assert store.get(job.id) is None


def test_pending_jobs_not_cleaned():
    store = JobStore(ttl_seconds=0)
    job = store.create()  # pending, no completed_at
    store.create()  # triggers cleanup
    assert store.get(job.id) is not None  # still there


def test_submit_runs_async():
    store = JobStore()

    async def mock_task(job_id: str):
        return {"path": "/tmp/result.pdf", "filename": "book.pdf"}

    loop = asyncio.new_event_loop()

    async def run():
        job_id = store.submit(mock_task)
        assert job_id
        # Give the task time to complete
        await asyncio.sleep(0.1)
        job = store.get(job_id)
        assert job.status == JobStatus.COMPLETED
        assert job.result["filename"] == "book.pdf"

    loop.run_until_complete(run())
    loop.close()


def test_submit_handles_failure():
    store = JobStore()

    async def failing_task(job_id: str):
        raise RuntimeError("Export failed")

    loop = asyncio.new_event_loop()

    async def run():
        job_id = store.submit(failing_task)
        await asyncio.sleep(0.1)
        job = store.get(job_id)
        assert job.status == JobStatus.FAILED
        assert "Export failed" in job.error

    loop.run_until_complete(run())
    loop.close()


# --- Event streaming ---


def test_publish_event_appends_and_folds_progress():
    store = JobStore()
    job = store.create()

    store.publish_event(job.id, "start", {"total": 5, "book_title": "Test"})
    store.publish_event(job.id, "chapter_start", {"index": 1, "title": "Ch 1"})
    store.publish_event(job.id, "chapter_done", {"index": 1, "title": "Ch 1", "filename": "001.mp3"})
    store.publish_event(job.id, "chapter_error", {"index": 2, "title": "Ch 2", "error": "tts down"})

    j = store.get(job.id)
    assert len(j.events) == 4
    assert j.progress["total_chapters"] == 5
    assert j.progress["current_chapter"] == 2
    assert j.progress["current_title"] == "Ch 1"
    assert j.progress["last_event"] == "chapter_error"
    assert j.progress["errors"] == 1


def test_publish_event_unknown_job_is_noop():
    store = JobStore()
    # Must not raise
    store.publish_event("does-not-exist", "start", {})


def test_subscribe_replays_events_then_exits_on_terminal():
    store = JobStore()

    async def run():
        job = store.create()
        store.publish_event(job.id, "start", {"total": 2})
        store.publish_event(job.id, "chapter_done", {"index": 1})

        async def producer():
            await asyncio.sleep(0.01)
            store.publish_event(job.id, "chapter_done", {"index": 2})
            await asyncio.sleep(0.01)
            store.update(job.id, JobStatus.COMPLETED, result={"path": "/x"})

        producer_task = asyncio.create_task(producer())

        collected: list[dict] = []
        async for event in store.subscribe(job.id):
            collected.append(event)

        await producer_task
        types = [e["type"] for e in collected]
        # The two events that were published before subscribe must replay
        assert types[0] == "start"
        assert types[1] == "chapter_done"
        assert "stream_end" in types
        # stream_end is always last
        assert types[-1] == "stream_end"

    asyncio.new_event_loop().run_until_complete(run())


def test_subscribe_unknown_job_yields_nothing():
    store = JobStore()

    async def run():
        events = [e async for e in store.subscribe("missing")]
        assert events == []

    asyncio.new_event_loop().run_until_complete(run())


def test_subscribe_cleanup_removes_subscriber():
    """Disconnect mid-stream must remove the notify Event from the job."""
    from contextlib import aclosing

    store = JobStore()

    async def run():
        job = store.create()

        async def consume():
            # aclosing() guarantees the generator's finally runs - mirrors
            # how Starlette closes the SSE generator when the client
            # disconnects.
            async with aclosing(store.subscribe(job.id)) as gen:
                async for _ in gen:
                    break  # disconnect after first event

        store.publish_event(job.id, "start", {"total": 1})
        await consume()
        # Subscriber list must be back to empty
        assert store.get(job.id)._subscribers == []

    asyncio.new_event_loop().run_until_complete(run())
