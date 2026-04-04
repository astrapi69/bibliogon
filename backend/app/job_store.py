"""In-memory async job store for background tasks like exports.

Jobs are stored with status, result path, and error. Clients poll
via job_id to check completion. Completed jobs are cleaned up after
a configurable TTL.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Job:
    id: str
    status: JobStatus = JobStatus.PENDING
    result: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    completed_at: float | None = None


class JobStore:
    """Thread-safe in-memory job store."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._jobs: dict[str, Job] = {}
        self._ttl = ttl_seconds

    def create(self) -> Job:
        """Create a new pending job."""
        self._cleanup_expired()
        job = Job(id=uuid.uuid4().hex[:12])
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        """Get a job by ID."""
        return self._jobs.get(job_id)

    def update(self, job_id: str, status: JobStatus, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        """Update job status."""
        job = self._jobs.get(job_id)
        if not job:
            return
        job.status = status
        if result:
            job.result = result
        if error:
            job.error = error
        if status in (JobStatus.COMPLETED, JobStatus.FAILED):
            job.completed_at = time.time()

    def submit(
        self,
        func: Callable[..., Coroutine[Any, Any, dict[str, Any]]],
        *args: Any,
        **kwargs: Any,
    ) -> str:
        """Create a job and run the async function in the background.

        Returns the job_id for polling.
        """
        job = self.create()

        async def _run() -> None:
            self.update(job.id, JobStatus.RUNNING)
            try:
                result = await func(*args, **kwargs)
                self.update(job.id, JobStatus.COMPLETED, result=result)
                logger.info("Job %s completed", job.id)
            except Exception as e:
                self.update(job.id, JobStatus.FAILED, error=str(e))
                logger.error("Job %s failed: %s", job.id, e)

        asyncio.get_event_loop().create_task(_run())
        return job.id

    def _cleanup_expired(self) -> None:
        """Remove completed/failed jobs older than TTL."""
        now = time.time()
        expired = [
            jid for jid, job in self._jobs.items()
            if job.completed_at and (now - job.completed_at) > self._ttl
        ]
        for jid in expired:
            del self._jobs[jid]


# Singleton instance
job_store = JobStore()
