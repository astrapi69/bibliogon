"""Integration tests for plugin install/uninstall endpoints.

Covers:
  POST   /api/plugins/install           -> upload ZIP, extract, register
  DELETE /api/plugins/install/{name}     -> remove plugin files and config
  GET    /api/plugins/installed          -> list ZIP-installed plugins

All filesystem operations are redirected to a temp directory so the
real config and plugins directories are never touched.
"""

import io
import shutil
import zipfile
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from app.main import app
from app.routers import plugin_install as pi_module


def _make_plugin_zip(
    plugin_name: str = "test-plugin",
    package_name: str = "test_plugin",
    version: str = "1.0.0",
    *,
    include_yaml: bool = True,
    include_init: bool = True,
    include_plugin_py: bool = True,
    yaml_content: dict | None = None,
    extra_files: dict[str, str] | None = None,
    bad_path: str | None = None,
) -> io.BytesIO:
    """Build a valid plugin ZIP in memory."""
    buf = io.BytesIO()
    top = f"bibliogon-plugin-{plugin_name}"

    with zipfile.ZipFile(buf, "w") as zf:
        if include_yaml:
            config = yaml_content or {
                "plugin": {
                    "name": plugin_name,
                    "display_name": f"Test Plugin {plugin_name}",
                    "description": "A test plugin",
                    "version": version,
                    "license": "MIT",
                },
            }
            zf.writestr(f"{top}/plugin.yaml", yaml.dump(config))

        if include_init:
            zf.writestr(f"{top}/{package_name}/__init__.py", "")

        if include_plugin_py:
            zf.writestr(
                f"{top}/{package_name}/plugin.py",
                "from pluginforge import BasePlugin\n\n"
                f"class TestPlugin(BasePlugin):\n"
                f"    name = '{plugin_name}'\n"
                f"    version = '{version}'\n",
            )

        if extra_files:
            for path, content in extra_files.items():
                zf.writestr(f"{top}/{path}", content)

        if bad_path:
            zf.writestr(bad_path, "malicious content")

    buf.seek(0)
    return buf


@pytest.fixture
def temp_base(tmp_path):
    """Create a temp base directory with the expected structure."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    plugins_dir = config_dir / "plugins"
    plugins_dir.mkdir()
    installed_dir = tmp_path / "plugins" / "installed"
    installed_dir.mkdir(parents=True)

    # Minimal app.yaml so plugin enable/disable works
    app_yaml = config_dir / "app.yaml"
    app_yaml.write_text(yaml.dump({"plugins": {"enabled": [], "disabled": []}}))

    return tmp_path


@pytest.fixture
def client(temp_base):
    """TestClient with plugin_install module pointing at temp dirs."""
    original_base = pi_module._base_dir
    original_installed = pi_module._installed_dir
    original_manager = pi_module._manager

    pi_module._base_dir = temp_base
    pi_module._installed_dir = temp_base / "plugins" / "installed"
    pi_module._manager = None  # skip dynamic registration

    yield TestClient(app)

    pi_module._base_dir = original_base
    pi_module._installed_dir = original_installed
    pi_module._manager = original_manager


# --- POST /api/plugins/install ---


def test_install_valid_plugin(client, temp_base):
    """Valid ZIP is extracted and plugin.yaml is copied to config."""
    zip_buf = _make_plugin_zip("my-plugin", "my_plugin")

    resp = client.post(
        "/api/plugins/install",
        files={"file": ("my-plugin.zip", zip_buf, "application/zip")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plugin"] == "my-plugin"
    assert body["version"] == "1.0.0"
    assert body["status"] in ("installed", "installed_pending_restart")

    # Verify files on disk
    installed_path = temp_base / "plugins" / "installed" / "my-plugin"
    assert installed_path.exists()
    assert (installed_path / "plugin.yaml").exists()
    assert (installed_path / "my_plugin" / "plugin.py").exists()

    # Verify config copied
    assert (temp_base / "config" / "plugins" / "my-plugin.yaml").exists()


def test_install_non_zip_rejected(client):
    """Non-ZIP file is rejected with 400."""
    buf = io.BytesIO(b"not a zip file")
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("plugin.txt", buf, "text/plain")},
    )
    assert resp.status_code == 400


def test_install_bad_zip_rejected(client):
    """Corrupt ZIP is rejected."""
    buf = io.BytesIO(b"PK\x03\x04corrupt")
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("plugin.zip", buf, "application/zip")},
    )
    assert resp.status_code == 400


def test_install_missing_plugin_yaml_rejected(client):
    """ZIP without plugin.yaml is rejected."""
    zip_buf = _make_plugin_zip(
        "no-yaml", "no_yaml", include_yaml=False,
    )
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("no-yaml.zip", zip_buf, "application/zip")},
    )
    assert resp.status_code == 400
    assert "plugin.yaml" in resp.json()["detail"]


def test_install_missing_plugin_py_rejected(client):
    """ZIP without plugin.py is rejected."""
    zip_buf = _make_plugin_zip(
        "no-pluginpy", "no_pluginpy", include_plugin_py=False,
    )
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("no-pluginpy.zip", zip_buf, "application/zip")},
    )
    assert resp.status_code == 400
    assert "plugin.py" in resp.json()["detail"]


def test_install_missing_init_py_rejected(client):
    """ZIP without __init__.py (no Python package) is rejected."""
    zip_buf = _make_plugin_zip(
        "no-init", "no_init", include_init=False,
    )
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("no-init.zip", zip_buf, "application/zip")},
    )
    assert resp.status_code == 400


def test_install_path_traversal_rejected(client):
    """ZIP with path traversal is rejected."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("plugin-dir/plugin.yaml", "plugin:\n  name: evil")
        zf.writestr("plugin-dir/../../../etc/passwd", "root:x:0:0")
    buf.seek(0)

    resp = client.post(
        "/api/plugins/install",
        files={"file": ("evil.zip", buf, "application/zip")},
    )
    assert resp.status_code == 400
    assert "Pfad" in resp.json()["detail"] or "path" in resp.json()["detail"].lower()


def test_install_invalid_plugin_name_rejected(client):
    """Plugin name with invalid characters is rejected."""
    zip_buf = _make_plugin_zip("INVALID_NAME!")
    # Override the yaml to have an invalid name
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "bibliogon-plugin-bad/plugin.yaml",
            yaml.dump({"plugin": {"name": "INVALID!", "version": "1.0.0"}}),
        )
        zf.writestr("bibliogon-plugin-bad/bad_pkg/__init__.py", "")
        zf.writestr(
            "bibliogon-plugin-bad/bad_pkg/plugin.py",
            "from pluginforge import BasePlugin\nclass P(BasePlugin):\n  name='bad'\n  version='1'\n",
        )
    buf.seek(0)

    resp = client.post(
        "/api/plugins/install",
        files={"file": ("bad.zip", buf, "application/zip")},
    )
    assert resp.status_code == 400


def test_install_overwrites_existing(client, temp_base):
    """Reinstalling a plugin replaces the old version."""
    zip_v1 = _make_plugin_zip("overwrite-me", "overwrite_me", version="1.0.0")
    client.post(
        "/api/plugins/install",
        files={"file": ("overwrite-me.zip", zip_v1, "application/zip")},
    )

    zip_v2 = _make_plugin_zip("overwrite-me", "overwrite_me", version="2.0.0")
    resp = client.post(
        "/api/plugins/install",
        files={"file": ("overwrite-me.zip", zip_v2, "application/zip")},
    )
    assert resp.status_code == 200
    assert resp.json()["version"] == "2.0.0"


# --- DELETE /api/plugins/install/{name} ---


def test_uninstall_removes_files(client, temp_base):
    """Uninstalling removes installed files, config, and from enabled list."""
    zip_buf = _make_plugin_zip("removable", "removable_pkg")
    client.post(
        "/api/plugins/install",
        files={"file": ("removable.zip", zip_buf, "application/zip")},
    )
    installed_path = temp_base / "plugins" / "installed" / "removable"
    assert installed_path.exists()

    resp = client.delete("/api/plugins/install/removable")
    assert resp.status_code == 200
    assert resp.json()["status"] == "uninstalled"

    # Files gone
    assert not installed_path.exists()
    # Config gone
    assert not (temp_base / "config" / "plugins" / "removable.yaml").exists()


def test_uninstall_nonexistent_returns_404(client):
    """Uninstalling a plugin that does not exist returns 404."""
    resp = client.delete("/api/plugins/install/nonexistent-plugin")
    assert resp.status_code == 404


def test_uninstall_invalid_name_returns_400(client):
    """Invalid plugin name is rejected before filesystem check."""
    resp = client.delete("/api/plugins/install/INVALID!")
    assert resp.status_code == 400


# --- GET /api/plugins/installed ---


def test_list_installed_empty(client):
    """No installed plugins returns empty list."""
    resp = client.get("/api/plugins/installed")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_installed_after_install(client):
    """Installed plugin appears in the list."""
    zip_buf = _make_plugin_zip("listed-plugin", "listed_plugin", version="1.2.3")
    client.post(
        "/api/plugins/install",
        files={"file": ("listed-plugin.zip", zip_buf, "application/zip")},
    )

    resp = client.get("/api/plugins/installed")
    assert resp.status_code == 200
    plugins = resp.json()
    assert len(plugins) == 1
    assert plugins[0]["name"] == "listed-plugin"
    assert plugins[0]["version"] == "1.2.3"


def test_list_installed_after_uninstall(client):
    """Uninstalled plugin no longer appears in the list."""
    zip_buf = _make_plugin_zip("temp-plugin", "temp_plugin")
    client.post(
        "/api/plugins/install",
        files={"file": ("temp-plugin.zip", zip_buf, "application/zip")},
    )
    client.delete("/api/plugins/install/temp-plugin")

    resp = client.get("/api/plugins/installed")
    assert resp.status_code == 200
    assert resp.json() == []
