"""Tests for ``app.services.git_import_adopter``.

Sanitization contract + adoption of an extracted .git/ into
``uploads/{book_id}/.git/``. Hits the real filesystem via
tmp_path; GitPython operates on local-only repos (no network).
"""

from __future__ import annotations

import configparser
from pathlib import Path

import git
import pytest

from app.services import git_backup
from app.services.git_import_adopter import (
    CorruptedSourceRepo,
    RepoAlreadyPresent,
    adopt_git_dir,
    sanitize_git_dir,
)


def _init_repo(root: Path, *, commits: int = 1, remote: str | None = None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(root, initial_branch="main")
    repo.git.config("user.name", "Test")
    repo.git.config("user.email", "test@example.com")
    for i in range(commits):
        f = root / f"file-{i}.txt"
        f.write_text(f"{i}", encoding="utf-8")
        repo.git.add(all=True)
        repo.index.commit(f"c{i}")
    if remote:
        repo.create_remote("origin", remote)
    return root


@pytest.fixture(autouse=True)
def _isolate_uploads(tmp_path, monkeypatch):
    """``git_backup.repo_path`` reads ``UPLOADS_ROOT`` at import time as
    a module-level ``Path("uploads")``; point it at tmp so tests
    don't touch the real uploads dir."""
    monkeypatch.setattr(git_backup, "UPLOADS_ROOT", tmp_path / "uploads")


# --- sanitize_git_dir ---


def test_sanitize_strips_http_extraheader(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "src")
    cfg = root / ".git" / "config"
    with cfg.open("a", encoding="utf-8") as f:
        f.write(
            '\n[http "https://github.com/"]\n'
            "\textraheader = AUTHORIZATION: Basic dGVzdA==\n"
        )
    actions = sanitize_git_dir(root / ".git")
    parser = configparser.ConfigParser(strict=False, interpolation=None)
    parser.read(cfg, encoding="utf-8")
    for section in parser.sections():
        if section.startswith("http"):
            assert "extraheader" not in parser[section]
    assert any("extraheader" in a for a in actions)


def test_sanitize_strips_credential_section(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "src")
    repo = git.Repo(root)
    repo.git.config("credential.helper", "store")
    sanitize_git_dir(root / ".git")
    parser = configparser.ConfigParser(strict=False, interpolation=None)
    parser.read(root / ".git" / "config", encoding="utf-8")
    assert not parser.has_section("credential")


def test_sanitize_clears_reflog(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "src", commits=3)
    # Reflog exists after 3 commits.
    reflog = root / ".git" / "logs" / "HEAD"
    assert reflog.is_file()
    sanitize_git_dir(root / ".git")
    # After expire --expire=now, the HEAD reflog shrinks to (at most)
    # the current tip entry. Good enough: assert size is small.
    assert reflog.stat().st_size < 200  # one line max


def test_sanitize_removes_custom_hooks_keeps_samples(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "src")
    custom = root / ".git" / "hooks" / "post-commit"
    custom.write_text("#!/bin/sh\n:\n", encoding="utf-8")
    custom.chmod(0o755)
    sample = root / ".git" / "hooks" / "pre-commit.sample"
    assert sample.is_file()  # git init creates these

    sanitize_git_dir(root / ".git")

    assert not custom.exists()
    assert sample.exists()


def test_sanitize_prunes_non_standard_packed_refs(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "src")
    packed = root / ".git" / "packed-refs"
    packed.write_text(
        "# pack-refs with: peeled fully-peeled sorted\n"
        + ("0" * 40) + " refs/heads/main\n"
        + ("1" * 40) + " refs/evil/backdoor\n",
        encoding="utf-8",
    )
    sanitize_git_dir(root / ".git")
    remaining = packed.read_text(encoding="utf-8")
    assert "refs/heads/main" in remaining
    assert "refs/evil" not in remaining


# --- adopt_git_dir ---


def test_adopt_copies_git_into_book_uploads(tmp_path: Path) -> None:
    src = _init_repo(tmp_path / "src", commits=2)
    result = adopt_git_dir(
        git_dir=src / ".git",
        target_book_id="adopt-1",
        preserve_remote=False,
    )
    target = git_backup.repo_path("adopt-1")
    assert (target / ".git" / "HEAD").is_file()
    assert (target / ".git" / "config").is_file()
    assert result["commit_count"] == 2
    assert result["current_branch"] == "main"


def test_adopt_preserves_current_branch(tmp_path: Path) -> None:
    src = _init_repo(tmp_path / "src", commits=2)
    repo = git.Repo(src)
    repo.git.checkout("-b", "feature-x")
    result = adopt_git_dir(
        git_dir=src / ".git",
        target_book_id="adopt-branch",
        preserve_remote=False,
    )
    assert result["current_branch"] == "feature-x"
    adopted = git.Repo(git_backup.repo_path("adopt-branch"))
    assert adopted.active_branch.name == "feature-x"


def test_adopt_with_preserve_remote_writes_origin(tmp_path: Path) -> None:
    src = _init_repo(
        tmp_path / "src",
        commits=1,
        remote="https://github.com/foo/bar.git",
    )
    result = adopt_git_dir(
        git_dir=src / ".git",
        target_book_id="adopt-remote",
        preserve_remote=True,
    )
    assert result["remote_adopted"] is True
    # db=None path: wrote to native config only.
    adopted = git.Repo(git_backup.repo_path("adopt-remote"))
    origins = [r for r in adopted.remotes if r.name == "origin"]
    assert len(origins) == 1
    assert next(origins[0].urls) == "https://github.com/foo/bar.git"


def test_adopt_without_preserve_remote_strips_origin(tmp_path: Path) -> None:
    src = _init_repo(
        tmp_path / "src",
        commits=1,
        remote="https://github.com/foo/bar.git",
    )
    result = adopt_git_dir(
        git_dir=src / ".git",
        target_book_id="adopt-no-remote",
        preserve_remote=False,
    )
    assert result["remote_adopted"] is False
    adopted = git.Repo(git_backup.repo_path("adopt-no-remote"))
    assert "origin" not in [r.name for r in adopted.remotes]


def test_adopt_rejects_target_with_existing_git(tmp_path: Path) -> None:
    src = _init_repo(tmp_path / "src")
    # Pre-create a target with .git/.
    target = git_backup.repo_path("already-has-git")
    target.mkdir(parents=True, exist_ok=True)
    git.Repo.init(target)
    with pytest.raises(RepoAlreadyPresent):
        adopt_git_dir(
            git_dir=src / ".git",
            target_book_id="already-has-git",
            preserve_remote=False,
        )


def test_adopt_rejects_corrupted_source(tmp_path: Path) -> None:
    src = _init_repo(tmp_path / "src", commits=2)
    # Break an object file to fail fsck.
    objects = src / ".git" / "objects"
    for sub in objects.iterdir():
        if sub.is_dir() and len(sub.name) == 2:
            for obj in sub.iterdir():
                obj.unlink()
                break
            break
    with pytest.raises(CorruptedSourceRepo):
        adopt_git_dir(
            git_dir=src / ".git",
            target_book_id="corrupted",
            preserve_remote=False,
        )


def test_adopt_sanitizes_before_copy(tmp_path: Path) -> None:
    """End-to-end: credentials in source .git/ must NOT appear in the
    adopted target."""
    src = _init_repo(tmp_path / "src")
    cfg = src / ".git" / "config"
    with cfg.open("a", encoding="utf-8") as f:
        f.write(
            "\n[credential]\n\thelper = store\n"
            '\n[http "https://github.com/"]\n'
            "\textraheader = AUTHORIZATION: Basic SECRET\n"
        )
    adopt_git_dir(
        git_dir=src / ".git",
        target_book_id="sanitized-adopt",
        preserve_remote=False,
    )
    adopted_cfg = (
        git_backup.repo_path("sanitized-adopt") / ".git" / "config"
    )
    text = adopted_cfg.read_text(encoding="utf-8")
    assert "SECRET" not in text
    assert "[credential]" not in text
    assert "extraheader" not in text.lower()
