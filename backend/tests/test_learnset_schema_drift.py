"""Self-check tests for the learnset schema-drift guard (#775).

The engine's schemas + Python validator are VENDORED, because there is
no installable package: `pip index versions learn-content-engine` finds
no distribution and the engine repo's pyproject.toml carries no
[project]/[build-system] table (it exists only to configure a prose
gate). The npm package does ship them (`files` includes `schema` and
`python/*.py`), so a nightly job can fetch the pinned version and
compare - which is what this script does.

Tested against a fake "npm package" directory so the tests need no
network.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import check_learnset_schema_drift as drift  # noqa: E402

VENDOR = (
    REPO_ROOT
    / "plugins"
    / "bibliogon-plugin-learnset"
    / "bibliogon_learnset"
    / "vendor"
)


def _fake_package(tmp_path: Path, *, mutate: str | None = None) -> Path:
    """Mirror the vendored files into an npm-package-shaped directory."""
    package = tmp_path / "package"
    (package / "schema").mkdir(parents=True)
    (package / "python").mkdir(parents=True)
    for name in ("lesson.schema.json", "content-manifest.schema.json"):
        (package / "schema" / name).write_text(
            (VENDOR / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    (package / "python" / "lce_schema.py").write_text(
        (VENDOR / "lce_schema.py").read_text(encoding="utf-8"), encoding="utf-8"
    )
    if mutate:
        target = package / "schema" / mutate
        target.write_text(
            target.read_text(encoding="utf-8") + "\n// upstream changed\n",
            encoding="utf-8",
        )
    return package


def test_pin_file_matches_the_plugin_constant() -> None:
    from bibliogon_learnset.scaffold import ENGINE_VERSION

    assert drift.pinned_version() == ENGINE_VERSION


def test_identical_package_reports_no_drift(tmp_path: Path) -> None:
    package = _fake_package(tmp_path)
    result = drift.compare(package)
    assert result.drifted == []
    assert result.missing == []
    assert result.ok


def test_changed_upstream_file_is_reported(tmp_path: Path) -> None:
    package = _fake_package(tmp_path, mutate="lesson.schema.json")
    result = drift.compare(package)
    assert "lesson.schema.json" in result.drifted
    assert not result.ok


def test_missing_upstream_file_is_reported(tmp_path: Path) -> None:
    package = _fake_package(tmp_path)
    (package / "python" / "lce_schema.py").unlink()
    result = drift.compare(package)
    assert "lce_schema.py" in result.missing
    assert not result.ok


def test_every_vendored_artifact_is_covered() -> None:
    """A file added to vendor/ without being added to the guard would
    drift unnoticed - exactly the failure the guard exists to prevent."""
    vendored = {
        path.name
        for path in VENDOR.iterdir()
        if path.is_file() and path.name not in {"__init__.py", "engine-version.txt"}
    }
    assert vendored == set(drift.VENDORED_ARTIFACTS)
