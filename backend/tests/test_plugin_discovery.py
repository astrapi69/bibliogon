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


def test_discovered_plugins_carries_v060_state_fields():
    """V060 C5: the endpoint surfaces ``filter_reason`` +
    ``load_error_message`` from PluginForge's last DiscoveryResult.
    Both should be null for all 12 first-party plugins on a clean
    test boot (they all activate cleanly), but the keys MUST exist
    on every row so the frontend can pin the contract.
    """
    with TestClient(app):
        resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload, "expected at least one discovered plugin"
    for p in payload:
        assert "filter_reason" in p, (
            f"plugin '{p['name']}' missing filter_reason; the V060 C5 "
            "contract requires both filter_reason + load_error_message "
            "keys on every row"
        )
        assert "load_error_message" in p, (
            f"plugin '{p['name']}' missing load_error_message"
        )
        # Clean test boot: every first-party plugin activates, so
        # both fields are null. A non-null filter_reason for any of
        # the 12 first-party plugins would be a real regression in
        # plugin loading.
        assert p["filter_reason"] is None, (
            f"plugin '{p['name']}' unexpectedly filtered with "
            f"reason={p['filter_reason']!r}; should be null"
        )
        assert p["load_error_message"] is None, (
            f"plugin '{p['name']}' unexpectedly has load error: "
            f"{p['load_error_message']!r}"
        )


def test_discovered_plugins_carries_v090_lifecycle_fields():
    """PluginForge v0.9.0 ``inspect_plugin(name)`` exposes
    ``PluginState.activated_at``, ``last_config_change``, and
    ``source``. The settings/discovered endpoint surfaces them as
    ISO 8601 strings (or null) so Settings UI can render
    "Active since …" / "Settings applied …" / "via ZIP" hints.

    Every first-party plugin activates on a clean test boot, so
    ``activated_at`` MUST be a parseable ISO string and ``source``
    MUST be ``"entry_point"``. ``last_config_change`` stays null
    unless a config refresh happened during the boot.
    """
    from datetime import datetime

    with TestClient(app):
        resp = client.get("/api/settings/plugins/discovered")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload, "expected at least one discovered plugin"
    for p in payload:
        assert "activated_at" in p, f"{p['name']} missing activated_at key"
        assert "last_config_change" in p, (
            f"{p['name']} missing last_config_change key"
        )
        assert "source" in p, f"{p['name']} missing source key"
        # First-party plugins should be entry-point sourced and
        # activated with a real timestamp.
        assert p["source"] == "entry_point", (
            f"{p['name']} expected entry_point source, got {p['source']!r}"
        )
        assert p["activated_at"] is not None, (
            f"{p['name']} expected non-null activated_at after clean boot"
        )
        # Parseable ISO 8601.
        datetime.fromisoformat(p["activated_at"])
        if p["last_config_change"] is not None:
            datetime.fromisoformat(p["last_config_change"])


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


def test_git_sync_yaml_loads_with_display_name():
    """git-sync ships backend/config/plugins/git-sync.yaml with i18n.

    Regression-pin for the 2026-05-18 plugin-metadata pattern audit
    Sub-finding A.1: git-sync was the only plugin lacking a
    canonical config file, so the Settings UI rendered the raw
    slug instead of a localized display name. The running backend
    logged the gap every startup:
        DEBUG [pluginforge.config] Config file not found, using
        empty defaults: backend/config/plugins/git-sync.yaml

    This test asserts the yaml is now present + carries i18n
    metadata in at least de + en. Future contributors removing the
    file or stripping languages back to 0 will fire this test.
    """
    from app import config_overlay

    cfg = config_overlay.read_plugin_config_merged("git-sync")
    plugin_block = cfg.get("plugin", {})
    assert plugin_block, "git-sync.yaml plugin block must be present"
    assert plugin_block.get("name") == "git-sync"
    display_name = plugin_block.get("display_name") or {}
    assert "de" in display_name, "git-sync display_name must include German"
    assert "en" in display_name, "git-sync display_name must include English"
    assert display_name["en"] == "Git Sync"
    description = plugin_block.get("description") or {}
    assert "de" in description and "en" in description, (
        "git-sync description must include de + en at minimum"
    )
