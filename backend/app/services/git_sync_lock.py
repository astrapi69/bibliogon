"""Per-book commit lock shared by core git and plugin-git-sync.

A book may have **both** core git (``uploads/{book_id}/.git``,
managed by ``app.services.git_backup``) and plugin-git-sync
(``uploads/git-sync/{book_id}/repo``, managed by
``app.services.git_sync_commit``) enabled at the same time.
PGS-05 wires a single user-facing "Commit everywhere" action
that fans out to both. Without a lock the two endpoints could
race - the user clicks core-git's commit button at the same
time as plugin-git-sync's, both grab the same DB rows, and
write inconsistent snapshots into the two histories.

The lock is intentionally in-process. Bibliogon ships with a
single uvicorn worker against a single SQLite file, so a
threading.Lock is sufficient. If the deployment ever moves to
multiple workers, swap this for a fasteners ``InterProcessLock``
on a sidecar file - the public API doesn't change.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager

# Module-level registry: one Lock per book_id. We intentionally
# never delete entries - locks are tiny, books are bounded, and
# popping while another thread is awaiting the lock is a class
# of bug we don't need.
_locks: dict[str, threading.Lock] = {}
_registry_lock = threading.Lock()


def _get_lock(book_id: str) -> threading.Lock:
    with _registry_lock:
        lock = _locks.get(book_id)
        if lock is None:
            lock = threading.Lock()
            _locks[book_id] = lock
        return lock


@contextmanager
def book_commit_lock(book_id: str, *, timeout: float = 30.0) -> Iterator[None]:
    """Acquire the per-book commit lock for the duration of the
    ``with`` block. Raises :class:`TimeoutError` if the lock can't
    be obtained within ``timeout`` seconds.

    The 30-second default is intentionally short. Commit-to-repo
    flows include a re-scaffold + git commit and rarely need more
    than a few seconds; if a request stalls past 30s the worker
    is most likely wedged and rejecting follow-up requests with
    503 is the correct user signal.
    """
    lock = _get_lock(book_id)
    acquired = lock.acquire(timeout=timeout)
    if not acquired:
        raise TimeoutError(f"git commit lock for book {book_id} held by another request")
    try:
        yield
    finally:
        lock.release()
