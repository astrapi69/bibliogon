"""Tests for ``app.services.git_import_inspector``.

Each test builds a minimal on-disk .git-like directory (or a real
GitPython-initialized repo) and asserts what
:func:`inspect_git_dir` reports. Never touches the network.
"""

from __future__ import annotations

from pathlib import Path

import git
import pytest

from app.services.git_import_inspector import (
    _looks_like_token_email,
    _scan_security,
    inspect_git_dir,
)


def _init_repo(root: Path, *, commits: int = 1) -> Path:
    """Create a real repo at ``root``, commit N empty changes, return
    the working-tree root (not .git/)."""
    root.mkdir(parents=True, exist_ok=True)
    repo = git.Repo.init(root, initial_branch="main")
    repo.git.config("user.name", "Test")
    repo.git.config("user.email", "test@example.com")
    for i in range(commits):
        file = root / f"file-{i}.txt"
        file.write_text(f"content {i}\n", encoding="utf-8")
        repo.git.add(all=True)
        repo.index.commit(f"commit {i}")
    return root


# --- inspect_git_dir happy path ---


def test_inspect_returns_not_present_when_dir_missing(tmp_path: Path) -> None:
    result = inspect_git_dir(tmp_path / "nonexistent")
    assert result.present is False


def test_inspect_clean_repo_reports_metadata(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book", commits=3)
    result = inspect_git_dir(root / ".git")
    assert result.present is True
    assert result.size_bytes > 0
    assert result.current_branch == "main"
    assert result.head_sha is not None
    assert len(result.head_sha) == 40
    assert result.commit_count == 3
    assert result.is_corrupted is False
    assert result.has_lfs is False
    assert result.has_submodules is False
    assert result.is_shallow is False
    assert result.security_warnings == []


def test_inspect_detects_remote_url(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    repo = git.Repo(root)
    repo.create_remote("origin", "https://github.com/astrapi69/fake.git")
    result = inspect_git_dir(root / ".git")
    assert result.remote_url == "https://github.com/astrapi69/fake.git"


def test_inspect_no_remote_url_is_none(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    result = inspect_git_dir(root / ".git")
    assert result.remote_url is None


# --- feature detection ---


def test_inspect_detects_lfs_filter(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    (root / ".gitattributes").write_text(
        "*.bin filter=lfs diff=lfs merge=lfs -text\n", encoding="utf-8"
    )
    result = inspect_git_dir(root / ".git")
    assert result.has_lfs is True


def test_inspect_detects_submodules(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    (root / ".gitmodules").write_text(
        '[submodule "x"]\n  path = x\n  url = https://example.invalid\n',
        encoding="utf-8",
    )
    result = inspect_git_dir(root / ".git")
    assert result.has_submodules is True


def test_inspect_detects_shallow(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    (root / ".git" / "shallow").write_text("abc\n", encoding="utf-8")
    result = inspect_git_dir(root / ".git")
    assert result.is_shallow is True


# --- corruption ---


def test_inspect_reports_corrupted_repo(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book", commits=2)
    # Drop one object file to corrupt the store.
    objects_dir = root / ".git" / "objects"
    for sub in objects_dir.iterdir():
        if sub.is_dir() and len(sub.name) == 2:  # 2-char subdir
            for obj in sub.iterdir():
                obj.unlink()
                break
            break
    result = inspect_git_dir(root / ".git")
    assert result.is_corrupted is True


# --- security scan ---


def test_security_scan_clean_repo(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    assert _scan_security(root / ".git") == []


def test_security_scan_flags_http_extraheader(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    cfg = root / ".git" / "config"
    with cfg.open("a", encoding="utf-8") as f:
        f.write(
            '\n[http "https://github.com/"]\n'
            "\textraheader = AUTHORIZATION: Basic dGVzdA==\n"
        )
    warnings = _scan_security(root / ".git")
    assert any("extraheader" in w.lower() for w in warnings)


def test_security_scan_flags_credential_helper(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    repo = git.Repo(root)
    repo.git.config("credential.helper", "store")
    warnings = _scan_security(root / ".git")
    assert any("credential helper" in w.lower() for w in warnings)


def test_security_scan_flags_custom_hooks(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    hook = root / ".git" / "hooks" / "post-commit"
    hook.write_text("#!/bin/sh\necho hacked\n", encoding="utf-8")
    hook.chmod(0o755)
    warnings = _scan_security(root / ".git")
    assert any("hook" in w.lower() for w in warnings)


def test_security_scan_flags_suspicious_packed_refs(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    packed = root / ".git" / "packed-refs"
    # Adjacent string literal + `*` binds the wrong way; use explicit
    # concatenation so "0" * 40 is NOT merged into the prefix.
    packed.write_text(
        "# pack-refs with: peeled fully-peeled sorted\n"
        + ("0" * 40)
        + " refs/evil/backdoor\n",
        encoding="utf-8",
    )
    warnings = _scan_security(root / ".git")
    assert any("refs/evil" in w for w in warnings)


def test_security_scan_multiple_findings(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book")
    cfg = root / ".git" / "config"
    with cfg.open("a", encoding="utf-8") as f:
        f.write(
            '\n[http "https://github.com/"]\n'
            "\textraheader = AUTHORIZATION: Basic dGVzdA==\n"
            "\n[credential]\n\thelper = store\n"
        )
    hook = root / ".git" / "hooks" / "pre-push"
    hook.write_text("#!/bin/sh\n:\n", encoding="utf-8")
    hook.chmod(0o755)
    warnings = _scan_security(root / ".git")
    assert len(warnings) >= 3


# --- token-email heuristic ---


@pytest.mark.parametrize(
    "email",
    [
        "ghp_abcdefghijklmnopqrstuvwxyz012345@users.noreply.github.com",
        "glpat_abcdef1234567890abcdef1234567890@gitlab.local",
        "abcdef1234567890abcdef1234567890abcdef12@example.com",
    ],
)
def test_token_email_heuristic_flags_token_shape(email: str) -> None:
    assert _looks_like_token_email(email) is True


@pytest.mark.parametrize(
    "email",
    [
        "alice@example.com",
        "test@github.com",
        "a.very.long.name@company.example.com",
        "short@x.io",
    ],
)
def test_token_email_heuristic_passes_normal(email: str) -> None:
    assert _looks_like_token_email(email) is False


# --- edge: detached HEAD ---


def test_inspect_detached_head(tmp_path: Path) -> None:
    root = _init_repo(tmp_path / "book", commits=2)
    repo = git.Repo(root)
    # Checkout the first commit by SHA (detached).
    first = list(repo.iter_commits())[-1]
    repo.git.checkout(first.hexsha)
    result = inspect_git_dir(root / ".git")
    assert result.current_branch is None
    assert result.head_sha == first.hexsha


# --- edge: empty repo (no commits) ---


def test_inspect_empty_repo(tmp_path: Path) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    git.Repo.init(root, initial_branch="main")
    result = inspect_git_dir(root / ".git")
    assert result.present is True
    # HEAD exists as 'ref: refs/heads/main' but the ref file does
    # not exist until first commit; head_sha should be None.
    assert result.current_branch == "main"
    assert result.head_sha is None
    assert result.commit_count in (0, None)
