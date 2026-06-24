"""Tests for the thin Bibliogon launcher wrapper (#588).

The launcher implementation lives in the ``docker-app-launcher`` PyPI
package; this wrapper only points it at ``launcher.json`` and preserves the
app version on ``--version``. So the tests are a smoke test (the entry point
runs and routes through the package) plus a config-loads test (the bundled
``launcher.json`` parses into the expected ``LauncherConfig``), plus the
no-foreign-reference regression guard.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from docker_app_launcher import actions
from docker_app_launcher.config import LauncherConfig

from bibliogon_launcher import __main__, __version__

LAUNCHER_ROOT = Path(__file__).resolve().parent.parent
LAUNCHER_JSON = LAUNCHER_ROOT / "launcher.json"


class TestSmoke:
    def test_main_module_imports_clean(self) -> None:
        # Importing the entry point must not raise (PyInstaller-safe).
        assert hasattr(__main__, "main")

    def test_version_reports_app_version(self, capsys: pytest.CaptureFixture[str]) -> None:
        rc = __main__.main(["--version"])
        out = capsys.readouterr().out
        assert rc == 0
        assert "bibliogon_launcher" in out
        assert __version__ in out

    def test_check_routes_through_package(self, monkeypatch, capsys) -> None:
        monkeypatch.setattr(actions, "check_docker", lambda: (True, "Docker is running."))
        rc = __main__.main(["--check"])
        assert rc == 0
        assert "running" in capsys.readouterr().out.lower()

    def test_no_legacy_launcher_symbols(self) -> None:
        # The bespoke launcher internals were removed; the wrapper is thin.
        for gone in ("_setup_logging", "_run_launcher", "_maybe_run_cli_action", "settings"):
            assert not hasattr(__main__, gone), f"{gone} should be gone (#588)"


class TestConfigLoads:
    def test_launcher_json_exists(self) -> None:
        assert LAUNCHER_JSON.is_file()

    def test_launcher_json_parses_to_expected_config(self) -> None:
        cfg = LauncherConfig.from_json(LAUNCHER_JSON)
        assert cfg.app_name == "Bibliogon"
        assert cfg.container_name == "bibliogon"
        assert cfg.compose_project == "bibliogon"
        assert cfg.default_port == 7880
        assert cfg.env_port_key == "BIBLIOGON_PORT"
        assert cfg.compose_file == "docker-compose.prod.yml"
        assert cfg.health_check_path == "/api/health"
        assert cfg.health_check_key == "status"
        assert cfg.health_check_value == "ok"
        assert cfg.app_version == __version__


class TestNoForeignProjectReference:
    """Regression guard: no copied ``adaptive-learner`` identifier leaks into
    the launcher source, the config, or the compose files."""

    def test_no_adaptive_learner_reference(self) -> None:
        repo_root = LAUNCHER_ROOT.parent
        targets = [
            repo_root / "docker-compose.yml",
            repo_root / "docker-compose.prod.yml",
            LAUNCHER_JSON,
        ]
        targets += list((LAUNCHER_ROOT / "bibliogon_launcher").glob("*.py"))
        for path in targets:
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8").lower()
            assert "adaptive-learner" not in text and "adaptive_learner" not in text, (
                f"{path} contains an adaptive-learner reference"
            )
