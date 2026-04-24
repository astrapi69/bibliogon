"""Execute-path wiring for git_adoption override.

Covers the new orchestrator ExecuteRequest.git_adoption field and
WBT handler's post-import _maybe_adopt_git call.
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
    """Point UPLOADS_ROOT at per-test tmp so adoption writes don't
    pollute the real uploads dir. Also matches the pattern already
    used in test_git_import_adopter.py."""
    monkeypatch.setattr(git_backup, "UPLOADS_ROOT", tmp_path / "uploads")


def _wbt_zip_with_git(tmp_dir: Path, *, remote: str | None = None) -> Path:
    """Build a ZIP that contains a real .git/ directory + WBT layout."""
    # Scratch repo outside the eventual ZIP.
    src = tmp_dir / "src"
    src.mkdir()
    repo = gitpy.Repo.init(src, initial_branch="main")
    repo.git.config("user.name", "T")
    repo.git.config("user.email", "t@example.com")
    (src / "seed.txt").write_text("x", encoding="utf-8")
    repo.git.add(all=True)
    repo.index.commit("seed")
    if remote:
        repo.create_remote("origin", remote)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Adopt Test\nauthor: A\nlang: en\n",
        )
        zf.writestr("book/manuscript/chapters/01.md", "# C1\n\nBody.\n")
        for file in (src / ".git").rglob("*"):
            if file.is_file():
                zf.write(file, f"book/{file.relative_to(src)}")
    path = tmp_dir / "with_git.zip"
    path.write_bytes(buf.getvalue())
    return path


def _detect(client: TestClient, zip_path: Path) -> dict:
    with open(zip_path, "rb") as f:
        bytes_ = f.read()
    resp = client.post(
        "/api/import/detect",
        files=[("files", (zip_path.name, bytes_, "application/zip"))],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _execute(client: TestClient, payload: dict) -> dict:
    resp = client.post("/api/import/execute", json=payload)
    return {"status_code": resp.status_code, **resp.json()}


def test_git_adoption_absent_acts_as_start_fresh(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_zip_with_git(tmp_path)
    detected = _detect(client, zip_path)
    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
        },
    )
    assert result["status_code"] == 200
    # No .git/ under uploads/<book_id>/; default behaviour unchanged.
    book_id = result["book_id"]
    assert not (git_backup.repo_path(book_id) / ".git").is_dir()


def test_git_adoption_start_fresh_explicit_is_noop(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_zip_with_git(tmp_path)
    detected = _detect(client, zip_path)
    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
            "git_adoption": "start_fresh",
        },
    )
    assert result["status_code"] == 200
    book_id = result["book_id"]
    assert not (git_backup.repo_path(book_id) / ".git").is_dir()


def test_git_adoption_adopt_without_remote_copies_git(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_zip_with_git(
        tmp_path, remote="https://github.com/foo/bar.git"
    )
    detected = _detect(client, zip_path)
    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
            "git_adoption": "adopt_without_remote",
        },
    )
    assert result["status_code"] == 200, result
    book_id = result["book_id"]
    adopted = git_backup.repo_path(book_id) / ".git"
    assert adopted.is_dir()
    # Remote stripped: Bibliogon's remote config absent.
    repo = gitpy.Repo(git_backup.repo_path(book_id))
    assert "origin" not in [r.name for r in repo.remotes]


def test_git_adoption_adopt_with_remote_sets_up_remote(
    client: TestClient, tmp_path: Path
) -> None:
    zip_path = _wbt_zip_with_git(
        tmp_path, remote="https://github.com/foo/bar.git"
    )
    detected = _detect(client, zip_path)
    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
            "git_adoption": "adopt_with_remote",
        },
    )
    assert result["status_code"] == 200, result
    book_id = result["book_id"]
    adopted_dir = git_backup.repo_path(book_id)
    assert (adopted_dir / ".git").is_dir()
    # Remote URL in native git config + Bibliogon's
    # .bibliogon-git-config.yaml written via configure_remote.
    repo = gitpy.Repo(adopted_dir)
    urls = [next(r.urls) for r in repo.remotes if r.name == "origin"]
    assert urls == ["https://github.com/foo/bar.git"]


def test_git_adoption_without_source_git_returns_400(
    client: TestClient, tmp_path: Path
) -> None:
    """User sends adopt_* but source has no .git/; orchestrator
    returns 400 before reaching the handler."""
    # Build a ZIP WITHOUT .git/.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: No Git\nauthor: A\nlang: en\n",
        )
        zf.writestr("book/manuscript/chapters/01.md", "# C1\n\nBody.\n")
    zip_path = tmp_path / "no_git.zip"
    zip_path.write_bytes(buf.getvalue())

    detected = _detect(client, zip_path)
    assert detected["detected"]["git_repo"] is None

    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
            "git_adoption": "adopt_with_remote",
        },
    )
    assert result["status_code"] == 400
    assert "git_repo.present" in result["detail"]


def test_git_adoption_sanitization_strips_credentials(
    client: TestClient, tmp_path: Path
) -> None:
    """Source repo with extraheader in .git/config -> adopted repo
    has it stripped."""
    src = tmp_path / "src"
    src.mkdir()
    repo = gitpy.Repo.init(src, initial_branch="main")
    repo.git.config("user.name", "T")
    repo.git.config("user.email", "t@example.com")
    (src / "seed.txt").write_text("x", encoding="utf-8")
    repo.git.add(all=True)
    repo.index.commit("seed")
    cfg = src / ".git" / "config"
    with cfg.open("a", encoding="utf-8") as f:
        f.write(
            '\n[http "https://github.com/"]\n'
            "\textraheader = AUTHORIZATION: Basic SECRETTOKEN\n"
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "book/config/metadata.yaml",
            "title: Sanitize\nauthor: A\nlang: en\n",
        )
        zf.writestr("book/manuscript/chapters/01.md", "# C\n\nBody.\n")
        for file in (src / ".git").rglob("*"):
            if file.is_file():
                zf.write(file, f"book/{file.relative_to(src)}")
    zip_path = tmp_path / "with_creds.zip"
    zip_path.write_bytes(buf.getvalue())

    detected = _detect(client, zip_path)
    result = _execute(
        client,
        {
            "temp_ref": detected["temp_ref"],
            "overrides": {},
            "duplicate_action": "create",
            "git_adoption": "adopt_without_remote",
        },
    )
    assert result["status_code"] == 200
    book_id = result["book_id"]
    adopted_cfg = (
        git_backup.repo_path(book_id) / ".git" / "config"
    ).read_text(encoding="utf-8")
    assert "SECRETTOKEN" not in adopted_cfg
    assert "extraheader" not in adopted_cfg.lower()


# ============================================================
# POST /api/books/{id}/git-import/adopt
# ============================================================
# Consolidated here rather than in a separate file to share the
# TestClient lifespan; the module-scoped `client` above accrues
# one .venv lifespan per module, and the full suite hits the
# documented RecursionError threshold when too many modules each
# spin up their own TestClient(app) fixture (see
# .claude/rules/lessons-learned.md).


def _create_book(client: TestClient, title: str = "Backfill Target") -> str:
    resp = client.post(
        "/api/books", json={"title": title, "author": "A"}
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _zip_with_git_at_root(tmp: Path, *, remote: str | None = None) -> bytes:
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


def test_backfill_rejects_zip_without_git(client: TestClient) -> None:
    book_id = _create_book(client)
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


def test_backfill_rejects_non_zip_upload(client: TestClient) -> None:
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
