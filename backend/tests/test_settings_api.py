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

from app import config_overlay
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
    app_yaml.write_text(
        yaml.dump(
            {
                "app": {"language": "de", "theme": "warm-literary"},
                "author": {"name": "Test Author"},
                "plugins": {"enabled": ["export", "help"], "disabled": []},
            }
        )
    )

    # Seed one plugin config
    export_yaml = plugins_dir / "export.yaml"
    export_yaml.write_text(
        yaml.dump(
            {
                "plugin": {"name": "export", "version": "1.0.0", "license": "MIT"},
                "settings": {"type_suffix_in_filename": True},
            }
        )
    )

    return tmp_path


@pytest.fixture
def client(temp_base, monkeypatch):
    """TestClient with config overlay collapsed to ``temp_base``.

    After PROD-WRITES-ARCHITECTURE-01 (v0.32.x) the production
    settings router reads ``_PROJECT_CONFIG_DIR / "app.yaml"`` and
    merges ``<data_dir>/config/app.yaml`` on top. The two paths
    differ in production (project tree vs platformdirs data dir)
    but in tests we point both at ``temp_base / "config"`` so the
    existing single-file seed remains the source of truth.

    Also redirects the user-override path resolution to ``temp_base``
    so the secrets-refactor flag (T-XX) does not see the developer's
    real ``~/.config/bibliogon/secrets.yaml`` while the suite runs.
    Same for ``BIBLIOGON_AI_API_KEY`` env-var.
    """
    from app import main as main_module

    original_base = settings_module._base_dir
    original_manager = settings_module._manager
    original_project_cfg = config_overlay.get_project_config_dir()

    settings_module._base_dir = temp_base
    settings_module._manager = None
    config_overlay.set_project_config_dir(temp_base / "config")
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(temp_base))

    monkeypatch.setattr(
        main_module,
        "_get_user_override_path",
        lambda: temp_base / "secrets-not-present.yaml",
    )
    monkeypatch.delenv("BIBLIOGON_AI_API_KEY", raising=False)

    yield TestClient(app)

    settings_module._base_dir = original_base
    settings_module._manager = original_manager
    config_overlay.set_project_config_dir(original_project_cfg)


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
    """Returns the flag-only payload when app.yaml does not exist."""
    (temp_base / "config" / "app.yaml").unlink()

    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    # _secrets_managed_externally meta-field is always emitted by the
    # endpoint so the frontend has a deterministic flag to read.
    assert resp.json() == {"_secrets_managed_externally": False}


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


def test_update_behavior_skip_confirmations_round_trips(client, temp_base):
    """behavior.skip_non_destructive_confirmations persists end-to-end.

    Regression: the ``behavior`` branch was missing from
    AppSettingsUpdate, so the Settings>Verhalten "skip confirmations
    for harmless actions" toggle was silently dropped at validation and
    never saved (reported by Aster 2026-06-05). This test fails on the
    pre-fix code (the field never reaches disk or the response).
    """
    resp = client.patch(
        "/api/settings/app",
        json={"behavior": {"skip_non_destructive_confirmations": True}},
    )
    assert resp.status_code == 200
    assert resp.json()["behavior"]["skip_non_destructive_confirmations"] is True

    # Persisted to disk...
    with open(temp_base / "config" / "app.yaml") as f:
        on_disk = yaml.safe_load(f)
    assert on_disk["behavior"]["skip_non_destructive_confirmations"] is True

    # ...and returned by a fresh GET (what AppDialog reads on next load).
    got = client.get("/api/settings/app")
    assert got.json()["behavior"]["skip_non_destructive_confirmations"] is True


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


def test_get_app_settings_externally_managed_flag_false_by_default(client):
    """Without override file or env-var, the flag is False."""
    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    assert resp.json()["_secrets_managed_externally"] is False


def test_get_app_settings_externally_managed_flag_true_with_env(client, monkeypatch):
    """Setting BIBLIOGON_AI_API_KEY flips the flag to True."""
    monkeypatch.setenv("BIBLIOGON_AI_API_KEY", "from-env")
    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    assert resp.json()["_secrets_managed_externally"] is True


def test_patch_strips_ai_api_key_when_externally_managed(client, temp_base, monkeypatch):
    """When override is active, the PATCH body's ai.api_key is
    stripped + a WARNING is logged. Other ai fields in the same
    PATCH still apply.

    Spies on ``settings_module.logger.warning`` directly because the
    suite reconfigures loggers across tests and ``caplog`` is not
    reliable cross-test for module-level loggers (same pattern as
    test_config_loader.py corrupt-override case).
    """
    monkeypatch.setenv("BIBLIOGON_AI_API_KEY", "from-env")

    captured: list[str] = []
    original_warning = settings_module.logger.warning

    def spy(msg, *args, **kwargs):
        captured.append(msg % args if args else msg)
        return original_warning(msg, *args, **kwargs)

    monkeypatch.setattr(settings_module.logger, "warning", spy)

    resp = client.patch(
        "/api/settings/app",
        json={"ai": {"provider": "openai", "api_key": "should-be-stripped"}},
    )
    assert resp.status_code == 200
    # ai.provider applied, ai.api_key NOT written.
    written = resp.json()
    assert written["ai"]["provider"] == "openai"
    assert (
        "api_key" not in written.get("ai", {})
        or written["ai"].get("api_key", "") != "should-be-stripped"
    )
    # On-disk verification: api_key absent or unchanged from baseline.
    with open(temp_base / "config" / "app.yaml") as f:
        on_disk = yaml.safe_load(f)
    assert on_disk["ai"].get("api_key", "") != "should-be-stripped"
    # Warning logged with the parent.child path so the dev sees
    # which UI surface still ships the field.
    assert any("ai" in m and "api_key" in m and "Stripped" in m for m in captured), captured


def test_patch_preserves_api_key_when_not_externally_managed(client):
    """Without override, ai.api_key flows through to disk as before."""
    resp = client.patch(
        "/api/settings/app",
        json={"ai": {"provider": "anthropic", "api_key": "from-ui"}},
    )
    assert resp.status_code == 200
    assert resp.json()["ai"]["api_key"] == "from-ui"


# --- DASHBOARD-PAGINATION-LOAD-MORE-01 C2: page-size validation ---


def test_patch_accepts_books_page_size_in_enum(client):
    """All four allowed values round-trip cleanly."""
    for value in (10, 25, 50, 100):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"dashboard": {"books_page_size": value}}},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ui"]["dashboard"]["books_page_size"] == value


def test_patch_accepts_articles_page_size_in_enum(client):
    """Mirror test for the articles key."""
    for value in (10, 25, 50, 100):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"dashboard": {"articles_page_size": value}}},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ui"]["dashboard"]["articles_page_size"] == value


def test_patch_rejects_out_of_enum_page_size(client):
    """Values outside {10, 25, 50, 100} produce a 400."""
    for bad in (5, 15, 99, 200, 0, -10):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"dashboard": {"books_page_size": bad}}},
        )
        assert resp.status_code == 400, f"value {bad} should have failed"
        assert "books_page_size" in resp.json()["detail"]


def test_patch_rejects_non_int_page_size(client):
    """String / null / float values are rejected."""
    for bad in ("25", None, 25.5):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"dashboard": {"articles_page_size": bad}}},
        )
        assert resp.status_code == 400, f"value {bad!r} should have failed"


def test_patch_page_size_does_not_break_unrelated_ui_keys(client):
    """Validation fires only on the page-size keys; other ui.dashboard
    fields (e.g. ``books_view``) flow through untouched."""
    resp = client.patch(
        "/api/settings/app",
        json={"ui": {"dashboard": {"books_view": "list"}}},
    )
    assert resp.status_code == 200
    assert resp.json()["ui"]["dashboard"]["books_view"] == "list"


# --- PATCH /api/settings/app : ui.defaults (book_type + content_type) ---


def test_patch_accepts_valid_default_book_type(client):
    """Each registry book_type round-trips into ui.defaults.book_type."""
    for value in ("prose", "picture_book", "comic_book"):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"defaults": {"book_type": value}}},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ui"]["defaults"]["book_type"] == value


def test_patch_accepts_valid_default_content_type(client):
    """A representative set of registry content_types round-trips."""
    for value in ("blogpost", "tutorial", "short_story"):
        resp = client.patch(
            "/api/settings/app",
            json={"ui": {"defaults": {"content_type": value}}},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["ui"]["defaults"]["content_type"] == value


def test_patch_accepts_both_defaults_together(client):
    """Book + content default persist together in one PATCH and survive
    a subsequent GET (round-trip to disk + back)."""
    resp = client.patch(
        "/api/settings/app",
        json={"ui": {"defaults": {"book_type": "comic_book", "content_type": "tutorial"}}},
    )
    assert resp.status_code == 200, resp.text
    fresh = client.get("/api/settings/app").json()
    assert fresh["ui"]["defaults"]["book_type"] == "comic_book"
    assert fresh["ui"]["defaults"]["content_type"] == "tutorial"


def test_patch_rejects_unknown_default_book_type(client):
    """A book_type not in book-types.yaml produces a 400 naming the key."""
    resp = client.patch(
        "/api/settings/app",
        json={"ui": {"defaults": {"book_type": "novella"}}},
    )
    assert resp.status_code == 400
    assert "ui.defaults.book_type" in resp.json()["detail"]


def test_patch_rejects_unknown_default_content_type(client):
    """A content_type not in content-types.yaml produces a 400."""
    resp = client.patch(
        "/api/settings/app",
        json={"ui": {"defaults": {"content_type": "podcast"}}},
    )
    assert resp.status_code == 400
    assert "ui.defaults.content_type" in resp.json()["detail"]


def test_patch_defaults_does_not_break_unrelated_ui_keys(client):
    """ui.defaults validation fires only on its own keys; other ui
    fields flow through untouched."""
    resp = client.patch(
        "/api/settings/app",
        json={"ui": {"defaults": {"book_type": "prose"}, "sidebar_collapsed": True}},
    )
    assert resp.status_code == 200
    assert resp.json()["ui"]["sidebar_collapsed"] is True


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
    resp = client.post(
        "/api/settings/plugins",
        json={
            "name": "custom-plugin",
            "display_name": "Custom Plugin",
            "description": "A custom plugin",
            "version": "2.0.0",
            "license": "MIT",
            "settings": {"enabled": True},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plugin"]["name"] == "custom-plugin"
    assert body["settings"]["enabled"] is True

    # File exists on disk
    assert (temp_base / "config" / "plugins" / "custom-plugin.yaml").exists()


def test_create_plugin_config_duplicate_returns_409(client):
    """Creating a config that already exists returns 409."""
    resp = client.post(
        "/api/settings/plugins",
        json={
            "name": "export",
            "display_name": "Export",
        },
    )
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


def test_get_app_settings_exposes_donations_when_configured(client, temp_base):
    """The existing /api/settings/app endpoint is the transport for the
    donation config. This test pins the shape so a future refactor that
    strips unknown keys from the response would fail loudly instead of
    silently breaking S-01/S-02/S-03.
    """
    app_yaml = temp_base / "config" / "app.yaml"
    base = yaml.safe_load(app_yaml.read_text()) or {}
    base["donations"] = {
        "enabled": True,
        "landing_page_url": None,
        "channels": [
            {
                "name": "Liberapay",
                "url": "https://liberapay.com/astrapi69/donate",
                "icon": "liberapay",
                "recommended": True,
                "description_key": "ui.donations.channels.liberapay_desc",
            },
            {
                "name": "GitHub Sponsors",
                "url": "https://github.com/sponsors/astrapi69",
                "icon": "github",
                "description_key": "ui.donations.channels.github_desc",
            },
        ],
    }
    app_yaml.write_text(yaml.dump(base))

    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    body = resp.json()
    donations = body.get("donations")
    assert donations is not None, "donations block missing from app config"
    assert donations["enabled"] is True
    assert donations["landing_page_url"] is None
    assert len(donations["channels"]) == 2
    assert donations["channels"][0]["name"] == "Liberapay"
    assert donations["channels"][0]["recommended"] is True
    # The second channel omits `recommended`; the endpoint must not
    # synthesise a default, it returns what the YAML had.
    assert "recommended" not in donations["channels"][1]


def test_get_app_settings_donations_disabled(client, temp_base):
    """Kill switch: donations.enabled=false is returned as-is. The
    frontend consumers treat this as 'hide all visibility levels'.
    """
    app_yaml = temp_base / "config" / "app.yaml"
    base = yaml.safe_load(app_yaml.read_text()) or {}
    base["donations"] = {"enabled": False, "landing_page_url": None, "channels": []}
    app_yaml.write_text(yaml.dump(base))

    resp = client.get("/api/settings/app")
    assert resp.status_code == 200
    assert resp.json()["donations"]["enabled"] is False


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
        "plugin:\n"
        '  name: "export"\n'
        '  version: "1.0.0"\n'
        '  license: "MIT"\n'
        "\n"
        "settings:\n"
        "  type_suffix_in_filename: true\n"
        "  # INTERNAL: power-user knob, edit via YAML only\n"
        "  pandoc_timeout_seconds: 120\n"
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


# --- POST /api/settings/author/pen-name ---


def test_add_pen_name_appends_to_existing_profile(client, temp_base):
    """name set, pen_names empty -> new pen name appended."""
    resp = client.post("/api/settings/author/pen-name", json={"name": "New Pen"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Test Author"
    assert body["pen_names"] == ["New Pen"]
    with open(temp_base / "config" / "app.yaml") as f:
        config = yaml.safe_load(f)
    assert config["author"]["pen_names"] == ["New Pen"]


def test_add_pen_name_idempotent_when_already_present(client, temp_base):
    """Adding a pen name that already exists is a no-op."""
    client.post("/api/settings/author/pen-name", json={"name": "Pen A"})
    resp = client.post("/api/settings/author/pen-name", json={"name": "Pen A"})
    assert resp.status_code == 200
    assert resp.json()["pen_names"] == ["Pen A"]


def test_add_pen_name_idempotent_when_matches_real_name(client, temp_base):
    """Adding the real name does not duplicate it into pen_names."""
    resp = client.post("/api/settings/author/pen-name", json={"name": "Test Author"})
    assert resp.status_code == 200
    assert resp.json() == {"name": "Test Author", "pen_names": []}


def test_add_pen_name_sets_real_name_when_empty(tmp_path, monkeypatch):
    """Bootstrapping: with empty profile, the first add becomes the
    real name rather than a lonely pen name."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    (config_dir / "app.yaml").write_text(yaml.dump({"author": {"name": "", "pen_names": []}}))

    monkeypatch.setattr(settings_module, "_base_dir", tmp_path)
    monkeypatch.setattr(settings_module, "_manager", None)

    original_project_cfg = config_overlay.get_project_config_dir()
    config_overlay.set_project_config_dir(tmp_path / "config")
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))
    try:
        c = TestClient(app)
        resp = c.post("/api/settings/author/pen-name", json={"name": "First"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "First"
        assert body["pen_names"] == []
    finally:
        config_overlay.set_project_config_dir(original_project_cfg)


def test_add_pen_name_rejects_blank(client):
    """Empty / whitespace-only name -> 400."""
    resp = client.post("/api/settings/author/pen-name", json={"name": "   "})
    assert resp.status_code == 400
