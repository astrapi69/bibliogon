"""End-to-end tests for the import orchestrator endpoints.

Covers the full detect -> execute flow with duplicate detection
across the two core handlers (.bgb and markdown). Runs against
FastAPI's TestClient so routing + dependency injection + Pydantic
serialization are all exercised.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Book, BookImportSource


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _bgb_bytes(book_id: str = "e2e-1", title: str = "E2E Book") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps({"format": "bibliogon-backup", "version": 1}),
        )
        zf.writestr(
            f"books/{book_id}/book.json",
            json.dumps(
                {
                    "id": book_id,
                    "title": title,
                    "author": "Alice",
                    "language": "en",
                    "chapters": [
                        {
                            "id": "ch-1",
                            "title": "Chapter 1",
                            "content": "Hello",
                            "position": 0,
                        }
                    ],
                    "assets": [],
                }
            ),
        )
        zf.writestr(
            f"books/{book_id}/chapters/ch-1.json",
            json.dumps(
                {"id": "ch-1", "title": "Chapter 1", "content": "Hello", "position": 0}
            ),
        )
    return buf.getvalue()


def _post_detect(client: TestClient, *, filename: str, content: bytes) -> dict:
    resp = client.post(
        "/api/import/detect",
        files={"file": (filename, content, "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_detect_bgb_returns_preview_and_no_duplicate(client: TestClient) -> None:
    body = _post_detect(client, filename="book.bgb", content=_bgb_bytes())
    assert body["detected"]["format_name"] == "bgb"
    assert body["detected"]["title"] == "E2E Book"
    assert body["duplicate"]["found"] is False
    assert body["temp_ref"].startswith("imp-")


def test_detect_markdown_returns_preview(client: TestClient) -> None:
    content = b"# Markdown Book\n\nBody."
    body = _post_detect(client, filename="book.md", content=content)
    assert body["detected"]["format_name"] == "markdown"
    assert body["detected"]["title"] == "Markdown Book"
    assert body["duplicate"]["found"] is False


def test_detect_unsupported_returns_415(client: TestClient) -> None:
    resp = client.post(
        "/api/import/detect",
        files={"file": ("file.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 415, resp.text
    payload = resp.json()["detail"]
    assert payload["filename"] == "file.pdf"
    assert "bgb" in payload["registered_formats"]
    assert "markdown" in payload["registered_formats"]


def test_execute_creates_book_and_records_source(client: TestClient) -> None:
    body = _post_detect(client, filename="b.bgb", content=_bgb_bytes(book_id="exec-1"))
    temp_ref = body["temp_ref"]
    resp = client.post(
        "/api/import/execute",
        json={"temp_ref": temp_ref, "overrides": {}, "duplicate_action": "create"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"book_id": "exec-1", "status": "created"}


def test_execute_unknown_temp_ref_returns_404(client: TestClient) -> None:
    resp = client.post(
        "/api/import/execute",
        json={
            "temp_ref": "imp-doesnotexist",
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert resp.status_code == 404, resp.text


def test_duplicate_detection_flow(client: TestClient) -> None:
    # First import: fresh book, no duplicate.
    raw = _bgb_bytes(book_id="dup-a", title="Dup A")
    first = _post_detect(client, filename="b.bgb", content=raw)
    assert first["duplicate"]["found"] is False
    create = client.post(
        "/api/import/execute",
        json={
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert create.status_code == 200

    # Second detect of the same bytes: duplicate found with the book_id.
    second = _post_detect(client, filename="b.bgb", content=raw)
    assert second["duplicate"]["found"] is True
    assert second["duplicate"]["existing_book_id"] == "dup-a"
    assert second["duplicate"]["existing_book_title"] == "Dup A"


def test_execute_cancel_does_not_create_book(client: TestClient) -> None:
    body = _post_detect(client, filename="b.bgb", content=_bgb_bytes(book_id="cxl-1"))
    resp = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "cancel",
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"book_id": None, "status": "cancelled"}

    # Staging dropped too; second execute with same temp_ref fails.
    second = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert second.status_code == 404


def test_execute_overwrite_replaces_book(client: TestClient) -> None:
    # Create once.
    first = _post_detect(
        client, filename="b.bgb", content=_bgb_bytes(book_id="ow-1", title="V1")
    )
    client.post(
        "/api/import/execute",
        json={
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )

    # Re-import same id with a different title and overwrite.
    second = _post_detect(
        client, filename="b.bgb", content=_bgb_bytes(book_id="ow-1", title="V2")
    )
    assert second["duplicate"]["found"] is False  # different bytes -> different hash

    # Manually target existing_book_id to exercise the overwrite path.
    resp = client.post(
        "/api/import/execute",
        json={
            "temp_ref": second["temp_ref"],
            "overrides": {},
            "duplicate_action": "overwrite",
            "existing_book_id": "ow-1",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "overwritten"


def test_execute_overwrite_without_existing_id_is_rejected(client: TestClient) -> None:
    body = _post_detect(client, filename="b.bgb", content=_bgb_bytes(book_id="rej-1"))
    resp = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "overwrite",
            "existing_book_id": None,
        },
    )
    assert resp.status_code == 400
    assert "existing_book_id" in resp.text
