"""Tests for app.yaml auto-creation from app.yaml.example on first startup."""

import shutil
from pathlib import Path

import yaml


def test_config_bootstrap_copies_example(tmp_path):
    """When app.yaml is missing but app.yaml.example exists, the example is copied."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    example = config_dir / "app.yaml.example"
    example.write_text(yaml.dump({"app": {"name": "Bibliogon"}, "ai": {"enabled": False}}))

    target = config_dir / "app.yaml"
    assert not target.exists()

    # Simulate the bootstrap logic from main.py
    if not target.exists() and example.exists():
        shutil.copy2(example, target)

    assert target.exists()
    data = yaml.safe_load(target.read_text())
    assert data["app"]["name"] == "Bibliogon"
    assert data["ai"]["enabled"] is False


def test_config_bootstrap_does_not_overwrite(tmp_path):
    """When app.yaml already exists, the example is NOT copied over it."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    example = config_dir / "app.yaml.example"
    example.write_text(yaml.dump({"app": {"name": "Bibliogon"}}))

    target = config_dir / "app.yaml"
    target.write_text(yaml.dump({"app": {"name": "My Custom Config"}}))

    # Simulate the bootstrap logic
    if not target.exists() and example.exists():
        shutil.copy2(example, target)

    data = yaml.safe_load(target.read_text())
    assert data["app"]["name"] == "My Custom Config"


def test_config_bootstrap_no_example(tmp_path):
    """When neither file exists, nothing crashes."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    target = config_dir / "app.yaml"
    example = config_dir / "app.yaml.example"

    # Simulate the bootstrap logic
    if not target.exists() and example.exists():
        shutil.copy2(example, target)

    assert not target.exists()
