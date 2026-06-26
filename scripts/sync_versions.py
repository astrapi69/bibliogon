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
- ``launcher/launcher.json`` (``app_version`` field, read at runtime
  by docker-app-launcher)
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


def update_package_lock_version(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    """Update package-lock.json's TWO top-level version fields.

    npm-generated locks carry the host project's version in two
    places at the top of the file:

    - top-level ``"version": "..."`` (document-root metadata)
    - ``packages[""]["version"]`` (the root package entry)

    Both must match ``package.json``'s version. npm only re-syncs
    them when ``npm install`` runs; a sync-versions invocation that
    edits ``package.json`` directly leaves the lock-file out of sync
    (Tier-5 drift; see docs/audits/release-automation-audit-2026-
    05-19.md).

    Surgical regex on the first 2 occurrences of ``"version": "..."``
    in the file. In npm-generated locks the top-level + packages[""]
    entries are always the first two ``"version":`` lines; every
    subsequent occurrence is a nested dependency entry that MUST
    NOT be touched.
    """
    if not path.is_file():
        return False
    content = path.read_text(encoding="utf-8")
    # Validate via JSON parse that the file is well-formed and that
    # the two expected fields exist. If the lock-file shape ever
    # changes, fail loud rather than mangle the file.
    data = json.loads(content)
    top_version = data.get("version")
    root_pkg_version = data.get("packages", {}).get("", {}).get("version")
    if top_version is None or root_pkg_version is None:
        print(
            f"WARN: {_display_path(path)} missing top-level or "
            f"packages[''] version field; skipping",
            file=sys.stderr,
        )
        return False
    if top_version == new_version and root_pkg_version == new_version:
        return False
    # Surgical regex: anchor on `"version":` with whitespace prefix
    # then quoted value. count=2 hits the two top-level locations
    # without touching the hundreds of nested dependency `"version":`
    # entries that follow.
    pattern = re.compile(r'^(\s*"version":\s*)"[^"]+"', re.MULTILINE)
    new_content, n = pattern.subn(
        rf'\g<1>"{new_version}"', content, count=2
    )
    if n != 2:
        print(
            f"WARN: {_display_path(path)} expected 2 version "
            f"matches, got {n}; skipping",
            file=sys.stderr,
        )
        return False
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    old = top_version if top_version == root_pkg_version else (
        f"top={top_version},root={root_pkg_version}"
    )
    print(f"  {_display_path(path)}: {old} -> {new_version}")
    return True


def _display_path(path: Path) -> str:
    """Format a path for user-facing output.

    Prefers repo-relative when the path lives inside REPO (the
    production case); falls back to the bare filename when the
    path is outside REPO (e.g. tempfile-based unit tests).
    """
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return path.name


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


def update_launcher_json_version(
    path: Path, new_version: str, dry_run: bool
) -> bool:
    """Update the ``app_version`` field in the launcher config JSON.

    ``launcher/launcher.json`` is read at runtime by docker-app-launcher;
    its ``app_version`` must track the canonical version so the launcher's
    update check + About string stay correct. Regex-replace the single
    field rather than a json round-trip, to keep the diff minimal."""
    if not path.is_file():
        return False
    content = path.read_text(encoding="utf-8")
    pattern = re.compile(r'("app_version":\s*)"([^"]+)"')
    match = pattern.search(content)
    if not match or match.group(2) == new_version:
        return False
    new_content = pattern.sub(rf'\g<1>"{new_version}"', content, count=1)
    if not dry_run:
        path.write_text(new_content, encoding="utf-8")
    print(
        f"  {path.relative_to(REPO)} (app_version): "
        f"{match.group(2)} -> {new_version}"
    )
    return True


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


_INSTALL_PLACEHOLDER = "@@BIBLIOGON_VERSION@@"

# Generated installer artifacts. The template is the editable source;
# the target is regenerated at release time. ``executable`` controls
# whether ``chmod 0o755`` is applied after a write - install.sh +
# install.ps1 both flip the bit on Linux/macOS so they curl-pipe
# directly without an extra ``chmod`` step. Windows ignores the bit.
_INSTALL_ARTIFACTS = (
    {
        "label": "install.sh",
        "template": REPO / "install.sh.template",
        "target": REPO / "install.sh",
        "executable": True,
    },
    {
        "label": "install.ps1",
        "template": REPO / "install.ps1.template",
        "target": REPO / "install.ps1",
        "executable": False,
    },
)


def _render_template(template_path: Path, canonical_version: str) -> str:
    """Substitute ``@@BIBLIOGON_VERSION@@`` -> ``v<canonical_version>``.

    Pure-Python so the same code path works on every platform. The
    earlier bash-only generator could resolve to either Git Bash or
    WSL2 on Windows runners depending on PATH order; WSL2 mishandles
    native Windows paths and returned spurious drift.
    """
    return template_path.read_text(encoding="utf-8").replace(
        _INSTALL_PLACEHOLDER, f"v{canonical_version}"
    )


def _regenerate_one(artifact: dict, canonical: str, dry_run: bool) -> bool:
    """Regenerate a single artifact from its template. Returns True
    when the artifact changed (or would change in dry-run)."""
    template_path: Path = artifact["template"]
    target_path: Path = artifact["target"]
    label: str = artifact["label"]
    executable: bool = artifact["executable"]

    if not template_path.is_file():
        print(
            f"WARN: {template_path.relative_to(REPO)} missing, "
            f"{label} not regenerated",
            file=sys.stderr,
        )
        return False

    rendered = _render_template(template_path, canonical)

    if not target_path.is_file():
        if dry_run:
            print(f"  {label} would be created from template")
        else:
            target_path.write_text(rendered, encoding="utf-8")
            if executable:
                try:
                    target_path.chmod(0o755)
                except OSError:
                    pass
            print(f"  {label} created from template")
        return True

    if target_path.read_text(encoding="utf-8") == rendered:
        return False

    if dry_run:
        print(f"  {label} would be regenerated from template")
    else:
        target_path.write_text(rendered, encoding="utf-8")
        if executable:
            try:
                target_path.chmod(0o755)
            except OSError:
                pass
        print(f"  {label} regenerated from template")
    return True


def regenerate_install_sh(dry_run: bool) -> bool:
    """Regenerate every installer artifact (install.sh + install.ps1).

    Returns True if any artifact changed (or would change in dry-run).
    The name is kept for backward compatibility with verify scripts +
    callers that pre-date install.ps1.
    """
    canonical = read_canonical_version()
    changed = False
    for artifact in _INSTALL_ARTIFACTS:
        if _regenerate_one(artifact, canonical, dry_run):
            changed = True
    return changed


def collect_targets() -> list[tuple[Path, str]]:
    """Return list of (file, kind). Kinds: pyproject, package_json,
    package_lock, spec, init_literal."""
    targets: list[tuple[Path, str]] = []

    targets.append((REPO / "frontend" / "package.json", "package_json"))
    targets.append((REPO / "frontend" / "package-lock.json", "package_lock"))

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
    targets.append(
        (REPO / "launcher" / "launcher.json", "launcher_json")
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
    "package_lock": update_package_lock_version,
    "spec": update_spec_plist,
    "init_literal": update_init_version_literal,
    "launcher_json": update_launcher_json_version,
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
