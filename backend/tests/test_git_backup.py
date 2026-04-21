"""Tests for Phase 1 git-based backup (SI-01..04 foundation).

Covers:
- init_repo: creates .git, first commit, idempotent
- commit: writes book state, refuses on clean tree, refuses if not init
- log: returns commits newest-first with shape
- status: before-init vs after-init
- file layout: front-matter / chapters / back-matter split
- slugify edge cases (German umlauts, empty title)

Tests use TestClient through the API router. A per-test tmp_path is
used as the uploads root via monkeypatching so real ``uploads/``
outside the test tree is never touched.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import git_backup

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    """Redirect UPLOADS_ROOT to a tmp dir for every test."""
    monkeypatch.setattr(git_backup, "UPLOADS_ROOT", tmp_path / "uploads")
    yield


def _create_book(title: str = "Git Backup Testbuch") -> str:
    resp = client.post(
        "/api/books",
        json={"title": title, "author": "Aster", "language": "de"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _add_chapter(
    book_id: str,
    title: str,
    chapter_type: str = "chapter",
    content: str = '{"type":"doc","content":[{"type":"paragraph"}]}',
) -> str:
    resp = client.post(
        f"/api/books/{book_id}/chapters",
        json={"title": title, "chapter_type": chapter_type, "content": content},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# --- init ---


def test_init_creates_repo_and_first_commit():
    book_id = _create_book("First Init")
    _add_chapter(book_id, "Chapter One")

    resp = client.post(f"/api/books/{book_id}/git/init")
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is True
    assert body["dirty"] is False
    assert body["head_hash"] is not None

    repo_root = git_backup.repo_path(book_id)
    assert (repo_root / ".git").is_dir()
    assert (repo_root / ".gitignore").is_file()
    assert (repo_root / "config" / "metadata.yaml").is_file()
    assert (repo_root / "manuscript" / "chapters").is_dir()


def test_init_is_idempotent():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    first = client.post(f"/api/books/{book_id}/git/init").json()
    second = client.post(f"/api/books/{book_id}/git/init").json()
    assert first["head_hash"] == second["head_hash"]


def test_init_404_for_unknown_book():
    resp = client.post("/api/books/doesnotexist/git/init")
    assert resp.status_code == 404


# --- commit ---


def test_commit_refuses_when_not_initialized():
    book_id = _create_book()
    resp = client.post(f"/api/books/{book_id}/git/commit", json={"message": "x"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "repo_not_initialized"


def test_commit_captures_chapter_change():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")

    # Add a new chapter so the working tree diverges from HEAD.
    _add_chapter(book_id, "Ch B")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "Second pass"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["message"] == "Second pass"
    assert len(body["hash"]) == 40
    assert body["short_hash"] == body["hash"][:7]


def test_commit_refuses_on_clean_tree():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "no-op"}
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "nothing_to_commit"


def test_commit_uses_default_message_when_empty():
    book_id = _create_book("Titled Book")
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    _add_chapter(book_id, "Ch B")
    body = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": ""}
    ).json()
    assert "Titled Book" in body["message"]


# --- log ---


def test_log_returns_commits_newest_first():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    client.post(f"/api/books/{book_id}/git/init")
    _add_chapter(book_id, "Ch B")
    client.post(f"/api/books/{book_id}/git/commit", json={"message": "Second"})

    resp = client.get(f"/api/books/{book_id}/git/log")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 2
    assert entries[0]["message"] == "Second"
    assert "Initial commit" in entries[1]["message"]


def test_log_409_when_not_initialized():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/log")
    assert resp.status_code == 409


def test_log_limit_validation():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/log?limit=0")
    assert resp.status_code == 422


# --- status ---


def test_status_before_init():
    book_id = _create_book()
    resp = client.get(f"/api/books/{book_id}/git/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["initialized"] is False
    assert body["head_hash"] is None


def test_status_initialized_flag_flips():
    book_id = _create_book()
    _add_chapter(book_id, "Ch A")
    before = client.get(f"/api/books/{book_id}/git/status").json()
    assert before["initialized"] is False
    client.post(f"/api/books/{book_id}/git/init")
    after = client.get(f"/api/books/{book_id}/git/status").json()
    assert after["initialized"] is True
    assert after["head_hash"] is not None


# --- file layout ---


def test_chapters_split_by_section():
    book_id = _create_book()
    _add_chapter(book_id, "Prefaceness", chapter_type="preface")
    _add_chapter(book_id, "Real Chapter", chapter_type="chapter")
    _add_chapter(book_id, "Epilogueness", chapter_type="epilogue")

    client.post(f"/api/books/{book_id}/git/init")

    root = git_backup.repo_path(book_id)
    front = list((root / "manuscript" / "front-matter").glob("*.json"))
    main = list((root / "manuscript" / "chapters").glob("*.json"))
    back = list((root / "manuscript" / "back-matter").glob("*.json"))
    assert len(front) == 1 and "prefaceness" in front[0].name
    assert len(main) == 1 and "real-chapter" in main[0].name
    assert len(back) == 1 and "epilogueness" in back[0].name


def test_chapter_file_contains_tiptap_json():
    book_id = _create_book()
    _add_chapter(
        book_id,
        "Content Test",
        content='{"type":"doc","content":[{"type":"paragraph"}]}',
    )
    client.post(f"/api/books/{book_id}/git/init")

    chapter_file = next(
        (git_backup.repo_path(book_id) / "manuscript" / "chapters").glob("*.json")
    )
    payload = json.loads(chapter_file.read_text(encoding="utf-8"))
    assert payload["title"] == "Content Test"
    assert payload["content"]["type"] == "doc"


def test_metadata_yaml_has_book_fields():
    book_id = _create_book("Metadata Test")
    client.post(f"/api/books/{book_id}/git/init")

    import yaml

    data = yaml.safe_load(
        (git_backup.repo_path(book_id) / "config" / "metadata.yaml")
        .read_text(encoding="utf-8")
    )
    assert data["title"] == "Metadata Test"
    assert data["author"] == "Aster"
    assert data["language"] == "de"


# --- slugify edge cases ---


def test_slugify_umlauts():
    assert git_backup._slugify("Über Alles") == "ueber-alles"
    assert git_backup._slugify("Straße") == "strasse"


def test_slugify_empty_falls_back():
    slug = git_backup._slugify("")
    assert slug.startswith("ch-")


def test_slugify_drops_non_alphanum():
    assert git_backup._slugify("Kapitel 1: Der Beginn!") == "kapitel-1-der-beginn"


# --- removed-chapter cleanup ---


def test_removed_chapter_drops_from_repo_on_commit():
    book_id = _create_book()
    ch_id = _add_chapter(book_id, "To Be Removed")
    _add_chapter(book_id, "Keeper")
    client.post(f"/api/books/{book_id}/git/init")

    chapters_dir = git_backup.repo_path(book_id) / "manuscript" / "chapters"
    assert len(list(chapters_dir.glob("*.json"))) == 2

    client.delete(f"/api/books/{book_id}/chapters/{ch_id}")

    resp = client.post(
        f"/api/books/{book_id}/git/commit", json={"message": "Drop removed"}
    )
    assert resp.status_code == 200
    remaining = list(chapters_dir.glob("*.json"))
    assert len(remaining) == 1
    assert "keeper" in remaining[0].name
