"""End-to-end tests for the persistent audiobook storage routes.

Covers the second half of the audiobook persistence feature: that an
async export job actually copies its generated MP3s into
``uploads/{book_id}/audiobook/`` and that the per-book download
endpoints expose them through the API.

The ElevenLabs key configuration endpoints (``/api/audiobook/config/elevenlabs``)
and the regeneration warning (409 from ``export/async/audiobook``) live
in this file too because they share the same TestClient lifespan setup.
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


def _create_book_with_chapters(client: TestClient, n: int = 2) -> str:
    r = client.post("/api/books", json={"title": "Persist Audio Test", "author": "T"})
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


def _fake_engine() -> AsyncMock:
    """An AsyncMock TTS engine whose synthesize() writes a tiny placeholder."""
    async def fake_synth(text, output_path, voice="", language="de", rate=""):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"fake mp3 bytes")

    engine = AsyncMock()
    engine.synthesize = fake_synth
    return engine


def _wait(job_id: str, timeout: float = 5.0) -> None:
    import asyncio
    deadline = None
    terminal = (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)

    async def _w():
        nonlocal deadline
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while True:
            job = job_store.get(job_id)
            if job is None or job.status in terminal:
                return
            if loop.time() > deadline:
                raise TimeoutError(f"Job {job_id} did not finish")
            await asyncio.sleep(0.05)

    asyncio.new_event_loop().run_until_complete(_w())


# --- Persistence after async export ---


def test_async_audiobook_export_persists_files(client, tmp_path, monkeypatch):
    """After a successful job, uploads/{id}/audiobook/ exists with the chapters."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 2)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            job_id = client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"]
            _wait(job_id)

        target = tmp_path / "uploads" / book_id / "audiobook"
        assert target.exists()
        assert (target / "metadata.json").exists()
        assert (target / "chapters").exists()
        # NOTE: We do NOT assert audiobook.mp3 existence here. The fake
        # TTS engine writes placeholder bytes that ffmpeg cannot concat,
        # so the merge step fails gracefully and the merged file is
        # absent in test runs. The chapter persistence is what matters.

        chapter_mp3s = sorted(f for f in (target / "chapters").iterdir() if f.suffix == ".mp3")
        assert len(chapter_mp3s) == 2
    finally:
        _cleanup(client, book_id)


def test_get_book_audiobook_returns_metadata(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 2)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            job_id = client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"]
            _wait(job_id)

        r = client.get(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 200
        body = r.json()
        assert body["exists"] is True
        assert body["book_id"] == book_id
        assert body["engine"]
        assert body["created_at"]
        assert len(body["chapters"]) == 2
        for ch in body["chapters"]:
            assert ch["url"].startswith(f"/api/books/{book_id}/audiobook/chapters/")
            assert ch["size_bytes"] > 0
        # NOTE: merged file is None in tests because ffmpeg cannot
        # concatenate the placeholder bytes the fake TTS engine writes.
        assert body["zip_url"] == f"/api/books/{book_id}/audiobook/zip"
    finally:
        _cleanup(client, book_id)


def test_get_book_audiobook_empty_state(client, tmp_path, monkeypatch):
    """A book without a generated audiobook returns ``exists: false``."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        r = client.get(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 200
        assert r.json() == {"exists": False, "book_id": book_id}
    finally:
        _cleanup(client, book_id)


def test_per_book_chapter_and_zip_downloads(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 2)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            job_id = client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"]
            _wait(job_id)

        meta = client.get(f"/api/books/{book_id}/audiobook").json()
        # Single chapter download
        first = meta["chapters"][0]
        r = client.get(first["url"])
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/mpeg"
        assert r.content

        # Merged download is 404 here (ffmpeg cannot concat fake bytes,
        # so the merged file was never persisted). Real-world flow has
        # ffmpeg writing a real MP3.
        r = client.get(f"/api/books/{book_id}/audiobook/merged")
        assert r.status_code == 404

        # ZIP download still works because individual chapters exist.
        r = client.get(f"/api/books/{book_id}/audiobook/zip")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"
        assert len(r.content) > 0
    finally:
        _cleanup(client, book_id)


def test_delete_book_audiobook(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )

        target = tmp_path / "uploads" / book_id / "audiobook"
        assert target.exists()

        r = client.delete(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 204
        assert not target.exists()

        # Second delete is 404 (no audiobook stored)
        r = client.delete(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 404
    finally:
        _cleanup(client, book_id)


def test_chapter_download_path_traversal_blocked(client, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )
        # Path traversal: encoded ../../etc/passwd
        r = client.get(f"/api/books/{book_id}/audiobook/chapters/..%2F..%2Fetc%2Fpasswd")
        # Either 404 (not found in chapters dir) or 4xx - never 200 + secret file
        assert r.status_code >= 400
    finally:
        _cleanup(client, book_id)


# --- Regeneration overwrite warning ---


def test_async_audiobook_blocks_regeneration_when_existing(client, tmp_path, monkeypatch):
    """Second async export call must return 409 with the existing metadata."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )
            # Second call without confirm_overwrite -> 409
            r = client.post(f"/api/books/{book_id}/export/async/audiobook")
            assert r.status_code == 409
            body = r.json()["detail"]
            assert body["code"] == "audiobook_exists"
            assert body["existing"]["engine"]
            assert body["existing"]["created_at"]

            # With confirm_overwrite=true the export proceeds
            r = client.post(
                f"/api/books/{book_id}/export/async/audiobook?confirm_overwrite=true",
            )
            assert r.status_code == 200
            assert "job_id" in r.json()
            _wait(r.json()["job_id"])
    finally:
        _cleanup(client, book_id)


def test_book_overwrite_flag_persists_via_patch(client, tmp_path, monkeypatch):
    """PATCH sets the per-book overwrite flag and GET reports it back."""
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        initial = client.get(f"/api/books/{book_id}").json()
        assert initial["audiobook_overwrite_existing"] is False

        r = client.patch(
            f"/api/books/{book_id}",
            json={"audiobook_overwrite_existing": True},
        )
        assert r.status_code == 200
        assert r.json()["audiobook_overwrite_existing"] is True

        refetched = client.get(f"/api/books/{book_id}").json()
        assert refetched["audiobook_overwrite_existing"] is True
    finally:
        _cleanup(client, book_id)


def test_book_overwrite_flag_disables_content_hash_cache(client, tmp_path, monkeypatch):
    """When the flag is on, every chapter is regenerated even if the cache could hit.

    Counts synthesize() calls across two back-to-back exports with the same
    content, engine, voice and speed. Flag off: second run hits cache and
    synthesizes 0 chapters. Flag on: second run regenerates all chapters.
    """
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 2)
    try:
        call_count = {"n": 0}

        async def counting_synth(text, output_path, voice="", language="de", rate=""):
            call_count["n"] += 1
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_bytes(b"fake mp3 bytes")

        engine = AsyncMock()
        engine.synthesize = counting_synth

        with patch("bibliogon_audiobook.generator.get_engine", return_value=engine):
            # First export: cold cache, all chapters synthesize.
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )
            first_run_calls = call_count["n"]
            assert first_run_calls == 2

            # Second export with flag OFF: cache hits, nothing re-synthesized.
            call_count["n"] = 0
            _wait(
                client.post(
                    f"/api/books/{book_id}/export/async/audiobook?confirm_overwrite=true",
                ).json()["job_id"],
            )
            assert call_count["n"] == 0, "cache should have covered both chapters"

            # Flip the per-book flag on; cache must be ignored now.
            client.patch(
                f"/api/books/{book_id}",
                json={"audiobook_overwrite_existing": True},
            )

            call_count["n"] = 0
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )
            assert call_count["n"] == 2, "flag should force full regeneration"
    finally:
        _cleanup(client, book_id)


def test_async_audiobook_per_book_overwrite_flag_skips_warning(client, tmp_path, monkeypatch):
    """``Book.audiobook_overwrite_existing = true`` lets the second call go through silently.

    Replaces the former plugin-global ``audiobook.settings.overwrite_existing`` flag,
    which has been removed in favor of the per-book column.
    """
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )
            # Opt the book into always-overwrite mode via PATCH.
            r_patch = client.patch(
                f"/api/books/{book_id}",
                json={"audiobook_overwrite_existing": True},
            )
            assert r_patch.status_code == 200
            assert r_patch.json()["audiobook_overwrite_existing"] is True

            # No confirm_overwrite param needed because the per-book flag is on.
            r = client.post(f"/api/books/{book_id}/export/async/audiobook")
            assert r.status_code == 200
            _wait(r.json()["job_id"])
    finally:
        _cleanup(client, book_id)


# --- ElevenLabs API key configuration ---


def test_elevenlabs_config_get_reports_unconfigured_initially(client, tmp_path, monkeypatch):
    """The fixture starts with no ElevenLabs key configured."""
    monkeypatch.chdir(tmp_path)
    # Import here so the engine module reset is local to this test
    from bibliogon_audiobook import tts_engine
    tts_engine.set_elevenlabs_api_key("")
    r = client.get("/api/audiobook/config/elevenlabs")
    assert r.status_code == 200
    assert r.json() == {"configured": False}


def test_elevenlabs_config_post_verifies_and_persists(client, tmp_path, monkeypatch):
    """POST verifies the key against the API and persists it on success."""
    cfg_dir = tmp_path / "config" / "plugins"
    cfg_dir.mkdir(parents=True)
    (cfg_dir / "audiobook.yaml").write_text(
        "settings:\n"
        "  read_chapter_number: false\n"
        "elevenlabs:\n"
        "  api_key: ''\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    class FakeResponse:
        status_code = 200
        text = ""
        def json(self):
            return {"subscription": {"tier": "free", "character_count": 0, "character_limit": 10000}}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **kw): return FakeResponse()

    with patch("httpx.Client", FakeClient):
        r = client.post(
            "/api/audiobook/config/elevenlabs",
            json={"api_key": "sk_fake_test_key"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["configured"] is True
    assert body["tier"] == "free"

    # Reflected in subsequent GET
    r = client.get("/api/audiobook/config/elevenlabs")
    assert r.json() == {"configured": True}

    # Persisted to YAML on disk
    on_disk = (tmp_path / "config" / "plugins" / "audiobook.yaml").read_text()
    assert "sk_fake_test_key" in on_disk


def test_elevenlabs_config_post_rejects_bad_key(client, tmp_path, monkeypatch):
    """A 401 from the upstream API becomes a 400 with a clear error."""
    cfg_dir = tmp_path / "config" / "plugins"
    cfg_dir.mkdir(parents=True)
    (cfg_dir / "audiobook.yaml").write_text(
        "settings: {}\nelevenlabs:\n  api_key: ''\n", encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    class FakeResponse:
        status_code = 401
        text = "Unauthorized"
        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, *a, **kw): return FakeResponse()

    with patch("httpx.Client", FakeClient):
        r = client.post(
            "/api/audiobook/config/elevenlabs",
            json={"api_key": "sk_bad"},
        )
    assert r.status_code == 400
    assert "401" in r.json()["detail"] or "Unauthorized" in r.json()["detail"] or "rejected" in r.json()["detail"].lower()


def test_elevenlabs_config_delete_clears_key(client, tmp_path, monkeypatch):
    cfg_dir = tmp_path / "config" / "plugins"
    cfg_dir.mkdir(parents=True)
    (cfg_dir / "audiobook.yaml").write_text(
        "settings: {}\nelevenlabs:\n  api_key: 'sk_will_be_removed'\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    from bibliogon_audiobook import tts_engine
    tts_engine.set_elevenlabs_api_key("sk_will_be_removed")

    r = client.delete("/api/audiobook/config/elevenlabs")
    assert r.status_code == 204
    assert tts_engine.get_elevenlabs_api_key() == ""

    on_disk = (tmp_path / "config" / "plugins" / "audiobook.yaml").read_text()
    assert "sk_will_be_removed" not in on_disk


# --- Backup integration ---


def test_backup_includes_audiobook_when_requested(client, tmp_path, monkeypatch):
    """include_audiobook=true adds the persisted audiobook directory to the .bgb."""
    import zipfile
    monkeypatch.chdir(tmp_path)
    book_id = _create_book_with_chapters(client, 1)
    try:
        with patch("bibliogon_audiobook.generator.get_engine", return_value=_fake_engine()):
            _wait(
                client.post(f"/api/books/{book_id}/export/async/audiobook").json()["job_id"],
            )

        # With include_audiobook=true
        r = client.get("/api/backup/export?include_audiobook=true")
        assert r.status_code == 200
        bgb_path = tmp_path / "backup_with.bgb"
        bgb_path.write_bytes(r.content)
        with zipfile.ZipFile(bgb_path) as zf:
            names = zf.namelist()
        assert any(f"books/{book_id}/audiobook/chapters/" in n for n in names)

        # Without (default)
        r = client.get("/api/backup/export")
        bgb_path2 = tmp_path / "backup_without.bgb"
        bgb_path2.write_bytes(r.content)
        with zipfile.ZipFile(bgb_path2) as zf:
            names2 = zf.namelist()
        assert not any("audiobook/chapters/" in n for n in names2)
    finally:
        _cleanup(client, book_id)
