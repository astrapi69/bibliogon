"""Tests for plugin discovery (all plugins are free)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_discovered_plugins_returns_core_plugins():
    """Core plugins (export, help, getstarted, ms-tools) should always appear."""
    resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "export" in names
    assert "help" in names
    assert "getstarted" in names
    assert "ms-tools" in names


def test_discovered_plugins_includes_all():
    """All plugins (audiobook, translation, kinderbuch, kdp) should appear."""
    resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "audiobook" in names
    assert "kinderbuch" in names
    assert "kdp" in names


def test_core_plugins_have_core_tier():
    """Core plugins should have license_tier='core' and has_license=True."""
    resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    for p in resp.json():
        if p["name"] in ("export", "help", "getstarted", "ms-tools"):
            assert p["license_tier"] == "core", f"{p['name']} should be core"
            assert p["has_license"] is True, f"{p['name']} should always have license"


def test_ms_tools_is_core_not_premium():
    """ms-tools is MIT/core, not premium. Should show as Standard."""
    resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    ms_tools = next((p for p in resp.json() if p["name"] == "ms-tools"), None)
    assert ms_tools is not None
    assert ms_tools["license_tier"] == "core"
    assert ms_tools["has_license"] is True


def test_plugin_configs_includes_kdp():
    """GET /settings/plugins should return kdp config."""
    resp = client.get("/api/settings/plugins")
    assert resp.status_code == 200
    names = set(resp.json().keys())
    assert "kdp" in names
