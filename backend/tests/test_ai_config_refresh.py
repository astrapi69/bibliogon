"""Regression tests: AI config changes take effect without server restart.

Verifies that toggling ai.enabled in settings is reflected immediately
in both the /api/ai/* routes and the /api/editor/plugin-status endpoint.
"""

import pytest
import yaml
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app, invalidate_plugin_status_cache
from app.routers import settings as settings_module


@pytest.fixture
def temp_base(tmp_path):
    """Create a temp base dir with AI disabled in app.yaml."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    plugins_dir = config_dir / "plugins"
    plugins_dir.mkdir()

    app_yaml = config_dir / "app.yaml"
    app_yaml.write_text(yaml.dump({
        "app": {"language": "de"},
        "plugins": {"enabled": []},
        "ai": {
            "enabled": False,
            "provider": "lmstudio",
            "base_url": "http://localhost:1234/v1",
            "model": "",
            "api_key": "",
            "temperature": 0.7,
            "max_tokens": 2048,
        },
    }))

    return tmp_path


@pytest.fixture
def client(temp_base):
    """TestClient with settings and main.py both reading from temp dir."""
    original_base = settings_module._base_dir
    original_manager = settings_module._manager

    settings_module._base_dir = temp_base
    settings_module._manager = None

    config_path = temp_base / "config" / "app.yaml"

    def mock_load():
        try:
            with open(config_path, encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception:
            return {}

    # Patch _load_app_config so plugin-status reads from the temp dir,
    # and patch _get_ai_config so AI routes read from the temp dir too.
    with patch("app.main._load_app_config", side_effect=mock_load), \
         patch("app.ai.routes._get_ai_config", side_effect=lambda: mock_load().get("ai", {})):
        invalidate_plugin_status_cache()
        yield TestClient(app)

    settings_module._base_dir = original_base
    settings_module._manager = original_manager


# --- Regression: stale config ---


def test_plugin_status_reflects_ai_disabled(client):
    """When ai.enabled is false, plugin-status reports AI as disabled."""
    resp = client.get("/api/editor/plugin-status")
    assert resp.status_code == 200
    ai_status = resp.json().get("ai", {})
    assert ai_status["available"] is False
    assert ai_status["reason"] == "disabled"


def test_plugin_status_reflects_ai_enabled_after_save(client):
    """After toggling ai.enabled to true via settings, plugin-status shows enabled.

    This is the core regression test: previously _app_config_raw was cached
    at startup and never refreshed, so this would still return disabled.
    """
    # Toggle AI on via settings save
    resp = client.patch("/api/settings/app", json={
        "ai": {"enabled": True},
    })
    assert resp.status_code == 200
    assert resp.json()["ai"]["enabled"] is True

    # Plugin-status must reflect the change immediately (no restart)
    resp = client.get("/api/editor/plugin-status")
    assert resp.status_code == 200
    ai_status = resp.json().get("ai", {})
    # AI is enabled now, so reason should NOT be "disabled"
    # (it may be "service_not_reachable" since LM Studio isn't running, that's fine)
    assert ai_status.get("reason") != "disabled", (
        "plugin-status still shows 'disabled' after toggling AI on - stale config bug"
    )


def test_plugin_status_reflects_ai_disabled_after_toggle_off(client):
    """Toggle on then off: plugin-status tracks both transitions."""
    # Enable
    client.patch("/api/settings/app", json={"ai": {"enabled": True}})
    resp = client.get("/api/editor/plugin-status")
    assert resp.json()["ai"].get("reason") != "disabled"

    # Disable again
    client.patch("/api/settings/app", json={"ai": {"enabled": False}})
    resp = client.get("/api/editor/plugin-status")
    assert resp.json()["ai"]["reason"] == "disabled"


def test_ai_generate_returns_403_when_disabled(client):
    """POST /api/ai/generate returns 403 when AI is disabled."""
    resp = client.post("/api/ai/generate", json={
        "prompt": "test",
        "system": "test",
    })
    assert resp.status_code == 403


def test_ai_generate_not_403_after_enabling(client):
    """After enabling AI, /api/ai/generate no longer returns 403.

    It may return 502 (server not reachable) but not 403 (disabled).
    """
    client.patch("/api/settings/app", json={"ai": {"enabled": True}})
    resp = client.post("/api/ai/generate", json={
        "prompt": "test",
        "system": "test",
    })
    # 502 = LM Studio not running (expected in test). 403 = bug.
    assert resp.status_code != 403, "AI still returning 403 after being enabled"


def test_ai_health_disabled(client):
    """Health endpoint returns disabled status when AI is off."""
    resp = client.get("/api/ai/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "disabled"


def test_ai_disabled_message_is_actionable(client):
    """The disabled message must tell users where to enable AI."""
    resp = client.get("/api/editor/plugin-status")
    message = resp.json()["ai"].get("message", "")
    assert "Einstellungen" in message or "Settings" in message, (
        f"Disabled message is not actionable: '{message}'"
    )
