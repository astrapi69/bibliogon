"""Zip Slip (CWE-22) regression pins for ``safe_extractall``.

Guards the shared archive-extraction helper used by every backup /
project / bgb import path. A crafted archive with ``../`` or absolute
members must be rejected BEFORE anything is written outside the target
dir. See the 2026-05-30 coverage audit BUG-1.
"""

import io
import zipfile
from pathlib import Path

import pytest

from app.exceptions import ValidationError
from app.services.backup.archive_utils import safe_extractall


def _zip_with(members: dict[str, bytes]) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    buf.seek(0)
    return zipfile.ZipFile(buf)


def test_safe_extractall_extracts_benign_archive(tmp_path: Path) -> None:
    target = tmp_path / "out"
    target.mkdir()
    zf = _zip_with({"books/book-1/metadata.yaml": b"title: ok", "manifest.json": b"{}"})
    safe_extractall(zf, target)
    assert (target / "books" / "book-1" / "metadata.yaml").read_bytes() == b"title: ok"
    assert (target / "manifest.json").exists()


def test_safe_extractall_rejects_parent_traversal(tmp_path: Path) -> None:
    target = tmp_path / "out"
    target.mkdir()
    sentinel = tmp_path / "escaped.txt"
    zf = _zip_with({"../escaped.txt": b"pwned"})
    with pytest.raises(ValidationError, match="Path-Traversal"):
        safe_extractall(zf, target)
    # Nothing escaped — the file was never written outside target.
    assert not sentinel.exists()


def test_safe_extractall_rejects_deep_traversal(tmp_path: Path) -> None:
    target = tmp_path / "out"
    target.mkdir()
    zf = _zip_with({"../../../tmp/bibliogon-zipslip-probe": b"pwned"})
    with pytest.raises(ValidationError, match="Path-Traversal"):
        safe_extractall(zf, target)


def test_safe_extractall_rejects_absolute_member(tmp_path: Path) -> None:
    target = tmp_path / "out"
    target.mkdir()
    # An absolute member name attempts to write to a fixed location.
    zf = _zip_with({"/tmp/bibliogon-zipslip-abs": b"pwned"})
    with pytest.raises(ValidationError, match="Path-Traversal"):
        safe_extractall(zf, target)
    assert not Path("/tmp/bibliogon-zipslip-abs").exists()
