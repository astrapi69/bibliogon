"""Tests for Phase 3 SSH keypair management.

Covers:
- generate writes both files with correct perms
- generate refuses second call without overwrite
- get_public_key 404 before generation
- delete idempotent
- metadata shape
- SSH URL classification + GIT_SSH_COMMAND wiring in git_backup
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import git_backup, ssh_keys

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_ssh_dir(tmp_path, monkeypatch):
    """Redirect SSH_DIR to a tmp path so no real keypair is touched."""
    tmp_ssh = tmp_path / "config" / "ssh"
    monkeypatch.setattr(ssh_keys, "SSH_DIR", tmp_ssh)
    yield


# --- generate ---


def test_generate_creates_keypair():
    resp = client.post("/api/ssh/generate", json={"comment": "test-host"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["exists"] is True
    assert body["type"] == "ssh-ed25519"
    assert body["comment"] == "test-host"
    assert body["public_key"].startswith("ssh-ed25519 ")
    assert ssh_keys.private_key_path().is_file()
    assert ssh_keys.public_key_path().is_file()


def test_generate_private_key_is_0600():
    client.post("/api/ssh/generate", json={})
    mode = stat.S_IMODE(ssh_keys.private_key_path().stat().st_mode)
    assert mode == 0o600


def test_generate_refuses_second_call_without_overwrite():
    assert client.post("/api/ssh/generate", json={}).status_code == 200
    resp = client.post("/api/ssh/generate", json={})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "ssh_key_exists"


def test_generate_with_overwrite_replaces_existing():
    first = client.post("/api/ssh/generate", json={}).json()["public_key"]
    second = client.post(
        "/api/ssh/generate", json={"overwrite": True}
    ).json()["public_key"]
    assert first != second


def test_generate_default_comment_is_bibliogon():
    body = client.post("/api/ssh/generate", json={}).json()
    assert body["comment"] == "bibliogon"


# --- get info + public key + delete ---


def test_get_info_before_generation():
    body = client.get("/api/ssh").json()
    assert body["exists"] is False


def test_public_key_404_before_generation():
    resp = client.get("/api/ssh/public-key")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "ssh_key_not_found"


def test_public_key_matches_generate_response():
    gen = client.post("/api/ssh/generate", json={"comment": "abc"}).json()
    got = client.get("/api/ssh/public-key").json()
    assert got["public_key"] == gen["public_key"]


def test_delete_is_idempotent():
    client.post("/api/ssh/generate", json={})
    assert client.delete("/api/ssh").status_code == 204
    # Second delete must also succeed.
    assert client.delete("/api/ssh").status_code == 204
    assert not ssh_keys.exists()


def test_delete_then_generate_works_again():
    client.post("/api/ssh/generate", json={})
    client.delete("/api/ssh")
    resp = client.post("/api/ssh/generate", json={})
    assert resp.status_code == 200
    assert resp.json()["exists"] is True


# --- URL classification ---


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("git@github.com:user/repo.git", True),
        ("ssh://git@github.com/user/repo.git", True),
        ("https://github.com/user/repo.git", False),
        ("http://example.com/repo.git", False),
        ("/tmp/bare.git", False),
        ("file:///tmp/bare.git", False),
        # user@host without a path separator is ambiguous; rule says ssh.
        ("git@example.com:repo.git", True),
    ],
)
def test_is_ssh_url_classification(url: str, expected: bool):
    assert git_backup._is_ssh_url(url) is expected


def test_ssh_env_empty_without_key():
    # No key on disk - even an SSH URL yields None.
    assert git_backup._ssh_env("git@example.com:repo.git") is None


def test_ssh_env_present_when_key_exists_and_url_is_ssh():
    client.post("/api/ssh/generate", json={})
    env = git_backup._ssh_env("git@example.com:repo.git")
    assert env is not None
    assert "GIT_SSH_COMMAND" in env
    assert str(ssh_keys.private_key_path().resolve()) in env["GIT_SSH_COMMAND"]
    assert "IdentitiesOnly=yes" in env["GIT_SSH_COMMAND"]


def test_ssh_env_ignored_for_https_urls():
    client.post("/api/ssh/generate", json={})
    assert git_backup._ssh_env("https://github.com/x/y.git") is None
