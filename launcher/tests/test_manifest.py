"""Tests for the install manifest module."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import manifest


def _patch_path(tmp_path: Path):
    """Patch manifest_path() to use a temp directory."""
    return patch.object(manifest, "manifest_path", return_value=tmp_path / "install.json")


class TestReadManifest:

    def test_returns_none_when_file_missing(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            assert manifest.read_manifest() is None

    def test_returns_none_on_malformed_json(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.manifest_path().parent.mkdir(parents=True, exist_ok=True)
            manifest.manifest_path().write_text("not json", encoding="utf-8")
            assert manifest.read_manifest() is None

    def test_returns_none_on_non_utf8_bytes(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.manifest_path().parent.mkdir(parents=True, exist_ok=True)
            manifest.manifest_path().write_bytes(b"\xff\xfe")
            assert manifest.read_manifest() is None

    def test_returns_dict_on_valid_json(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.manifest_path().parent.mkdir(parents=True, exist_ok=True)
            manifest.manifest_path().write_text(
                json.dumps({"version": "0.16.0", "install_dir": "/tmp/bib"}),
                encoding="utf-8",
            )
            result = manifest.read_manifest()
            assert result is not None
            assert result["version"] == "0.16.0"


class TestWriteManifest:

    def test_creates_parent_dirs_and_writes(self, tmp_path: Path) -> None:
        target = tmp_path / "nested" / "install.json"
        with patch.object(manifest, "manifest_path", return_value=target):
            manifest.write_manifest(Path("/home/user/bibliogon"), "0.16.0")
        assert target.is_file()
        data = json.loads(target.read_text(encoding="utf-8"))
        assert data["version"] == "0.16.0"
        assert data["install_dir"] == "/home/user/bibliogon"
        assert "installed_at" in data
        assert "platform" in data

    def test_overwrites_existing_manifest(self, tmp_path: Path) -> None:
        target = tmp_path / "install.json"
        with patch.object(manifest, "manifest_path", return_value=target):
            manifest.write_manifest(Path("/old"), "0.15.0")
            manifest.write_manifest(Path("/new"), "0.16.0")
        data = json.loads(target.read_text(encoding="utf-8"))
        assert data["install_dir"] == "/new"
        assert data["version"] == "0.16.0"


class TestDeleteManifest:

    def test_removes_file(self, tmp_path: Path) -> None:
        target = tmp_path / "install.json"
        target.write_text("{}", encoding="utf-8")
        with patch.object(manifest, "manifest_path", return_value=target):
            manifest.delete_manifest()
        assert not target.exists()

    def test_noop_when_missing(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.delete_manifest()  # must not raise


class TestInstallDirFromManifest:

    def test_returns_none_when_no_manifest(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            assert manifest.install_dir_from_manifest() is None

    def test_returns_none_when_field_missing(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.manifest_path().parent.mkdir(parents=True, exist_ok=True)
            manifest.manifest_path().write_text(
                json.dumps({"version": "0.16.0"}), encoding="utf-8",
            )
            assert manifest.install_dir_from_manifest() is None

    def test_returns_path_when_present(self, tmp_path: Path) -> None:
        with _patch_path(tmp_path):
            manifest.manifest_path().parent.mkdir(parents=True, exist_ok=True)
            manifest.manifest_path().write_text(
                json.dumps({"version": "0.16.0", "install_dir": "/tmp/bib"}),
                encoding="utf-8",
            )
            result = manifest.install_dir_from_manifest()
            assert result == Path("/tmp/bib")
