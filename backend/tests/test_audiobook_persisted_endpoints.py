"""Tests for the persistent audiobook download + preview endpoints in
app/routers/audiobook.py.

These endpoints serve files the user generated in a previous run, so they
are exercised with REAL files written under the isolated test upload dir
(``get_upload_dir()``) - no mocking of the storage layer. Only book
creation goes through the API.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.paths import get_upload_dir


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _create_book(client: TestClient, title: str = "AB Persist") -> str:
    r = client.post("/api/books", json={"title": title, "author": "Author"})
    assert r.status_code in (200, 201)
    return r.json()["id"]


def _audiobook_dir(book_id: str):
    return get_upload_dir() / book_id / "audiobook"


def _make_audiobook(book_id: str, *, chapters: list[str], merged: bool):
    """Write a realistic persisted-audiobook tree + metadata.json."""
    ab = _audiobook_dir(book_id)
    chapters_dir = ab / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)
    chapter_files = []
    for idx, name in enumerate(chapters, start=1):
        (chapters_dir / name).write_bytes(b"ID3fakeaudio")
        chapter_files.append(
            {"filename": name, "size_bytes": 12, "title": f"Kapitel {idx}", "position": idx}
        )
    metadata = {
        "status": "complete",
        "engine": "edge-tts",
        "voice": "de-DE-KatjaNeural",
        "chapter_files": chapter_files,
    }
    if merged:
        (ab / "audiobook.mp3").write_bytes(b"ID3mergedaudio")
        metadata["merged"] = {"filename": "audiobook.mp3", "size_bytes": 14}
    (ab / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")


def _make_preview(book_id: str, filename: str):
    previews = _audiobook_dir(book_id) / "previews"
    previews.mkdir(parents=True, exist_ok=True)
    (previews / filename).write_bytes(b"ID3preview")


class TestGetBookAudiobook:
    def test_404_when_book_missing(self, client):
        r = client.get("/api/books/no-such-book/audiobook")
        assert r.status_code == 404

    def test_exists_false_without_metadata(self, client):
        book_id = _create_book(client)
        r = client.get(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 200
        assert r.json() == {"exists": False, "book_id": book_id}

    def test_exists_true_with_chapters_and_merged(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-vorwort.mp3", "002-kapitel.mp3"], merged=True)
        r = client.get(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 200
        body = r.json()
        assert body["exists"] is True
        assert len(body["chapters"]) == 2
        assert body["merged"]["filename"] == "audiobook.mp3"
        assert body["chapters"][0]["url"].endswith("/chapters/001-vorwort.mp3")


class TestClassify:
    def test_classifies_chapters_as_missing_without_mp3s(self, client):
        book_id = _create_book(client)
        r = client.post(
            f"/api/books/{book_id}/chapters",
            json={"title": "Kapitel 1", "content": "{}", "chapter_type": "chapter"},
        )
        assert r.status_code in (200, 201)
        r = client.get(f"/api/books/{book_id}/audiobook/classify")
        assert r.status_code == 200
        body = r.json()
        assert len(body["missing"]) == 1
        assert body["current"] == []
        assert body["engine"] == "edge-tts"

    def test_classify_404_when_book_missing(self, client):
        r = client.get("/api/books/no-such-book/audiobook/classify")
        assert r.status_code == 404


class TestDeleteAudiobook:
    def test_404_when_nothing_stored(self, client):
        book_id = _create_book(client)
        r = client.delete(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 404

    def test_deletes_stored_audiobook(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-a.mp3"], merged=False)
        r = client.delete(f"/api/books/{book_id}/audiobook")
        assert r.status_code == 204
        assert not _audiobook_dir(book_id).exists()


class TestMergedDownload:
    def test_404_without_merged(self, client):
        book_id = _create_book(client)
        r = client.get(f"/api/books/{book_id}/audiobook/merged")
        assert r.status_code == 404

    def test_downloads_merged(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-a.mp3"], merged=True)
        r = client.get(f"/api/books/{book_id}/audiobook/merged")
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/mpeg"


class TestChapterFiles:
    def test_download_chapter_success_and_404(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-a.mp3"], merged=False)
        ok = client.get(f"/api/books/{book_id}/audiobook/chapters/001-a.mp3")
        assert ok.status_code == 200
        missing = client.get(f"/api/books/{book_id}/audiobook/chapters/nope.mp3")
        assert missing.status_code == 404

    def test_delete_chapter_success_and_404(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-a.mp3"], merged=False)
        ok = client.delete(f"/api/books/{book_id}/audiobook/chapters/001-a.mp3")
        assert ok.status_code == 204
        again = client.delete(f"/api/books/{book_id}/audiobook/chapters/001-a.mp3")
        assert again.status_code == 404


class TestZip:
    def test_404_without_metadata(self, client):
        book_id = _create_book(client)
        r = client.get(f"/api/books/{book_id}/audiobook/zip")
        assert r.status_code == 404

    def test_404_when_no_chapter_files(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=[], merged=False)
        r = client.get(f"/api/books/{book_id}/audiobook/zip")
        assert r.status_code == 404

    def test_bundles_chapters_into_zip(self, client):
        book_id = _create_book(client)
        _make_audiobook(book_id, chapters=["001-a.mp3", "002-b.mp3"], merged=False)
        r = client.get(f"/api/books/{book_id}/audiobook/zip")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"


class TestPreviews:
    def test_list_empty(self, client):
        book_id = _create_book(client)
        r = client.get(f"/api/books/{book_id}/audiobook/previews")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_with_files(self, client):
        book_id = _create_book(client)
        _make_preview(book_id, "probe-1.mp3")
        _make_preview(book_id, "probe-2.mp3")
        r = client.get(f"/api/books/{book_id}/audiobook/previews")
        assert r.status_code == 200
        names = {p["filename"] for p in r.json()}
        assert names == {"probe-1.mp3", "probe-2.mp3"}

    def test_download_preview_success_and_404(self, client):
        book_id = _create_book(client)
        _make_preview(book_id, "probe.mp3")
        ok = client.get(f"/api/books/{book_id}/audiobook/previews/probe.mp3")
        assert ok.status_code == 200
        assert ok.headers["content-type"] == "audio/mpeg"
        missing = client.get(f"/api/books/{book_id}/audiobook/previews/none.mp3")
        assert missing.status_code == 404

    def test_delete_single_preview(self, client):
        book_id = _create_book(client)
        _make_preview(book_id, "probe.mp3")
        r = client.delete(f"/api/books/{book_id}/audiobook/previews/probe.mp3")
        assert r.status_code == 204
        again = client.delete(f"/api/books/{book_id}/audiobook/previews/probe.mp3")
        assert again.status_code == 404

    def test_delete_all_previews(self, client):
        book_id = _create_book(client)
        _make_preview(book_id, "a.mp3")
        _make_preview(book_id, "b.mp3")
        r = client.delete(f"/api/books/{book_id}/audiobook/previews")
        assert r.status_code == 204
        assert not (_audiobook_dir(book_id) / "previews").exists()
