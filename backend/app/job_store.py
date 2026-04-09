"""In-memory async job store with progress event streaming.

Long-running exports (Audiobook above all) need per-step progress, not
just a binary pending->completed flip. Each ``Job`` carries:

- ``events`` - an append-only log so a late subscriber can replay
- ``progress`` - a small dict updated as known events arrive
  (``current_chapter``, ``total_chapters``, ``last_event``)
- one ``asyncio.Event`` per active subscriber so the SSE generator
  wakes up exactly when there is new data

Clients reach the events through:

1. ``job_store.subscribe(job_id)`` async generator (used by the SSE
   endpoint), which yields every event in order and exits cleanly when
   the synthetic ``stream_end`` event is published by ``update()``.
2. ``GET /api/export/jobs/{id}`` for polling-based fallbacks; the
   response includes the ``progress`` dict and recent events.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator, Awaitable, Callable

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
    # Progress / event-streaming state
    progress: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    _subscribers: list[asyncio.Event] = field(default_factory=list, repr=False)


JobRunner = Callable[[str], Awaitable[dict[str, Any]]]


class JobStore:
    """Thread-safe in-memory job store with event streaming."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._jobs: dict[str, Job] = {}
        self._ttl = ttl_seconds

    # --- Lifecycle ---

    def create(self) -> Job:
        """Create a new pending job."""
        self._cleanup_expired()
        job = Job(id=uuid.uuid4().hex[:12])
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        status: JobStatus,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        """Update job status and notify subscribers on terminal transitions.

        When the status flips to COMPLETED or FAILED a synthetic
        ``stream_end`` event is appended so SSE subscribers wake, drain
        and exit cleanly.
        """
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
            job.events.append({
                "type": "stream_end",
                "data": {"status": status.value, "error": error},
            })
            self._wake_subscribers(job)

    def submit(
        self,
        func: JobRunner,
        *args: Any,
        **kwargs: Any,
    ) -> str:
        """Create a job and run the async function in the background.

        ``func`` MUST accept ``job_id`` as its first positional argument
        so it can publish progress events with ``publish_event(job_id, ...)``.
        """
        job = self.create()
        job_id = job.id

        async def _wrap() -> None:
            self.update(job_id, JobStatus.RUNNING)
            try:
                result = await func(job_id, *args, **kwargs)
                self.update(job_id, JobStatus.COMPLETED, result=result)
                logger.info("Job %s completed", job_id)
            except Exception as e:
                self.update(job_id, JobStatus.FAILED, error=str(e))
                logger.exception("Job %s failed", job_id)

        asyncio.create_task(_wrap())
        return job_id

    # --- Event streaming ---

    def publish_event(self, job_id: str, event_type: str, data: dict[str, Any]) -> None:
        """Append an event to the job log and wake all subscribers.

        Also folds well-known event types into the ``progress`` dict so
        plain pollers (no SSE) get a useful summary without parsing the
        full event log.
        """
        job = self._jobs.get(job_id)
        if not job:
            return
        event = {"type": event_type, "data": data}
        job.events.append(event)
        self._fold_progress(job, event_type, data)
        self._wake_subscribers(job)

    async def subscribe(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        """Async-iterate every event for a job, including replay from start.

        Yields each event exactly once. Returns cleanly when the
        synthetic ``stream_end`` event is observed (published by
        ``update()`` on terminal status). The subscriber's notify-Event
        is removed in the ``finally`` so client disconnects do not leak.
        """
        job = self._jobs.get(job_id)
        if not job:
            return

        notify = asyncio.Event()
        job._subscribers.append(notify)
        try:
            seen = 0
            while True:
                while seen < len(job.events):
                    event = job.events[seen]
                    seen += 1
                    yield event
                    if event["type"] == "stream_end":
                        return
                # Backstop: status went terminal but no stream_end was emitted
                # (should not happen in practice; defensive only).
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED):
                    return
                await notify.wait()
                notify.clear()
        finally:
            try:
                job._subscribers.remove(notify)
            except ValueError:
                pass

    # --- Internal helpers ---

    def _wake_subscribers(self, job: Job) -> None:
        for sub in job._subscribers:
            sub.set()

    def _fold_progress(self, job: Job, event_type: str, data: dict[str, Any]) -> None:
        """Mirror selected event payloads into the ``progress`` dict.

        Keys exposed:
            total_chapters    - set on ``start``
            current_chapter   - last finished/skipped chapter index
            current_title     - last touched chapter title
            last_event        - the most recent event type
            errors            - count of chapter_error events
        """
        job.progress["last_event"] = event_type
        if event_type == "start":
            job.progress["total_chapters"] = data.get("total", 0)
            job.progress["current_chapter"] = 0
            job.progress.setdefault("errors", 0)
        elif event_type == "chapter_start":
            job.progress["current_title"] = data.get("title", "")
        elif event_type == "chapter_done" or event_type == "chapter_skipped":
            job.progress["current_chapter"] = data.get("index", job.progress.get("current_chapter", 0))
        elif event_type == "chapter_error":
            job.progress["current_chapter"] = data.get("index", job.progress.get("current_chapter", 0))
            job.progress["errors"] = job.progress.get("errors", 0) + 1

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
