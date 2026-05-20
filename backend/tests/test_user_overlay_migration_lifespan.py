"""Integration test for USER-OVERLAY-PLUGIN-ENABLE-MIGRATION-01 (P2).

Exercises the FastAPI lifespan startup path end-to-end:
1. Seed a stale user-overlay (missing the comics plugin) into the
   conftest's BIBLIOGON_DATA_DIR.
2. Reset the app.main module-level _startup_config snapshot so the
   lifespan re-reads the stale overlay.
3. Boot the app via TestClient (triggers the lifespan).
4. Assert comics is in plugins.enabled on disk AFTER lifespan + the
   /api/comics/info endpoint responds 200.

This pins the wiring the unit tests in test_config_overlay.py
can't catch: the lifespan ORDER (migration BEFORE
manager.discover_plugins) and the _startup_config REFRESH after
the migration writes.

Closes the operational gap surfaced by the plugin-comics
Session 1 smoke (2026-05-18). The default conftest BEHAVIOR
(empty tmpdir overlay) MASKED the gap because no overlay file
means the migration trivially no-ops AND the merge uses the
full project list. This test sets up an EXPLICIT stale overlay
to reproduce the production state.
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from app import main as app_main
from app.main import app
from app.paths import get_data_dir


# The OLD enabled list (the v0.35.0-or-earlier user-overlay state
# from before plugin-comics shipped). 11 plugins, comics missing.
STALE_ENABLED_LIST = [
    "export",
    "help",
    "getstarted",
    "ms-tools",
    "audiobook",
    "kdp",
    "translation",
    "kinderbuch",
    "grammar",
    "git-sync",
    "medium-import",
]


@pytest.fixture
def stale_user_overlay() -> Generator[Path, None, None]:
    """Seed a user-overlay app.yaml missing 'comics' from plugins.enabled.

    Writes to the conftest's BIBLIOGON_DATA_DIR (a session-scoped tmp
    dir). Refreshes the app.main module-level _startup_config snapshot
    so the next lifespan boot picks up the stale overlay.

    Returns the path to the seeded user-overlay file.
    """
    user_config_dir = get_data_dir() / "config"
    user_config_dir.mkdir(parents=True, exist_ok=True)
    overlay_path = user_config_dir / "app.yaml"

    stale_overlay = {
        "plugins": {
            "config_dir": "config/plugins",
            "disabled": [],
            "enabled": list(STALE_ENABLED_LIST),
            "entry_point_group": "bibliogon.plugins",
        },
    }
    overlay_path.write_text(yaml.safe_dump(stale_overlay), encoding="utf-8")

    # Refresh the app.main snapshot so the lifespan re-reads the
    # freshly-seeded overlay (the snapshot was cached at module
    # import time, BEFORE this fixture seeded the overlay).
    app_main._startup_config = app_main._load_app_config()

    yield overlay_path

    # Cleanup: remove the test overlay so subsequent tests start
    # from the conftest's default (no user-overlay file present).
    if overlay_path.exists():
        overlay_path.unlink()


class TestUserOverlayMigrationOnLifespan:
    """Stale user-overlay + lifespan startup = comics active."""

    def test_comics_becomes_active_after_lifespan(
        self, stale_user_overlay: Path
    ) -> None:
        """Lifespan migration must append comics to enabled BEFORE
        plugin discovery runs, so /api/comics/info responds 200."""
        with TestClient(app) as client:
            resp = client.get("/api/comics/info")
            assert resp.status_code == 200, (
                f"Expected 200, got {resp.status_code}. The stale "
                f"user-overlay should have been migrated by the "
                f"lifespan startup. Response body: {resp.text[:200]}"
            )
            body = resp.json()
            assert body["name"] == "comics"
            # Comics-Session-2 (commit a33baf3) bumped plugin-comics
            # to 1.1.0 with the full editor surface. Update on each
            # plugin-comics version bump.
            assert body["version"] == "1.1.0"

    def test_user_overlay_was_migrated_on_disk(
        self, stale_user_overlay: Path
    ) -> None:
        """The lifespan-time migration writes back to disk so the
        next boot is in-sync (no repeated migration writes)."""
        with TestClient(app):
            pass  # Lifespan startup is sufficient.

        with open(stale_user_overlay, encoding="utf-8") as f:
            persisted = yaml.safe_load(f)
        assert "comics" in persisted["plugins"]["enabled"], (
            "Migration must persist to disk. Found enabled list: "
            f"{persisted['plugins']['enabled']}"
        )

    def test_idempotent_second_boot_no_write(
        self, stale_user_overlay: Path
    ) -> None:
        """Second lifespan boot must NOT rewrite the user-overlay
        (mtime unchanged because no diff between project and user)."""
        # First boot: triggers the migration write.
        with TestClient(app):
            pass

        mtime_after_first = stale_user_overlay.stat().st_mtime_ns

        # Refresh _startup_config so the second boot re-reads the
        # now-in-sync user-overlay.
        app_main._startup_config = app_main._load_app_config()

        # Second boot: nothing to append, no write.
        with TestClient(app):
            pass

        mtime_after_second = stale_user_overlay.stat().st_mtime_ns
        assert mtime_after_second == mtime_after_first, (
            "Idempotent contract: second migration must not rewrite "
            "the user-overlay when the diff is empty."
        )

    def test_migration_respects_user_disabled_at_lifespan(
        self, stale_user_overlay: Path
    ) -> None:
        """If a user has comics in disabled, lifespan migration must
        NOT add it to enabled (opt-out preserved).

        Asserts on plugin-MANAGER state, NOT HTTP status: FastAPI's
        ``include_router`` is one-directional — once a route is
        mounted in a prior test (e.g.
        ``test_comics_becomes_active_after_lifespan``), it stays
        mounted for the rest of the pytest session. So
        ``/api/comics/info`` would return 200 even when comics is
        deactivated. The contract this pins is "migration respects
        disabled opt-out" — verified at the manager-state + disk
        layers, not the HTTP layer.
        """
        # Overwrite the fixture's overlay to opt-out of comics.
        overlay = yaml.safe_load(stale_user_overlay.read_text(encoding="utf-8"))
        overlay["plugins"]["disabled"] = ["comics"]
        stale_user_overlay.write_text(yaml.safe_dump(overlay), encoding="utf-8")
        app_main._startup_config = app_main._load_app_config()

        with TestClient(app):
            # Comics is NOT in the active-plugin set (manager-level
            # contract — pluginforge's filter_plugins(enabled, disabled)
            # excluded it).
            active_names = {
                p.name for p in app_main.manager.get_active_plugins()
            }
            assert "comics" not in active_names, (
                f"Migration must respect disabled opt-out. Active "
                f"plugins after lifespan: {sorted(active_names)}"
            )
            # And the merged config that pluginforge filters from
            # carries the user's disabled list.
            merged_plugins = app_main.manager._app_config.get("plugins", {})
            assert "comics" not in (merged_plugins.get("enabled") or [])
            assert "comics" in (merged_plugins.get("disabled") or [])

        # Verify disk state: enabled list unchanged (no comics
        # appended); disabled list unchanged.
        persisted = yaml.safe_load(stale_user_overlay.read_text(encoding="utf-8"))
        assert "comics" not in persisted["plugins"]["enabled"]
        assert "comics" in persisted["plugins"]["disabled"]
