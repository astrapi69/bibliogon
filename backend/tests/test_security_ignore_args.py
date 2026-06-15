"""Unit tests for scripts/security_ignore_args.py.

The script turns ``.security-ignore.yml`` (the single source of truth for
accepted / deferred security advisories) into pip-audit ``--ignore-vuln``
arguments, shared by the weekly security watcher and ``make check-security``.

Following the bibliogon convention (see test_sync_versions.py), the repo-root
``scripts/`` directory is added to sys.path so pytest can import the module.
The tests exercise the pure ``build_ignore_args`` helper against tempfile
fixtures so they run in milliseconds with no subprocess.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import security_ignore_args  # noqa: E402


def _write(tmp_path: Path, content: str) -> Path:
    target = tmp_path / ".security-ignore.yml"
    target.write_text(content, encoding="utf-8")
    return target


def test_single_entry_emits_ignore_vuln(tmp_path: Path) -> None:
    """One entry produces a `--ignore-vuln <id>` pair."""
    path = _write(tmp_path, "ignored:\n  - id: CVE-2025-68616\n    package: x\n")
    assert security_ignore_args.build_ignore_args(path) == [
        "--ignore-vuln",
        "CVE-2025-68616",
    ]


def test_multiple_entries_preserve_order(tmp_path: Path) -> None:
    """Multiple entries emit one pair each, in file order."""
    path = _write(
        tmp_path,
        "ignored:\n  - id: CVE-A\n  - id: CVE-B\n  - id: CVE-C\n",
    )
    assert security_ignore_args.build_ignore_args(path) == [
        "--ignore-vuln",
        "CVE-A",
        "--ignore-vuln",
        "CVE-B",
        "--ignore-vuln",
        "CVE-C",
    ]


def test_missing_file_yields_no_args(tmp_path: Path) -> None:
    """A missing ignore file means 'ignore nothing' (empty, no raise)."""
    assert security_ignore_args.build_ignore_args(tmp_path / "absent.yml") == []


def test_empty_ignored_list_yields_no_args(tmp_path: Path) -> None:
    """An explicit empty list ignores nothing."""
    assert security_ignore_args.build_ignore_args(_write(tmp_path, "ignored: []\n")) == []


def test_entry_without_id_fails_loud(tmp_path: Path) -> None:
    """An entry missing `id` raises rather than silently dropping it."""
    path = _write(tmp_path, "ignored:\n  - package: weasyprint\n")
    with pytest.raises(ValueError, match="needs an 'id'"):
        security_ignore_args.build_ignore_args(path)


def test_non_mapping_top_level_fails_loud(tmp_path: Path) -> None:
    """A non-mapping document fails loud."""
    path = _write(tmp_path, "- just\n- a\n- list\n")
    with pytest.raises(ValueError, match="must be a mapping"):
        security_ignore_args.build_ignore_args(path)


def test_committed_ignore_file_parses() -> None:
    """The real committed `.security-ignore.yml` is well-formed and parses."""
    args = security_ignore_args.build_ignore_args(REPO_ROOT / ".security-ignore.yml")
    assert args == ["--ignore-vuln", "CVE-2025-68616"]
    document = yaml.safe_load((REPO_ROOT / ".security-ignore.yml").read_text())
    for entry in document["ignored"]:
        assert {"id", "reason", "tracking", "review_by"} <= entry.keys()
