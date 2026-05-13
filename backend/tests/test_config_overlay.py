"""Unit tests for ``app.config_overlay``.

Pins the project / user-overlay merge semantics, the "writes
never touch the project tree" invariant (the v0.32.x
PROD-WRITES-ARCHITECTURE-01 promise), and the comment-preserving
``load_*_for_edit`` round-trip path.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app import config_overlay


@pytest.fixture
def two_layer_dirs(tmp_path, monkeypatch):
    """Set up a project-tree layer and a separate user-overlay layer.

    Returns ``(project_dir, user_data_dir)``. The two are deliberately
    different paths so the merge logic is genuinely exercised
    (collapsed layers would let bugs slip through that production
    deployment would surface).
    """
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    (project_dir / "config").mkdir()
    (project_dir / "config" / "plugins").mkdir()

    user_data = tmp_path / "user-data"
    user_data.mkdir()

    original = config_overlay.get_project_config_dir()
    config_overlay.set_project_config_dir(project_dir / "config")
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(user_data))
    yield project_dir / "config", user_data
    config_overlay.set_project_config_dir(original)


# --- deep_merge ---


def test_deep_merge_dict_recurse():
    out = config_overlay.deep_merge({"a": {"b": 1, "c": 2}}, {"a": {"c": 3, "d": 4}})
    assert out == {"a": {"b": 1, "c": 3, "d": 4}}


def test_deep_merge_lists_replace():
    """Lists REPLACE, do not concatenate (matches secrets-overlay)."""
    out = config_overlay.deep_merge({"plugins": ["a", "b"]}, {"plugins": ["c"]})
    assert out == {"plugins": ["c"]}


def test_deep_merge_scalar_override():
    out = config_overlay.deep_merge({"theme": "warm"}, {"theme": "nord"})
    assert out == {"theme": "nord"}


def test_deep_merge_does_not_mutate_inputs():
    base = {"a": {"b": 1}}
    override = {"a": {"c": 2}}
    config_overlay.deep_merge(base, override)
    assert base == {"a": {"b": 1}}
    assert override == {"a": {"c": 2}}


# --- read_app_config_merged ---


def test_read_app_config_user_wins_over_project(two_layer_dirs):
    project_cfg, _ = two_layer_dirs
    (project_cfg / "app.yaml").write_text(
        "app:\n  language: en\n  theme: warm\n", encoding="utf-8"
    )
    config_overlay.write_user_app_config({"app": {"language": "de"}})

    merged = config_overlay.read_app_config_merged()
    assert merged["app"]["language"] == "de"  # user wins
    assert merged["app"]["theme"] == "warm"  # project preserved


def test_read_app_config_no_user_returns_project(two_layer_dirs):
    project_cfg, _ = two_layer_dirs
    (project_cfg / "app.yaml").write_text("app:\n  theme: warm\n", encoding="utf-8")
    merged = config_overlay.read_app_config_merged()
    assert merged == {"app": {"theme": "warm"}}


def test_read_app_config_no_project_returns_user(two_layer_dirs):
    config_overlay.write_user_app_config({"app": {"theme": "nord"}})
    merged = config_overlay.read_app_config_merged()
    assert merged == {"app": {"theme": "nord"}}


def test_read_app_config_both_missing_returns_empty(two_layer_dirs):
    assert config_overlay.read_app_config_merged() == {}


# --- write_user_app_config: path isolation invariant ---


def test_write_user_app_config_never_touches_project(two_layer_dirs):
    """The headline PROD-WRITES-ARCHITECTURE-01 guarantee."""
    project_cfg, user_data = two_layer_dirs
    project_app = project_cfg / "app.yaml"
    project_app.write_text("app:\n  theme: warm\n", encoding="utf-8")
    original_bytes = project_app.read_bytes()

    config_overlay.write_user_app_config({"app": {"theme": "nord"}})

    assert project_app.read_bytes() == original_bytes, (
        "write_user_app_config wrote into the project tree; the "
        "dev-docker bind-mount quirk would crash here."
    )
    assert (user_data / "config" / "app.yaml").exists()


def test_write_user_app_config_creates_user_dir_if_missing(two_layer_dirs):
    """User config dir is created lazily; no startup-time mkdir needed."""
    _, user_data = two_layer_dirs
    user_config_dir = user_data / "config"
    assert not user_config_dir.exists()
    config_overlay.write_user_app_config({"app": {}})
    assert user_config_dir.is_dir()


# --- read_plugin_config_merged ---


def test_read_plugin_config_user_wins(two_layer_dirs):
    project_cfg, _ = two_layer_dirs
    (project_cfg / "plugins" / "x.yaml").write_text(
        "plugin:\n  name: x\nsettings:\n  a: 1\n  b: 2\n", encoding="utf-8"
    )
    config_overlay.write_user_plugin_config("x", {"settings": {"b": 99}})

    merged = config_overlay.read_plugin_config_merged("x")
    assert merged["plugin"]["name"] == "x"
    assert merged["settings"] == {"a": 1, "b": 99}


def test_read_plugin_config_missing_both_returns_empty(two_layer_dirs):
    assert config_overlay.read_plugin_config_merged("nonexistent") == {}


# --- load_*_for_edit preserves ruamel comments ---


def test_load_app_config_for_edit_preserves_comments(two_layer_dirs):
    """First write seeds from project; bundled comments survive."""
    project_cfg, user_data = two_layer_dirs
    (project_cfg / "app.yaml").write_text(
        "app:\n  # INTERNAL: shipped default\n  theme: warm\n",
        encoding="utf-8",
    )
    loaded = config_overlay.load_app_config_for_edit()
    loaded["app"]["theme"] = "nord"
    config_overlay.write_user_app_config(loaded)

    on_disk = (user_data / "config" / "app.yaml").read_text(encoding="utf-8")
    assert "# INTERNAL: shipped default" in on_disk
    assert "theme: nord" in on_disk


def test_load_plugin_config_for_edit_preserves_comments(two_layer_dirs):
    project_cfg, user_data = two_layer_dirs
    (project_cfg / "plugins" / "y.yaml").write_text(
        "plugin:\n  name: y\nsettings:\n"
        "  # INTERNAL: power-user knob\n"
        "  tweak: 10\n",
        encoding="utf-8",
    )
    loaded = config_overlay.load_plugin_config_for_edit("y")
    loaded["settings"]["tweak"] = 20
    config_overlay.write_user_plugin_config("y", loaded)

    on_disk = (user_data / "config" / "plugins" / "y.yaml").read_text(encoding="utf-8")
    assert "# INTERNAL: power-user knob" in on_disk
    assert "tweak: 20" in on_disk


def test_load_app_config_for_edit_returns_empty_when_neither_exists(two_layer_dirs):
    assert config_overlay.load_app_config_for_edit() == {}


def test_load_app_config_for_edit_prefers_user_overlay(two_layer_dirs):
    """Once the overlay exists, subsequent edits build on it, not on
    the project. Otherwise edits would silently reset on every save."""
    project_cfg, _ = two_layer_dirs
    (project_cfg / "app.yaml").write_text("app:\n  theme: warm\n", encoding="utf-8")
    config_overlay.write_user_app_config({"app": {"theme": "nord"}})

    loaded = config_overlay.load_app_config_for_edit()
    assert loaded["app"]["theme"] == "nord"


# --- delete_user_plugin_config ---


def test_delete_user_plugin_config_returns_true_when_present(two_layer_dirs):
    config_overlay.write_user_plugin_config("z", {"settings": {}})
    assert config_overlay.delete_user_plugin_config("z") is True
    assert not config_overlay.has_user_plugin_config("z")


def test_delete_user_plugin_config_returns_false_when_absent(two_layer_dirs):
    assert config_overlay.delete_user_plugin_config("nothing") is False


def test_delete_user_plugin_config_never_touches_project(two_layer_dirs):
    project_cfg, _ = two_layer_dirs
    project_file = project_cfg / "plugins" / "w.yaml"
    project_file.write_text("plugin:\n  name: w\n", encoding="utf-8")
    original_bytes = project_file.read_bytes()
    config_overlay.write_user_plugin_config("w", {"settings": {}})

    config_overlay.delete_user_plugin_config("w")

    assert project_file.read_bytes() == original_bytes
    # plugin_config_exists still True because the bundled file survives.
    assert config_overlay.plugin_config_exists("w")


# --- list_merged_plugin_names ---


def test_list_merged_plugin_names_unions_both_layers(two_layer_dirs):
    project_cfg, _ = two_layer_dirs
    (project_cfg / "plugins" / "a.yaml").write_text("plugin:\n  name: a\n", encoding="utf-8")
    (project_cfg / "plugins" / "b.yaml").write_text("plugin:\n  name: b\n", encoding="utf-8")
    config_overlay.write_user_plugin_config("c", {"settings": {}})
    config_overlay.write_user_plugin_config("a", {"settings": {"v": 1}})  # also in project

    names = config_overlay.list_merged_plugin_names()
    assert names == ["a", "b", "c"]


def test_get_user_config_dir_resolves_via_data_dir(two_layer_dirs):
    """The resolver re-reads BIBLIOGON_DATA_DIR on every call so test
    env-var overrides land even after module import (the same rule
    the v0.31.0 Phase 2 paths.py docstring spells out for
    get_upload_dir)."""
    _, user_data = two_layer_dirs
    assert config_overlay.get_user_config_dir() == user_data / "config"


def test_set_project_config_dir_round_trip(tmp_path):
    """Tests rely on round-tripping the project config dir to keep
    them isolated; pin the helper so a future refactor that loses
    the setter breaks here, not in 50 downstream test fixtures."""
    original = config_overlay.get_project_config_dir()
    try:
        config_overlay.set_project_config_dir(tmp_path)
        assert config_overlay.get_project_config_dir() == tmp_path
    finally:
        config_overlay.set_project_config_dir(original)
        assert config_overlay.get_project_config_dir() == original
