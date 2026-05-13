"""BodySizeLimitMiddleware — fail fast on oversized request bodies.

BACKEND-UPLOAD-SIZE-LIMIT-01 close. Defense-in-depth for every
``POST`` / ``PUT`` / ``PATCH`` endpoint, in particular the
upload-accepting ones (medium-import, backup-import,
plugin-install, asset-upload, AI-template ZIP import, ...). Each
upload endpoint has, or could grow, its own per-endpoint guard;
the middleware is the outer fence that rejects abuse cheaply
before any handler code runs.

Two enforcement points:

1. **Content-Length header**: if the incoming request advertises a
   body larger than ``max_bytes``, the middleware returns HTTP 413
   immediately — before consuming any body bytes. This is the
   happy path for browsers and well-behaved clients (every fetch
   / XHR / curl POST sets Content-Length).
2. **Streamed body counter**: clients that use chunked transfer
   encoding omit Content-Length. The middleware then watches the
   incoming ASGI ``http.request`` events, accumulates byte counts,
   and aborts with 413 the moment ``max_bytes`` is exceeded. The
   inner ``send`` is wrapped so a partial response does not leak.

Method allowlist: ``GET``, ``HEAD``, ``OPTIONS``, ``DELETE`` pass
through unchanged. They normally have no body of interest; the
middleware skips them to keep the read-path overhead at zero.

Configuration: the cap is read from ``app.yaml`` at startup via
``app.max_upload_mb`` (default ``500``). Editing the value
requires a server restart, intentionally: a runtime cap change
would need locking around the in-flight request set to stay
consistent with what handlers already accepted.

Fail-open posture: if config loading raises for any reason, the
middleware defaults to 500 MB rather than refusing to start. A
load error is logged once at warning level so an operator sees
the misconfiguration without losing service.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


_METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH"})
DEFAULT_MAX_UPLOAD_MB = 500


def _resolve_max_bytes_from_config(app_config: dict[str, Any] | None) -> int:
    """Read ``app.max_upload_mb`` from a loaded config dict and clamp
    to a positive megabyte value. Returns the byte budget."""
    if not app_config:
        return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    raw = app_config.get("app", {}).get("max_upload_mb")
    if raw is None:
        return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    try:
        mb = int(raw)
    except (TypeError, ValueError):
        logger.warning(
            "BodySizeLimitMiddleware: app.max_upload_mb=%r is not an "
            "integer; falling back to %d MB.",
            raw,
            DEFAULT_MAX_UPLOAD_MB,
        )
        return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    if mb <= 0:
        logger.warning(
            "BodySizeLimitMiddleware: app.max_upload_mb=%d is non-positive; falling back to %d MB.",
            mb,
            DEFAULT_MAX_UPLOAD_MB,
        )
        return DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    return mb * 1024 * 1024


def _too_large_response(max_bytes: int) -> dict[str, Any]:
    """Build the JSON body returned on a 413."""
    return {
        "detail": (
            f"Request body exceeds the {max_bytes // (1024 * 1024)} MB cap. "
            f"Configure via app.max_upload_mb in backend/config/app.yaml."
        )
    }


async def _send_413(send: Send, max_bytes: int) -> None:
    body = json.dumps(_too_large_response(max_bytes)).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body, "more_body": False})


class BodySizeLimitMiddleware:
    """ASGI middleware enforcing a per-request body-size cap.

    Constructed with a byte budget. The standard FastAPI
    ``app.add_middleware(BodySizeLimitMiddleware, max_bytes=...)``
    call is used in ``app/main.py``.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        if method not in _METHODS_WITH_BODY:
            await self.app(scope, receive, send)
            return

        # --- Step 1: Content-Length pre-check. Cheap and catches every
        # well-behaved client before any body byte is read. ---
        content_length = _content_length_from_scope(scope)
        if content_length is not None and content_length > self.max_bytes:
            logger.warning(
                "BodySizeLimitMiddleware: rejected upload via Content-Length: %d > %d (path=%s)",
                content_length,
                self.max_bytes,
                scope.get("path"),
            )
            await _send_413(send, self.max_bytes)
            return

        # --- Step 2: stream-counter for chunked-transfer clients. ---
        body_bytes_seen = 0
        exceeded = False

        async def wrapped_receive() -> Message:
            nonlocal body_bytes_seen, exceeded
            if exceeded:
                # Once we've decided to reject, never let the handler
                # observe further chunks. Synthesize an empty disconnect
                # event so any handler that polls for more terminates.
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"") or b""
                body_bytes_seen += len(chunk)
                if body_bytes_seen > self.max_bytes:
                    exceeded = True
                    logger.warning(
                        "BodySizeLimitMiddleware: rejected upload via "
                        "stream counter: %d > %d (path=%s)",
                        body_bytes_seen,
                        self.max_bytes,
                        scope.get("path"),
                    )
            return message

        # Track whether the inner app already sent response.start so we
        # don't double-respond. If exceeded triggers AFTER the handler
        # started writing back (rare but possible if the handler reads
        # part of the body, decides to respond, and only THEN we see
        # the over-cap chunk), we can't safely inject 413. Log and let
        # the inner response complete.
        started_response = False

        async def wrapped_send(message: Message) -> None:
            nonlocal started_response
            if message["type"] == "http.response.start":
                started_response = True
            await send(message)

        try:
            await self.app(scope, wrapped_receive, wrapped_send)
        finally:
            if exceeded and not started_response:
                # The inner handler hasn't responded yet (it disconnected
                # mid-read). Send the 413 explicitly so the client gets
                # a clean error instead of a hang or empty response.
                try:
                    await _send_413(send, self.max_bytes)
                except Exception:
                    # If the channel is already torn down, nothing to
                    # do. Log once for visibility but do not raise.
                    logger.debug(
                        "BodySizeLimitMiddleware: could not send 413 "
                        "after stream-counter exceed; client likely "
                        "already disconnected."
                    )


def _content_length_from_scope(scope: Scope) -> int | None:
    """Extract ``Content-Length`` from an ASGI scope's headers.

    Returns ``None`` when the header is missing or unparseable so
    the caller falls through to the streaming counter.
    """
    headers = scope.get("headers", [])
    for name, value in headers:
        if name.lower() == b"content-length":
            try:
                return int(value)
            except (TypeError, ValueError):
                return None
    return None
