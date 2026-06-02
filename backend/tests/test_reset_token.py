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


def test_consume_enforces_one_time_use() -> None:
    """L1: a token is one-time when verified with consume=True.

    A non-consuming verify never spends the token (used by no production
    gate, kept for parity); the first consuming verify succeeds and any
    replay - the vector the /reset endpoint must reject - returns False.
    """
    issued = reset_token.issue_token()
    # Non-consuming reads never spend it.
    assert reset_token.verify_token(issued.encoded) is True
    assert reset_token.verify_token(issued.encoded) is True
    # First consume wins; replay is rejected.
    assert reset_token.verify_token(issued.encoded, consume=True) is True
    assert reset_token.verify_token(issued.encoded, consume=True) is False


def test_expired_token_is_not_consumed() -> None:
    """An expired token fails the TTL check before the nonce is spent, so a
    later (hypothetical, clock-rewound) consume of the same nonce is still
    available - expiry and replay are independent gates."""
    issued = reset_token.issue_token(ttl_seconds=60)
    assert (
        reset_token.verify_token(issued.encoded, now=issued.expires_at + 1, consume=True)
        is False
    )
    assert issued.nonce not in reset_token._CONSUMED_NONCES
