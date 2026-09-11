#!/usr/bin/env python3
"""Detect drift between the vendored learn-content-engine artifacts and
the pinned upstream release (#775).

plugin-learnset validates every exported learn set against schemas it
VENDORS, because upstream ships no installable package:

- ``pip index versions learn-content-engine`` / ``lce-schema``: no
  distribution exists.
- The engine repo's ``pyproject.toml`` has no ``[project]`` /
  ``[build-system]`` table (its header states it only configures the
  manuscript-tools prose gate), so ``pip install git+...`` cannot work.
- The npm package DOES ship them: ``files`` includes ``schema`` and
  ``python/*.py``.

So vendoring stays and this guard makes the drift visible: fetch the
pinned npm version, byte-compare the vendored artifacts, fail on any
difference. Intended for the NIGHTLY workflow, not a PR gate - an
upstream release is not a reason to redden someone's unrelated PR.

Usage::

    python3 scripts/check_learnset_schema_drift.py            # fetches via npm
    python3 scripts/check_learnset_schema_drift.py --package-dir <dir>
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
VENDOR_DIR = (
    REPO_ROOT / "plugins" / "bibliogon-plugin-learnset" / "bibliogon_learnset" / "vendor"
)
PACKAGE_NAME = "learn-content-engine"

#: Vendored file -> its path inside the npm package.
VENDORED_ARTIFACTS: dict[str, str] = {
    "lesson.schema.json": "schema/lesson.schema.json",
    "content-manifest.schema.json": "schema/content-manifest.schema.json",
    "lce_schema.py": "python/lce_schema.py",
}


@dataclass
class DriftResult:
    drifted: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.drifted and not self.missing


def pinned_version() -> str:
    """Engine version the vendored copies were taken from."""
    return (VENDOR_DIR / "engine-version.txt").read_text(encoding="utf-8").strip()


def compare(package_dir: Path) -> DriftResult:
    """Byte-compare every vendored artifact against ``package_dir``.

    Args:
        package_dir: Unpacked npm package root (the dir holding
            ``schema/`` and ``python/``).

    Returns:
        Which artifacts differ and which are absent upstream.
    """
    result = DriftResult()
    for vendored_name, package_rel in VENDORED_ARTIFACTS.items():
        upstream = package_dir / package_rel
        if not upstream.is_file():
            result.missing.append(vendored_name)
            continue
        ours = (VENDOR_DIR / vendored_name).read_bytes()
        if upstream.read_bytes() != ours:
            result.drifted.append(vendored_name)
    return result


def fetch_package(version: str, into: Path) -> Path:
    """Download + unpack the pinned npm tarball. Returns the package root."""
    subprocess.run(
        ["npm", "pack", f"{PACKAGE_NAME}@{version}", "--silent"],
        cwd=str(into),
        check=True,
        capture_output=True,
        text=True,
    )
    tarballs = list(into.glob("*.tgz"))
    if not tarballs:
        raise RuntimeError(f"npm pack produced no tarball for {PACKAGE_NAME}@{version}")
    with tarfile.open(tarballs[0]) as archive:
        archive.extractall(into, filter="data")
    return into / "package"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--package-dir",
        type=Path,
        help="Compare against an already-unpacked package instead of fetching",
    )
    args = parser.parse_args(argv)

    version = pinned_version()
    print(f"learn-content-engine pin: {version}")

    if args.package_dir:
        result = compare(args.package_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="lce-drift-") as tmp:
            try:
                package_dir = fetch_package(version, Path(tmp))
            except (subprocess.CalledProcessError, RuntimeError) as exc:
                print(f"ERROR: could not fetch {PACKAGE_NAME}@{version}: {exc}")
                return 1
            result = compare(package_dir)

    if result.ok:
        print(f"OK: all {len(VENDORED_ARTIFACTS)} vendored artifacts match upstream.")
        return 0

    for name in result.drifted:
        print(f"DRIFT: {name} differs from {PACKAGE_NAME}@{version}")
    for name in result.missing:
        print(f"MISSING upstream: {name}")
    print()
    print("Re-vendor from the engine tag and bump vendor/engine-version.txt,")
    print("then re-run the plugin tests - a schema change may invalidate exports.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
