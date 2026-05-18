"""Plugin-only unit tests for the v2 preview pipeline.

Backend-integration tests live under
``backend/tests/test_medium_import_preview.py`` and exercise the
three new endpoints with a real TestClient + lifespan. The tests
here focus on the parts that don't need the backend:

  * Preview-cache lifecycle (store / load / delete / TTL eviction).
  * ``import_zip(selected_filenames=...)`` filtering.

The cache uses ``app.paths.get_data_dir()`` lazily inside its
method calls, so plugin-only test runs that don't have the backend
on sys.path would normally trip the import. We monkey-patch
``preview.PreviewCache._cache_dir`` to a tmp_path here so the
cache lifecycle remains testable in isolation. ``import_zip``
itself never touches the cache so its tests don't need that
shim.
"""

from __future__ import annotations

import asyncio
import io
import time
import zipfile
from pathlib import Path

import pytest

from bibliogon_medium_import.importer import import_zip
from bibliogon_medium_import.preview import PreviewCache

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _build_zip(filenames: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in filenames:
            zf.writestr(f"posts/{name}", (FIXTURES_DIR / name).read_bytes())
    return buf.getvalue()


# ---------------------------------------------------------------------------
# PreviewCache lifecycle
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> PreviewCache:
    """A PreviewCache whose ``_cache_dir`` resolves to ``tmp_path``.

    Avoids the lazy ``app.paths.get_data_dir`` import that the
    real method uses — plugin-only test runs don't have the
    backend on sys.path."""
    cache = PreviewCache(ttl_seconds=60)
    target = tmp_path / "previews"
    target.mkdir()
    monkeypatch.setattr(cache, "_cache_dir", lambda: target)
    return cache


def test_cache_store_returns_uuid_and_persists_bytes(tmp_cache: PreviewCache) -> None:
    payload = b"PK\x03\x04\x00\x00 fake zip"
    preview_id = tmp_cache.store(payload)
    assert isinstance(preview_id, str) and preview_id
    assert tmp_cache.load(preview_id) == payload


def test_cache_load_unknown_id_returns_none(tmp_cache: PreviewCache) -> None:
    assert tmp_cache.load("does-not-exist") is None


def test_cache_delete_removes_file_and_returns_true(tmp_cache: PreviewCache) -> None:
    preview_id = tmp_cache.store(b"payload")
    assert tmp_cache.delete(preview_id) is True
    assert tmp_cache.load(preview_id) is None
    # Second delete is a no-op (already gone) — returns False.
    assert tmp_cache.delete(preview_id) is False


def test_cache_load_evicts_expired_entry(tmp_path: Path, monkeypatch) -> None:
    """An expired entry loaded once must be deleted from disk
    even though the load itself returns None."""
    cache = PreviewCache(ttl_seconds=0.05)
    target = tmp_path / "previews"
    target.mkdir()
    monkeypatch.setattr(cache, "_cache_dir", lambda: target)

    preview_id = cache.store(b"payload")
    cached_path = target / f"{preview_id}.zip"
    assert cached_path.exists()

    time.sleep(0.2)
    assert cache.load(preview_id) is None
    # The opportunistic reap inside load() must have unlinked the file.
    assert not cached_path.exists()


def test_cache_reap_expired_removes_only_stale_entries(
    tmp_path: Path, monkeypatch
) -> None:
    cache = PreviewCache(ttl_seconds=0.05)
    target = tmp_path / "previews"
    target.mkdir()
    monkeypatch.setattr(cache, "_cache_dir", lambda: target)

    old_id = cache.store(b"old")
    time.sleep(0.2)
    fresh_id = cache.store(b"fresh")

    reaped = cache.reap_expired()
    assert reaped == 1
    assert cache.load(old_id) is None
    assert cache.load(fresh_id) == b"fresh"


def test_cache_expires_at_returns_zero_for_unknown_id(tmp_cache: PreviewCache) -> None:
    assert tmp_cache.expires_at("never-stored") == 0.0


def test_cache_expires_at_is_in_the_future(tmp_cache: PreviewCache) -> None:
    preview_id = tmp_cache.store(b"x")
    expires = tmp_cache.expires_at(preview_id)
    assert expires > time.time()


# ---------------------------------------------------------------------------
# import_zip(selected_filenames=...) selection plumbing
# ---------------------------------------------------------------------------


def test_import_zip_none_keeps_legacy_import_everything() -> None:
    """The default ``selected_filenames=None`` must keep the v1
    behaviour — every post in the ZIP gets processed. The backend
    DB writes fail in plugin-only test runs (no SessionLocal), so
    we observe the no-op path by passing a ZIP with no posts; the
    return is an empty ImportResult and that's enough to pin the
    contract.

    ``import_zip`` is async since ASYNC-IMPORT-PROGRESS-01 commit 1;
    we wrap with ``asyncio.run`` to keep these tests pytest-asyncio-
    free (plugin's dev-deps don't include pytest-asyncio)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("posts/", b"")  # dir entry only; no posts inside

    result = asyncio.run(import_zip(buf.getvalue(), selected_filenames=None))
    # No posts in the ZIP -> empty result, no crash.
    assert result.imported == []
    assert result.skipped == []
    assert result.errored == []


def test_import_zip_empty_selection_short_circuits_to_empty_result() -> None:
    """When the selection is the empty set, no post is processed
    regardless of how many are in the ZIP. Documented short-circuit
    branch added in MEDIUM-IMPORT-V2-01 commit 1."""
    zip_bytes = _build_zip(["01_oldest_tech.html"])
    result = asyncio.run(import_zip(zip_bytes, selected_filenames=set()))
    assert result.imported == []
    assert result.skipped == []
    assert result.errored == []


def test_import_zip_filters_to_only_matching_filenames() -> None:
    """Selection contains one of two ZIP entries — only the matching
    file is processed. We can't actually persist articles in a
    plugin-only run (no DB), so we trip the importer's own error
    path: the matching file's import lands in ``errored`` (DB
    import error wrapped per the file-level try/except), and the
    UNSELECTED file does NOT appear in ANY of the result lists.

    What the test pins: the unselected filename never shows up.
    What it does not pin: success of the matching import (that's
    covered by the backend-integration test file).
    """
    zip_bytes = _build_zip(
        ["01_oldest_tech.html", "02_german_philosophical.html"]
    )
    result = asyncio.run(
        import_zip(
            zip_bytes,
            selected_filenames={"01_oldest_tech.html"},
        )
    )
    all_filenames = (
        {a.canonical_url for a in result.imported}
        | {s.filename for s in result.skipped}
        | {e.filename for e in result.errored}
    )
    assert "02_german_philosophical.html" not in all_filenames


def test_import_zip_selection_unknown_filename_processes_nothing() -> None:
    """A selection that names a file NOT in the ZIP filters the
    work list down to empty — same short-circuit as the empty-set
    case. No error, no crash."""
    zip_bytes = _build_zip(["01_oldest_tech.html"])
    result = asyncio.run(
        import_zip(
            zip_bytes,
            selected_filenames={"ghost.html"},
        )
    )
    assert result.imported == []
    assert result.skipped == []
    assert result.errored == []


# ---------------------------------------------------------------------------
# ASYNC-IMPORT-PROGRESS-01: progress_callback emission patterns
# ---------------------------------------------------------------------------


def test_import_zip_progress_callback_fires_start_and_done_on_empty_archive() -> None:
    """Even an empty/no-match archive emits ``start`` + ``done`` so
    the SSE subscriber gets a clean lifecycle and doesn't hang."""
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("posts/", b"")

    asyncio.run(import_zip(buf.getvalue(), progress_callback=cb))

    types = [e[0] for e in events]
    assert types == ["start", "done"]
    assert events[0][1] == {"total": 0}
    assert events[1][1]["imported_count"] == 0


def test_import_zip_progress_callback_emits_post_start_per_file() -> None:
    """Two ZIP entries -> two ``post_start`` events between the
    ``start`` and ``done`` events. The post outcome events
    (``post_errored`` in this plugin-only test because DB writes
    fail) follow each ``post_start``."""
    events: list[tuple[str, dict]] = []

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    zip_bytes = _build_zip(["01_oldest_tech.html", "02_german_philosophical.html"])
    asyncio.run(import_zip(zip_bytes, progress_callback=cb))

    types = [e[0] for e in events]
    assert types[0] == "start"
    assert types[-1] == "done"
    # Two post_start events, each followed by a per-post outcome.
    assert types.count("post_start") == 2
    # In plugin-only runs DB writes fail; both posts land in errored.
    assert types.count("post_errored") == 2

    # post_start payload shape.
    post_starts = [e[1] for e in events if e[0] == "post_start"]
    assert post_starts[0]["index"] == 1
    assert post_starts[0]["total"] == 2
    assert post_starts[0]["filename"] == "01_oldest_tech.html"
    assert post_starts[1]["index"] == 2


def test_import_zip_progress_callback_is_optional_no_op_when_none() -> None:
    """Passing ``progress_callback=None`` (the default) must run the
    full pipeline silently — no events emitted, no errors. This pins
    the v1 + sync-v2 endpoints' behaviour, which don't pass a
    callback."""
    zip_bytes = _build_zip(["01_oldest_tech.html"])
    # No raise, no observable side-effect; just runs through.
    result = asyncio.run(import_zip(zip_bytes))
    # The legacy "everything imports" path was exercised. In a
    # plugin-only run the DB writes fail, so the file lands in
    # errored. The contract here is just "didn't crash with no
    # callback".
    assert len(result.errored) == 1


def test_import_zip_progress_callback_failures_do_not_kill_import() -> None:
    """A broken subscriber must NEVER abort a real import. Mirrors
    the audiobook generator's defensive callback wrapping
    (lessons-learned: 'Generator callbacks must never kill the
    export')."""
    raised: list[str] = []

    async def broken_cb(event_type: str, _payload: dict) -> None:
        raised.append(event_type)
        raise RuntimeError(f"sub broke on {event_type}")

    zip_bytes = _build_zip(["01_oldest_tech.html"])
    result = asyncio.run(import_zip(zip_bytes, progress_callback=broken_cb))

    # Every event the orchestrator tried to fire reached the
    # callback (which then raised; the importer swallowed it).
    assert "start" in raised
    assert "post_start" in raised
    assert "done" in raised
    # The import still ran to completion - the file's outcome lands
    # in errored from the DB-import failure, NOT from the callback.
    assert len(result.errored) == 1


def test_import_zip_cooperative_cancellation_stops_between_posts() -> None:
    """``asyncio.sleep(0)`` between posts is the cancellation
    yield-point. When the surrounding task is cancelled, the loop
    raises CancelledError on the next iteration and no further
    posts run.

    Setup: create a 2-post import and cancel the task itself via
    the callback's first ``post_start`` event. The
    cooperative-cancel yield-point fires before the SECOND
    iteration, so we observe only ONE post_start.
    """
    events: list[tuple[str, dict]] = []
    cancel_handle: dict[str, asyncio.Task | None] = {"task": None}

    async def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))
        # Cancel ourselves the moment the first post_start fires.
        if event_type == "post_start" and payload.get("index") == 1:
            task = cancel_handle["task"]
            if task is not None:
                task.cancel()

    async def runner() -> None:
        zip_bytes = _build_zip(
            ["01_oldest_tech.html", "02_german_philosophical.html"]
        )
        await import_zip(zip_bytes, progress_callback=cb)

    async def main() -> None:
        task = asyncio.create_task(runner())
        cancel_handle["task"] = task
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(main())

    types = [e[0] for e in events]
    # Exactly one post_start fired before cancellation stopped the loop.
    assert types.count("post_start") == 1
    # The cancellation interrupted before ``done`` could fire.
    assert "done" not in types
