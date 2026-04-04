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

    async def mock_task():
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

    async def failing_task():
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
