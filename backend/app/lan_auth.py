"""PIN gate for LAN mode (LAN-MODE-PHASE-1 C3).

When the backend runs with ``BIBLIOGON_LAN_MODE=1`` (the ``make dev-lan``
flow) it binds ``0.0.0.0`` and is reachable by every device on the local
network. Bibliogon has no user-account system, so this module adds a
lightweight pre-shared-PIN gate: enough to stop another device on the
Wi-Fi from reading or writing the author's books, without standing up a
full login system.

Threat model: a casual same-network device. The attacker must already be
on the LAN AND know (or brute-force) a 6-digit PIN, with a 3-strikes /
10-minute lockout per client IP. This is NOT a defence against a
determined attacker on a hostile network -- LAN mode is for trusted home
networks, documented as such.

What is gated:
- Every ``/api/*`` request (the actual book data) except ``/api/health``
  (the launcher / Makefile health probe) and the PIN-verify endpoint.
- HTML page navigations: an unauthenticated navigation is answered with
  the self-contained PIN-entry page instead of the SPA shell.

What is NOT gated: static app assets (JS/CSS/icons/manifest/service
worker). They are the same open-source bundle for everyone and carry no
user data; gating them only breaks the PWA bootstrap for no security
gain. The data they fetch (``/api/*``) is what is protected.

State lives in a :class:`LanAuthState` instance. Production wires one
singleton via :func:`configure_lan_auth`; tests build their own so no
module-level state leaks across test boundaries.
"""

from __future__ import annotations

import hmac
import logging
import os
import secrets
import time
from dataclasses import dataclass, field

from fastapi import FastAPI, Request, Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import HTMLResponse, JSONResponse
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

SESSION_COOKIE = "bibliogon_lan_session"
VERIFY_PATH = "/api/lan-auth/verify"
_UNGATED_API = frozenset({"/api/health", VERIFY_PATH})

_DEFAULT_SESSION_TTL = 24 * 60 * 60  # 24 h
_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_LOCKOUT_SECONDS = 10 * 60  # 10 min


def lan_mode_enabled() -> bool:
    """True when ``BIBLIOGON_LAN_MODE`` requests the PIN gate."""
    return os.getenv("BIBLIOGON_LAN_MODE", "").strip().lower() in ("1", "true", "yes")


def _generate_pin() -> str:
    """A cryptographically-random 6-digit PIN (leading zeros allowed)."""
    return f"{secrets.randbelow(10**6):06d}"


@dataclass
class LanAuthState:
    """Holds the PIN, valid sessions, and per-IP lockout counters.

    All times are unix seconds passed in by the caller so the logic stays
    pure and testable (no hidden clock reads inside the methods).
    """

    pin: str = field(default_factory=_generate_pin)
    session_ttl: int = _DEFAULT_SESSION_TTL
    max_attempts: int = _DEFAULT_MAX_ATTEMPTS
    lockout_seconds: int = _DEFAULT_LOCKOUT_SECONDS
    _sessions: dict[str, float] = field(default_factory=dict)
    _attempts: dict[str, int] = field(default_factory=dict)
    _locked_until: dict[str, float] = field(default_factory=dict)

    def locked_for(self, client_ip: str, now: float) -> int:
        """Remaining lockout seconds for an IP, or 0 if not locked."""
        until = self._locked_until.get(client_ip, 0.0)
        return max(0, int(until - now)) if until > now else 0

    def create_session(self, now: float) -> str:
        """Mint a session token valid for ``session_ttl`` seconds."""
        token = secrets.token_urlsafe(32)
        self._sessions[token] = now + self.session_ttl
        return token

    def is_valid_session(self, token: str | None, now: float) -> bool:
        """True if ``token`` is a known, unexpired session."""
        if not token:
            return False
        expiry = self._sessions.get(token)
        if expiry is None:
            return False
        if expiry <= now:
            self._sessions.pop(token, None)
            return False
        return True

    def verify_pin(self, submitted: str, client_ip: str, now: float) -> tuple[str, int]:
        """Check a submitted PIN with lockout accounting.

        Returns ``(status, info)`` where status is one of:
        - ``"locked"`` -> info is the retry-after seconds
        - ``"invalid"`` -> info is the attempts remaining before lockout
        - ``"ok"`` -> info is 0 (caller then mints a session)
        """
        retry = self.locked_for(client_ip, now)
        if retry > 0:
            return "locked", retry
        if hmac.compare_digest(submitted, self.pin):
            self._attempts.pop(client_ip, None)
            self._locked_until.pop(client_ip, None)
            return "ok", 0
        used = self._attempts.get(client_ip, 0) + 1
        if used >= self.max_attempts:
            self._attempts.pop(client_ip, None)
            self._locked_until[client_ip] = now + self.lockout_seconds
            return "locked", self.lockout_seconds
        self._attempts[client_ip] = used
        return "invalid", self.max_attempts - used


class PinVerifyRequest(BaseModel):
    pin: str


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def render_pin_page() -> str:
    """A self-contained PIN-entry page (no app bundle, no theme tokens).

    Bilingual DE/EN. This page is served before the SPA loads, so it
    cannot use the app's i18n catalog or CSS variables; the inline styling
    is a deliberate exception scoped to this bootstrap surface.
    """
    return """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bibliogon - PIN</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh;
         display: grid; place-items: center; background: #faf8f5; color: #2a2622; }
  @media (prefers-color-scheme: dark) { body { background: #1c1a18; color: #e8e4df; } }
  .card { width: min(20rem, 90vw); padding: 1.75rem; border-radius: 14px;
          background: rgba(127,127,127,.08); text-align: center; }
  h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
  p { margin: 0 0 1.25rem; opacity: .75; font-size: .9rem; }
  input { width: 100%; box-sizing: border-box; font-size: 1.6rem; text-align: center;
          letter-spacing: .4rem; padding: .6rem; border-radius: 10px;
          border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; }
  button { margin-top: 1rem; width: 100%; padding: .7rem; font-size: 1rem; border: 0;
           border-radius: 10px; background: #b45309; color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  .err { margin-top: .9rem; min-height: 1.2rem; color: #c0392b; font-size: .85rem; }
</style>
</head>
<body>
  <form class="card" id="f">
    <h1>Bibliogon</h1>
    <p>LAN-Zugriff &middot; PIN eingeben / Enter PIN</p>
    <input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6"
           autocomplete="one-time-code" autofocus aria-label="PIN">
    <button type="submit" id="b">Entsperren / Unlock</button>
    <div class="err" id="e" role="alert"></div>
  </form>
<script>
  var url = new URL(location.href);
  var pre = url.searchParams.get("pin");
  var pin = document.getElementById("pin");
  var err = document.getElementById("e");
  var btn = document.getElementById("b");
  if (pre) { pin.value = pre.replace(/[^0-9]/g, "").slice(0, 6); }
  document.getElementById("f").addEventListener("submit", function (ev) {
    ev.preventDefault();
    btn.disabled = true; err.textContent = "";
    fetch("/api/lan-auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin.value })
    }).then(function (r) {
      if (r.ok) { location.replace(url.origin + (url.pathname || "/")); return null; }
      return r.json();
    }).then(function (data) {
      if (!data) return;
      err.textContent = data.detail || "Fehler / Error";
      btn.disabled = false; pin.value = ""; pin.focus();
    }).catch(function () {
      err.textContent = "Netzwerkfehler / Network error";
      btn.disabled = false;
    });
  });
  if (pre) { setTimeout(function () { btn.click(); }, 50); }
</script>
</body>
</html>"""


class LanPinAuthMiddleware(BaseHTTPMiddleware):
    """Gate API + page navigations behind a valid PIN session cookie."""

    def __init__(self, app: ASGIApp, state: LanAuthState) -> None:
        super().__init__(app)
        self.state = state

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        path = request.url.path
        if path in _UNGATED_API:
            return await call_next(request)

        token = request.cookies.get(SESSION_COOKIE)
        if self.state.is_valid_session(token, time.time()):
            return await call_next(request)

        # Unauthenticated below this point.
        if path.startswith("/api/"):
            return JSONResponse(
                status_code=401,
                content={"detail": "LAN PIN required", "code": "lan_pin_required"},
            )
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return HTMLResponse(render_pin_page(), status_code=200)
        # Non-sensitive static sub-resource (app bundle, icons): allow.
        return await call_next(request)


def build_verify_response(
    state: LanAuthState, body: PinVerifyRequest, request: Request
) -> Response:
    """Validate a PIN submission and, on success, set the session cookie."""
    now = time.time()
    status, info = state.verify_pin(body.pin, _client_ip(request), now)
    if status == "ok":
        token = state.create_session(now)
        resp = JSONResponse(status_code=200, content={"status": "ok"})
        resp.set_cookie(
            SESSION_COOKIE,
            token,
            max_age=state.session_ttl,
            httponly=True,
            samesite="lax",
            path="/",
        )
        return resp
    if status == "locked":
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Too many attempts. Locked for {info} s.",
                "code": "locked_out",
                "retry_after": info,
            },
        )
    return JSONResponse(
        status_code=401,
        content={
            "detail": f"Invalid PIN. {info} attempt(s) left.",
            "code": "invalid_pin",
            "attempts_remaining": info,
        },
    )


def configure_lan_auth(app: FastAPI, state: LanAuthState | None = None) -> LanAuthState:
    """Wire the PIN gate onto ``app`` and return the shared state.

    Adds the middleware (outermost, so it runs first) and the verify
    endpoint, and stashes the state on ``app.state.lan_auth``. The PIN is
    logged once so the ``make dev-lan`` terminal shows it (the QR code in
    C4 builds on this). ``state`` may be injected for tests; production
    passes none and a fresh random-PIN state is created.
    """
    state = state or LanAuthState()
    app.state.lan_auth = state

    @app.post(VERIFY_PATH)
    async def verify_lan_pin(body: PinVerifyRequest, request: Request) -> Response:
        return build_verify_response(state, body, request)

    app.add_middleware(LanPinAuthMiddleware, state=state)
    logger.info("LAN mode active. Access PIN: %s", state.pin)
    return state
