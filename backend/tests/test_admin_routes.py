"""Integration tests for app/routes_admin.py.

Exercises the plugin-introspection endpoints (manifests / health /
errors), the editor plugin-status endpoint (including its 30s cache
path), and the debug-only test-reset route + its non-fatal WAL
checkpoint fallback. These handlers were previously uncovered.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app
from app.routes_admin import (
    _reset_shared_infra,
    invalidate_plugin_status_cache,
    register_admin_routes,
)


def test_plugins_manifests_endpoint_returns_dict():
    with TestClient(app) as client:
        resp = client.get("/api/plugins/manifests")

    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_plugins_health_endpoint_returns_dict():
    with TestClient(app) as client:
        resp = client.get("/api/plugins/health")

    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_plugins_errors_endpoint_returns_dict():
    with TestClient(app) as client:
        resp = client.get("/api/plugins/errors")

    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_editor_plugin_status_lists_editor_plugins_with_availability():
    invalidate_plugin_status_cache()
    with TestClient(app) as client:
        resp = client.get("/api/editor/plugin-status")

    assert resp.status_code == 200
    body = resp.json()
    assert {"grammar", "translation", "audiobook", "ai"} <= set(body)
    for entry in body.values():
        assert "available" in entry
        assert "reason" in entry


def test_editor_plugin_status_second_call_is_served_from_cache():
    invalidate_plugin_status_cache()
    with TestClient(app) as client:
        first = client.get("/api/editor/plugin-status").json()
        second = client.get("/api/editor/plugin-status").json()

    assert first == second


def test_test_reset_route_wipes_and_returns_status():
    test_app = FastAPI()
    register_admin_routes(test_app, debug=True)

    with TestClient(test_app) as client:
        resp = client.delete("/api/test/reset")

    assert resp.status_code == 200
    assert resp.json() == {"status": "reset"}


def test_test_reset_route_absent_when_not_debug():
    test_app = FastAPI()
    register_admin_routes(test_app, debug=False)

    with TestClient(test_app) as client:
        resp = client.delete("/api/test/reset")

    assert resp.status_code == 404


def test_reset_shared_infra_survives_wal_checkpoint_failure(monkeypatch):
    """A non-SQLite / non-WAL backend makes the checkpoint raise; the
    reset must log and continue rather than propagate."""
    import app.database as database

    class _BoomConn:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def exec_driver_sql(self, _sql):
            raise RuntimeError("no WAL here")

    class _BoomEngine:
        def connect(self):
            return _BoomConn()

    monkeypatch.setattr(database, "engine", _BoomEngine())

    _reset_shared_infra()
