"""Content-safety: optimistic locking + chapter_versions retention.

Covers the contract the Editor depends on:
  - PATCH /chapters with the correct version succeeds and bumps the
    counter
  - PATCH with a stale version returns 409 with the full server-state
    payload the conflict dialog needs
  - Every successful PATCH creates a ChapterVersion row holding the
    PRE-update content, and retention trims to the last 20
  - Restore overwrites current state AND snapshots the pre-restore
    state so nothing is lost
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_book() -> str:
    r = client.post("/api/books", json={"title": "Versioning Test Book", "author": "T"})
    return r.json()["id"]


def _create_chapter(book_id: str, title: str = "Chapter", content: str = "initial") -> dict:
    r = client.post(f"/api/books/{book_id}/chapters", json={"title": title, "content": content})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _cleanup(book_id: str) -> None:
    client.delete(f"/api/books/{book_id}")
    client.delete(f"/api/books/trash/{book_id}")


# --- Optimistic locking ---


def test_patch_with_correct_version_succeeds_and_increments():
    book_id = _create_book()
    ch = _create_chapter(book_id)
    assert ch["version"] == 1

    r = client.patch(
        f"/api/books/{book_id}/chapters/{ch['id']}",
        json={"content": "updated once", "version": 1},
    )
    assert r.status_code == 200
    assert r.json()["version"] == 2
    assert r.json()["content"] == "updated once"

    r = client.patch(
        f"/api/books/{book_id}/chapters/{ch['id']}",
        json={"content": "updated twice", "version": 2},
    )
    assert r.status_code == 200
    assert r.json()["version"] == 3

    _cleanup(book_id)


def test_patch_with_stale_version_returns_409_with_server_state():
    book_id = _create_book()
    ch = _create_chapter(book_id, content="original")

    # First save moves the server to v=2.
    client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
        "content": "server-side write", "version": 1,
    })

    # Second save still thinks it is on v=1 - should 409.
    r = client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
        "content": "stale client write", "version": 1,
    })
    assert r.status_code == 409
    body = r.json()["detail"]
    assert body["error"] == "version_conflict"
    assert body["current_version"] == 2
    assert body["server_content"] == "server-side write"
    assert "server_title" in body
    assert "server_updated_at" in body
    # The readable `message` is present for the ApiError synthesis.
    assert "expected v1" in body["message"]
    assert "server has v2" in body["message"]

    _cleanup(book_id)


def test_patch_without_version_returns_422():
    book_id = _create_book()
    ch = _create_chapter(book_id)
    r = client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={"content": "nope"})
    assert r.status_code == 422, r.text
    _cleanup(book_id)


def test_updated_at_bumps_on_every_patch():
    import time
    book_id = _create_book()
    ch = _create_chapter(book_id)
    initial = ch["updated_at"]
    time.sleep(0.02)  # defeat same-millisecond timestamps
    r = client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
        "content": "bump", "version": 1,
    })
    assert r.json()["updated_at"] != initial
    _cleanup(book_id)


# --- chapter_versions snapshots ---


def test_patch_creates_version_row_with_pre_update_content():
    book_id = _create_book()
    ch = _create_chapter(book_id, content="A")

    client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
        "content": "B", "version": 1,
    })

    versions = client.get(f"/api/books/{book_id}/chapters/{ch['id']}/versions").json()
    assert len(versions) == 1
    # The snapshot holds the PRE-update content + the pre-update version.
    assert versions[0]["version"] == 1
    detail = client.get(
        f"/api/books/{book_id}/chapters/{ch['id']}/versions/{versions[0]['id']}"
    ).json()
    assert detail["content"] == "A"

    _cleanup(book_id)


def test_retention_trims_to_last_20_per_chapter():
    book_id = _create_book()
    ch = _create_chapter(book_id, content="v1")
    current_version = 1
    # 21 patches -> 21 snapshots before trim, then DELETE keeps 20.
    for i in range(21):
        r = client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
            "content": f"edit {i}", "version": current_version,
        })
        assert r.status_code == 200
        current_version = r.json()["version"]

    versions = client.get(f"/api/books/{book_id}/chapters/{ch['id']}/versions").json()
    assert len(versions) == 20, f"expected 20 after trim, got {len(versions)}"
    # The oldest surviving snapshot corresponds to v=2 (v=1 was deleted).
    version_numbers = sorted(v["version"] for v in versions)
    assert version_numbers[0] == 2
    assert version_numbers[-1] == 21

    _cleanup(book_id)


# --- Restore endpoint ---


def test_restore_overwrites_current_and_snapshots_pre_restore():
    book_id = _create_book()
    ch = _create_chapter(book_id, content="first")
    current_version = 1
    # Edit a few times to have real history.
    for content in ("second", "third"):
        r = client.patch(f"/api/books/{book_id}/chapters/{ch['id']}", json={
            "content": content, "version": current_version,
        })
        current_version = r.json()["version"]

    versions = client.get(f"/api/books/{book_id}/chapters/{ch['id']}/versions").json()
    # Snapshots: [v=2 (content="second"), v=1 (content="first")] ordered newest first.
    first_snapshot = next(v for v in versions if v["version"] == 1)

    r = client.post(
        f"/api/books/{book_id}/chapters/{ch['id']}/versions/{first_snapshot['id']}/restore"
    )
    assert r.status_code == 200
    restored = r.json()
    assert restored["content"] == "first"
    # Restore bumps the version counter (like any write).
    assert restored["version"] == current_version + 1

    # A new snapshot of the pre-restore state (content="third", v=3) exists.
    versions_after = client.get(f"/api/books/{book_id}/chapters/{ch['id']}/versions").json()
    assert len(versions_after) == len(versions) + 1
    pre_restore = next(v for v in versions_after if v["version"] == current_version)
    detail = client.get(
        f"/api/books/{book_id}/chapters/{ch['id']}/versions/{pre_restore['id']}"
    ).json()
    assert detail["content"] == "third"

    _cleanup(book_id)


def test_restore_nonexistent_version_returns_404():
    book_id = _create_book()
    ch = _create_chapter(book_id)
    r = client.post(
        f"/api/books/{book_id}/chapters/{ch['id']}/versions/nope/restore"
    )
    assert r.status_code == 404
    _cleanup(book_id)


def test_list_versions_for_nonexistent_chapter_returns_404():
    book_id = _create_book()
    r = client.get(f"/api/books/{book_id}/chapters/ghost/versions")
    assert r.status_code == 404
    _cleanup(book_id)
