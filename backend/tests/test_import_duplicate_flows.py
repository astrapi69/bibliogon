"""End-to-end duplicate-action flow tests.

``test_import_orchestrator_e2e.py`` covers the base happy paths;
this file pins the three duplicate-action branches when
``DuplicateInfo.found`` is True:

- ``create`` on a found duplicate inserts a second book with a
  fresh id (the user chose to keep both).
- ``overwrite`` on a found duplicate replaces the matched book
  using the ``existing_book_id`` surfaced by detect.
- ``cancel`` on a found duplicate is a no-op and cleans up the
  staged bytes.
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


def _bgb_bytes(book_id: str, title: str) -> bytes:
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


def _detect(client: TestClient, filename: str, data: bytes) -> dict:
    resp = client.post(
        "/api/import/detect",
        files=[("files", (filename, data, "application/octet-stream"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _execute(client: TestClient, body: dict) -> dict:
    resp = client.post("/api/import/execute", json=body)
    return resp.json() | {"_status": resp.status_code}


# --- duplicate branches ---


def test_detect_reports_duplicate_on_second_identical_import(
    client: TestClient,
) -> None:
    raw = _bgb_bytes(book_id="dup-flow-a", title="DupA")
    first = _detect(client, "a.bgb", raw)
    _execute(
        client,
        {
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    second = _detect(client, "a.bgb", raw)
    assert second["duplicate"]["found"] is True
    assert second["duplicate"]["existing_book_id"] == "dup-flow-a"


def test_duplicate_then_overwrite_replaces_existing(client: TestClient) -> None:
    raw = _bgb_bytes(book_id="dup-ow", title="Before Overwrite")
    first = _detect(client, "x.bgb", raw)
    _execute(
        client,
        {
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )

    second = _detect(client, "x.bgb", raw)
    assert second["duplicate"]["found"] is True
    existing_id = second["duplicate"]["existing_book_id"]

    result = _execute(
        client,
        {
            "temp_ref": second["temp_ref"],
            "overrides": {},
            "duplicate_action": "overwrite",
            "existing_book_id": existing_id,
        },
    )
    assert result["_status"] == 200, result
    assert result["status"] == "overwritten"
    assert result["book_id"] == existing_id

    books = client.get("/api/books").json()
    matches = [b for b in books if b["id"] == existing_id]
    assert len(matches) == 1, (
        "Overwrite must keep the book at the same id, not create a duplicate row"
    )


def test_duplicate_then_cancel_does_not_touch_db(client: TestClient) -> None:
    raw = _bgb_bytes(book_id="dup-cxl", title="Keep As Is")
    first = _detect(client, "k.bgb", raw)
    _execute(
        client,
        {
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    # Pin the pre-cancel book state so we can diff after the cancel
    # call. Titles are the most user-visible field so they beat
    # counting rows.
    before = client.get("/api/books").json()
    before_by_id = {b["id"]: b["title"] for b in before}

    second = _detect(client, "k.bgb", raw)
    assert second["duplicate"]["found"] is True
    cancel = _execute(
        client,
        {
            "temp_ref": second["temp_ref"],
            "overrides": {},
            "duplicate_action": "cancel",
        },
    )
    assert cancel["_status"] == 200
    assert cancel["status"] == "cancelled"
    assert cancel["book_id"] is None

    after = client.get("/api/books").json()
    after_by_id = {b["id"]: b["title"] for b in after}
    assert after_by_id == before_by_id, (
        "cancel on a found duplicate must not add, drop or rename any book row"
    )


def test_bgb_duplicate_with_create_action_is_rejected(tmp_path) -> None:
    """.bgb ids are payload-intrinsic. Choosing ``create`` on a found
    duplicate for .bgb has no well-defined outcome - the restore
    helper skips live rows with the same id, so the handler raises
    rather than silently committing nothing. This pins the current
    behavior; the frontend should route .bgb duplicates through
    overwrite/cancel instead of offering create at all.

    Regression guard: if a future refactor makes this path succeed
    (e.g. by re-id-ing the incoming book), update the wizard UI to
    surface the re-id path to the user explicitly.

    Driven at the handler layer (not through TestClient) because the
    orchestrator wraps the handler exception in a 500 response, and
    the way FastAPI handles that inside a shared in-memory test
    database has been known to pollute subsequent lifespan runs."""
    from app.import_plugins.handlers.bgb import BgbImportHandler, _BgbInvalid

    path = tmp_path / "dup.bgb"
    path.write_bytes(_bgb_bytes(book_id="dup-create", title="First"))

    handler = BgbImportHandler()
    detected = handler.detect(str(path))
    # First import succeeds.
    book_id = handler.execute(
        str(path), detected, overrides={}, duplicate_action="create"
    )
    assert book_id == "dup-create"

    # Second create with the same .bgb raises _BgbInvalid whose
    # message names the invariant ("no restorable book.json").
    with pytest.raises(_BgbInvalid, match="no restorable book.json"):
        handler.execute(
            str(path), detected, overrides={}, duplicate_action="create"
        )


def test_cancel_drops_staging(client: TestClient) -> None:
    """After cancel the temp_ref is gone; retrying execute against
    the same ref returns 404."""
    raw = _bgb_bytes(book_id="dup-gc", title="G")
    first = _detect(client, "g.bgb", raw)
    _execute(
        client,
        {
            "temp_ref": first["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )

    second = _detect(client, "g.bgb", raw)
    _execute(
        client,
        {
            "temp_ref": second["temp_ref"],
            "overrides": {},
            "duplicate_action": "cancel",
        },
    )

    retry = client.post(
        "/api/import/execute",
        json={
            "temp_ref": second["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert retry.status_code == 404
