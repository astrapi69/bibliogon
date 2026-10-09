"""Security response headers for the FastAPI deployment (#986).

Two kinds of header, for two different reasons.

The small ones go on EVERY response, API included. ``nosniff`` is the one
that earns its place there: ``/api/books/{id}/assets/file/{name}`` serves
bytes the user imported, and content sniffing is how a file that claims
to be an image gets executed as something else.

The Content-Security-Policy goes only on HTML, because that is the only
response a policy governs - and only in the single-port desktop / LAN
mode, where this process is what serves ``index.html``. In the Docker
stack nginx serves the SPA and carries the policy itself
(``frontend/security/nginx-security-headers.conf``); this middleware
still runs there and still sends the small headers on the API responses.

The policy text is read from ``frontend/security/csp.txt``, the same file
the Vite plugin and the nginx generator read. When the file is not
reachable - an installed backend with no repo checkout beside it - the
CSP header is simply omitted rather than falling back to a copy of the
policy baked in here, because a copy is what drifts.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

#: Headers with no policy text in them, so nothing to keep in sync.
STATIC_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
}

#: Report-only while the policy is still a prediction. Enforcing is its
#: own change, once the E2E violation gate has been green.
CSP_HEADER_NAME = "Content-Security-Policy-Report-Only"


def resolve_policy_file() -> Path:
    """Path to the canonical policy file.

    ``BIBLIOGON_CSP_POLICY_FILE`` overrides it; the default walks up from
    this module (``backend/app/middleware/security_headers.py``) to the
    repo root, the same way
    :func:`app.frontend_static.resolve_frontend_dist` does.
    """
    override = os.getenv("BIBLIOGON_CSP_POLICY_FILE")
    if override:
        return Path(override).expanduser().resolve()
    return (Path(__file__).resolve().parents[3] / "frontend" / "security" / "csp.txt").resolve()


def load_csp_policy() -> str | None:
    """Return the policy as one header value, or ``None`` if unreadable.

    Drops ``#`` comments and blank lines and joins the directives with
    ``; ``, matching ``frontend/security/securityHeaders.ts`` and
    ``scripts/generate_security_headers.py``.
    """
    path = resolve_policy_file()
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        logger.info("No CSP policy file at %s; sending no CSP header.", path)
        return None
    directives = [
        line.strip()
        for line in raw.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    return "; ".join(directives) or None


#: Distinguishes "the caller said nothing" from "the caller said there is
#: no policy". Without it, ``policy=None`` - the way a test says *send no
#: CSP* - would fall through to reading the file and send one anyway.
_UNSET = object()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add the static security headers, plus the CSP on HTML responses.

    The policy is resolved once at construction: it is deployment
    configuration, not per-request state, and re-reading a file on every
    response would put a filesystem call in the hot path of every API
    call for no gain.
    """

    def __init__(self, app: ASGIApp, policy: str | None | object = _UNSET) -> None:
        super().__init__(app)
        resolved = load_csp_policy() if policy is _UNSET else policy
        self._policy: str | None = resolved if isinstance(resolved, str) else None

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response: Response = await call_next(request)
        for name, value in STATIC_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if self._policy and response.headers.get("content-type", "").startswith("text/html"):
            response.headers.setdefault(CSP_HEADER_NAME, self._policy)
        return response
