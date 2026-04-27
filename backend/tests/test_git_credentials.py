"""Tests for the per-book git credential helpers (PGS-02-FU-01).

Pin the contract that ``git_backup`` and plugin-git-sync share via
:mod:`app.services.git_credentials`:

- one PAT per book, encrypted at rest
- HTTPS URL injection produces ``x-access-token:<pat>@host``
- non-HTTPS URLs are returned unchanged
- SSH URL detection covers both ``ssh://`` and ``git@host:path``
- ``ssh_env`` returns None unless a Bibliogon SSH key exists
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import git_credentials, ssh_keys


@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(git_credentials, "GIT_CRED_DIR", tmp_path / "creds")
    monkeypatch.setattr(ssh_keys, "SSH_DIR", tmp_path / "ssh")
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-pgs02fu")
    yield


# --- PAT round-trip ---


def test_save_then_load_returns_same_pat() -> None:
    git_credentials.save_pat("book-A", "ghp_abc123")
    assert git_credentials.load_pat("book-A") == "ghp_abc123"


def test_has_pat_reflects_save_and_delete() -> None:
    assert git_credentials.has_pat("book-B") is False
    git_credentials.save_pat("book-B", "ghp_x")
    assert git_credentials.has_pat("book-B") is True
    git_credentials.delete_pat("book-B")
    assert git_credentials.has_pat("book-B") is False


def test_save_empty_pat_clears_existing() -> None:
    git_credentials.save_pat("book-C", "ghp_old")
    git_credentials.save_pat("book-C", "")
    assert git_credentials.has_pat("book-C") is False


def test_load_pat_returns_none_when_absent() -> None:
    assert git_credentials.load_pat("book-missing") is None


def test_pat_isolation_per_book() -> None:
    git_credentials.save_pat("book-1", "pat-one")
    git_credentials.save_pat("book-2", "pat-two")
    assert git_credentials.load_pat("book-1") == "pat-one"
    assert git_credentials.load_pat("book-2") == "pat-two"


# --- inject_pat_into_url ---


def test_inject_pat_into_https_url() -> None:
    git_credentials.save_pat("book-1", "ghp_secret")
    url = git_credentials.inject_pat_into_url("https://github.com/foo/bar.git", "book-1")
    assert url == "https://x-access-token:ghp_secret@github.com/foo/bar.git"


def test_inject_pat_url_encodes_special_chars() -> None:
    git_credentials.save_pat("book-1", "p@ss/word")
    url = git_credentials.inject_pat_into_url("https://gitlab.com/x.git", "book-1")
    assert "x-access-token:p%40ss%2Fword@gitlab.com/x.git" in url


def test_inject_strips_existing_credentials_in_url() -> None:
    git_credentials.save_pat("book-1", "new")
    url = git_credentials.inject_pat_into_url("https://old:old@github.com/foo.git", "book-1")
    assert url == "https://x-access-token:new@github.com/foo.git"


def test_inject_returns_url_unchanged_when_no_pat() -> None:
    original = "https://github.com/foo/bar.git"
    assert git_credentials.inject_pat_into_url(original, "no-pat") == original


def test_inject_skips_ssh_urls() -> None:
    git_credentials.save_pat("book-1", "ghp_x")
    ssh = "git@github.com:foo/bar.git"
    assert git_credentials.inject_pat_into_url(ssh, "book-1") == ssh


def test_inject_skips_file_urls() -> None:
    git_credentials.save_pat("book-1", "ghp_x")
    file_url = "/tmp/bare.git"
    assert git_credentials.inject_pat_into_url(file_url, "book-1") == file_url


# --- is_ssh_url ---


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("git@github.com:user/repo.git", True),
        ("ssh://git@github.com/user/repo.git", True),
        ("https://github.com/user/repo.git", False),
        ("http://example.com/repo.git", False),
        ("/tmp/bare.git", False),
        ("file:///tmp/bare.git", False),
    ],
)
def test_is_ssh_url_classification(url: str, expected: bool) -> None:
    assert git_credentials.is_ssh_url(url) is expected


# --- ssh_env ---


def test_ssh_env_none_without_key() -> None:
    assert git_credentials.ssh_env("git@example.com:repo.git") is None


def test_ssh_env_present_when_key_exists_and_url_is_ssh() -> None:
    ssh_keys.generate()
    env = git_credentials.ssh_env("git@example.com:repo.git")
    assert env is not None
    assert "GIT_SSH_COMMAND" in env
    assert "IdentitiesOnly=yes" in env["GIT_SSH_COMMAND"]
    assert str(ssh_keys.private_key_path().resolve()) in env["GIT_SSH_COMMAND"]


def test_ssh_env_none_for_https_url_even_with_key() -> None:
    ssh_keys.generate()
    assert git_credentials.ssh_env("https://github.com/x/y.git") is None
