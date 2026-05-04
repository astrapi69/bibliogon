#!/usr/bin/env python3
"""Synchronize all subsystem versions to backend/pyproject.toml.

`backend/pyproject.toml` is the canonical Python source-of-truth.
This script reads its version and writes the same value to every
derived location:

- ``frontend/package.json`` (top-level "version" key)
- ``launcher/pyproject.toml`` (Poetry version)
- ``launcher/bibliogon_launcher/__init__.py`` (``__version__`` literal)
- ``launcher/bibliogon-launcher.spec`` (CFBundleVersion +
  CFBundleShortVersionString plist entries; both get the same value)
- ``plugins/*/pyproject.toml`` (every plugin)
- Plugin ``__init__.py`` files that hold a ``__version__ = "..."``
  literal AND do not already use importlib.metadata or tomllib
  (skip files that already derive)

After updating those files, this script regenerates ``install.sh``
via the existing ``scripts/generate_install_sh.sh``.

Modes:
  apply (default): write changes
  --dry-run:        show changes without writing
  --check:          exit 1 if any drift detected; never writes

The --check mode is what verify_version_pins.sh and CI use.

stdlib only (tomllib, json, re, subprocess).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CANONICAL = REPO / "backend" / "pyproject.toml"


def read_canonical_version() -> str:
    with CANONICAL.open("rb") as f:
        data = tomllib.load(f)
    return data["tool"]["poetry"]["version"]


def update_pyproject_version(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    """Update first ``version = "..."`` line under ``[tool.poetry]``.
    Returns True if the file changed (or would change in dry-run)."""
    content = path.read_text(encoding="utf-8")
    pattern = re.compile(r'^(version\s*=\s*)"([^"]+)"', re.MULTILINE)
    match = pattern.search(content)
    if not match:
        print(f"WARN: no version field in {path}", file=sys.stderr)
        return False
    if match.group(2) == new_version:
        return False
    new_content = pattern.sub(rf'\g<1>"{new_version}"', content, count=1)
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    print(f"  {path.relative_to(REPO)}: {match.group(2)} -> {new_version}")
    return True


def update_package_json_version(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    content = path.read_text(encoding="utf-8")
    data = json.loads(content)
    if data.get("version") == new_version:
        return False
    old = data.get("version")
    data["version"] = new_version
    if not dry_run:
        # Preserve trailing newline + 2-space indent (npm default).
        path.write_text(
            json.dumps(data, indent=2) + "\n", encoding="utf-8"
        )
    print(f"  {path.relative_to(REPO)}: {old} -> {new_version}")
    return True


def update_spec_plist(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    """Update CFBundleVersion + CFBundleShortVersionString in
    PyInstaller spec. Both keys get the same value (no Apple-style
    separation between user-facing and build-number)."""
    content = path.read_text(encoding="utf-8")
    changed = False

    for key in ("CFBundleVersion", "CFBundleShortVersionString"):
        pattern = re.compile(
            rf'("{re.escape(key)}":\s*)["\']([^"\']+)["\']'
        )
        match = pattern.search(content)
        if match and match.group(2) != new_version:
            content = pattern.sub(
                rf'\g<1>"{new_version}"', content, count=1
            )
            print(
                f"  {path.relative_to(REPO)} ({key}): "
                f"{match.group(2)} -> {new_version}"
            )
            changed = True

    if changed and not dry_run:
        path.write_text(content, encoding="utf-8")
    return changed


def update_init_version_literal(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    """Update ``__version__ = "..."`` literal in __init__.py.

    Skips files that already use importlib.metadata or tomllib for
    derivation. Frozen binaries (PyInstaller) need the literal
    embedded; that is why we keep the literal pattern for the
    launcher rather than refactoring to importlib."""
    if not path.is_file():
        return False
    content = path.read_text(encoding="utf-8")
    if "importlib.metadata" in content or "tomllib" in content:
        return False
    pattern = re.compile(
        r'^(__version__\s*=\s*)"([^"]+)"', re.MULTILINE
    )
    match = pattern.search(content)
    if not match:
        return False
    if match.group(2) == new_version:
        return False
    new_content = pattern.sub(rf'\g<1>"{new_version}"', content, count=1)
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    print(
        f"  {path.relative_to(REPO)}: __version__ "
        f"{match.group(2)} -> {new_version}"
    )
    return True


_INSTALL_TEMPLATE = REPO / "install.sh.template"
_INSTALL_TARGET = REPO / "install.sh"
_INSTALL_PLACEHOLDER = "@@BIBLIOGON_VERSION@@"


def _render_install_sh(canonical_version: str) -> str:
    """Pure-Python equivalent of generate_install_sh.sh.

    Reads ``install.sh.template``, substitutes ``@@BIBLIOGON_VERSION@@``
    with ``v<canonical_version>``, returns the result.

    Avoids subprocess + bash entirely so the same code path works on
    Windows runners. Earlier versions invoked the bash script via
    ``subprocess.run(["bash", str(script), "--check"])``, which on
    Windows could resolve to either Git Bash or the WSL2 launcher
    depending on PATH order; the latter mishandles native Windows
    paths and returned spurious drift.
    """
    template_text = _INSTALL_TEMPLATE.read_text(encoding="utf-8")
    tag = f"v{canonical_version}"
    return template_text.replace(_INSTALL_PLACEHOLDER, tag)


def regenerate_install_sh(dry_run: bool) -> bool:
    """Pure-Python re-implementation of generate_install_sh.sh.

    Returns True if install.sh changed (or would change in dry-run).
    Stays in sync with scripts/generate_install_sh.sh; the bash
    script is the canonical human-facing tool, this function is the
    cross-platform equivalent for tooling that does not want to
    spawn bash subprocesses.
    """
    if not _INSTALL_TEMPLATE.is_file():
        print(
            f"WARN: {_INSTALL_TEMPLATE.relative_to(REPO)} missing, "
            "install.sh not regenerated",
            file=sys.stderr,
        )
        return False

    canonical = read_canonical_version()
    rendered = _render_install_sh(canonical)

    if not _INSTALL_TARGET.is_file():
        if dry_run:
            print(f"  install.sh would be created from template")
        else:
            _INSTALL_TARGET.write_text(rendered, encoding="utf-8")
            try:
                _INSTALL_TARGET.chmod(0o755)
            except OSError:
                pass
            print(f"  install.sh created from template")
        return True

    current = _INSTALL_TARGET.read_text(encoding="utf-8")
    if current == rendered:
        return False

    if dry_run:
        print(f"  install.sh would be regenerated from template")
    else:
        _INSTALL_TARGET.write_text(rendered, encoding="utf-8")
        try:
            _INSTALL_TARGET.chmod(0o755)
        except OSError:
            pass
        print(f"  install.sh regenerated from template")
    return True


def collect_targets() -> list[tuple[Path, str]]:
    """Return list of (file, kind). Kinds: pyproject, package_json,
    spec, init_literal."""
    targets: list[tuple[Path, str]] = []

    targets.append((REPO / "frontend" / "package.json", "package_json"))

    targets.append((REPO / "launcher" / "pyproject.toml", "pyproject"))
    targets.append(
        (
            REPO / "launcher" / "bibliogon_launcher" / "__init__.py",
            "init_literal",
        )
    )
    targets.append(
        (REPO / "launcher" / "bibliogon-launcher.spec", "spec")
    )

    for plugin_pyproject in sorted(
        (REPO / "plugins").glob("*/pyproject.toml")
    ):
        targets.append((plugin_pyproject, "pyproject"))
    for plugin_init in sorted((REPO / "plugins").glob("*/*/__init__.py")):
        targets.append((plugin_init, "init_literal"))

    return targets


HANDLERS = {
    "pyproject": update_pyproject_version,
    "package_json": update_package_json_version,
    "spec": update_spec_plist,
    "init_literal": update_init_version_literal,
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group()
    g.add_argument(
        "--dry-run",
        action="store_true",
        help="show changes without writing",
    )
    g.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if any drift; never writes",
    )
    args = ap.parse_args()

    canonical = read_canonical_version()
    label = "Canonical version (backend/pyproject.toml)"
    print(f"{label}: {canonical}")
    print()

    if args.check:
        drift = 0
        for path, kind in collect_targets():
            if HANDLERS[kind](path, canonical, dry_run=True):
                drift += 1
        if regenerate_install_sh(dry_run=True):
            drift += 1
        print()
        if drift > 0:
            print(f"DRIFT: {drift} file(s) out of sync with {canonical}.")
            return 1
        print(f"All subsystems in sync with {canonical}.")
        return 0

    changed_count = 0
    for path, kind in collect_targets():
        if HANDLERS[kind](path, canonical, args.dry_run):
            changed_count += 1
    if regenerate_install_sh(args.dry_run):
        changed_count += 1

    print()
    if args.dry_run:
        print(
            f"DRY RUN: {changed_count} file(s) would be updated "
            f"to {canonical}."
        )
    else:
        print(
            f"Synced {changed_count} file(s) to {canonical}."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
