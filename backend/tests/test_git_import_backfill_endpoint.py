"""Tests for POST /api/books/{id}/git-import/adopt.

Post-import adoption endpoint for books that imported before the
.git/ adoption feature shipped. Accepts any ZIP containing a
``.git/`` at root or one level deep.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import git as gitpy
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import git_backup


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(git_backup, "UPLOADS_ROOT", tmp_path / "uploads")


def _create_book(client: TestClient, title: str = "Backfill Target") -> str:
    resp = client.post(
        "/api/books", json={"title": title, "author": "A"}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _zip_with_git_at_root(tmp: Path, *, remote: str | None = None) -> bytes:
    """Build a ZIP where .git/ lives at the top level (e.g. a
    user-extracted repo re-zipped)."""
    src = tmp / "src-root"
    src.mkdir()
    repo = gitpy.Repo.init(src, initial_branch="main")
    repo.git.config("user.name", "T")
    repo.git.config("user.email", "t@example.com")
    (src / "seed.txt").write_text("x", encoding="utf-8")
    repo.git.add(all=True)
    repo.index.commit("c1")
    if remote:
        repo.create_remote("origin", remote)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in src.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(src))
    return buf.getvalue()


def _zip_with_git_one_level_deep(tmp: Path) -> bytes:
    """Build a full WBT-style ZIP with .git/ nested one dir deep."""
    src = tmp / "nested"
    src.mkdir()
    repo = gitpy.Repo.init(src, initial_branch="main")
    repo.git.config("user.name", "T")
    repo.git.config("user.email", "t@example.com")
    (src / "seed.txt").write_text("x", encoding="utf-8")
    repo.git.add(all=True)
    repo.index.commit("init")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in src.rglob("*"):
            if file.is_file():
                zf.write(file, f"project/{file.relative_to(src)}")
    return buf.getvalue()


def test_backfill_rejects_unknown_book(client: TestClient, tmp_path: Path) -> None:
    payload = _zip_with_git_at_root(tmp_path)
    resp = client.post(
        "/api/books/does-not-exist/git-import/adopt",
        files={"file": ("upload.zip", payload, "application/zip")},
    )
    assert resp.status_code == 404


def test_backfill_adopts_git_at_root(client: TestClient, tmp_path: Path) -> None:
    book_id = _create_book(client)
    payload = _zip_with_git_at_root(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("upload.zip", payload, "application/zip")},
    )
    assert resp.status_code == 200, resp.text
    assert (git_backup.repo_path(book_id) / ".git" / "HEAD").is_file()


def test_backfill_finds_git_one_level_deep(
    client: TestClient, tmp_path: Path
) -> None:
    book_id = _create_book(client)
    payload = _zip_with_git_one_level_deep(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("wbt.zip", payload, "application/zip")},
    )
    assert resp.status_code == 200, resp.text


def test_backfill_returns_409_when_target_has_git(
    client: TestClient, tmp_path: Path
) -> None:
    book_id = _create_book(client)
    # Pre-populate a .git/ in the target.
    target = git_backup.repo_path(book_id)
    target.mkdir(parents=True, exist_ok=True)
    gitpy.Repo.init(target)
    assert (target / ".git").is_dir()

    payload = _zip_with_git_at_root(tmp_path)
    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("upload.zip", payload, "application/zip")},
    )
    assert resp.status_code == 409


def test_backfill_rejects_zip_without_git(
    client: TestClient, tmp_path: Path
) -> None:
    book_id = _create_book(client)
    # ZIP with no .git/ inside.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project/config/metadata.yaml", "title: No Git\n")
        zf.writestr("project/manuscript/chapters/01.md", "# C\n")

    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("plain.zip", buf.getvalue(), "application/zip")},
    )
    assert resp.status_code == 400
    assert ".git/" in resp.json()["detail"]


def test_backfill_rejects_non_zip_upload(
    client: TestClient, tmp_path: Path
) -> None:
    book_id = _create_book(client)
    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("not-a-zip.txt", b"plain text", "text/plain")},
    )
    assert resp.status_code == 400


def test_backfill_preserve_remote_flag(
    client: TestClient, tmp_path: Path
) -> None:
    book_id = _create_book(client)
    payload = _zip_with_git_at_root(
        tmp_path, remote="https://github.com/foo/bar.git"
    )
    resp = client.post(
        f"/api/books/{book_id}/git-import/adopt",
        files={"file": ("upload.zip", payload, "application/zip")},
        data={"preserve_remote": "true"},
    )
    assert resp.status_code == 200, resp.text
    repo = gitpy.Repo(git_backup.repo_path(book_id))
    origins = [r for r in repo.remotes if r.name == "origin"]
    assert len(origins) == 1
    assert next(origins[0].urls) == "https://github.com/foo/bar.git"
