"""Override-application contract per handler.

Each handler exposes a narrow allowlist of scalar Book columns that
the wizard's preview panel may override. Disallowed keys must raise
rather than silently being dropped (that was an earlier bug where
a mis-typed key from the UI looked like it saved). These tests pin
both branches for every in-repo handler.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def _detect(client: TestClient, files: list[tuple[str, bytes]]) -> dict:
    file_parts = [
        ("files", (name, data, "application/octet-stream")) for name, data in files
    ]
    resp = client.post("/api/import/detect", files=file_parts)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _execute(client: TestClient, body: dict) -> dict:
    resp = client.post("/api/import/execute", json=body)
    return {"status_code": resp.status_code, **resp.json()}


# --- markdown handler ---


def test_markdown_override_applies_title_and_author(client: TestClient) -> None:
    detect = _detect(client, [("book.md", b"# Original Title\n\nBody.")])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"title": "Overridden", "author": "Jane Doe"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 200
    book = client.get(f"/api/books/{result['book_id']}").json()
    assert book["title"] == "Overridden"
    assert book["author"] == "Jane Doe"


def test_markdown_override_rejects_disallowed_key(client: TestClient) -> None:
    detect = _detect(client, [("book.md", b"# X\n\nBody.")])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"favorite_color": "green"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 500
    assert "not allowed" in result["detail"].lower()


def test_markdown_override_allows_subtitle_and_genre(client: TestClient) -> None:
    detect = _detect(client, [("book.md", b"# Book\n\nBody.")])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"subtitle": "A Sub", "genre": "Fiction"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 200
    book = client.get(f"/api/books/{result['book_id']}").json()
    assert book["subtitle"] == "A Sub"
    assert book["genre"] == "Fiction"


# --- .bgb handler ---


def _bgb_bytes(book_id: str = "ovr-1") -> bytes:
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
                    "title": "Original",
                    "author": "A",
                    "language": "en",
                    "chapters": [
                        {
                            "id": "ch-1",
                            "title": "C1",
                            "content": "B",
                            "position": 0,
                        }
                    ],
                    "assets": [],
                }
            ),
        )
        zf.writestr(
            f"books/{book_id}/chapters/ch-1.json",
            json.dumps({"id": "ch-1", "title": "C1", "content": "B", "position": 0}),
        )
    return buf.getvalue()


def test_bgb_override_applies_title(client: TestClient) -> None:
    detect = _detect(client, [("backup.bgb", _bgb_bytes(book_id="ovr-bgb"))])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"title": "Restored With New Title"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 200
    book = client.get(f"/api/books/{result['book_id']}").json()
    assert book["title"] == "Restored With New Title"


def test_bgb_override_rejects_disallowed_key(client: TestClient) -> None:
    detect = _detect(client, [("backup.bgb", _bgb_bytes(book_id="ovr-bgb-bad"))])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"isbn": "000-invalid-field"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 500
    assert "not allowed" in result["detail"].lower()


# --- WBT handler ---


def _wbt_zip_bytes(title: str = "Wbt Original") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "my-book/config/metadata.yaml",
            f"title: {title}\nauthor: Orig\nlang: en\n",
        )
        zf.writestr(
            "my-book/manuscript/chapters/01-ch.md", "# Chapter 1\n\nBody.\n"
        )
    return buf.getvalue()


def test_wbt_override_applies_title_and_author(client: TestClient) -> None:
    detect = _detect(client, [("project.zip", _wbt_zip_bytes())])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"title": "WBT Overridden", "author": "New Author"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 200
    book = client.get(f"/api/books/{result['book_id']}").json()
    assert book["title"] == "WBT Overridden"
    assert book["author"] == "New Author"


def test_wbt_override_rejects_disallowed_key(client: TestClient) -> None:
    detect = _detect(client, [("project.zip", _wbt_zip_bytes(title="X"))])
    result = _execute(
        client,
        {
            "temp_ref": detect["temp_ref"],
            "overrides": {"publisher": "Sneaky House"},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 500
    assert "not allowed" in result["detail"].lower()


# --- markdown-folder handler ---


def test_markdown_folder_override_applies_title(client: TestClient) -> None:
    file_parts = [
        ("files", ("proj/01.md", b"# Original\n\nBody.", "text/markdown")),
        ("files", ("proj/02.md", b"# Second\n\nMore.", "text/markdown")),
    ]
    resp = client.post(
        "/api/import/detect",
        files=file_parts,
        data={"paths": ["proj/01.md", "proj/02.md"]},
    )
    assert resp.status_code == 200
    temp_ref = resp.json()["temp_ref"]

    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": temp_ref,
            "overrides": {"title": "Folder Override", "author": "F"},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    book = client.get(f"/api/books/{execute.json()['book_id']}").json()
    assert book["title"] == "Folder Override"
    assert book["author"] == "F"


def test_markdown_folder_override_rejects_disallowed_key(client: TestClient) -> None:
    file_parts = [
        ("files", ("proj/01.md", b"# A\n\nBody.", "text/markdown")),
        ("files", ("proj/02.md", b"# B\n\nBody.", "text/markdown")),
    ]
    resp = client.post(
        "/api/import/detect",
        files=file_parts,
        data={"paths": ["proj/01.md", "proj/02.md"]},
    )
    temp_ref = resp.json()["temp_ref"]

    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": temp_ref,
            "overrides": {"dangerous_eval_path": "/etc"},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 500
    assert "not allowed" in execute.json()["detail"].lower()
