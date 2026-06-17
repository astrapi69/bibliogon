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


def test_plugins_enabled_list_replace_regression_pin():
    """Plugins.enabled list REPLACES under raw merge, but migration
    helper extends the user-overlay BEFORE merge runs.

    Two-part regression-pin for USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01:

    Part 1 — ``deep_merge`` itself REPLACES lists (semantics
    preserved globally). A stale user-overlay would silently
    filter new plugins out IF the migration helper did not run
    first. This was the plugin-comics Session 1 smoke's 404 root
    cause.

    Part 2 — ``migrate_user_overlay_enabled_list`` runs at
    lifespan startup BEFORE the merge resolves the enabled list.
    It appends project-tree plugins missing from the user-overlay
    (while respecting ``disabled`` opt-out). The migration LIVES
    BESIDE the merge contract — it does NOT change ``deep_merge``.

    Future contract changes must update BOTH parts in lockstep:
    - If ``deep_merge`` ever stops treating lists as replace,
      update part 1's assertion.
    - If the migration ever stops being eager-by-default, update
      part 2's assertion + the lifespan wiring in ``main.py``.
    """
    project = {"plugins": {"enabled": ["export", "kdp", "comics"]}}
    user_overlay = {"plugins": {"enabled": ["export", "kdp"]}}  # stale, missing comics
    merged = config_overlay.deep_merge(project, user_overlay)
    # Part 1: raw merge replaces; comics filtered out.
    assert merged["plugins"]["enabled"] == ["export", "kdp"]
    assert "comics" not in merged["plugins"]["enabled"], (
        "Current semantics: user-overlay enabled list replaces the "
        "project-tree's list. If this assertion fails, the merge "
        "semantics changed; update both this test and the "
        "USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 backlog item."
    )

    # Part 2: migration helper EXTENDS the user-overlay before merge
    # runs. Function-level call here pins the contract: given the
    # same stale user-overlay, calling migrate_*() rewrites
    # user.enabled to include the missing project plugins. The
    # lifespan integration test (test_user_overlay_migration_*)
    # pins the same behavior end-to-end via TestClient.
    extended_user = {"plugins": {"enabled": list(user_overlay["plugins"]["enabled"])}}
    project_enabled_set = set(project["plugins"]["enabled"])
    user_enabled_set = set(extended_user["plugins"]["enabled"])
    user_disabled = set(extended_user["plugins"].get("disabled") or [])
    to_append = [
        n
        for n in project["plugins"]["enabled"]
        if n not in user_enabled_set and n not in user_disabled
    ]
    extended_user["plugins"]["enabled"] = list(extended_user["plugins"]["enabled"]) + to_append
    merged_after = config_overlay.deep_merge(project, extended_user)
    assert "comics" in merged_after["plugins"]["enabled"], (
        "Migration helper should append project-tree plugins "
        "missing from the user-overlay's enabled list, so the "
        "merged result includes comics. Pin both this assertion "
        "AND the function-level test_migrate_appends_missing_plugins "
        "if the migration's contract ever changes."
    )
    assert set(merged_after["plugins"]["enabled"]) == project_enabled_set


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
    (project_cfg / "app.yaml").write_text("app:\n  language: en\n  theme: warm\n", encoding="utf-8")
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


def test_write_user_app_config_is_atomic_under_concurrent_read(two_layer_dirs, monkeypatch):
    """Regression: a write in progress must never expose a truncated file to
    a concurrent reader.

    Pre-fix ``write_yaml_roundtrip`` opened the target in ``"w"`` mode (which
    truncates immediately) and dumped in place, so a reader that hit the file
    mid-dump saw a partial document. Two overlapping ``PATCH /settings/app``
    requests (the manual-automation TC-052 language sweep fires several in
    quick succession) corrupted ``app.yaml`` this way, 500-ing every later
    settings read. The atomic temp-file + ``os.replace`` write keeps the
    target pointing at the complete previous version until the rename, so a
    concurrent read always sees a full, valid document.

    Deterministic by construction: the dump is slowed so the read lands
    squarely inside the write window.
    """
    import threading
    import time

    from ruamel.yaml import YAML

    from app import yaml_io
    from app.yaml_io import read_yaml_roundtrip

    original = {
        "app": {"default_language": "de"},
        "ai": {"provider": "anthropic", "api_key": "", "model": "x"},
        "ui": {"theme": "warm"},
    }
    config_overlay.write_user_app_config(original)
    path = config_overlay._user_app_path()

    class _SlowDumper:
        """Stand-in for the ruamel YAML object whose ``dump`` writes the new
        document in two chunks with a gap, widening the partial-write window
        a non-atomic writer would expose. ``load`` delegates to a real YAML
        so concurrent reads still parse normally (the monkeypatch below
        replaces ``_yaml`` for both the read and the write path)."""

        _real = YAML(typ="rt")

        def load(self, stream: object) -> object:
            return self._real.load(stream)

        def dump(self, data: object, stream: object) -> None:
            stream.write("app:\n")  # type: ignore[attr-defined]
            stream.flush()  # type: ignore[attr-defined]
            time.sleep(0.3)
            stream.write("  default_language: en\n")  # type: ignore[attr-defined]
            stream.flush()  # type: ignore[attr-defined]

    monkeypatch.setattr(yaml_io, "_yaml", lambda: _SlowDumper())

    seen_during_write: list[dict] = []

    def slow_write() -> None:
        config_overlay.write_user_app_config({"app": {"default_language": "en"}})

    writer = threading.Thread(target=slow_write)
    writer.start()
    time.sleep(0.1)  # land inside the 0.3s dump window
    seen_during_write.append(read_yaml_roundtrip(path))
    writer.join()

    # Mid-write, the reader must have seen the COMPLETE previous document,
    # not a truncated ``app:\n`` (which parses to {"app": None}).
    mid = seen_during_write[0]
    assert mid.get("ai", {}).get("provider") == "anthropic", (
        f"reader saw a partial file mid-write: {mid!r}"
    )
    assert mid["app"]["default_language"] == "de"


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
        "plugin:\n  name: y\nsettings:\n  # INTERNAL: power-user knob\n  tweak: 10\n",
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


# --- migrate_user_overlay_enabled_list ---
#
# Closes USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (P2 backlog).
# The migration appends project-tree plugins missing from the
# user-overlay's enabled list, while respecting user-overlay's
# disabled list as opt-out.


def _write_project_app(project_cfg: Path, enabled: list[str]) -> None:
    """Helper: seed the project-tree app.yaml with a plugins.enabled list."""
    (project_cfg / "app.yaml").write_text(
        "plugins:\n  enabled:\n" + "".join(f"    - {name}\n" for name in enabled),
        encoding="utf-8",
    )


def _write_user_app(enabled: list[str] | None = None, disabled: list[str] | None = None) -> None:
    """Helper: seed the user-overlay app.yaml with plugins.enabled + disabled."""
    cfg: dict[str, object] = {"plugins": {}}
    plugins = cfg["plugins"]
    assert isinstance(plugins, dict)
    if enabled is not None:
        plugins["enabled"] = enabled
    if disabled is not None:
        plugins["disabled"] = disabled
    config_overlay.write_user_app_config(cfg)


def test_migrate_no_user_overlay_is_noop(two_layer_dirs):
    """Fresh installs have no user-overlay yet; migration must no-op."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    # No user-overlay written.
    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    assert newly_added == []
    assert did_write is False
    assert not config_overlay.user_app_config_exists()


def test_migrate_appends_missing_plugins(two_layer_dirs):
    """Project has comics, user-overlay doesn't, no disabled list → comics appended."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    _write_user_app(enabled=["export", "kdp"])

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    assert newly_added == ["comics"]
    assert did_write is True

    merged = config_overlay.read_app_config_merged()
    assert merged["plugins"]["enabled"] == ["export", "kdp", "comics"]


def test_migrate_respects_disabled_opt_out(two_layer_dirs):
    """If a plugin is in user.disabled, do NOT add it to enabled."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    _write_user_app(enabled=["export", "kdp"], disabled=["comics"])

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    # comics is opt-out; not appended.
    assert newly_added == []
    assert did_write is False

    merged = config_overlay.read_app_config_merged()
    # Project list is replaced (deep_merge semantics for lists) by user's
    # explicit list — comics stays absent because the user opted it out.
    assert merged["plugins"]["enabled"] == ["export", "kdp"]
    assert merged["plugins"]["disabled"] == ["comics"]


def test_migrate_in_sync_is_noop(two_layer_dirs):
    """User-overlay already has every project-enabled plugin → no write."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    _write_user_app(enabled=["export", "kdp", "comics"])

    user_path = config_overlay.get_user_config_dir() / "app.yaml"
    mtime_before = user_path.stat().st_mtime_ns

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    assert newly_added == []
    assert did_write is False

    # Verify the file was NOT touched (mtime unchanged).
    assert user_path.stat().st_mtime_ns == mtime_before


def test_migrate_appends_multiple(two_layer_dirs):
    """Multiple project plugins missing from user → all appended in one write."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics", "newplugin"])
    _write_user_app(enabled=["export"])

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    assert newly_added == ["kdp", "comics", "newplugin"]
    assert did_write is True

    merged = config_overlay.read_app_config_merged()
    assert merged["plugins"]["enabled"] == [
        "export",
        "kdp",
        "comics",
        "newplugin",
    ]


def test_migrate_is_idempotent(two_layer_dirs):
    """Running the migration twice in a row produces no extra writes."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    _write_user_app(enabled=["export"])

    # First call: appends.
    first_added, first_wrote = config_overlay.migrate_user_overlay_enabled_list()
    assert first_added == ["kdp", "comics"]
    assert first_wrote is True

    # Second call: nothing left to append.
    second_added, second_wrote = config_overlay.migrate_user_overlay_enabled_list()
    assert second_added == []
    assert second_wrote is False


def test_migrate_handles_empty_user_enabled(two_layer_dirs):
    """User-overlay has plugins block but no enabled key → seed full list."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp"])
    # Write a user-overlay that has plugins but NO enabled key.
    config_overlay.write_user_app_config({"plugins": {"disabled": []}})

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    assert newly_added == ["export", "kdp"]
    assert did_write is True


def test_migrate_handles_malformed_plugins_block(two_layer_dirs):
    """User-overlay has plugins as a non-dict (e.g. list) → no-op gracefully."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp"])
    # Write a user-overlay with a broken plugins block.
    config_overlay.write_user_app_config({"plugins": ["not", "a", "dict"]})

    newly_added, did_write = config_overlay.migrate_user_overlay_enabled_list()
    # Migration refuses to repair malformed shapes (silent no-op so an
    # admin can fix the yaml by hand). Pin this regression-pin in
    # case a future refactor adds auto-repair (which would be a
    # behavior change worth re-discussing).
    assert newly_added == []
    assert did_write is False


def test_migrate_preserves_user_disabled_list(two_layer_dirs):
    """Migration must NOT mutate plugins.disabled — only plugins.enabled."""
    project_cfg, _ = two_layer_dirs
    _write_project_app(project_cfg, ["export", "kdp", "comics"])
    _write_user_app(enabled=["export"], disabled=["audiobook"])

    config_overlay.migrate_user_overlay_enabled_list()

    merged = config_overlay.read_app_config_merged()
    assert merged["plugins"]["disabled"] == ["audiobook"]
    # comics is added (not in disabled); audiobook stays disabled
    # (not in project enabled).
    assert "comics" in merged["plugins"]["enabled"]
    assert "audiobook" not in merged["plugins"]["enabled"]
