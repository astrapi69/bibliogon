"""Integration tests for the settings API endpoints.

Covers:
  GET    /api/settings/app                     -> read app config
  PATCH  /api/settings/app                     -> merge-update app config
  GET    /api/settings/plugins                 -> list all plugin configs
  POST   /api/settings/plugins                 -> create plugin config
  DELETE /api/settings/plugins/{name}          -> delete plugin config
  GET    /api/settings/plugins/{name}          -> get single plugin config
  PATCH  /api/settings/plugins/{name}          -> update plugin settings
  POST   /api/settings/plugins/{name}/enable   -> enable plugin
  POST   /api/settings/plugins/{name}/disable  -> disable plugin

All filesystem operations are redirected to a temp directory.
"""

import pytest
import yaml
from fastapi.testclient import TestClient

from app.main import app
from app.routers import settings as settings_module


@pytest.fixture
def temp_base(tmp_path):
    """Create a temp base dir with config structure."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    plugins_dir = config_dir / "plugins"
    plugins_dir.mkdir()

    app_yaml = config_dir / "app.yaml"
    app_yaml.write_text(yaml.dump({
        "app": {"language": "de", "theme": "warm-literary"},
        "author": {"name": "Test Author"},
        "plugins": {"enabled": ["export", "help"], "disabled": []},
    }))

    # Seed one plugin config
    export_yaml = plugins_dir / "export.yaml"
    export_yaml.write_text(yaml.dump({
        "plugin": {"name": "export", "version": "1.0.0", "license": "MIT"},
        "settings": {"type_suffix_in_filename": True},
    }))

    return tmp_path


@pytest.fixture
def client(temp_base):
    """TestClient with settings module pointing at temp dir."""
    original_base = settings_module._base_dir
    original_manager = settings_module._manager

    settings_module._base_dir = temp_base
    settings_module._manager = None

    yield TestClient(app)

    settings_module._base_dir = original_base
    settings_module._manager = original_manager


# --- GET /api/settings/app ---


def test_get_app_settings(client):
    """Returns the full app.yaml contents."""
    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    data = resp.json()
    assert data["app"]["language"] == "de"
    assert data["app"]["theme"] == "warm-literary"
    assert data["author"]["name"] == "Test Author"
    assert "export" in data["plugins"]["enabled"]


def test_get_app_settings_missing_file(client, temp_base):
    """Returns empty dict when app.yaml does not exist."""
    (temp_base / "config" / "app.yaml").unlink()

    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    assert resp.json() == {}


# --- PATCH /api/settings/app ---


def test_update_app_language(client):
    """Updating app.language merges into existing config."""
    resp = client.patch("/api/settings/app", json={"app": {"language": "en"}})
    assert resp.status_code == 200
    assert resp.json()["app"]["language"] == "en"
    # Theme still intact (merge, not replace)
    assert resp.json()["app"]["theme"] == "warm-literary"


def test_update_author_name(client):
    """Updating author section merges correctly."""
    resp = client.patch("/api/settings/app", json={"author": {"name": "New Author"}})
    assert resp.status_code == 200
    assert resp.json()["author"]["name"] == "New Author"


def test_update_ui_settings(client):
    """UI section is created if it does not exist."""
    resp = client.patch("/api/settings/app", json={"ui": {"sidebar_collapsed": True}})
    assert resp.status_code == 200
    assert resp.json()["ui"]["sidebar_collapsed"] is True


def test_update_persists_to_disk(client, temp_base):
    """Changes are written to app.yaml on disk."""
    client.patch("/api/settings/app", json={"app": {"language": "fr"}})

    # Read directly from disk
    with open(temp_base / "config" / "app.yaml") as f:
        on_disk = yaml.safe_load(f)
    assert on_disk["app"]["language"] == "fr"


def test_update_preserves_unmentioned_sections(client):
    """Sections not included in the PATCH body remain unchanged."""
    resp = client.patch("/api/settings/app", json={"app": {"language": "es"}})
    assert resp.status_code == 200
    # plugins section untouched
    assert "export" in resp.json()["plugins"]["enabled"]
    assert resp.json()["author"]["name"] == "Test Author"


def test_update_empty_body(client):
    """Empty PATCH body is a no-op, returns current config."""
    resp = client.patch("/api/settings/app", json={})
    assert resp.status_code == 200
    assert resp.json()["app"]["language"] == "de"


# --- GET /api/settings/plugins ---


def test_list_plugin_configs(client):
    """Returns all plugin YAML configs keyed by name."""
    resp = client.get("/api/settings/plugins")
    assert resp.status_code == 200
    data = resp.json()
    assert "export" in data
    assert data["export"]["plugin"]["name"] == "export"


def test_list_plugin_configs_empty(client, temp_base):
    """Empty plugins dir returns empty dict."""
    import shutil
    shutil.rmtree(temp_base / "config" / "plugins")
    (temp_base / "config" / "plugins").mkdir()

    resp = client.get("/api/settings/plugins")
    assert resp.status_code == 200
    assert resp.json() == {}


# --- POST /api/settings/plugins ---


def test_create_plugin_config(client, temp_base):
    """Creates a new plugin YAML config file."""
    resp = client.post("/api/settings/plugins", json={
        "name": "custom-plugin",
        "display_name": "Custom Plugin",
        "description": "A custom plugin",
        "version": "2.0.0",
        "license": "MIT",
        "settings": {"enabled": True},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["plugin"]["name"] == "custom-plugin"
    assert body["settings"]["enabled"] is True

    # File exists on disk
    assert (temp_base / "config" / "plugins" / "custom-plugin.yaml").exists()


def test_create_plugin_config_duplicate_returns_409(client):
    """Creating a config that already exists returns 409."""
    resp = client.post("/api/settings/plugins", json={
        "name": "export",
        "display_name": "Export",
    })
    assert resp.status_code == 409


# --- GET /api/settings/plugins/{name} ---


def test_get_single_plugin_config(client):
    """Returns config for a specific plugin."""
    resp = client.get("/api/settings/plugins/export")
    assert resp.status_code == 200
    assert resp.json()["plugin"]["name"] == "export"
    assert resp.json()["settings"]["type_suffix_in_filename"] is True


def test_get_nonexistent_plugin_config_returns_404(client):
    """Requesting a non-existent plugin config returns 404."""
    resp = client.get("/api/settings/plugins/nonexistent")
    assert resp.status_code == 404


# --- PATCH /api/settings/plugins/{name} ---


def test_update_plugin_settings(client):
    """Updating settings merges into existing plugin config."""
    resp = client.patch(
        "/api/settings/plugins/export",
        json={"settings": {"type_suffix_in_filename": False, "new_setting": "value"}},
    )
    assert resp.status_code == 200
    assert resp.json()["settings"]["type_suffix_in_filename"] is False
    assert resp.json()["settings"]["new_setting"] == "value"


def test_update_nonexistent_plugin_returns_404(client):
    """Updating settings on a non-existent plugin returns 404."""
    resp = client.patch(
        "/api/settings/plugins/nonexistent",
        json={"settings": {"key": "value"}},
    )
    assert resp.status_code == 404


def test_update_preserves_comments_and_formatting(client, temp_base):
    """PATCH must not strip YAML comments or quote styles.

    Regression pin for the PyYAML -> ruamel.yaml swap: saving plugin
    settings through the UI used to drop `# INTERNAL` comments and
    rewrite `"foo"` as `foo`. This test proves the HTTP round-trip
    preserves both, so a future refactor that bypasses `app.yaml_io`
    fails loudly instead of silently corrupting user configs.
    """
    export_yaml_path = temp_base / "config" / "plugins" / "export.yaml"
    export_yaml_path.write_text(
        'plugin:\n'
        '  name: "export"\n'
        '  version: "1.0.0"\n'
        '  license: "MIT"\n'
        '\n'
        'settings:\n'
        '  type_suffix_in_filename: true\n'
        '  # INTERNAL: power-user knob, edit via YAML only\n'
        '  pandoc_timeout_seconds: 120\n'
        '  output_dir: "./out"\n',
        encoding="utf-8",
    )

    resp = client.patch(
        "/api/settings/plugins/export",
        json={"settings": {"type_suffix_in_filename": False}},
    )
    assert resp.status_code == 200
    assert resp.json()["settings"]["type_suffix_in_filename"] is False

    on_disk = export_yaml_path.read_text(encoding="utf-8")

    # The mutated value landed.
    assert "type_suffix_in_filename: false" in on_disk

    # The # INTERNAL comment survived the save.
    assert "# INTERNAL: power-user knob, edit via YAML only" in on_disk

    # Untouched fields kept their double-quote style.
    assert 'name: "export"' in on_disk
    assert 'version: "1.0.0"' in on_disk
    assert 'license: "MIT"' in on_disk
    assert 'output_dir: "./out"' in on_disk

    # Untouched value untouched.
    assert "pandoc_timeout_seconds: 120" in on_disk


# --- DELETE /api/settings/plugins/{name} ---


def test_delete_plugin_config(client, temp_base):
    """Deleting removes the YAML file."""
    # Create one first
    client.post("/api/settings/plugins", json={"name": "deletable"})
    assert (temp_base / "config" / "plugins" / "deletable.yaml").exists()

    resp = client.delete("/api/settings/plugins/deletable")
    assert resp.status_code == 200
    assert resp.json()["status"] == "removed"
    assert not (temp_base / "config" / "plugins" / "deletable.yaml").exists()


def test_delete_nonexistent_plugin_returns_404(client):
    """Deleting a non-existent plugin config returns 404."""
    resp = client.delete("/api/settings/plugins/ghost")
    assert resp.status_code == 404


# --- POST /api/settings/plugins/{name}/enable ---


def test_enable_plugin(client, temp_base):
    """Enabling adds plugin to the enabled list in app.yaml."""
    resp = client.post("/api/settings/plugins/grammar/enable")
    assert resp.status_code == 200
    assert resp.json()["status"] == "enabled"

    # Verify on disk
    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert "grammar" in config["plugins"]["enabled"]


def test_enable_already_enabled_is_idempotent(client, temp_base):
    """Enabling an already-enabled plugin does not duplicate it."""
    client.post("/api/settings/plugins/export/enable")
    client.post("/api/settings/plugins/export/enable")

    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert config["plugins"]["enabled"].count("export") == 1


# --- POST /api/settings/plugins/{name}/disable ---


def test_disable_plugin(client, temp_base):
    """Disabling removes from enabled and adds to disabled list."""
    resp = client.post("/api/settings/plugins/export/disable")
    assert resp.status_code == 200
    assert resp.json()["status"] == "disabled"

    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert "export" not in config["plugins"]["enabled"]
    assert "export" in config["plugins"]["disabled"]


def test_disable_already_disabled_is_idempotent(client, temp_base):
    """Disabling an already-disabled plugin does not duplicate in disabled list."""
    client.post("/api/settings/plugins/export/disable")
    client.post("/api/settings/plugins/export/disable")

    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert config["plugins"]["disabled"].count("export") == 1


def test_enable_then_disable_roundtrip(client, temp_base):
    """Enable -> disable cycle leaves plugin in disabled list only."""
    client.post("/api/settings/plugins/grammar/enable")
    client.post("/api/settings/plugins/grammar/disable")

    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert "grammar" not in config["plugins"]["enabled"]
    assert "grammar" in config["plugins"]["disabled"]
