"""Round-trip YAML helper contract tests.

Pins the behavior that user-editable plugin YAMLs survive a save from
the UI without losing comments, blank lines, or quote styles. The
architecture rules require # INTERNAL comments to stay in the file.
"""
from pathlib import Path

from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip


def test_pristine_plugin_yaml_round_trips_byte_identically(tmp_path: Path) -> None:
    src = (
        'plugin:\n'
        '  name: "translation"\n'
        '  display_name:\n'
        '    de: "Übersetzung"\n'
        '    en: "Translation"\n'
        '  version: "1.0.0"\n'
        '  api_version: "1"\n'
        '\n'
        'settings:\n'
        '  provider: deepl\n'
        '  deepl_api_key: ""\n'
        '  deepl_free_api: true\n'
    )
    path = tmp_path / "plugin.yaml"
    path.write_text(src, encoding="utf-8")

    data = read_yaml_roundtrip(path)
    write_yaml_roundtrip(path, data)

    assert path.read_text(encoding="utf-8") == src


def test_internal_comment_survives_mutation(tmp_path: Path) -> None:
    src = (
        'settings:\n'
        '  provider: deepl\n'
        '  # INTERNAL: power-user knob, edit via YAML only\n'
        '  max_retries: 3\n'
        '  api_key: ""\n'
    )
    path = tmp_path / "plugin.yaml"
    path.write_text(src, encoding="utf-8")

    data = read_yaml_roundtrip(path)
    data["settings"]["api_key"] = "secret"
    write_yaml_roundtrip(path, data)

    written = path.read_text(encoding="utf-8")
    assert "# INTERNAL: power-user knob, edit via YAML only" in written
    assert 'api_key: "secret"' in written
    assert "max_retries: 3" in written


def test_double_quoted_strings_stay_double_quoted(tmp_path: Path) -> None:
    src = (
        'settings:\n'
        '  url: "http://localhost:1234/v1"\n'
        '  model: "default"\n'
    )
    path = tmp_path / "plugin.yaml"
    path.write_text(src, encoding="utf-8")

    data = read_yaml_roundtrip(path)
    write_yaml_roundtrip(path, data)

    written = path.read_text(encoding="utf-8")
    assert 'url: "http://localhost:1234/v1"' in written
    assert 'model: "default"' in written


def test_missing_file_read_raises(tmp_path: Path) -> None:
    import pytest
    with pytest.raises(FileNotFoundError):
        read_yaml_roundtrip(tmp_path / "does-not-exist.yaml")


def test_write_creates_parent_directories(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "deeper" / "plugin.yaml"
    write_yaml_roundtrip(path, {"hello": "world"})
    assert path.exists()
    assert "hello: world" in path.read_text(encoding="utf-8")
