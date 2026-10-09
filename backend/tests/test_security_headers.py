"""Security-header contract (#986).

What these pin, in order of how much they would cost to get wrong:

- the static headers reach EVERY response, API included, because
  ``nosniff`` is the one that matters on the asset endpoints that serve
  imported bytes;
- the CSP goes on HTML and nowhere else, so a JSON response does not
  carry a policy that governs nothing;
- the parser agrees with the two other parsers of the same file (the
  Vite plugin and the nginx generator), which is the only thing keeping
  three deployments on one policy;
- a missing policy file degrades to "no CSP header", not to a stale copy
  compiled into the module.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.testclient import TestClient

from app.exception_handlers import register_exception_handlers
from app.middleware.security_headers import (
    CSP_HEADER_NAME,
    STATIC_SECURITY_HEADERS,
    SecurityHeadersMiddleware,
    load_csp_policy,
    resolve_policy_file,
)

POLICY = "default-src 'self'; script-src 'self'"


def _app(policy: str | None = POLICY) -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, policy=policy)
    # The project's catch-all handler, as production has it. Without it an
    # unhandled exception is turned into a 500 by Starlette's
    # ServerErrorMiddleware, which sits OUTSIDE every user middleware - so
    # the headers would legitimately be missing there, and the test would
    # be pinning an artefact of the bare FastAPI() rather than the app.
    register_exception_handlers(app, debug=False)

    @app.get("/api/thing")
    def thing() -> JSONResponse:
        return JSONResponse({"ok": True})

    @app.get("/page")
    def page() -> HTMLResponse:
        return HTMLResponse("<!doctype html><title>x</title>")

    @app.get("/boom")
    def boom() -> JSONResponse:
        raise ValueError("deliberate")

    return TestClient(app, raise_server_exceptions=False)


def test_static_headers_on_a_json_api_response() -> None:
    response = _app().get("/api/thing")
    assert response.status_code == 200
    for name, value in STATIC_SECURITY_HEADERS.items():
        assert response.headers[name] == value


def test_static_headers_on_an_error_response() -> None:
    """A 500 is exactly where a sniffing browser should not get creative.

    Reaching the headers at all depends on the catch-all handler turning
    the exception into a response INSIDE the middleware stack, which is
    why ``_app`` registers the project's handlers.
    """
    response = _app().get("/boom")
    assert response.status_code == 500
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_csp_only_on_html() -> None:
    client = _app()
    assert CSP_HEADER_NAME not in client.get("/api/thing").headers
    assert client.get("/page").headers[CSP_HEADER_NAME] == POLICY


def test_csp_is_report_only_not_enforcing() -> None:
    """The enforcing flip is its own change; it must not arrive by accident."""
    assert CSP_HEADER_NAME == "Content-Security-Policy-Report-Only"
    assert "Content-Security-Policy" not in _app().get("/page").headers


def test_no_policy_means_no_csp_header_but_still_the_static_ones() -> None:
    client = _app(policy=None)
    page = client.get("/page")
    assert CSP_HEADER_NAME not in page.headers
    assert page.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_unreadable_policy_file_degrades_to_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BIBLIOGON_CSP_POLICY_FILE", str(tmp_path / "absent.txt"))
    assert load_csp_policy() is None


def test_parser_drops_comments_and_blank_lines(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    policy_file = tmp_path / "csp.txt"
    policy_file.write_text(
        "# a comment\n\n  default-src 'self'\n\n# another\nscript-src 'self'\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("BIBLIOGON_CSP_POLICY_FILE", str(policy_file))
    assert load_csp_policy() == "default-src 'self'; script-src 'self'"


def test_comment_only_policy_file_yields_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    policy_file = tmp_path / "csp.txt"
    policy_file.write_text("# nothing but prose\n", encoding="utf-8")
    monkeypatch.setenv("BIBLIOGON_CSP_POLICY_FILE", str(policy_file))
    assert load_csp_policy() is None


def test_canonical_policy_file_is_the_one_in_the_repo() -> None:
    """The default path must resolve without the env-var override set.

    A wrong ``parents[]`` index here is invisible in every other test,
    because they all point the override at a tmp file.
    """
    path = resolve_policy_file()
    assert path.is_file(), path
    assert path.parts[-3:] == ("frontend", "security", "csp.txt")


def test_canonical_policy_names_the_directives_the_app_depends_on() -> None:
    """The directives whose absence would be a silently broken app.

    Each one is here because something in the bundle needs it: blob: for
    IndexedDB-resolved images and the audiobook player, 'unsafe-inline'
    for the style attributes React and KaTeX write, the open connect-src
    for browser-direct AI against a user-typed base URL.
    """
    policy = load_csp_policy()
    assert policy is not None
    for directive in (
        "default-src 'self'",
        "script-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
    ):
        assert directive in policy, directive
    assert "style-src 'self' 'unsafe-inline'" in policy
    assert "blob:" in policy


def test_the_real_app_actually_sends_them() -> None:
    """The middleware is registered in ``app.main``, not just importable.

    Everything above exercises a throwaway FastAPI instance, so all of it
    would stay green if nobody had wired the middleware into the app that
    ships. This is the test that notices.
    """
    from app.main import app as real_app

    response = TestClient(real_app).get("/api/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_nginx_include_matches_the_canonical_policy() -> None:
    """The committed nginx fragment is still a fresh render of csp.txt.

    nginx takes a literal in ``add_header``, so the Docker deployment
    needs the policy spelled out in a config file. A stale fragment means
    the container enforces a policy the repo no longer describes - which
    is the drift the generator's ``--check`` mode exists to catch, run
    here so the backend job catches it too.
    """
    repo_root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["python3", str(repo_root / "scripts" / "generate_security_headers.py"), "--check"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout
