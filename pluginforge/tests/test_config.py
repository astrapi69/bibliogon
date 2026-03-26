"""Tests for ConfigLoader."""

from pathlib import Path

from pluginforge.config import ConfigLoader


class TestConfigLoader:

    def test_load_existing_file(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("app:\n  name: TestApp\n  version: '1.0'\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load("app.yaml")

        assert config["app"]["name"] == "TestApp"
        assert config["app"]["version"] == "1.0"

    def test_load_nonexistent_returns_empty(self, tmp_path: Path) -> None:
        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load("missing.yaml")
        assert config == {}

    def test_load_caches_result(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: value1\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config1 = loader.load("app.yaml")
        assert config1["key"] == "value1"

        config_file.write_text("key: value2\n")
        config2 = loader.load("app.yaml")
        assert config2["key"] == "value1"  # still cached

    def test_invalidate_clears_cache(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: value1\n")

        loader = ConfigLoader(base_dir=tmp_path)
        loader.load("app.yaml")

        config_file.write_text("key: value2\n")
        loader.invalidate("app.yaml")
        config = loader.load("app.yaml")
        assert config["key"] == "value2"

    def test_invalidate_all(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: original\n")

        loader = ConfigLoader(base_dir=tmp_path)
        loader.load("app.yaml")

        config_file.write_text("key: updated\n")
        loader.invalidate()
        config = loader.load("app.yaml")
        assert config["key"] == "updated"

    def test_load_plugin_config(self, tmp_path: Path) -> None:
        plugins_dir = tmp_path / "config" / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "export.yaml").write_text("plugin:\n  name: export\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load_plugin_config("export")

        assert config["plugin"]["name"] == "export"

    def test_load_app_config(self, tmp_path: Path) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        (config_dir / "app.yaml").write_text("app:\n  name: MyApp\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load_app_config()

        assert config["app"]["name"] == "MyApp"

    def test_absolute_path(self, tmp_path: Path) -> None:
        config_file = tmp_path / "absolute.yaml"
        config_file.write_text("key: value\n")

        loader = ConfigLoader(base_dir="/some/other/dir")
        config = loader.load(str(config_file))

        assert config["key"] == "value"

    def test_empty_yaml_returns_empty_dict(self, tmp_path: Path) -> None:
        config_file = tmp_path / "empty.yaml"
        config_file.write_text("")

        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load("empty.yaml")
        assert config == {}
