"""Tests for V-02: compare two .bgb backups via /api/backup/compare."""

import io

from fastapi.testclient import TestClient

from app.main import app


def _create_book(client: TestClient, title: str = "Compare Test") -> str:
    r = client.post("/api/books", json={"title": title, "author": "A"})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _add_chapter(client: TestClient, book_id: str, title: str, content: str) -> str:
    r = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "content": content},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _update_chapter(client: TestClient, book_id: str, chapter_id: str, content: str) -> None:
    r = client.patch(
        f"/api/books/{book_id}/chapters/{chapter_id}",
        json={"content": content},
    )
    assert r.status_code == 200, r.text


def _export_backup(client: TestClient) -> bytes:
    r = client.get("/api/backup/export")
    assert r.status_code == 200
    return r.content


def _cleanup(client: TestClient, book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


def _compare(client: TestClient, backup_a: bytes, backup_b: bytes):
    return client.post(
        "/api/backup/compare",
        files={
            "file_a": ("a.bgb", io.BytesIO(backup_a), "application/octet-stream"),
            "file_b": ("b.bgb", io.BytesIO(backup_b), "application/octet-stream"),
        },
    )


def test_compare_identical_backups_has_no_changes():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            _add_chapter(client, book_id, "Ch1", "<p>Same content</p>")
            backup = _export_backup(client)
            r = _compare(client, backup, backup)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["summary"]["books_in_both"] == 1
            assert data["summary"]["books_only_in_a"] == []
            assert data["summary"]["books_only_in_b"] == []
            book_diff = data["books"][0]
            assert book_diff["metadata_changes"] == []
            assert book_diff["chapters"] == []
        finally:
            _cleanup(client, book_id)


def test_compare_detects_chapter_content_change():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            ch_id = _add_chapter(client, book_id, "Ch1", "<p>First version</p>")
            backup_a = _export_backup(client)

            _update_chapter(client, book_id, ch_id, "<p>Second version</p>")
            backup_b = _export_backup(client)

            r = _compare(client, backup_a, backup_b)
            assert r.status_code == 200, r.text
            data = r.json()
            assert len(data["books"]) == 1
            chapter_diffs = data["books"][0]["chapters"]
            assert len(chapter_diffs) == 1
            diff = chapter_diffs[0]
            assert diff["change_type"] == "changed"
            assert diff["has_changes"] is True
            texts = [line["text"] for line in diff["lines"]]
            types = [line["type"] for line in diff["lines"]]
            assert "removed" in types
            assert "added" in types
            assert any("First version" in t for t in texts)
            assert any("Second version" in t for t in texts)
        finally:
            _cleanup(client, book_id)


def test_compare_detects_added_chapter():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            _add_chapter(client, book_id, "Ch1", "<p>Existing</p>")
            backup_a = _export_backup(client)

            _add_chapter(client, book_id, "Ch2", "<p>Brand new</p>")
            backup_b = _export_backup(client)

            r = _compare(client, backup_a, backup_b)
            data = r.json()
            chapter_diffs = data["books"][0]["chapters"]
            added = [d for d in chapter_diffs if d["change_type"] == "added"]
            assert len(added) == 1
            assert added[0]["title_b"] == "Ch2"
        finally:
            _cleanup(client, book_id)


def test_compare_detects_metadata_change():
    with TestClient(app) as client:
        book_id = _create_book(client)
        try:
            _add_chapter(client, book_id, "Ch1", "<p>x</p>")
            backup_a = _export_backup(client)

            r_patch = client.patch(
                f"/api/books/{book_id}",
                json={"subtitle": "New Subtitle", "author": "B"},
            )
            assert r_patch.status_code == 200
            backup_b = _export_backup(client)

            r = _compare(client, backup_a, backup_b)
            data = r.json()
            changes = {c["field"]: c for c in data["books"][0]["metadata_changes"]}
            assert "subtitle" in changes
            assert changes["subtitle"]["before"] is None
            assert changes["subtitle"]["after"] == "New Subtitle"
            assert "author" in changes
            assert changes["author"]["after"] == "B"
        finally:
            _cleanup(client, book_id)


def test_compare_rejects_non_bgb_filename():
    with TestClient(app) as client:
        r = client.post(
            "/api/backup/compare",
            files={
                "file_a": ("a.txt", io.BytesIO(b"nope"), "text/plain"),
                "file_b": ("b.bgb", io.BytesIO(b"nope"), "application/octet-stream"),
            },
        )
        assert r.status_code == 400
        assert ".bgb" in r.json()["detail"]


def test_compare_rejects_no_common_books():
    with TestClient(app) as client:
        book_a_id = _create_book(client, title="Book A")
        backup_a = _export_backup(client)
        _cleanup(client, book_a_id)

        book_b_id = _create_book(client, title="Book B")
        backup_b = _export_backup(client)
        try:
            r = _compare(client, backup_a, backup_b)
            assert r.status_code == 400
            assert "gemeinsame" in r.json()["detail"].lower()
        finally:
            _cleanup(client, book_b_id)


def test_compare_rejects_corrupt_zip():
    with TestClient(app) as client:
        r = client.post(
            "/api/backup/compare",
            files={
                "file_a": ("a.bgb", io.BytesIO(b"not a zip"), "application/octet-stream"),
                "file_b": ("b.bgb", io.BytesIO(b"not a zip"), "application/octet-stream"),
            },
        )
        assert r.status_code == 400
        assert "beschaedigt" in r.json()["detail"].lower()
