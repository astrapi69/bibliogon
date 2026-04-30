"""Tests for the three-layer config loader.

Layer chain: project app.yaml < user override file < env-vars.
Covers XDG path, Windows path, deep merge precedence, env-var
overrides, deprecation warning, and graceful corrupt-override
handling.

The loader lives in :mod:`app.main`; we import the helpers
directly and monkeypatch CONFIG_PATH + override-path resolution
per test so each case is hermetic.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pytest
import yaml

from app import main as main_module


@pytest.fixture
def project_yaml(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Stand up a fresh project app.yaml + override path in tmp_path
    and monkeypatch the loader so it reads from there. Returns the
    project yaml path so tests can write content to it.

    Each test gets its own tmp_path so override-file presence and
    env-var state are isolated.
    """
    project = tmp_path / "app.yaml"
    project.write_text("", encoding="utf-8")
    monkeypatch.setattr(main_module, "CONFIG_PATH", project)
    override = tmp_path / "secrets.yaml"
    monkeypatch.setattr(main_module, "_get_user_override_path", lambda: override)
    # Always start with a clean env so env-var tests opt-in.
    monkeypatch.delenv("BIBLIOGON_AI_API_KEY", raising=False)
    return project


def _write(path: Path, data: dict) -> None:
    path.write_text(yaml.safe_dump(data), encoding="utf-8")


def test_project_only_baseline(project_yaml: Path) -> None:
    """Without override + env-vars, merged config equals project."""
    _write(project_yaml, {"ai": {"provider": "anthropic", "api_key": ""}})
    cfg = main_module._load_app_config()
    assert cfg["ai"]["provider"] == "anthropic"
    assert cfg["ai"]["api_key"] == ""


def test_override_only_ai_key(project_yaml: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Override file supplies ai.api_key; project has empty value."""
    _write(project_yaml, {"ai": {"provider": "anthropic", "api_key": ""}})
    override = main_module._get_user_override_path()
    _write(override, {"ai": {"api_key": "sk-from-override"}})
    cfg = main_module._load_app_config()
    assert cfg["ai"]["api_key"] == "sk-from-override"
    # Project keys preserved.
    assert cfg["ai"]["provider"] == "anthropic"


def test_nested_merge_precedence(project_yaml: Path) -> None:
    """Override touches one nested key; siblings + parents preserved."""
    _write(
        project_yaml,
        {
            "ai": {
                "provider": "anthropic",
                "api_key": "",
                "model": "claude-sonnet-4-20250514",
            },
            "app": {"name": "Bibliogon"},
        },
    )
    override = main_module._get_user_override_path()
    _write(override, {"ai": {"api_key": "sk-override"}})
    cfg = main_module._load_app_config()
    assert cfg["ai"]["api_key"] == "sk-override"
    assert cfg["ai"]["provider"] == "anthropic"
    assert cfg["ai"]["model"] == "claude-sonnet-4-20250514"
    assert cfg["app"]["name"] == "Bibliogon"


def test_env_var_beats_project_and_override(
    project_yaml: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """BIBLIOGON_AI_API_KEY wins against both project and override."""
    _write(project_yaml, {"ai": {"api_key": "from-project"}})
    override = main_module._get_user_override_path()
    _write(override, {"ai": {"api_key": "from-override"}})
    monkeypatch.setenv("BIBLIOGON_AI_API_KEY", "from-env")
    cfg = main_module._load_app_config()
    assert cfg["ai"]["api_key"] == "from-env"


def test_deprecation_warning_when_secret_in_project_only(
    project_yaml: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Project carries non-empty api_key + no override + no env-var
    → WARNING logged with file path + migration hint."""
    _write(project_yaml, {"ai": {"api_key": "sk-leaked-into-project"}})
    # Override file does NOT exist; env-var unset (fixture clears it).
    with caplog.at_level(logging.WARNING, logger="app.main"):
        triggered = main_module._has_project_secret_without_override()
    assert triggered is True


def test_no_deprecation_warning_when_override_exists(
    project_yaml: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Override file present silences the deprecation hint even when
    project still has the legacy key."""
    _write(project_yaml, {"ai": {"api_key": "sk-leaked"}})
    override = main_module._get_user_override_path()
    _write(override, {"ai": {"api_key": "sk-override"}})
    triggered = main_module._has_project_secret_without_override()
    assert triggered is False


def test_xdg_config_home_respected(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """XDG_CONFIG_HOME env-var redirects the override path on
    Linux/macOS."""
    monkeypatch.setattr("sys.platform", "linux")
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "xdg"))
    path = main_module._get_user_override_path()
    assert path == tmp_path / "xdg" / "bibliogon" / "secrets.yaml"


def test_windows_appdata_branch(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """On Windows, %APPDATA%/bibliogon/secrets.yaml is the override
    location."""
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setenv("APPDATA", str(tmp_path / "AppData" / "Roaming"))
    path = main_module._get_user_override_path()
    assert path == tmp_path / "AppData" / "Roaming" / "bibliogon" / "secrets.yaml"


def test_corrupt_override_file_does_not_crash(
    project_yaml: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Malformed override yaml falls back to project config + logs
    WARNING. Backend MUST start (loader returns project dict, never
    raises).

    Three corruption shapes covered:
    - invalid YAML syntax
    - top-level non-dict (e.g. list)
    - empty file (None)

    Spies on ``logger.warning`` directly because other tests in the
    suite reconfigure the ``app.main`` logger and the standard
    ``caplog`` fixture cannot reliably intercept that logger
    cross-test (same pattern used in test_backup_articles.py for
    the forward-compat manifest warning).
    """
    _write(project_yaml, {"ai": {"provider": "anthropic", "api_key": "from-project"}})
    override = main_module._get_user_override_path()

    captured: list[str] = []
    original_warning = main_module.logger.warning

    def spy(msg: str, *args: object, **kwargs: object) -> None:
        captured.append(msg % args if args else msg)
        original_warning(msg, *args, **kwargs)

    monkeypatch.setattr(main_module.logger, "warning", spy)

    # Invalid YAML syntax.
    override.write_text("this is: : : not valid yaml :\n  - broken", encoding="utf-8")
    cfg = main_module._load_app_config()
    assert cfg["ai"]["provider"] == "anthropic"
    assert cfg["ai"]["api_key"] == "from-project"
    assert any("Invalid YAML" in m for m in captured), captured

    # Top-level non-dict.
    captured.clear()
    override.write_text("- one\n- two\n", encoding="utf-8")
    cfg = main_module._load_app_config()
    assert cfg["ai"]["api_key"] == "from-project"
    assert any("expected mapping" in m for m in captured), captured

    # Empty file -> silently treated as empty override (no warning).
    captured.clear()
    override.write_text("", encoding="utf-8")
    cfg = main_module._load_app_config()
    assert cfg["ai"]["api_key"] == "from-project"
    assert captured == []


def test_lists_are_replaced_not_merged(project_yaml: Path) -> None:
    """Override list replaces base list verbatim. Confirms we don't
    accidentally concatenate; relevant for ``app.supported_languages``,
    ``topics``, etc."""
    _write(project_yaml, {"app": {"supported_languages": ["de", "en", "es"]}})
    override = main_module._get_user_override_path()
    _write(override, {"app": {"supported_languages": ["fr"]}})
    cfg = main_module._load_app_config()
    assert cfg["app"]["supported_languages"] == ["fr"]


def test_deep_merge_helper_pure_function() -> None:
    """``_deep_merge`` is documented as non-mutating; verify."""
    base = {"a": 1, "nested": {"x": 1, "y": 2}}
    override = {"nested": {"y": 99, "z": 3}}
    out = main_module._deep_merge(base, override)
    assert out == {"a": 1, "nested": {"x": 1, "y": 99, "z": 3}}
    # Inputs unchanged.
    assert base == {"a": 1, "nested": {"x": 1, "y": 2}}
    assert override == {"nested": {"y": 99, "z": 3}}
