"""Tests for the per-book git credential helpers (PGS-02-FU-01).

Pin the contract that ``git_backup`` and plugin-git-sync share via
:mod:`app.services.git.credentials`:

- one PAT per book, encrypted at rest
- HTTPS URL injection produces ``x-access-token:<pat>@host``
- non-HTTPS URLs are returned unchanged
- SSH URL detection covers both ``ssh://`` and ``git@host:path``
- ``ssh_env`` returns None unless a Bibliogon SSH key exists
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import ssh_keys
from app.services.git import credentials as git_credentials


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


# --- pat_git_config ---


def test_pat_git_config_passes_the_token_through_the_environment() -> None:
    """#989: the token goes in the environment, never in a config value."""
    git_credentials.save_pat("book-1", "ghp_secret")
    result = git_credentials.pat_git_config("https://github.com/foo/bar.git", "book-1")
    assert result is not None
    options, env = result
    assert env[git_credentials.PAT_ENV_VAR] == "ghp_secret"
    assert "ghp_secret" not in " ".join(options)


def test_pat_git_config_resets_any_ambient_credential_helper() -> None:
    """An empty first value clears the list, so a global helper cannot cache."""
    git_credentials.save_pat("book-1", "ghp_secret")
    result = git_credentials.pat_git_config("https://github.com/foo/bar.git", "book-1")
    assert result is not None
    options, _ = result
    assert options[0] == "credential.helper="
    assert options[1].startswith("credential.helper=!")


def test_pat_git_config_disables_the_terminal_prompt() -> None:
    """A rejected token must fail, not block on a prompt nobody can answer."""
    git_credentials.save_pat("book-1", "ghp_secret")
    result = git_credentials.pat_git_config("https://github.com/foo/bar.git", "book-1")
    assert result is not None
    _, env = result
    assert env["GIT_TERMINAL_PROMPT"] == "0"


def test_pat_git_config_helper_answers_only_the_get_action() -> None:
    """``store``/``erase`` are no-ops, so git cannot persist the token."""
    assert 'test "$1" = get' in git_credentials._CREDENTIAL_HELPER


def test_pat_git_config_none_without_a_pat() -> None:
    assert git_credentials.pat_git_config("https://github.com/foo/bar.git", "no-pat") is None


def test_pat_git_config_none_for_ssh_urls() -> None:
    git_credentials.save_pat("book-1", "ghp_x")
    assert git_credentials.pat_git_config("git@github.com:foo/bar.git", "book-1") is None


def test_pat_git_config_none_for_file_urls() -> None:
    git_credentials.save_pat("book-1", "ghp_x")
    assert git_credentials.pat_git_config("/tmp/bare.git", "book-1") is None


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
