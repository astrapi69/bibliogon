"""Encrypted credential storage for sensitive service account files.

Google Cloud TTS requires a Service Account JSON that gives access
to the entire GCP project. Unlike a simple API key (ElevenLabs), a
leaked Service Account can rack up unbounded costs, so we never
store it in plain text on disk.

Encryption uses Fernet (AES-128-CBC + HMAC-SHA256) with a key derived
(SHA-256) from a secret resolved via a fallback chain:
``BIBLIOGON_CREDENTIALS_SECRET`` -> ``BIBLIOGON_SECRET_KEY`` -> an
auto-generated secret persisted in the data dir (so credential storage
works without manual env setup). The encrypted blob lives under the
user data dir (``get_config_dir()/plugins/audiobook/`` by default) with
``chmod 600`` permissions.

The decrypted bytes are only ever held in memory - they are written
to a ``NamedTemporaryFile`` for the short window that the manuscripta
adapter needs a file path, then cleaned up in a ``finally`` block.

Deletion overwrites the file with null bytes before unlinking so
a simple ``undelete`` on the filesystem does not recover the key.
"""

import base64
import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Default credentials directory override. ``None`` means "resolve fresh under
# the data dir" (see ``_default_credentials_dir``); tests set this (or pass
# ``credentials_dir``) to a ``tmp_path``. Never a CWD-relative literal - that
# escapes the isolated data dir (filesystem-isolation rule).
DEFAULT_CREDENTIALS_DIR: Path | None = None

# Persisted auto-generated credentials secret, used only when neither
# BIBLIOGON_CREDENTIALS_SECRET nor BIBLIOGON_SECRET_KEY is set.
_AUTO_SECRET_FILENAME = "credentials.secret"


def _default_credentials_dir() -> Path:
    """Default encrypted-credentials directory, resolved fresh under the user
    data dir (or a test override)."""
    from app.paths import get_config_dir

    return DEFAULT_CREDENTIALS_DIR or (get_config_dir() / "plugins" / "audiobook")


def _get_secret() -> str:
    """Resolve the credentials-encryption secret with a fallback chain so
    credential storage works out of the box:

    1. ``BIBLIOGON_CREDENTIALS_SECRET`` (dedicated; allows independent rotation)
    2. ``BIBLIOGON_SECRET_KEY`` (the app secret start.sh auto-generates)
    3. an auto-generated secret persisted in the data dir on first use.
    """
    secret = os.environ.get("BIBLIOGON_CREDENTIALS_SECRET") or os.environ.get(
        "BIBLIOGON_SECRET_KEY"
    )
    if secret:
        return secret
    return _load_or_create_persisted_secret()


def _load_or_create_persisted_secret() -> str:
    from app.paths import get_config_dir

    path = get_config_dir() / _AUTO_SECRET_FILENAME
    try:
        if path.exists():
            existing = path.read_text(encoding="utf-8").strip()
            if existing:
                return existing
    except OSError as e:
        logger.warning("Could not read persisted credentials secret: %s", e)
    new_secret = base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(new_secret, encoding="utf-8")
        os.chmod(path, 0o600)
    except OSError as e:
        # Could not persist (read-only FS); the in-memory secret still works
        # this process, but stored credentials won't decrypt after a restart.
        logger.warning("Could not persist auto-generated credentials secret: %s", e)
    return new_secret


def _get_cipher() -> Fernet:
    """Build a Fernet cipher from the resolved credentials secret.

    Fernet requires a 32-byte URL-safe base64-encoded key. We derive it
    deterministically from the secret via SHA-256 so any passphrase length
    works.
    """
    secret = _get_secret()
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def validate_service_account_json(raw_bytes: bytes) -> dict[str, Any]:
    """Parse and validate a Google Service Account JSON.

    Returns the parsed dict on success.

    Raises:
        ValueError: on any validation failure (not a JSON, wrong type,
            missing required fields).
    """
    try:
        data = json.loads(raw_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object, got " + type(data).__name__)

    if data.get("type") != "service_account":
        raise ValueError(f"Expected type 'service_account', got '{data.get('type', '<missing>')}'")

    required = {"project_id", "private_key", "client_email"}
    missing = required - data.keys()
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(sorted(missing))}")

    return data


def save_encrypted(
    raw_bytes: bytes,
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> dict[str, str]:
    """Encrypt and persist a credential file. Returns metadata (never the key).

    The caller is responsible for validating the content BEFORE calling
    this function — ``save_encrypted`` only does the encrypt-and-write
    part so it stays reusable for future credential types.
    """
    target_dir = credentials_dir or _default_credentials_dir()
    target_dir.mkdir(parents=True, exist_ok=True)

    cipher = _get_cipher()
    encrypted = cipher.encrypt(raw_bytes)

    target = target_dir / filename
    target.write_bytes(encrypted)
    try:
        os.chmod(target, 0o600)
    except OSError:
        # Windows or restrictive container FS - the encryption is the
        # real protection, chmod is defense-in-depth.
        pass

    logger.info("Encrypted credentials saved to %s (%d bytes)", target, len(encrypted))

    # Return non-sensitive metadata the caller can forward to the UI.
    try:
        data = json.loads(raw_bytes)
        return {
            "project_id": data.get("project_id", ""),
            "client_email": data.get("client_email", ""),
        }
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def load_decrypted(
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> bytes:
    """Read and decrypt a credential file, returning the raw bytes.

    Raises:
        FileNotFoundError: credential file does not exist.
        RuntimeError: decryption failed (wrong secret or corrupted file).
    """
    target = (credentials_dir or _default_credentials_dir()) / filename
    if not target.exists():
        raise FileNotFoundError(f"Credential file not found: {target}")

    cipher = _get_cipher()
    try:
        return cipher.decrypt(target.read_bytes())
    except InvalidToken as e:
        raise RuntimeError(
            "Failed to decrypt credentials. Is BIBLIOGON_CREDENTIALS_SECRET "
            "the same value that was used when the credentials were stored?"
        ) from e


def load_to_tempfile(
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> Path:
    """Decrypt credentials into a temporary file and return its path.

    The caller MUST delete the temp file when done (e.g. in a
    ``finally`` block). The file is created with mode 600.
    """
    decrypted = load_decrypted(filename, credentials_dir)
    tmp = tempfile.NamedTemporaryFile(mode="wb", suffix=".json", delete=False)
    try:
        tmp.write(decrypted)
        tmp.close()
        os.chmod(tmp.name, 0o600)
    except Exception:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise
    return Path(tmp.name)


def is_configured(
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> bool:
    """True if encrypted credentials exist on disk."""
    return ((credentials_dir or _default_credentials_dir()) / filename).exists()


def secure_delete(
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> bool:
    """Overwrite the file with null bytes, then unlink. Returns True if deleted."""
    target = (credentials_dir or _default_credentials_dir()) / filename
    if not target.exists():
        return False
    try:
        size = target.stat().st_size
        with open(target, "wb") as f:
            f.write(b"\x00" * size)
            f.flush()
            os.fsync(f.fileno())
        target.unlink()
        logger.info("Securely deleted %s", target)
        return True
    except OSError as e:
        logger.error("Failed to securely delete %s: %s", target, e)
        # Fall back to simple unlink if overwrite fails
        target.unlink(missing_ok=True)
        return True


def get_metadata(
    filename: str = "google-credentials.enc",
    credentials_dir: Path | None = None,
) -> dict[str, Any] | None:
    """Decrypt and extract non-sensitive metadata. Returns None if not configured."""
    if not is_configured(filename, credentials_dir):
        return None
    try:
        raw = load_decrypted(filename, credentials_dir)
        data = json.loads(raw)
        return {
            "project_id": data.get("project_id", ""),
            "client_email": data.get("client_email", ""),
        }
    except (RuntimeError, FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("Failed to read credential metadata: %s", e)
        return None
