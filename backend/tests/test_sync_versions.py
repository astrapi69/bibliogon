"""Unit tests for scripts/sync_versions.py handlers.

These tests cover the helper functions in the sync_versions script
that propagates ``backend/pyproject.toml`` version to all derived
files. They use the helpers directly (no subprocess) against
tempfile fixtures so each test runs in milliseconds.

The script lives at ``scripts/sync_versions.py`` (repo-root scripts/,
not under ``backend/app/``). We add scripts/ to sys.path explicitly
so pytest can import it. The bibliogon convention is to put cross-
cutting script tests under backend/tests/ so ``make test-backend``
picks them up automatically.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import sync_versions  # noqa: E402


# --- package_lock handler (Scope 2 of release-automation audit) ---


def _make_lock_fixture(top: str, root: str, deps_versions: list[str]) -> str:
    """Build an npm-shaped package-lock.json string.

    Top-level + packages[""] version land in the FIRST TWO version
    fields. Each ``deps_versions`` entry adds a nested dependency
    entry that the handler MUST NOT touch.
    """
    nested_pkgs: dict[str, dict[str, str]] = {}
    for i, dep_ver in enumerate(deps_versions):
        nested_pkgs[f"node_modules/dep-{i}"] = {
            "version": dep_ver,
            "license": "MIT",
        }
    payload = {
        "name": "test-pkg",
        "version": top,
        "lockfileVersion": 3,
        "requires": True,
        "packages": {
            "": {
                "name": "test-pkg",
                "version": root,
                "license": "MIT",
            },
            **nested_pkgs,
        },
    }
    return json.dumps(payload, indent=2) + "\n"


def test_update_package_lock_updates_top_level_and_root(tmp_path: Path):
    """Both top-level and packages[''] versions get bumped together."""
    lock = tmp_path / "package-lock.json"
    lock.write_text(_make_lock_fixture("1.0.0", "1.0.0", []), encoding="utf-8")

    changed = sync_versions.update_package_lock_version(
        lock, "1.0.1", dry_run=False
    )
    assert changed is True

    data = json.loads(lock.read_text(encoding="utf-8"))
    assert data["version"] == "1.0.1"
    assert data["packages"][""]["version"] == "1.0.1"


def test_update_package_lock_preserves_nested_dependency_versions(
    tmp_path: Path,
):
    """Regression pin: the surgical regex must NOT touch nested
    dependency entries (which carry their own ``"version": "..."``
    fields and would catastrophically break the lock if mutated).
    This is the most important property of the handler — npm
    package-lock files have hundreds of nested dep version entries,
    and overwriting any of them would corrupt the lock for every
    user who runs ``npm install`` afterwards.
    """
    lock = tmp_path / "package-lock.json"
    lock.write_text(
        _make_lock_fixture(
            "1.0.0", "1.0.0", ["7.29.0", "5.1.11", "3.4.4", "1.0.0"]
        ),
        encoding="utf-8",
    )

    sync_versions.update_package_lock_version(lock, "1.0.1", dry_run=False)

    data = json.loads(lock.read_text(encoding="utf-8"))
    # Top + root bumped:
    assert data["version"] == "1.0.1"
    assert data["packages"][""]["version"] == "1.0.1"
    # Nested deps UNCHANGED — even the one that happened to also
    # be "1.0.0" must NOT have been swept up by the regex:
    assert data["packages"]["node_modules/dep-0"]["version"] == "7.29.0"
    assert data["packages"]["node_modules/dep-1"]["version"] == "5.1.11"
    assert data["packages"]["node_modules/dep-2"]["version"] == "3.4.4"
    assert data["packages"]["node_modules/dep-3"]["version"] == "1.0.0"


def test_update_package_lock_no_change_when_already_synced(tmp_path: Path):
    """Idempotency: a second invocation reports no change."""
    lock = tmp_path / "package-lock.json"
    lock.write_text(_make_lock_fixture("1.0.1", "1.0.1", []), encoding="utf-8")
    original_bytes = lock.read_bytes()

    changed = sync_versions.update_package_lock_version(
        lock, "1.0.1", dry_run=False
    )

    assert changed is False
    assert lock.read_bytes() == original_bytes


def test_update_package_lock_dry_run_does_not_write(tmp_path: Path):
    """--dry-run mode reports the change but leaves the file alone."""
    lock = tmp_path / "package-lock.json"
    lock.write_text(_make_lock_fixture("1.0.0", "1.0.0", []), encoding="utf-8")
    original_bytes = lock.read_bytes()

    changed = sync_versions.update_package_lock_version(
        lock, "1.0.1", dry_run=True
    )

    assert changed is True
    # File on disk unchanged — only stdout reported the diff.
    assert lock.read_bytes() == original_bytes


def test_update_package_lock_skips_missing_file(tmp_path: Path):
    """Robustness: a non-existent file is a no-op (not a crash)."""
    nonexistent = tmp_path / "no-such-lock.json"
    changed = sync_versions.update_package_lock_version(
        nonexistent, "1.0.1", dry_run=False
    )
    assert changed is False


def test_update_package_lock_warns_on_missing_version_fields(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
):
    """A lock-file missing the top-level or packages[''] version
    fields gets a stderr warning + no write."""
    lock = tmp_path / "package-lock.json"
    lock.write_text(
        '{"name": "foo", "lockfileVersion": 3, "packages": {}}\n',
        encoding="utf-8",
    )
    original_bytes = lock.read_bytes()

    changed = sync_versions.update_package_lock_version(
        lock, "1.0.1", dry_run=False
    )

    assert changed is False
    assert lock.read_bytes() == original_bytes
    captured = capsys.readouterr()
    assert "missing top-level" in captured.err


def test_update_package_lock_handles_drifted_top_and_root(tmp_path: Path):
    """When top-level and packages[''] disagree (real bug state at
    audit time on 2026-05-19: package.json + lock had drifted), the
    handler bumps both to the canonical and reports the mismatch."""
    lock = tmp_path / "package-lock.json"
    lock.write_text(_make_lock_fixture("1.0.0", "1.0.0", []), encoding="utf-8")
    # Synthesize drift: replace ONLY the top-level by hand-editing.
    content = lock.read_text(encoding="utf-8")
    content = content.replace('"version": "1.0.0"', '"version": "0.9.9"', 1)
    lock.write_text(content, encoding="utf-8")

    changed = sync_versions.update_package_lock_version(
        lock, "1.0.1", dry_run=False
    )

    assert changed is True
    data = json.loads(lock.read_text(encoding="utf-8"))
    assert data["version"] == "1.0.1"
    assert data["packages"][""]["version"] == "1.0.1"


# --- collect_targets integration ---


def test_collect_targets_includes_frontend_package_lock():
    """The new package_lock target type must appear in the target
    list, mapped to the frontend lock file."""
    targets = sync_versions.collect_targets()
    matching = [
        (p, k)
        for (p, k) in targets
        if k == "package_lock" and p.name == "package-lock.json"
    ]
    assert len(matching) == 1, (
        f"Expected exactly one package_lock target, got {len(matching)}: "
        f"{[(str(p.relative_to(REPO_ROOT)), k) for p, k in matching]}"
    )
    path, _ = matching[0]
    assert path == REPO_ROOT / "frontend" / "package-lock.json"


def test_handlers_dispatch_includes_package_lock():
    """The HANDLERS dispatch table must wire the package_lock kind
    to the new handler function."""
    assert "package_lock" in sync_versions.HANDLERS
    assert (
        sync_versions.HANDLERS["package_lock"]
        is sync_versions.update_package_lock_version
    )
