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
        install_dir = tmp_path / "bibliogon"
        with patch.object(manifest, "manifest_path", return_value=target):
            manifest.write_manifest(install_dir, "0.16.0")
        assert target.is_file()
        data = json.loads(target.read_text(encoding="utf-8"))
        assert data["version"] == "0.16.0"
        assert data["install_dir"] == str(install_dir)
        assert "installed_at" in data
        assert "platform" in data

    def test_overwrites_existing_manifest(self, tmp_path: Path) -> None:
        target = tmp_path / "install.json"
        old_dir = tmp_path / "old"
        new_dir = tmp_path / "new"
        with patch.object(manifest, "manifest_path", return_value=target):
            manifest.write_manifest(old_dir, "0.15.0")
            manifest.write_manifest(new_dir, "0.16.0")
        data = json.loads(target.read_text(encoding="utf-8"))
        assert data["install_dir"] == str(new_dir)
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


class TestCleanupPersistence:

    def _patch_cleanup(self, tmp_path: Path):
        return patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json")

    def test_read_returns_none_when_absent(self, tmp_path: Path) -> None:
        with self._patch_cleanup(tmp_path):
            assert manifest.read_cleanup_pending() is None

    def test_write_and_read_roundtrip(self, tmp_path: Path) -> None:
        with self._patch_cleanup(tmp_path):
            manifest.write_cleanup_pending(tmp_path / "bibliogon")
            data = manifest.read_cleanup_pending()
            assert data is not None
            assert data["install_dir"] == str(tmp_path / "bibliogon")
            assert all(v is False for v in data["steps"].values())
            assert "pending_since" in data

    def test_update_step_marks_true(self, tmp_path: Path) -> None:
        with self._patch_cleanup(tmp_path):
            manifest.write_cleanup_pending(tmp_path / "bib")
            manifest.update_cleanup_step("compose_down", True)
            data = manifest.read_cleanup_pending()
            assert data["steps"]["compose_down"] is True
            assert data["steps"]["rmtree"] is False

    def test_update_step_noop_when_no_file(self, tmp_path: Path) -> None:
        with self._patch_cleanup(tmp_path):
            manifest.update_cleanup_step("compose_down", True)  # must not raise

    def test_delete_removes_file(self, tmp_path: Path) -> None:
        target = tmp_path / "cleanup.json"
        target.write_text("{}", encoding="utf-8")
        with patch.object(manifest, "cleanup_path", return_value=target):
            manifest.delete_cleanup_pending()
        assert not target.exists()

    def test_all_cleanup_done_true_when_all_true(self) -> None:
        data = {"steps": {s: True for s in manifest.CLEANUP_STEPS}}
        assert manifest.all_cleanup_done(data) is True

    def test_all_cleanup_done_false_when_any_false(self) -> None:
        steps = {s: True for s in manifest.CLEANUP_STEPS}
        steps["rmtree"] = False
        assert manifest.all_cleanup_done({"steps": steps}) is False

    def test_all_cleanup_done_true_when_none(self) -> None:
        assert manifest.all_cleanup_done(None) is True


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
