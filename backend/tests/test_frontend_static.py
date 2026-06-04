"""Tests for single-port SPA serving (LAN-MODE-PHASE-1 C1).

These build a fresh ``FastAPI`` app against a temporary dist directory
via the ``BIBLIOGON_FRONTEND_DIST`` override, so they never depend on a
real ``frontend/dist`` build being present (CI-safe).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.frontend_static import register_frontend_static, resolve_frontend_dist


@pytest.fixture
def dist_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A minimal built-frontend layout pointed at by the env override."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Bibliogon</title>", encoding="utf-8")
    (dist / "assets" / "app-abc123.js").write_text("console.log('app')", encoding="utf-8")
    (dist / "manifest.webmanifest").write_text('{"name":"Bibliogon"}', encoding="utf-8")
    monkeypatch.setenv("BIBLIOGON_FRONTEND_DIST", str(dist))
    return dist


def _client_with_api(dist_present: bool) -> TestClient:
    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    registered = register_frontend_static(app)
    assert registered is dist_present
    return TestClient(app)


def test_resolve_returns_none_when_dist_absent(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("BIBLIOGON_FRONTEND_DIST", str(tmp_path / "nope"))
    assert resolve_frontend_dist() is None


def test_register_is_noop_without_dist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("BIBLIOGON_FRONTEND_DIST", str(tmp_path / "nope"))
    client = _client_with_api(dist_present=False)
    # No SPA catch-all -> an unknown non-API path is a plain 404.
    assert client.get("/books/123").status_code == 404


def test_serves_existing_static_file(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    resp = client.get("/assets/app-abc123.js")
    assert resp.status_code == 200
    assert "console.log" in resp.text
    assert resp.headers["content-type"].startswith("text/javascript") or resp.headers[
        "content-type"
    ].startswith("application/javascript")


def test_webmanifest_media_type(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    resp = client.get("/manifest.webmanifest")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/manifest+json"


def test_unknown_route_falls_back_to_index_html(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    resp = client.get("/books/123/chapters/9")
    assert resp.status_code == 200
    assert "<title>Bibliogon</title>" in resp.text


def test_api_route_still_wins_over_catch_all(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_api_miss_returns_json_404_not_spa(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Not Found"}
    assert "<title>" not in resp.text


def test_path_traversal_falls_back_to_index(dist_dir: Path) -> None:
    client = _client_with_api(dist_present=True)
    # A traversal attempt must not escape dist; it serves the SPA shell.
    resp = client.get("/../../../../etc/passwd")
    assert resp.status_code == 200
    assert "<title>Bibliogon</title>" in resp.text
    assert "root:" not in resp.text
