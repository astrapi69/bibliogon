"""Tests for the per-book audiobook skip-chapter-types feature.

Covers the migration of the former plugin-global ``audiobook.settings.skip_types``
list to ``Book.audiobook_skip_chapter_types``: PATCH round-trip, async export
job filtering, and the dry-run cost-estimation endpoint.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.job_store import JobStatus, job_store
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str = "Skip Test") -> str:
    r = client.post("/api/books", json={"title": title, "author": "T"})
    assert r.status_code in (200, 201)
    return r.json()["id"]


def _add_chapter(client: TestClient, book_id: str, title: str, ch_type: str) -> str:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={
            "title": title,
            "content": json.dumps({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": f"Body of {title}."}],
                }],
            }),
            "chapter_type": ch_type,
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def _fake_engine() -> AsyncMock:
    async def fake_synth(text, output_path, voice="", language="de", rate=""):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"fake mp3")

    engine = AsyncMock()
    engine.synthesize = fake_synth
    return engine


def _wait(job_id: str, timeout: float = 5.0) -> None:
    import asyncio
    terminal = (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)

    async def _w():
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while True:
            job = job_store.get(job_id)
            if job is None or job.status in terminal:
                return
            if loop.time() > deadline:
                raise TimeoutError(f"Job {job_id} did not finish")
            await asyncio.sleep(0.05)

    asyncio.run(_w())


# --- PATCH round-trip ---


def test_patch_skip_chapter_types_round_trip(client, tmp_path, monkeypatch):
    """PATCH stores the list and GET returns it as a typed array."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        r = client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": ["toc", "imprint", "endnotes"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert sorted(body["audiobook_skip_chapter_types"]) == ["endnotes", "imprint", "toc"]

        fetched = client.get(f"/api/books/{book_id}").json()
        assert sorted(fetched["audiobook_skip_chapter_types"]) == ["endnotes", "imprint", "toc"]
    finally:
        _cleanup(client, book_id)


def test_patch_empty_skip_list_clears_overrides(client, tmp_path, monkeypatch):
    """An explicit empty list means 'fall back to the generator default'."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": ["toc"]},
        )
        r = client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": []},
        )
        assert r.status_code == 200
        assert r.json()["audiobook_skip_chapter_types"] == []
    finally:
        _cleanup(client, book_id)


# --- Async export honours per-book skip list ---


def test_async_export_filters_by_book_skip_list(client, tmp_path, monkeypatch):
    """When the book sets skip_chapter_types, only non-skipped chapters synth."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        _add_chapter(client, book_id, "TOC", "toc")
        _add_chapter(client, book_id, "Vorwort", "preface")
        _add_chapter(client, book_id, "Kapitel 1", "chapter")
        _add_chapter(client, book_id, "Impressum", "imprint")

        client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": ["toc", "imprint"]},
        )

        synth_calls: list[str] = []

        async def counting_synth(text, output_path, voice="", language="de", rate=""):
            synth_calls.append(text)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_bytes(b"fake mp3")

        engine = AsyncMock()
        engine.synthesize = counting_synth

        with patch("bibliogon_audiobook.generator.get_engine", return_value=engine):
            job_id = client.post(
                f"/api/books/{book_id}/export/async/audiobook",
            ).json()["job_id"]
            _wait(job_id)

        # Two chapters should have been synthesised: preface + chapter.
        # Both TOC and Imprint must be absent from the synth calls.
        assert len(synth_calls) == 2
        joined = "\n".join(synth_calls)
        assert "Vorwort" in joined
        assert "Kapitel 1" in joined
        assert "TOC" not in joined
        assert "Impressum" not in joined
    finally:
        _cleanup(client, book_id)


def test_async_export_empty_skip_list_uses_generator_default(client, tmp_path, monkeypatch):
    """An empty per-book list falls through to the built-in SKIP_TYPES.

    The generator default skips toc/imprint/index/bibliography/endnotes,
    so a book with one toc chapter and one regular chapter only emits
    one synthesize call when the per-book list is empty.
    """
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        _add_chapter(client, book_id, "TOC", "toc")
        _add_chapter(client, book_id, "Kapitel 1", "chapter")

        client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": []},
        )

        synth_calls: list[str] = []

        async def counting_synth(text, output_path, voice="", language="de", rate=""):
            synth_calls.append(text)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_bytes(b"fake mp3")

        engine = AsyncMock()
        engine.synthesize = counting_synth

        with patch("bibliogon_audiobook.generator.get_engine", return_value=engine):
            job_id = client.post(
                f"/api/books/{book_id}/export/async/audiobook",
            ).json()["job_id"]
            _wait(job_id)

        assert len(synth_calls) == 1
        assert "Kapitel 1" in synth_calls[0]
    finally:
        _cleanup(client, book_id)


# --- Dry-run endpoint reads per-book column ---


def test_dry_run_uses_per_book_skip_list(client, tmp_path, monkeypatch):
    """Dry-run picks the first chapter that the per-book skip list does NOT skip."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book(client)
    try:
        # First chapter is toc (would be skipped by default), second is preface.
        _add_chapter(client, book_id, "TOC", "toc")
        _add_chapter(client, book_id, "Vorwort", "preface")

        # Set the per-book skip list to ALSO include preface, so the dry-run
        # has to fall further down. We add a real chapter as the third.
        _add_chapter(client, book_id, "Kapitel 1", "chapter")
        client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_skip_chapter_types": ["toc", "preface"]},
        )

        sample_seen: list[str] = []

        async def capturing_synth(text, output_path, voice="", language="de", rate=""):
            sample_seen.append(text)
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_bytes(b"fake mp3")

        engine = AsyncMock()
        engine.synthesize = capturing_synth

        with patch("bibliogon_audiobook.tts_engine.get_engine", return_value=engine):
            r = client.post(f"/api/books/{book_id}/audiobook/dry-run")
        assert r.status_code == 200, r.text

        # The sample text should come from "Kapitel 1" (the only non-skipped
        # chapter under the per-book list), NOT from preface.
        assert sample_seen, "synthesize() should have been called"
        assert "Kapitel 1" in sample_seen[0]
        assert "Vorwort" not in sample_seen[0]
    finally:
        _cleanup(client, book_id)
