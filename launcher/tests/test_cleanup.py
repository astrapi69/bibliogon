"""Tests for the reusable uninstall/cleanup module.

Covers the UI-agnostic ``cleanup`` module: the config/data directory and
desktop-shortcut helpers, the full ``uninstall_bibliogon`` orchestration
(every step called, results reported, crash-safety), and the
config-dir-last gating.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import cleanup, manifest


# --- config_data_dirs / desktop_shortcut_paths ---


class TestConfigDataDirs:
    def test_posix_includes_home_data_dirs(self) -> None:
        env = {"HOME": "/home/tester"}
        with patch.object(cleanup.sys, "platform", "linux"):
            dirs = cleanup.config_data_dirs(env)
        as_str = [str(d) for d in dirs]
        assert "/home/tester/.bibliogon" in as_str
        assert "/home/tester/.config/bibliogon" in as_str

    def test_windows_includes_appdata_and_profile_dirs(self) -> None:
        env = {
            "USERPROFILE": "C:\\Users\\tester",
            "APPDATA": "C:\\Users\\tester\\AppData\\Roaming",
        }
        with patch.object(cleanup.sys, "platform", "win32"):
            dirs = cleanup.config_data_dirs(env)
        as_str = [str(d) for d in dirs]
        assert any(p.endswith(".bibliogon") for p in as_str)
        assert any(p.endswith("bibliogon") for p in as_str)

    def test_dirs_are_deduplicated(self) -> None:
        env = {"HOME": "/home/tester"}
        with patch.object(cleanup.sys, "platform", "linux"):
            dirs = cleanup.config_data_dirs(env)
        resolved = [str(d.resolve()) for d in dirs]
        assert len(resolved) == len(set(resolved))


class TestDesktopShortcuts:
    def test_posix_shortcut_paths(self) -> None:
        env = {"HOME": "/home/tester"}
        with patch.object(cleanup.sys, "platform", "linux"):
            paths = cleanup.desktop_shortcut_paths(env)
        as_str = [str(p) for p in paths]
        assert "/home/tester/Desktop/bibliogon.desktop" in as_str
        assert "/home/tester/.local/share/applications/bibliogon.desktop" in as_str

    def test_remove_shortcuts_deletes_existing_only(self, tmp_path: Path) -> None:
        desktop = tmp_path / "Desktop"
        desktop.mkdir()
        shortcut = desktop / "bibliogon.desktop"
        shortcut.write_text("[Desktop Entry]", encoding="utf-8")
        env = {"HOME": str(tmp_path)}
        with patch.object(cleanup.sys, "platform", "linux"):
            ok, detail = cleanup.remove_desktop_shortcuts(env)
        assert ok is True
        assert not shortcut.exists()
        assert "1 shortcut" in detail

    def test_remove_shortcuts_is_noop_when_absent(self, tmp_path: Path) -> None:
        env = {"HOME": str(tmp_path)}
        with patch.object(cleanup.sys, "platform", "linux"):
            ok, detail = cleanup.remove_desktop_shortcuts(env)
        assert ok is True
        assert "0 shortcut" in detail


class TestRemoveConfigDirs:
    def test_removes_existing_dirs(self, tmp_path: Path) -> None:
        target = tmp_path / ".bibliogon"
        target.mkdir()
        (target / "data.txt").write_text("x", encoding="utf-8")
        env = {"HOME": str(tmp_path)}
        with patch.object(cleanup.sys, "platform", "linux"), patch.object(
            cleanup.manifest, "manifest_path", return_value=tmp_path / "cfg" / "install.json"
        ), patch.object(cleanup.config, "appdata_dir", return_value=tmp_path / "launcher_cfg"):
            ok, detail = cleanup.remove_config_dirs(env)
        assert ok is True
        assert not target.exists()


# --- uninstall_bibliogon orchestration ---


def _patch_manifest_paths(tmp_path: Path):
    """Route manifest + cleanup state files into tmp_path."""
    return (
        patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"),
        patch.object(manifest, "manifest_path", return_value=tmp_path / "install.json"),
    )


class TestUninstallBibliogon:
    def test_all_steps_run_and_succeed(self, tmp_path: Path) -> None:
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        cleanup_p, manifest_p = _patch_manifest_paths(tmp_path)
        seen: list[str] = []
        with cleanup_p, manifest_p, patch.object(
            cleanup.docker, "compose_down", return_value=(True, "stopped")
        ), patch.object(cleanup.docker, "remove_volumes", return_value=(True, "ok")), patch.object(
            cleanup.docker, "remove_images", return_value=(True, "ok")
        ), patch.object(
            cleanup.installer, "remove_install", return_value=(True, "ok")
        ), patch.object(
            cleanup, "remove_desktop_shortcuts", return_value=(True, "ok")
        ), patch.object(cleanup, "remove_config_dirs", return_value=(True, "ok")):
            results = cleanup.uninstall_bibliogon(
                install_dir, status_callback=seen.append
            )
        assert all(results.values())
        assert set(results.keys()) == set(manifest.CLEANUP_STEPS)
        # Every step was announced via the status callback, in order.
        assert seen == list(manifest.CLEANUP_STEPS)
        # All-done removes the cleanup-state file.
        assert not (tmp_path / "cleanup.json").exists()

    def test_removes_container_image_and_volumes(self, tmp_path: Path) -> None:
        """Problem-5 acceptance: uninstall stops the stack and removes
        images + volumes."""
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        cleanup_p, manifest_p = _patch_manifest_paths(tmp_path)
        with cleanup_p, manifest_p, patch.object(
            cleanup.docker, "compose_down", return_value=(True, "stopped")
        ) as down, patch.object(
            cleanup.docker, "remove_volumes", return_value=(True, "removed 1")
        ) as vols, patch.object(
            cleanup.docker, "remove_images", return_value=(True, "removed 1")
        ) as imgs, patch.object(
            cleanup.installer, "remove_install", return_value=(True, "ok")
        ), patch.object(
            cleanup, "remove_desktop_shortcuts", return_value=(True, "ok")
        ), patch.object(cleanup, "remove_config_dirs", return_value=(True, "ok")):
            results = cleanup.uninstall_bibliogon(install_dir)
        down.assert_called_once()
        vols.assert_called_once()
        imgs.assert_called_once()
        assert results["compose_down"] is True
        assert results["remove_volumes"] is True
        assert results["remove_images"] is True

    def test_config_dirs_skipped_when_prior_step_fails(self, tmp_path: Path) -> None:
        """config-dir removal must not run (and not nuke the retry
        breadcrumb) when an earlier step failed."""
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        cleanup_p, manifest_p = _patch_manifest_paths(tmp_path)
        with cleanup_p, manifest_p, patch.object(
            cleanup.docker, "compose_down", return_value=(True, "stopped")
        ), patch.object(cleanup.docker, "remove_volumes", return_value=(True, "ok")), patch.object(
            cleanup.docker, "remove_images", return_value=(True, "ok")
        ), patch.object(
            cleanup.installer, "remove_install", return_value=(False, "locked")
        ), patch.object(
            cleanup, "remove_desktop_shortcuts", return_value=(True, "ok")
        ), patch.object(cleanup, "remove_config_dirs", return_value=(True, "ok")) as cfg:
            results = cleanup.uninstall_bibliogon(install_dir)
        cfg.assert_not_called()
        assert results["rmtree"] is False
        assert results["remove_config_dirs"] is False
        # Not all done -> cleanup-state retained for retry.
        assert (tmp_path / "cleanup.json").exists()

    def test_step_exception_is_caught_not_propagated(self, tmp_path: Path) -> None:
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        cleanup_p, manifest_p = _patch_manifest_paths(tmp_path)
        with cleanup_p, manifest_p, patch.object(
            cleanup.docker, "compose_down", side_effect=RuntimeError("boom")
        ), patch.object(cleanup.docker, "remove_volumes", return_value=(True, "ok")), patch.object(
            cleanup.docker, "remove_images", return_value=(True, "ok")
        ), patch.object(
            cleanup.installer, "remove_install", return_value=(True, "ok")
        ), patch.object(
            cleanup, "remove_desktop_shortcuts", return_value=(True, "ok")
        ), patch.object(cleanup, "remove_config_dirs", return_value=(True, "ok")):
            results = cleanup.uninstall_bibliogon(install_dir)
        assert results["compose_down"] is False


class TestRetryPendingCleanup:
    def test_returns_none_when_nothing_pending(self, tmp_path: Path) -> None:
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"):
            assert cleanup.retry_pending_cleanup() is None

    def test_resumes_only_incomplete_steps(self, tmp_path: Path) -> None:
        install_dir = tmp_path / "bibliogon"
        install_dir.mkdir()
        steps = {s: True for s in manifest.CLEANUP_STEPS}
        steps["rmtree"] = False
        steps["delete_manifest"] = False
        steps["remove_config_dirs"] = False
        data = {
            "pending_since": "2026-04-16T12:00:00Z",
            "install_dir": str(install_dir),
            "steps": steps,
        }
        (tmp_path / "cleanup.json").write_text(json.dumps(data), encoding="utf-8")
        cleanup_p, manifest_p = _patch_manifest_paths(tmp_path)
        with cleanup_p, manifest_p, patch.object(
            cleanup.docker, "compose_down"
        ) as down, patch.object(
            cleanup.installer, "remove_install", return_value=(True, "ok")
        ) as rmtree, patch.object(
            cleanup, "remove_desktop_shortcuts", return_value=(True, "ok")
        ) as shortcuts, patch.object(
            cleanup, "remove_config_dirs", return_value=(True, "ok")
        ) as cfg:
            results = cleanup.retry_pending_cleanup()
        # Already-true steps are not re-run.
        down.assert_not_called()
        shortcuts.assert_not_called()
        # Incomplete steps run; config-dir runs because everything else is done.
        rmtree.assert_called_once()
        cfg.assert_called_once()
        assert all(results.values())
        assert not (tmp_path / "cleanup.json").exists()
