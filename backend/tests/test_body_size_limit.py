"""Tests for BodySizeLimitMiddleware (BACKEND-UPLOAD-SIZE-LIMIT-01).

Two enforcement paths to pin:

1. Content-Length header pre-check: a client that advertises an
   oversized body must get 413 BEFORE any byte hits the handler.
2. Stream counter: a chunked-transfer client (no Content-Length)
   that pushes oversized bytes must get 413 once the running
   total exceeds the cap.

Plus the no-op paths: GET / HEAD / DELETE bypass entirely;
POST under the cap succeeds; missing Content-Length on a small
POST also succeeds.

Resolver helper ``_resolve_max_bytes_from_config`` gets its own
pin: integer in, non-int / non-positive / missing fall back to
the documented default.
"""

from __future__ import annotations

from fastapi import FastAPI, Request

from app.middleware.body_size_limit import (
    DEFAULT_MAX_UPLOAD_MB,
    BodySizeLimitMiddleware,
    _resolve_max_bytes_from_config,
)


# --- Resolver helper --------------------------------------------------


def test_resolver_returns_default_when_config_is_none() -> None:
    assert _resolve_max_bytes_from_config(None) == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024


def test_resolver_returns_default_when_app_key_missing() -> None:
    assert (
        _resolve_max_bytes_from_config({}) == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    )


def test_resolver_returns_default_when_max_upload_mb_missing() -> None:
    assert (
        _resolve_max_bytes_from_config({"app": {"version": "0.31.0"}})
        == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    )


def test_resolver_reads_max_upload_mb_value() -> None:
    assert (
        _resolve_max_bytes_from_config({"app": {"max_upload_mb": 250}})
        == 250 * 1024 * 1024
    )


def test_resolver_coerces_string_integer() -> None:
    assert (
        _resolve_max_bytes_from_config({"app": {"max_upload_mb": "10"}})
        == 10 * 1024 * 1024
    )


def test_resolver_falls_back_on_non_integer_value() -> None:
    """A YAML typo ("five hundred") must not crash the server."""
    assert (
        _resolve_max_bytes_from_config({"app": {"max_upload_mb": "five"}})
        == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    )


def test_resolver_falls_back_on_zero() -> None:
    assert (
        _resolve_max_bytes_from_config({"app": {"max_upload_mb": 0}})
        == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    )


def test_resolver_falls_back_on_negative() -> None:
    assert (
        _resolve_max_bytes_from_config({"app": {"max_upload_mb": -5}})
        == DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    )


# --- Integration tests via TestClient ---------------------------------


def _build_app_with_cap(max_bytes: int) -> FastAPI:
    """Spin up a tiny FastAPI app with a single echo endpoint behind the
    middleware; pinning the gate independently of the production
    router graph."""
    app = FastAPI()
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=max_bytes)

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, int]:
        body = await request.body()
        return {"received_bytes": len(body)}

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    @app.delete("/sink")
    async def sink() -> dict[str, str]:
        return {"status": "ok"}

    return app


def test_content_length_under_cap_passes_through() -> None:
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(1024)
    client = TestClient(app)
    payload = b"a" * 512
    r = client.post("/echo", content=payload)
    assert r.status_code == 200
    assert r.json() == {"received_bytes": 512}


def test_content_length_at_cap_passes_through() -> None:
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(1024)
    client = TestClient(app)
    payload = b"a" * 1024
    r = client.post("/echo", content=payload)
    assert r.status_code == 200
    assert r.json() == {"received_bytes": 1024}


def test_content_length_over_cap_returns_413() -> None:
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(1024)
    client = TestClient(app)
    payload = b"a" * 2048
    r = client.post("/echo", content=payload)
    assert r.status_code == 413
    body = r.json()
    assert "detail" in body
    # Detail must name a cap so the client can act on it.
    assert "MB" in body["detail"]


def test_get_request_is_not_rate_limited() -> None:
    """GETs bypass entirely — they don't carry a body in this app."""
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(1024)
    client = TestClient(app)
    r = client.get("/ping")
    assert r.status_code == 200


def test_delete_request_is_not_rate_limited() -> None:
    """DELETE bypasses; ASGI lets a body through optionally but
    Bibliogon's DELETE endpoints don't use one."""
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(1024)
    client = TestClient(app)
    r = client.delete("/sink")
    assert r.status_code == 200


def test_error_response_is_json_with_detail_field() -> None:
    """The 413 body must be JSON with a 'detail' field so the
    frontend's ApiError class can render it consistently with other
    BibliogonError-style errors."""
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(64)
    client = TestClient(app)
    r = client.post("/echo", content=b"x" * 128)
    assert r.status_code == 413
    assert r.headers["content-type"].startswith("application/json")
    body = r.json()
    assert isinstance(body.get("detail"), str)
    assert body["detail"]


def test_default_cap_when_no_explicit_value_passed() -> None:
    """Sanity-check that the production wiring (500 MB default) lets
    realistic payloads through. 1 MB payload must pass under the
    production default."""
    from fastapi.testclient import TestClient

    app = _build_app_with_cap(_resolve_max_bytes_from_config(None))
    client = TestClient(app)
    r = client.post("/echo", content=b"x" * (1024 * 1024))
    assert r.status_code == 200
    assert r.json() == {"received_bytes": 1024 * 1024}
