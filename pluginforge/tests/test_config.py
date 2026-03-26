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
        assert loader.load("missing.yaml") == {}

    def test_load_caches_result(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: value1\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config1 = loader.load("app.yaml")
        assert config1["key"] == "value1"

        config_file.write_text("key: value2\n")
        config2 = loader.load("app.yaml")
        assert config2["key"] == "value1"  # still cached

    def test_invalidate_clears_specific_cache(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: value1\n")

        loader = ConfigLoader(base_dir=tmp_path)
        loader.load("app.yaml")

        config_file.write_text("key: value2\n")
        loader.invalidate("app.yaml")
        assert loader.load("app.yaml")["key"] == "value2"

    def test_invalidate_all(self, tmp_path: Path) -> None:
        config_file = tmp_path / "app.yaml"
        config_file.write_text("key: original\n")

        loader = ConfigLoader(base_dir=tmp_path)
        loader.load("app.yaml")

        config_file.write_text("key: updated\n")
        loader.invalidate()
        assert loader.load("app.yaml")["key"] == "updated"

    def test_load_plugin_config(self, tmp_path: Path) -> None:
        plugins_dir = tmp_path / "config" / "plugins"
        plugins_dir.mkdir(parents=True)
        (plugins_dir / "export.yaml").write_text("plugin:\n  name: export\n")

        loader = ConfigLoader(base_dir=tmp_path)
        config = loader.load_plugin_config("export")
        assert config["plugin"]["name"] == "export"

    def test_load_i18n(self, tmp_path: Path) -> None:
        i18n_dir = tmp_path / "config" / "i18n"
        i18n_dir.mkdir(parents=True)
        (i18n_dir / "de.yaml").write_text(
            "ui:\n  dashboard:\n    title: Meine Buecher\n"
        )

        loader = ConfigLoader(base_dir=tmp_path)
        strings = loader.load_i18n("de")
        assert strings["ui"]["dashboard"]["title"] == "Meine Buecher"

    def test_load_i18n_missing_language(self, tmp_path: Path) -> None:
        loader = ConfigLoader(base_dir=tmp_path)
        assert loader.load_i18n("xx") == {}

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
        assert loader.load("empty.yaml") == {}
