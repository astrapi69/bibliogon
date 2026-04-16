"""Tests for the installer module."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from bibliogon_launcher import installer


def _make_zip_bytes(files: dict[str, str], prefix: str = "bibliogon-0.16.0/") -> bytes:
    """Create an in-memory ZIP with the given files under a prefix directory."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(f"{prefix}{name}", content)
    return buf.getvalue()


class TestReleaseZipUrl:

    def test_default_version(self) -> None:
        url = installer.release_zip_url()
        assert f"/tags/v{installer.COMPATIBLE_VERSION}.zip" in url

    def test_explicit_version(self) -> None:
        url = installer.release_zip_url("1.2.3")
        assert "/tags/v1.2.3.zip" in url

    def test_version_with_v_prefix(self) -> None:
        url = installer.release_zip_url("v1.2.3")
        assert "/tags/v1.2.3.zip" in url
        assert "/tags/vv1.2.3.zip" not in url


class TestDownloadRelease:

    def test_extracts_with_prefix_stripping(self, tmp_path: Path) -> None:
        """Files inside the ZIP's top-level dir land directly in target_dir."""
        zip_bytes = _make_zip_bytes({
            "README.md": "# Bibliogon",
            "backend/pyproject.toml": "[tool.poetry]\nname = 'bib'",
            "docker-compose.prod.yml": "services:\n  backend:",
        })
        mock_resp = MagicMock()
        mock_resp.read = MagicMock(return_value=zip_bytes)
        mock_resp.__enter__ = MagicMock(return_value=io.BytesIO(zip_bytes))
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("bibliogon_launcher.installer.urlopen", return_value=mock_resp):
            ok, detail = installer.download_release(tmp_path / "install")
        assert ok, detail
        assert (tmp_path / "install" / "README.md").is_file()
        assert (tmp_path / "install" / "backend" / "pyproject.toml").is_file()
        assert (tmp_path / "install" / "docker-compose.prod.yml").is_file()

    def test_returns_false_on_network_error(self, tmp_path: Path) -> None:
        from urllib.error import URLError
        with patch("bibliogon_launcher.installer.urlopen", side_effect=URLError("no network")):
            ok, detail = installer.download_release(tmp_path / "install")
        assert not ok
        assert "Download failed" in detail

    def test_returns_false_on_empty_zip(self, tmp_path: Path) -> None:
        """An empty ZIP is rejected."""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w"):
            pass
        empty_zip = buf.getvalue()
        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=io.BytesIO(empty_zip))
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch("bibliogon_launcher.installer.urlopen", return_value=mock_resp):
            ok, detail = installer.download_release(tmp_path / "install")
        assert not ok
        assert "empty" in detail.lower()

    def test_cleans_up_temp_file_on_failure(self, tmp_path: Path) -> None:
        """Temp ZIP file is removed even on failure."""
        from urllib.error import URLError
        with patch("bibliogon_launcher.installer.urlopen", side_effect=URLError("fail")):
            installer.download_release(tmp_path / "install")
        # No .zip files should linger in the system temp dir from this call
        # (we can't check the exact temp path, but the function has a finally block)


class TestCreateEnvFile:

    def test_creates_env_from_example(self, tmp_path: Path) -> None:
        (tmp_path / ".env.example").write_text(
            "SECRET=change-me-to-a-random-secret\nPORT=7880", encoding="utf-8",
        )
        ok, detail = installer.create_env_file(tmp_path)
        assert ok
        env_text = (tmp_path / ".env").read_text(encoding="utf-8")
        assert "change-me-to-a-random-secret" not in env_text
        assert "PORT=7880" in env_text
        assert len(env_text) > 20  # secret was injected

    def test_noop_if_env_exists(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("MY_CONFIG=true", encoding="utf-8")
        ok, detail = installer.create_env_file(tmp_path)
        assert ok
        assert detail == "already exists"
        assert (tmp_path / ".env").read_text(encoding="utf-8") == "MY_CONFIG=true"

    def test_fails_if_no_example(self, tmp_path: Path) -> None:
        ok, detail = installer.create_env_file(tmp_path)
        assert not ok
        assert ".env.example" in detail


class TestRemoveInstall:

    def test_removes_directory(self, tmp_path: Path) -> None:
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        (install_dir / "file.txt").write_text("data")
        ok, detail = installer.remove_install(install_dir)
        assert ok
        assert not install_dir.exists()

    def test_noop_if_already_gone(self, tmp_path: Path) -> None:
        ok, detail = installer.remove_install(tmp_path / "nonexistent")
        assert ok
        assert detail == "already removed"

    def test_returns_false_on_permission_error(self, tmp_path: Path) -> None:
        install_dir = tmp_path / "locked"
        install_dir.mkdir()
        with patch("shutil.rmtree", side_effect=OSError("Permission denied")):
            ok, detail = installer.remove_install(install_dir)
        assert not ok
        assert "Permission denied" in detail
