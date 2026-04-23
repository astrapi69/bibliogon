"""Shared helpers for tests that need to import a project ZIP.

The legacy ``/api/backup/import-project`` + ``/api/backup/smart-import``
endpoints were removed in CIO-05. Tests that previously POSTed to those
endpoints now go through the orchestrator's two-phase detect + execute
surface via ``import_wbt_zip`` / ``import_markdown_zip`` below.

The return shape stays compatible with the legacy endpoints that these
tests were written against - ``{"book_id": ..., "title": ...,
"chapter_count": ...}`` - so downstream assertions only need their
call sites migrated, not their bodies.
"""

from __future__ import annotations

import io
from typing import Any

from fastapi.testclient import TestClient


def import_wbt_zip(
    client: TestClient,
    buf: io.BytesIO,
    filename: str = "test.zip",
) -> dict[str, Any]:
    """Import a write-book-template ZIP via the orchestrator.

    Returns ``{"book_id", "title", "chapter_count", "asset_count"}``
    to match the legacy endpoint's response shape.
    """
    buf.seek(0)
    detect = client.post(
        "/api/import/detect",
        files=[("files", (filename, buf.read(), "application/zip"))],
    )
    assert detect.status_code == 200, detect.text
    body = detect.json()
    temp_ref = body["temp_ref"]

    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": temp_ref,
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    book_id = execute.json()["book_id"]
    return {
        "book_id": book_id,
        "title": body["detected"].get("title") or "Untitled",
        "chapter_count": len(body["detected"].get("chapters", [])),
        "asset_count": len(body["detected"].get("assets", [])),
    }


def import_single_markdown(
    client: TestClient,
    content: str,
    filename: str = "chapter.md",
) -> dict[str, Any]:
    """Import a single Markdown file via the orchestrator."""
    detect = client.post(
        "/api/import/detect",
        files=[("files", (filename, content.encode("utf-8"), "text/markdown"))],
    )
    assert detect.status_code == 200, detect.text
    body = detect.json()
    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    return {
        "book_id": execute.json()["book_id"],
        "title": body["detected"].get("title") or "Untitled",
        "chapter_count": len(body["detected"].get("chapters", [])),
    }


def import_markdown_folder(
    client: TestClient,
    files: list[tuple[str, bytes]],
) -> dict[str, Any]:
    """Import a folder of Markdown files via the orchestrator.

    ``files`` is a list of ``(rel_path, content_bytes)`` tuples; each
    gets sent as a multipart part with its rel_path surfaced via the
    ``paths`` form field (which the backend strips ``..`` from).
    """
    paths = [rel for rel, _ in files]
    multipart = [
        ("files", (rel, content, "application/octet-stream")) for rel, content in files
    ]
    detect = client.post(
        "/api/import/detect",
        files=multipart,
        data={"paths": paths},
    )
    assert detect.status_code == 200, detect.text
    body = detect.json()
    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": body["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    return {
        "book_id": execute.json()["book_id"],
        "title": body["detected"].get("title") or "Untitled",
        "chapter_count": len(body["detected"].get("chapters", [])),
    }


def import_bgb(
    client: TestClient,
    buf: io.BytesIO,
    filename: str = "backup.bgb",
) -> dict[str, Any]:
    """Restore a .bgb via the legacy /api/backup/import route.

    That route is still live post-CIO-05; only smart-import and
    import-project were removed. Wrapper stays here so tests that
    wanted backup restoration have a single shared helper.
    """
    buf.seek(0)
    r = client.post(
        "/api/backup/import",
        files={"file": (filename, buf, "application/octet-stream")},
    )
    assert r.status_code == 200, r.text
    return r.json()
