"""Tests for launcher.config: pure-function path + port helpers."""

from __future__ import annotations

from pathlib import Path

from bibliogon_launcher import config


class TestAppdataDir:

    def test_uses_appdata_on_windows_env(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        assert config.appdata_dir(env) == tmp_path / "Bibliogon"

    def test_falls_back_to_home_config_when_appdata_missing(self, tmp_path: Path) -> None:
        env = {"HOME": str(tmp_path)}
        assert config.appdata_dir(env) == tmp_path / ".config" / "Bibliogon"

    def test_lockfile_and_logfile_are_under_appdata(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        base = tmp_path / "Bibliogon"
        assert config.lockfile_path(env) == base / "launcher.lock"
        assert config.logfile_path(env) == base / "launcher.log"
        assert config.launcher_config_path(env) == base / "launcher.json"


class TestDefaultRepoPath:

    def test_uses_userprofile_on_windows(self, tmp_path: Path) -> None:
        env = {"USERPROFILE": str(tmp_path)}
        assert config.default_repo_path(env) == tmp_path / "bibliogon"

    def test_falls_back_to_home_when_userprofile_missing(self, tmp_path: Path) -> None:
        env = {"HOME": str(tmp_path)}
        assert config.default_repo_path(env) == tmp_path / "bibliogon"


class TestLoadSaveLauncherConfig:

    def test_load_returns_empty_dict_when_file_missing(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        assert config.load_launcher_config(env) == {}

    def test_roundtrip(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        config.save_launcher_config({"repo_path": "C:\\bibliogon"}, env)
        assert config.load_launcher_config(env) == {"repo_path": "C:\\bibliogon"}

    def test_load_returns_empty_dict_on_parse_error(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        path = config.launcher_config_path(env)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not valid json {", encoding="utf-8")
        assert config.load_launcher_config(env) == {}


class TestResolveRepoPath:

    def test_uses_configured_path_when_present(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path), "USERPROFILE": "/somewhere/else"}
        configured = tmp_path / "custom" / "bibliogon"
        config.save_launcher_config({"repo_path": str(configured)}, env)
        assert config.resolve_repo_path(env) == configured

    def test_falls_back_to_default_when_not_configured(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path), "USERPROFILE": str(tmp_path)}
        assert config.resolve_repo_path(env) == tmp_path / "bibliogon"


class TestIsValidRepo:

    def test_true_when_compose_file_present(self, tmp_path: Path) -> None:
        (tmp_path / config.COMPOSE_FILENAME).write_text("services: {}", encoding="utf-8")
        assert config.is_valid_repo(tmp_path) is True

    def test_false_when_compose_file_missing(self, tmp_path: Path) -> None:
        assert config.is_valid_repo(tmp_path) is False


class TestGetShowDetailsDefault:

    def test_false_when_config_missing(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        assert config.get_show_details_default(env) is False

    def test_false_when_field_absent(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        config.save_launcher_config({"repo_path": "C:\\x"}, env)
        assert config.get_show_details_default(env) is False

    def test_true_when_field_true(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        config.save_launcher_config({"show_details_by_default": True}, env)
        assert config.get_show_details_default(env) is True

    def test_coerces_truthy_values(self, tmp_path: Path) -> None:
        env = {"APPDATA": str(tmp_path)}
        # JSON parsing yields ints if the user hand-edits the file.
        config.save_launcher_config({"show_details_by_default": 1}, env)
        assert config.get_show_details_default(env) is True


class TestReadPort:

    def test_returns_default_when_no_env_file(self, tmp_path: Path) -> None:
        assert config.read_port(tmp_path) == config.DEFAULT_PORT

    def test_reads_configured_port(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("BIBLIOGON_PORT=9090\nOTHER=x\n", encoding="utf-8")
        assert config.read_port(tmp_path) == 9090

    def test_tolerates_whitespace_around_port(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("  BIBLIOGON_PORT = 8080  \n", encoding="utf-8")
        assert config.read_port(tmp_path) == 8080

    def test_falls_back_on_non_numeric(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("BIBLIOGON_PORT=abc\n", encoding="utf-8")
        assert config.read_port(tmp_path) == config.DEFAULT_PORT

    def test_falls_back_on_out_of_range(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("BIBLIOGON_PORT=70000\n", encoding="utf-8")
        assert config.read_port(tmp_path) == config.DEFAULT_PORT

    def test_falls_back_on_missing_key(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("OTHER=1\n", encoding="utf-8")
        assert config.read_port(tmp_path) == config.DEFAULT_PORT
