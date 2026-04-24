"""Parity probe: same .bgb through legacy /api/backup/import vs orchestrator.

CIO-05 removed ``/api/backup/smart-import`` + ``/api/backup/import-project``
but kept ``/api/backup/import`` (scoped to .bgb). The orchestrator's
``BgbImportHandler`` reuses ``backup_import._restore_book_from_dir``
underneath, so the two paths SHOULD produce an identical book. This
test pins that invariant so a future refactor of one path cannot
silently drift from the other.
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
    # Module-scoped TestClient: lifespan runs once per test module so
    # plugin routes aren't re-mounted N times on a shared FastAPI
    # singleton (that was accumulating and eventually crossing a
    # recursion-depth threshold further down in the suite).
    with TestClient(app) as c:
        yield c


def _bgb_bytes(book_id: str, title: str) -> bytes:
    """Produce a minimal .bgb archive. Chapter ids are derived from
    ``book_id`` so two parity probes with different books don't fight
    over the globally-unique ``chapters.id`` column."""
    ch1 = f"{book_id}-ch-1"
    ch2 = f"{book_id}-ch-2"
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
                    "publisher": "Parity Press",
                    "chapters": [
                        {
                            "id": ch1,
                            "title": "C1",
                            "content": "Hello World",
                            "position": 0,
                        },
                        {
                            "id": ch2,
                            "title": "C2",
                            "content": "Second chapter.",
                            "position": 1,
                        },
                    ],
                    "assets": [],
                }
            ),
        )
        zf.writestr(
            f"books/{book_id}/chapters/{ch1}.json",
            json.dumps(
                {"id": ch1, "title": "C1", "content": "Hello World", "position": 0}
            ),
        )
        zf.writestr(
            f"books/{book_id}/chapters/{ch2}.json",
            json.dumps(
                {"id": ch2, "title": "C2", "content": "Second chapter.", "position": 1}
            ),
        )
    return buf.getvalue()


def _import_via_backup_route(
    client: TestClient, data: bytes
) -> dict:
    resp = client.post(
        "/api/backup/import",
        files={"file": ("backup.bgb", data, "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _import_via_orchestrator(client: TestClient, data: bytes) -> str:
    detect = client.post(
        "/api/import/detect",
        files=[("files", ("backup.bgb", data, "application/octet-stream"))],
    )
    assert detect.status_code == 200, detect.text
    execute = client.post(
        "/api/import/execute",
        json={
            "temp_ref": detect.json()["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert execute.status_code == 200, execute.text
    return execute.json()["book_id"]


def _book_snapshot(client: TestClient, book_id: str) -> dict:
    """Comparable projection of a book: scalar metadata + chapter titles
    and positions. Excludes created_at/updated_at which naturally differ
    between the two imports."""
    book = client.get(f"/api/books/{book_id}").json()
    chapters = [
        {
            "title": ch["title"],
            "position": ch["position"],
            "chapter_type": ch["chapter_type"],
        }
        for ch in sorted(book["chapters"], key=lambda c: c["position"])
    ]
    return {
        "title": book["title"],
        "author": book["author"],
        "language": book["language"],
        "publisher": book["publisher"],
        "chapters": chapters,
    }


def test_legacy_backup_route_and_orchestrator_agree_on_book_shape(
    client: TestClient,
) -> None:
    raw_a = _bgb_bytes(book_id="parity-legacy", title="Parity Same")
    raw_b = _bgb_bytes(book_id="parity-orch", title="Parity Same")

    _import_via_backup_route(client, raw_a)
    orch_book_id = _import_via_orchestrator(client, raw_b)

    legacy_snap = _book_snapshot(client, "parity-legacy")
    orch_snap = _book_snapshot(client, orch_book_id)

    assert legacy_snap == orch_snap


def test_orchestrator_preserves_publisher_field_like_legacy(
    client: TestClient,
) -> None:
    """Publisher is a less-trafficked column; both paths must preserve
    it. Earlier bug: a path that lost publisher would still pass the
    happy-path tests because most use 'Test Author'."""
    raw = _bgb_bytes(book_id="pub-check", title="Publisher Check")
    book_id = _import_via_orchestrator(client, raw)
    book = client.get(f"/api/books/{book_id}").json()
    assert book["publisher"] == "Parity Press"


def test_backup_import_route_still_scoped_to_bgb_only(client: TestClient) -> None:
    """CIO-05 scope note: /api/backup/import must not accept project
    ZIPs or loose markdown any more. Only .bgb archives land there."""
    resp = client.post(
        "/api/backup/import",
        files={
            "file": (
                "project.zip",
                _wbt_project_zip(),
                "application/zip",
            )
        },
    )
    # The endpoint returns 200 with imported_books=0 when the input
    # has no recognisable manifest; either 200 with 0 or 400/415 is
    # acceptable. What's NOT acceptable is silent restoration from a
    # non-bgb payload.
    if resp.status_code == 200:
        payload = resp.json()
        assert payload["imported_books"] == 0, (
            "Legacy endpoint must not pull books out of a WBT ZIP - "
            "that flow belongs to the orchestrator now."
        )


def _wbt_project_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("my-book/config/metadata.yaml", "title: NotABackup\nauthor: X\n")
        zf.writestr("my-book/manuscript/chapters/01.md", "# Ch\n\nBody.\n")
    return buf.getvalue()
