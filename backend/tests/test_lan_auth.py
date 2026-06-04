"""Tests for the LAN-mode PIN gate (LAN-MODE-PHASE-1 C3).

State logic is tested as a pure unit (explicit ``now`` timestamps, no
clock reads). The middleware + verify endpoint are tested against a fresh
FastAPI app wired with a fixed-PIN state, so nothing depends on the
global app or on env vars, and no module-level state leaks between tests.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.lan_auth import (
    SESSION_COOKIE,
    LanAuthState,
    configure_lan_auth,
    lan_mode_enabled,
)

PIN = "424242"


# --- pure state logic ---------------------------------------------------


def test_session_roundtrip_valid_then_expired() -> None:
    state = LanAuthState(pin=PIN, session_ttl=100)
    token = state.create_session(now=1000.0)
    assert state.is_valid_session(token, now=1099.0) is True
    assert state.is_valid_session(token, now=1101.0) is False  # expired
    assert state.is_valid_session(token, now=1099.0) is False  # purged on expiry


def test_unknown_and_empty_session_rejected() -> None:
    state = LanAuthState(pin=PIN)
    assert state.is_valid_session(None, now=0.0) is False
    assert state.is_valid_session("nope", now=0.0) is False


def test_verify_ok_clears_attempts() -> None:
    state = LanAuthState(pin=PIN)
    assert state.verify_pin("000000", "ip", now=0.0) == ("invalid", 2)
    assert state.verify_pin(PIN, "ip", now=1.0) == ("ok", 0)
    # A prior failure must not count toward a later lockout.
    assert state.verify_pin("000000", "ip", now=2.0) == ("invalid", 2)


def test_three_failures_lock_out() -> None:
    state = LanAuthState(pin=PIN, max_attempts=3, lockout_seconds=600)
    assert state.verify_pin("x", "ip", now=0.0) == ("invalid", 2)
    assert state.verify_pin("x", "ip", now=1.0) == ("invalid", 1)
    assert state.verify_pin("x", "ip", now=2.0) == ("locked", 600)
    # While locked, even the correct PIN is refused (lockout set at now=2.0,
    # so at now=3.0 there are 600 - 1 = 599 s left).
    assert state.verify_pin(PIN, "ip", now=3.0) == ("locked", 599)


def test_lockout_expires() -> None:
    state = LanAuthState(pin=PIN, max_attempts=1, lockout_seconds=600)
    assert state.verify_pin("x", "ip", now=0.0) == ("locked", 600)
    assert state.locked_for("ip", now=599.0) == pytest.approx(1, abs=1)
    assert state.locked_for("ip", now=601.0) == 0
    # After expiry the correct PIN works again.
    assert state.verify_pin(PIN, "ip", now=601.0) == ("ok", 0)


def test_lockout_is_per_ip() -> None:
    state = LanAuthState(pin=PIN, max_attempts=1, lockout_seconds=600)
    state.verify_pin("x", "ip-a", now=0.0)
    assert state.locked_for("ip-a", now=1.0) > 0
    assert state.locked_for("ip-b", now=1.0) == 0


# --- middleware + endpoint integration ----------------------------------


def _app() -> tuple[TestClient, LanAuthState]:
    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/books")
    def books() -> list[dict[str, str]]:
        return [{"id": "1"}]

    # Mirror production order: the lan-auth routes register BEFORE the SPA
    # catch-all so the catch-all (which 404s unmatched /api/ GETs) cannot
    # shadow /api/lan-auth/info + qr.svg.
    state = LanAuthState(pin=PIN)
    configure_lan_auth(app, state=state)

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ANN202 - test stub
        from starlette.responses import HTMLResponse

        return HTMLResponse("<title>app shell</title>")

    return TestClient(app), state


def test_health_is_ungated() -> None:
    client, _ = _app()
    assert client.get("/api/health").status_code == 200


def test_unauthenticated_api_returns_401() -> None:
    client, _ = _app()
    resp = client.get("/api/books")
    assert resp.status_code == 401
    assert resp.json()["code"] == "lan_pin_required"


def test_unauthenticated_html_navigation_serves_pin_page() -> None:
    client, _ = _app()
    resp = client.get("/books/1", headers={"Accept": "text/html"})
    assert resp.status_code == 200
    assert "lan-auth/verify" in resp.text
    assert "app shell" not in resp.text


def test_static_subresource_passes_through_unauthenticated() -> None:
    client, _ = _app()
    # Non-API, non-HTML request (e.g. a JS bundle): not sensitive, allowed.
    resp = client.get("/assets/app.js", headers={"Accept": "*/*"})
    assert resp.status_code == 200


def test_correct_pin_sets_cookie_and_unlocks_api() -> None:
    client, _ = _app()
    resp = client.post("/api/lan-auth/verify", json={"pin": PIN})
    assert resp.status_code == 200
    assert SESSION_COOKIE in resp.cookies
    # Subsequent API call carries the cookie -> passes the gate.
    after = client.get("/api/books")
    assert after.status_code == 200
    assert after.json() == [{"id": "1"}]


def test_wrong_pin_rejected_then_locks_out() -> None:
    client, _ = _app()
    for remaining in (2, 1):
        r = client.post("/api/lan-auth/verify", json={"pin": "000000"})
        assert r.status_code == 401
        assert r.json()["attempts_remaining"] == remaining
    locked = client.post("/api/lan-auth/verify", json={"pin": "000000"})
    assert locked.status_code == 429
    assert locked.json()["code"] == "locked_out"


def test_lan_mode_enabled_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BIBLIOGON_LAN_MODE", raising=False)
    assert lan_mode_enabled() is False
    monkeypatch.setenv("BIBLIOGON_LAN_MODE", "1")
    assert lan_mode_enabled() is True
    monkeypatch.setenv("BIBLIOGON_LAN_MODE", "false")
    assert lan_mode_enabled() is False


def test_info_endpoint_gated_then_returns_details() -> None:
    client, _ = _app()
    assert client.get("/api/lan-auth/info").status_code == 401  # needs auth
    client.post("/api/lan-auth/verify", json={"pin": PIN})
    info = client.get("/api/lan-auth/info")
    assert info.status_code == 200
    body = info.json()
    assert body["enabled"] is True
    assert body["pin"] == PIN
    assert body["url"].startswith("http://")
    assert body["port"] >= 1


def test_qr_svg_endpoint_serves_svg_when_authed() -> None:
    client, _ = _app()
    assert client.get("/api/lan-auth/qr.svg").status_code == 401
    client.post("/api/lan-auth/verify", json={"pin": PIN})
    qr = client.get("/api/lan-auth/qr.svg")
    assert qr.status_code == 200
    assert qr.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in qr.content
