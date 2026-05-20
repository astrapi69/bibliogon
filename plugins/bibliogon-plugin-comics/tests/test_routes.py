"""Route-level tests for the comics plugin (Session 1).

Mounts the plugin's router on a minimal FastAPI app and hits
``GET /api/comics/info`` via TestClient. This is the per-plugin
half of the "Two installation paths" contract: the backend's
combined poetry.lock is exercised by a separate test under
``backend/tests/``; this file exercises the per-plugin install
path that the CI plugin-matrix runs.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bibliogon_comics.routes import router


def _make_client() -> TestClient:
    app = FastAPI()
    # /api prefix mirrors pluginforge.mount_plugin_routes' default.
    app.include_router(router, prefix="/api")
    return TestClient(app)


class TestComicsInfoEndpoint:
    def test_returns_200(self) -> None:
        client = _make_client()
        response = client.get("/api/comics/info")
        assert response.status_code == 200

    def test_returns_plugin_identity(self) -> None:
        client = _make_client()
        body = client.get("/api/comics/info").json()
        assert body["name"] == "comics"
        assert body["version"] == "1.1.0"

    def test_returns_session_phase(self) -> None:
        # Pin the session marker so a future commit cannot silently
        # ship Session-2 features under the Session-1 plugin tag.
        client = _make_client()
        body = client.get("/api/comics/info").json()
        assert body["session"] == 2
        assert body["status"] == "active"

    def test_returns_description(self) -> None:
        client = _make_client()
        body = client.get("/api/comics/info").json()
        assert "description" in body
        assert isinstance(body["description"], str)
        assert len(body["description"]) > 0
