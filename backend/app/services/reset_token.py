"""HMAC-signed one-time tokens for the Danger Zone reset endpoint.

The reset flow is two-phase:

1. Client calls ``POST /api/system/reset/prepare`` to obtain a
   signed token + an ``expires_at`` timestamp (default 5 min TTL).
2. Client calls ``POST /api/system/reset`` with the token plus the
   literal string ``"RESET"`` as a confirmation. Both must verify.

The signing secret is a per-process random 32-byte value generated
at module import (``_RESET_TOKEN_SECRET``). Tokens cannot survive a
server restart - by design - so a 5-minute window is short enough
that this is not a usability concern and removes any need to
persist the secret. The token payload carries the nonce + expiry;
the HMAC binds them together.

This is deliberately NOT reusing ``BIBLIOGON_SECRET_KEY``: that env
var is HMAC for license signature verification (a long-lived
contract that must survive restarts). The reset token's lifecycle
is single-request-pair and intentionally fragile across restarts.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

DEFAULT_TTL_SECONDS = 300  # 5 minutes

_RESET_TOKEN_SECRET: bytes = secrets.token_bytes(32)

# Nonces already spent by a successful ``consume`` verification. Makes the
# two-phase reset token genuinely one-time: a token replayed within its TTL
# is rejected. Per-process (so is the signing secret), so the set never
# outlives the tokens it guards; it only grows by one per executed reset.
_CONSUMED_NONCES: set[str] = set()


@dataclass(frozen=True)
class ResetToken:
    """A signed reset token plus its raw payload fields."""

    encoded: str
    nonce: str
    expires_at: int  # unix seconds


def issue_token(ttl_seconds: int = DEFAULT_TTL_SECONDS) -> ResetToken:
    """Build a fresh signed token valid for ``ttl_seconds`` seconds."""
    nonce = secrets.token_urlsafe(16)
    expires_at = int(time.time()) + ttl_seconds
    payload = f"{nonce}:{expires_at}".encode()
    payload_b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(_RESET_TOKEN_SECRET, payload, hashlib.sha256).digest()
    signature_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    encoded = f"{payload_b64}.{signature_b64}"
    return ResetToken(encoded=encoded, nonce=nonce, expires_at=expires_at)


def verify_token(encoded: str, now: int | None = None, *, consume: bool = False) -> bool:
    """Verify signature + expiry on a previously-issued token.

    Returns ``True`` only when (a) the token parses, (b) the HMAC
    matches the per-process secret, and (c) ``expires_at > now``.
    Any malformed or tampered input returns ``False``; we never
    raise on bad input so the caller's error path stays uniform.

    When ``consume=True`` the token is additionally enforced as
    ONE-TIME: a token whose nonce was already spent by a prior
    ``consume`` call returns ``False`` (replay rejected), and a fresh
    valid token's nonce is recorded as spent before returning ``True``.
    The ``/reset`` endpoint passes ``consume=True``; ``/reset/prepare``
    never verifies, so issuing a token does not spend it.
    """
    now = now if now is not None else int(time.time())
    try:
        payload_b64, signature_b64 = encoded.split(".", 1)
    except ValueError:
        return False
    try:
        payload = base64.urlsafe_b64decode(_pad(payload_b64))
        signature = base64.urlsafe_b64decode(_pad(signature_b64))
    except (ValueError, TypeError):
        return False
    expected = hmac.new(_RESET_TOKEN_SECRET, payload, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, signature):
        return False
    try:
        nonce_str, expires_str = payload.decode().split(":", 1)
        expires_at = int(expires_str)
    except (ValueError, UnicodeDecodeError):
        return False
    if not nonce_str or expires_at <= now:
        return False
    if consume:
        if nonce_str in _CONSUMED_NONCES:
            return False  # replay of an already-spent token
        _CONSUMED_NONCES.add(nonce_str)
    return True


def _pad(s: str) -> str:
    """Restore base64 padding stripped by ``rstrip('=')``."""
    return s + "=" * (-len(s) % 4)
