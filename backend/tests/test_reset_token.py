"""Unit tests for the Danger Zone reset-token HMAC scheme.

Covers: happy-path issue + verify, expired tokens reject, tampered
signature rejects, tampered payload rejects, malformed input
rejects, empty/garbage rejects.
"""

from __future__ import annotations

import base64
import time

from app.services import reset_token


def test_issue_token_is_well_formed() -> None:
    issued = reset_token.issue_token(ttl_seconds=60)
    assert "." in issued.encoded
    payload_b64, signature_b64 = issued.encoded.split(".", 1)
    assert payload_b64
    assert signature_b64
    assert issued.expires_at > int(time.time())


def test_verify_accepts_fresh_token() -> None:
    issued = reset_token.issue_token(ttl_seconds=60)
    assert reset_token.verify_token(issued.encoded) is True


def test_verify_rejects_expired_token() -> None:
    issued = reset_token.issue_token(ttl_seconds=1)
    # Simulate clock advance past the TTL.
    assert reset_token.verify_token(issued.encoded, now=issued.expires_at + 1) is False


def test_verify_rejects_tampered_signature() -> None:
    issued = reset_token.issue_token(ttl_seconds=60)
    payload_b64, signature_b64 = issued.encoded.split(".", 1)
    # Flip one byte in the signature.
    raw = bytearray(base64.urlsafe_b64decode(reset_token._pad(signature_b64)))
    raw[0] ^= 0xFF
    bad_sig = base64.urlsafe_b64encode(bytes(raw)).decode().rstrip("=")
    tampered = f"{payload_b64}.{bad_sig}"
    assert reset_token.verify_token(tampered) is False


def test_verify_rejects_tampered_payload() -> None:
    issued = reset_token.issue_token(ttl_seconds=60)
    _payload_b64, signature_b64 = issued.encoded.split(".", 1)
    forged_payload = base64.urlsafe_b64encode(b"forged:9999999999").decode().rstrip("=")
    tampered = f"{forged_payload}.{signature_b64}"
    assert reset_token.verify_token(tampered) is False


def test_verify_rejects_malformed_string() -> None:
    assert reset_token.verify_token("") is False
    assert reset_token.verify_token("no-dot-in-here") is False
    assert reset_token.verify_token("a.b.c") is False  # only first split honoured, sig invalid
    assert reset_token.verify_token("!@#$.%^&*") is False


def test_two_tokens_are_distinct() -> None:
    a = reset_token.issue_token(ttl_seconds=60)
    b = reset_token.issue_token(ttl_seconds=60)
    assert a.nonce != b.nonce
    assert a.encoded != b.encoded


def test_default_ttl_is_five_minutes() -> None:
    assert reset_token.DEFAULT_TTL_SECONDS == 300
    issued = reset_token.issue_token()
    delta = issued.expires_at - int(time.time())
    assert 295 <= delta <= 301
