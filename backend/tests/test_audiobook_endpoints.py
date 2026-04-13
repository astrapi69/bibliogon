"""Tests for audiobook dry-run error paths (CW-13) and Google Cloud TTS config endpoints (CW-14).

CW-13 covers the POST /api/books/{book_id}/audiobook/dry-run endpoint:
  - 404 when the book does not exist
  - 400 when the book has no chapters
  - 200 with a mocked TTS engine producing a sample MP3

CW-14 covers the Google Cloud TTS credential management endpoints:
  - GET  /api/audiobook/config/google-cloud-tts  (not configured)
  - DELETE /api/audiobook/config/google-cloud-tts (not configured)
  - POST /api/audiobook/config/google-cloud-tts  (invalid file)
  - GET  /api/audiobook/config/google-cloud-tts  (mocked as configured)
"""

import io
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str = "Audiobook Test") -> str:
    """Create a book via the API and return its ID."""
    r = client.post("/api/books", json={"title": title, "author": "Author"})
    assert r.status_code in (200, 201)
    return r.json()["id"]


def _add_chapter(
    client: TestClient,
    book_id: str,
    title: str,
    chapter_type: str = "chapter",
) -> str:
    """Add a chapter with a text paragraph to a book."""
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
            "chapter_type": chapter_type,
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _cleanup(client: TestClient, book_id: str) -> None:
    """Soft-delete and permanently delete a book."""
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


# ---------------------------------------------------------------------------
# CW-13: Dry-run error paths
# ---------------------------------------------------------------------------


class TestDryRunErrorPaths:
    """POST /api/books/{book_id}/audiobook/dry-run error scenarios."""

    def test_dry_run_book_not_found(self, client):
        """Dry-run on a nonexistent book returns 404."""
        r = client.post("/api/books/nonexistent-id/audiobook/dry-run")
        assert r.status_code == 404
        assert "not found" in r.json()["detail"].lower()

    def test_dry_run_no_chapters(self, client, tmp_path, monkeypatch):
        """Dry-run on a book with zero chapters returns 400."""
        monkeypatch.chdir(tmp_path)
        book_id = _create_book(client, "Empty Book")
        try:
            r = client.post(f"/api/books/{book_id}/audiobook/dry-run")
            assert r.status_code == 400
            assert "no chapters" in r.json()["detail"].lower()
        finally:
            _cleanup(client, book_id)

    def test_dry_run_with_mocked_engine(self, client, tmp_path, monkeypatch):
        """Dry-run with a mocked TTS engine returns 200 and audio content."""
        monkeypatch.chdir(tmp_path)
        book_id = _create_book(client, "Dry Run Book")
        try:
            _add_chapter(client, book_id, "Kapitel 1", "chapter")

            async def fake_synth(text, output_path, voice="", language="de", rate=""):
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                Path(output_path).write_bytes(b"\xff\xfb\x90\x00" + b"\x00" * 100)

            engine = AsyncMock()
            engine.synthesize = fake_synth

            with patch("bibliogon_audiobook.tts_engine.get_engine", return_value=engine):
                r = client.post(f"/api/books/{book_id}/audiobook/dry-run")

            assert r.status_code == 200, r.text
            assert r.headers.get("content-type", "").startswith("audio/")
            assert "x-estimated-chapters" in r.headers
            assert "x-sample-engine" in r.headers
        finally:
            _cleanup(client, book_id)

    def test_dry_run_only_skipped_chapters(self, client, tmp_path, monkeypatch):
        """Dry-run returns 400 when all chapters are in the skip list."""
        monkeypatch.chdir(tmp_path)
        book_id = _create_book(client, "All Skipped")
        try:
            _add_chapter(client, book_id, "TOC", "toc")
            _add_chapter(client, book_id, "Imprint", "imprint")

            r = client.post(f"/api/books/{book_id}/audiobook/dry-run")
            assert r.status_code == 400
            assert "no chapter with text" in r.json()["detail"].lower()
        finally:
            _cleanup(client, book_id)


# ---------------------------------------------------------------------------
# CW-14: Google Cloud TTS config endpoints
# ---------------------------------------------------------------------------


class TestGoogleCloudTtsConfig:
    """Google Cloud TTS credential management endpoints."""

    def test_google_tts_config_get_not_configured(self, client):
        """GET returns configured=false when no credentials are stored."""
        with patch("app.routers.audiobook.credential_store") as mock_store:
            mock_store.is_configured.return_value = False
            r = client.get("/api/audiobook/config/google-cloud-tts")
        assert r.status_code == 200
        assert r.json()["configured"] is False

    def test_google_tts_config_delete_not_configured(self, client):
        """DELETE when not configured completes without error (204)."""
        with patch("app.routers.audiobook.credential_store") as mock_store:
            mock_store.secure_delete.return_value = False
            r = client.delete("/api/audiobook/config/google-cloud-tts")
        assert r.status_code == 204

    def test_google_tts_config_post_invalid_json(self, client):
        """POST with a non-JSON file is rejected with 400."""
        invalid_content = b"this is not json"
        r = client.post(
            "/api/audiobook/config/google-cloud-tts",
            files={"file": ("credentials.json", io.BytesIO(invalid_content), "application/json")},
        )
        assert r.status_code == 400

    def test_google_tts_config_post_wrong_extension(self, client):
        """POST with a non-.json filename is rejected with 400."""
        r = client.post(
            "/api/audiobook/config/google-cloud-tts",
            files={"file": ("credentials.txt", io.BytesIO(b"{}"), "text/plain")},
        )
        assert r.status_code == 400
        assert ".json" in r.json()["detail"]

    def test_google_tts_config_get_after_setup(self, client):
        """GET returns configured=true when credentials are present."""
        with patch("app.routers.audiobook.credential_store") as mock_store:
            mock_store.is_configured.return_value = True
            mock_store.get_metadata.return_value = {
                "project_id": "test-project",
                "client_email": "test@test.iam.gserviceaccount.com",
            }
            r = client.get("/api/audiobook/config/google-cloud-tts")
        assert r.status_code == 200
        body = r.json()
        assert body["configured"] is True
        assert body["project_id"] == "test-project"
        assert body["client_email"] == "test@test.iam.gserviceaccount.com"
