"""Tests for the encrypted credential storage module."""

import json
import os
from pathlib import Path

import pytest

from app.credential_store import (
    get_metadata,
    is_configured,
    load_decrypted,
    load_to_tempfile,
    save_encrypted,
    secure_delete,
    validate_service_account_json,
)

VALID_SA = json.dumps({
    "type": "service_account",
    "project_id": "test-project",
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
    "client_email": "test@test-project.iam.gserviceaccount.com",
}).encode()


@pytest.fixture(autouse=True)
def set_secret(monkeypatch):
    """Every test gets a consistent encryption secret."""
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "test-secret-for-unit-tests")


# --- validate_service_account_json ---


def test_validate_valid_sa():
    data = validate_service_account_json(VALID_SA)
    assert data["type"] == "service_account"
    assert data["project_id"] == "test-project"


def test_validate_invalid_json():
    with pytest.raises(ValueError, match="Invalid JSON"):
        validate_service_account_json(b"not json {{{")


def test_validate_wrong_type():
    with pytest.raises(ValueError, match="service_account"):
        validate_service_account_json(json.dumps({"type": "authorized_user"}).encode())


def test_validate_missing_fields():
    with pytest.raises(ValueError, match="Missing required"):
        validate_service_account_json(json.dumps({"type": "service_account"}).encode())


# --- encrypt / decrypt roundtrip ---


def test_save_and_load_roundtrip(tmp_path):
    meta = save_encrypted(VALID_SA, credentials_dir=tmp_path)
    assert meta["project_id"] == "test-project"
    assert (tmp_path / "google-credentials.enc").exists()

    decrypted = load_decrypted(credentials_dir=tmp_path)
    assert json.loads(decrypted) == json.loads(VALID_SA)


def test_load_nonexistent_raises_file_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_decrypted(credentials_dir=tmp_path)


def test_load_with_wrong_secret_raises_runtime(tmp_path, monkeypatch):
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    monkeypatch.setenv("BIBLIOGON_CREDENTIALS_SECRET", "different-secret")
    with pytest.raises(RuntimeError, match="decrypt"):
        load_decrypted(credentials_dir=tmp_path)


def test_missing_secret_raises_runtime(tmp_path, monkeypatch):
    monkeypatch.delenv("BIBLIOGON_CREDENTIALS_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="BIBLIOGON_CREDENTIALS_SECRET"):
        save_encrypted(VALID_SA, credentials_dir=tmp_path)


# --- load_to_tempfile ---


def test_load_to_tempfile_creates_readable_file(tmp_path):
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    temp_path = load_to_tempfile(credentials_dir=tmp_path)
    try:
        assert temp_path.exists()
        data = json.loads(temp_path.read_text())
        assert data["project_id"] == "test-project"
    finally:
        temp_path.unlink(missing_ok=True)


# --- is_configured ---


def test_is_configured_false_when_missing(tmp_path):
    assert is_configured(credentials_dir=tmp_path) is False


def test_is_configured_true_after_save(tmp_path):
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    assert is_configured(credentials_dir=tmp_path) is True


# --- secure_delete ---


def test_secure_delete_removes_file(tmp_path):
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    assert secure_delete(credentials_dir=tmp_path) is True
    assert not (tmp_path / "google-credentials.enc").exists()


def test_secure_delete_missing_returns_false(tmp_path):
    assert secure_delete(credentials_dir=tmp_path) is False


def test_secure_delete_overwrites_before_unlink(tmp_path):
    """The file content must be zeroed out before deletion."""
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    target = tmp_path / "google-credentials.enc"
    original_size = target.stat().st_size

    # Monkey-patch unlink to capture the file content right before deletion
    content_before_unlink = []
    original_unlink = Path.unlink

    def spy_unlink(self, *args, **kwargs):
        if self == target:
            content_before_unlink.append(self.read_bytes())
        return original_unlink(self, *args, **kwargs)

    Path.unlink = spy_unlink
    try:
        secure_delete(credentials_dir=tmp_path)
    finally:
        Path.unlink = original_unlink

    assert len(content_before_unlink) == 1
    assert content_before_unlink[0] == b"\x00" * original_size


# --- get_metadata ---


def test_get_metadata_returns_project_info(tmp_path):
    save_encrypted(VALID_SA, credentials_dir=tmp_path)
    meta = get_metadata(credentials_dir=tmp_path)
    assert meta is not None
    assert meta["project_id"] == "test-project"
    assert "private_key" not in meta  # secret must never leak


def test_get_metadata_returns_none_when_missing(tmp_path):
    assert get_metadata(credentials_dir=tmp_path) is None
