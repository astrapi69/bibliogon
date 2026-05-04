"""Tests for the Phase 2 XDG data-dir migration.

The migration helper (``app.data_dir_migration.migrate_data_dir_if_needed``)
ports v0.25.0-and-earlier project-tree data into the canonical
XDG location on first start. These tests cover the five
scenarios called out in the session plan:

1. No legacy data, fresh target -> creates target, plants marker.
2. Legacy DB + uploads exist, target empty -> moves both,
   leaves breadcrumbs at old paths, plants marker.
3. Legacy DB exists, target also has DB -> RuntimeError; no
   silent merge.
4. Migration marker already present -> short-circuit no-op.
5. Idempotent: running twice does nothing the second time.

The migration helper uses the in-process ``BIBLIOGON_DATA_DIR``
override and the package-relative ``_PROJECT_BACKEND_DIR``
constant (= the directory containing ``app/``) for legacy
locations. Tests monkeypatch the legacy constants to a
sandboxed ``tmp_path`` tree so we never touch the real
``backend/`` while the migration runs.

The helper also short-circuits when ``BIBLIOGON_TEST=1`` is set
(set by conftest before any test runs); we explicitly clear it
inside each test so the migration code path actually executes
under the sandboxed paths.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app import data_dir_migration
from app.data_dir_migration import (
    MIGRATION_MARKER_FILENAME,
    migrate_data_dir_if_needed,
)


@pytest.fixture
def sandbox(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    """Provide isolated legacy + target directories.

    Returns a dict with the canonical paths the test can populate.
    Sets BIBLIOGON_DATA_DIR to the sandbox target. Clears
    BIBLIOGON_TEST so the migration's own test-mode short-circuit
    does not skip the run we want to exercise.
    """
    legacy_root = tmp_path / "legacy_backend"
    legacy_root.mkdir()
    legacy_db = legacy_root / "bibliogon.db"
    legacy_uploads = legacy_root / "uploads"

    target = tmp_path / "target_data"

    monkeypatch.setattr(data_dir_migration, "_LEGACY_DB", legacy_db)
    monkeypatch.setattr(data_dir_migration, "_LEGACY_UPLOADS", legacy_uploads)
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(target))
    monkeypatch.delenv("BIBLIOGON_TEST", raising=False)

    return {
        "target": target,
        "legacy_db": legacy_db,
        "legacy_uploads": legacy_uploads,
    }


class TestMigrate:
    def test_no_legacy_data_creates_target_and_marks(
        self, sandbox
    ) -> None:
        """Fresh install: no legacy paths, no target dir.

        Expected: target dir gets created, .migration-complete marker
        is planted, no breadcrumbs anywhere.
        """
        migrate_data_dir_if_needed()

        assert sandbox["target"].is_dir()
        assert (sandbox["target"] / MIGRATION_MARKER_FILENAME).exists()
        # Nothing was moved
        assert not (sandbox["target"] / "bibliogon.db").exists()
        assert not (sandbox["target"] / "uploads").exists()

    def test_migrates_db_and_uploads(self, sandbox) -> None:
        """Both legacy DB and uploads exist; target is empty.

        Expected: both move to target, breadcrumbs sit beside the old
        locations, marker planted.
        """
        sandbox["legacy_db"].write_text("fake-db-content", encoding="utf-8")
        sandbox["legacy_uploads"].mkdir()
        (sandbox["legacy_uploads"] / "cover.png").write_bytes(b"fake-png")

        migrate_data_dir_if_needed()

        moved_db = sandbox["target"] / "bibliogon.db"
        moved_uploads = sandbox["target"] / "uploads"
        assert moved_db.read_text(encoding="utf-8") == "fake-db-content"
        assert (moved_uploads / "cover.png").read_bytes() == b"fake-png"

        # Breadcrumbs at old paths (named with .migrated-YYYY-MM-DD suffix)
        legacy_dir = sandbox["legacy_db"].parent
        breadcrumbs = list(legacy_dir.glob("bibliogon.db.migrated-*"))
        assert len(breadcrumbs) == 1
        assert "moved to" in breadcrumbs[0].read_text(encoding="utf-8")

        upload_breadcrumbs = list(legacy_dir.glob("uploads.migrated-*"))
        assert len(upload_breadcrumbs) == 1

        # Original legacy paths should be gone after the move
        assert not sandbox["legacy_db"].exists()
        assert not sandbox["legacy_uploads"].exists()

        # Marker present
        assert (sandbox["target"] / MIGRATION_MARKER_FILENAME).exists()

    def test_conflict_aborts_with_runtime_error(self, sandbox) -> None:
        """Both legacy DB and target DB exist.

        Expected: RuntimeError; neither side is touched. Silent merge
        would corrupt data.
        """
        sandbox["legacy_db"].write_text("legacy-db", encoding="utf-8")
        sandbox["target"].mkdir()
        (sandbox["target"] / "bibliogon.db").write_text(
            "target-db", encoding="utf-8"
        )

        with pytest.raises(RuntimeError, match="bibliogon.db.*both legacy"):
            migrate_data_dir_if_needed()

        # Both files still exist with their original content
        assert sandbox["legacy_db"].read_text(encoding="utf-8") == "legacy-db"
        assert (
            (sandbox["target"] / "bibliogon.db").read_text(encoding="utf-8")
            == "target-db"
        )
        # Marker NOT planted on conflict
        assert not (sandbox["target"] / MIGRATION_MARKER_FILENAME).exists()

    def test_marker_present_short_circuits(self, sandbox) -> None:
        """Migration marker already present (from a prior run).

        Expected: no-op even when legacy data exists. Migration ran
        once already; do not redo work.
        """
        # Plant marker
        sandbox["target"].mkdir()
        (sandbox["target"] / MIGRATION_MARKER_FILENAME).touch()
        # Plant legacy data that WOULD migrate without the marker
        sandbox["legacy_db"].write_text(
            "this-should-stay-in-place", encoding="utf-8"
        )

        migrate_data_dir_if_needed()

        # Legacy untouched
        assert sandbox["legacy_db"].read_text(encoding="utf-8") == (
            "this-should-stay-in-place"
        )
        # Target DB never created (no migration)
        assert not (sandbox["target"] / "bibliogon.db").exists()

    def test_idempotent_on_rerun(self, sandbox) -> None:
        """Running migration twice in a row.

        First run moves data + plants marker. Second run sees marker
        and short-circuits. No errors, no double-move.
        """
        sandbox["legacy_db"].write_text("once-and-only-once", encoding="utf-8")

        migrate_data_dir_if_needed()
        first_breadcrumbs = list(
            sandbox["legacy_db"].parent.glob("bibliogon.db.migrated-*")
        )

        # Second call: idempotent
        migrate_data_dir_if_needed()
        second_breadcrumbs = list(
            sandbox["legacy_db"].parent.glob("bibliogon.db.migrated-*")
        )

        # Same breadcrumbs (no new file); no error raised
        assert first_breadcrumbs == second_breadcrumbs
        assert (
            (sandbox["target"] / "bibliogon.db").read_text(encoding="utf-8")
            == "once-and-only-once"
        )
