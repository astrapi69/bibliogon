"""Tests for the pending cleanup retry logic."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from bibliogon_launcher import manifest


def _write_pending(tmp_path: Path, steps: dict[str, bool] | None = None) -> dict:
    """Write a cleanup.json with the given step states."""
    data = {
        "pending_since": "2026-04-16T12:00:00Z",
        "install_dir": str(tmp_path / "bibliogon"),
        "steps": steps or {s: False for s in manifest.CLEANUP_STEPS},
    }
    cleanup = tmp_path / "cleanup.json"
    cleanup.write_text(json.dumps(data), encoding="utf-8")
    return data


class TestRetrySkipsCompletedSteps:
    """Verify that retry only re-runs steps still marked False."""

    def test_all_true_deletes_cleanup(self, tmp_path: Path) -> None:
        """If all steps are already True, cleanup.json is deleted."""
        steps = {s: True for s in manifest.CLEANUP_STEPS}
        _write_pending(tmp_path, steps)
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"):
            data = manifest.read_cleanup_pending()
            assert manifest.all_cleanup_done(data) is True
            manifest.delete_cleanup_pending()
        assert not (tmp_path / "cleanup.json").exists()

    def test_partial_leaves_file(self, tmp_path: Path) -> None:
        """If some steps are False, cleanup.json is retained."""
        steps = {s: True for s in manifest.CLEANUP_STEPS}
        steps["rmtree"] = False
        _write_pending(tmp_path, steps)
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"):
            data = manifest.read_cleanup_pending()
            assert not manifest.all_cleanup_done(data)

    def test_update_step_persists_across_reads(self, tmp_path: Path) -> None:
        _write_pending(tmp_path)
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"):
            manifest.update_cleanup_step("compose_down", True)
            manifest.update_cleanup_step("remove_volumes", True)
            data = manifest.read_cleanup_pending()
            assert data["steps"]["compose_down"] is True
            assert data["steps"]["remove_volumes"] is True
            assert data["steps"]["rmtree"] is False


class TestRetryResilience:
    """Retry must never crash the launcher."""

    def test_corrupt_cleanup_json_is_ignored(self, tmp_path: Path) -> None:
        (tmp_path / "cleanup.json").write_text("not json", encoding="utf-8")
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "cleanup.json"):
            assert manifest.read_cleanup_pending() is None

    def test_cleanup_path_not_writable(self, tmp_path: Path) -> None:
        """update_cleanup_step must not raise if the file can't be written."""
        with patch.object(manifest, "cleanup_path", return_value=tmp_path / "nonexistent" / "cleanup.json"):
            # read returns None, update is a no-op, no exception
            manifest.update_cleanup_step("compose_down", True)
