"""Phase 3 SSH key management for git-based backup.

Generates an Ed25519 keypair in OpenSSH format and stores it under
``config/ssh/``. The public key is meant to be copy-pasted into
GitHub/GitLab/Gitea by the user; the private key stays on disk with
permissions 0600 and is consumed by :mod:`app.services.git_backup`
push/pull through the ``GIT_SSH_COMMAND`` env var.

One keypair per install. Phase 3 out of scope: per-book keys, multiple
keys, per-host configuration. See
[docs/explorations/git-based-backup.md](../../../docs/explorations/git-based-backup.md)
Phase 3.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

logger = logging.getLogger(__name__)

SSH_DIR = Path("config/ssh")
PRIVATE_KEY_NAME = "id_ed25519"
PUBLIC_KEY_NAME = "id_ed25519.pub"


class SshKeyError(Exception):
    """Base for SSH-key failures."""


class SshKeyExistsError(SshKeyError):
    """Generate called while a keypair already exists."""


class SshKeyNotFoundError(SshKeyError):
    """Operation requires a keypair but none is present."""


def _ssh_dir() -> Path:
    SSH_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(SSH_DIR, 0o700)
    except OSError:
        # Windows or restrictive container FS.
        pass
    return SSH_DIR


def private_key_path() -> Path:
    return SSH_DIR / PRIVATE_KEY_NAME


def public_key_path() -> Path:
    return SSH_DIR / PUBLIC_KEY_NAME


def exists() -> bool:
    """True when both halves of the keypair are present on disk."""
    return private_key_path().is_file() and public_key_path().is_file()


def generate(comment: str | None = None, *, overwrite: bool = False) -> dict[str, Any]:
    """Create a fresh Ed25519 keypair in OpenSSH format.

    The comment is appended to the public key line; GitHub, GitLab, and
    Gitea all display it as the key label in their UI.
    """
    if exists() and not overwrite:
        raise SshKeyExistsError(
            "An SSH keypair already exists. Delete it first or set overwrite=True."
        )

    label = (comment or "bibliogon").strip() or "bibliogon"

    key = Ed25519PrivateKey.generate()
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_openssh = key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )

    _ssh_dir()
    priv = private_key_path()
    pub = public_key_path()

    priv.write_bytes(private_pem)
    # OpenSSH refuses to use private keys with loose perms; 0600 is
    # mandatory, not just hygiene.
    try:
        os.chmod(priv, 0o600)
    except OSError:
        pass

    # Public key: "<type> <base64> <comment>\n"
    pub.write_bytes(public_openssh + b" " + label.encode("utf-8") + b"\n")
    try:
        os.chmod(pub, 0o644)
    except OSError:
        pass

    logger.info("Generated SSH keypair at %s (%d bytes private)", priv, priv.stat().st_size)
    return get_metadata() or {}


def get_public_key() -> str:
    """Return the OpenSSH-format public key (``ssh-ed25519 AAAA... label``).

    Raises :class:`SshKeyNotFoundError` when no keypair exists.
    """
    if not exists():
        raise SshKeyNotFoundError("No SSH keypair. Generate one first.")
    return public_key_path().read_text(encoding="utf-8").strip()


def get_metadata() -> dict[str, Any] | None:
    """Non-sensitive metadata for the UI. None when no keypair exists."""
    if not exists():
        return None
    stat_result = private_key_path().stat()
    pub = public_key_path().read_text(encoding="utf-8").strip()
    # "<type> <base64> <comment>"
    parts = pub.split(None, 2)
    key_type = parts[0] if len(parts) >= 1 else "ssh-ed25519"
    comment = parts[2] if len(parts) >= 3 else ""
    return {
        "exists": True,
        "type": key_type,
        "comment": comment,
        "created_at": datetime.fromtimestamp(stat_result.st_mtime, tz=UTC).isoformat(),
        "public_key": pub,
    }


def delete() -> bool:
    """Remove the keypair. Idempotent. Returns True when files existed."""
    removed = False
    for path in (private_key_path(), public_key_path()):
        if path.exists():
            path.unlink()
            removed = True
    if removed:
        logger.info("SSH keypair deleted from %s", SSH_DIR)
    return removed
