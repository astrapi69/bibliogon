"""Per-book git credential helpers shared across git_backup + plugin-git-sync.

PGS-02-FU-01 follow-up. Both subsystems push to remotes scoped by
``book_id`` and benefit from one shared PAT (and one shared SSH key).
The actual storage primitives live in :mod:`app.credential_store`;
this module is the per-book convention layer.

Storage layout: ``config/git_credentials/{book_id}.enc`` (Fernet-encrypted).
Tests redirect via the ``GIT_CRED_DIR`` module attribute.
"""

from __future__ import annotations

import urllib.parse
from pathlib import Path

from app import credential_store
from app.services import ssh_keys

# Single source of truth for the per-book PAT directory. Tests
# monkeypatch this attribute. Keep imports of this constant via the
# module path (``git_credentials.GIT_CRED_DIR``), never via ``from
# git_credentials import GIT_CRED_DIR`` - the latter freezes the
# binding at import time and defeats the monkeypatch.
GIT_CRED_DIR = Path("config/git_credentials")


def pat_filename(book_id: str) -> str:
    """Convention: one encrypted PAT per book at ``{book_id}.enc``."""
    return f"{book_id}.enc"


def save_pat(book_id: str, pat: str) -> None:
    """Persist an encrypted PAT for ``book_id``. Empty input deletes."""
    pat = (pat or "").strip()
    if not pat:
        delete_pat(book_id)
        return
    credential_store.save_encrypted(
        pat.encode("utf-8"),
        filename=pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    )


def delete_pat(book_id: str) -> None:
    """Idempotent secure delete of the PAT for ``book_id``."""
    credential_store.secure_delete(
        filename=pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    )


def has_pat(book_id: str) -> bool:
    """True when a PAT is stored for ``book_id``."""
    return credential_store.is_configured(
        filename=pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    )


def load_pat(book_id: str) -> str | None:
    """Return the decrypted PAT for ``book_id`` or None when missing/empty."""
    if not has_pat(book_id):
        return None
    raw = credential_store.load_decrypted(
        filename=pat_filename(book_id),
        credentials_dir=GIT_CRED_DIR,
    )
    pat = raw.decode("utf-8").strip()
    return pat or None


def is_ssh_url(url: str) -> bool:
    """True when ``url`` is SSH (``ssh://`` or ``user@host:path``)."""
    if url.startswith("ssh://"):
        return True
    if "://" not in url and "@" in url and ":" in url.split("@", 1)[1]:
        return True
    return False


def inject_pat_into_url(url: str, book_id: str) -> str:
    """Return ``url`` with the per-book PAT embedded for HTTPS auth.

    Returns the input unchanged when:
    - URL is not http/https (SSH, file://, ...).
    - No PAT is stored for ``book_id``.

    Stripping any pre-existing ``user:pw@`` prevents double credentials
    when a user pasted a token-bearing URL.
    """
    scheme = url.split("://", 1)[0] if "://" in url else ""
    if scheme not in ("http", "https"):
        return url

    pat = load_pat(book_id)
    if not pat:
        return url

    encoded_pat = urllib.parse.quote(pat, safe="")
    prefix, rest = url.split("://", 1)
    if "@" in rest:
        rest = rest.split("@", 1)[1]
    return f"{prefix}://x-access-token:{encoded_pat}@{rest}"


def ssh_env(url: str) -> dict[str, str] | None:
    """Return a ``GIT_SSH_COMMAND`` env mapping for SSH URLs when a
    Bibliogon-managed key exists. None otherwise.

    ``-i`` points at the stored private key; ``IdentitiesOnly=yes``
    keeps ssh-agent from trying unrelated keys first;
    ``StrictHostKeyChecking=accept-new`` lets first-time hosts connect
    without manual ``known_hosts`` seeding while still pinning on
    subsequent connects (standard OpenSSH TOFU).
    """
    if not is_ssh_url(url) or not ssh_keys.exists():
        return None
    key_path = ssh_keys.private_key_path().resolve()
    cmd = f'ssh -i "{key_path}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
    return {"GIT_SSH_COMMAND": cmd}
