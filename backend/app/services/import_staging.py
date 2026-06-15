"""On-disk staging for the two-phase import orchestrator.

Extracted from ``routers/import_orchestrator.py`` (God-file split #6,
2026-06-14). Staged uploads live on disk between the ``detect`` and
``execute`` phases so execute can re-read the original bytes (re-hash,
re-extract a ZIP). A 30-minute TTL is enforced opportunistically on
every detect via :func:`gc_stale_staging`.

Path sanitisation raises :class:`app.exceptions.ValidationError`; the
global handler in ``main.py`` maps it to HTTP 400 (same response the
router produced inline before the split).
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile

from app.exceptions import ValidationError

# Staged uploads live on disk between detect and execute so execute can
# re-read the original bytes (the handler may need to re-hash them or
# re-extract a ZIP). TTL enforced lazily during each request.
_STAGING_DIR = Path(tempfile.gettempdir()) / "bibliogon_import_staging"
_STAGING_DIR.mkdir(parents=True, exist_ok=True)
_STAGING_TTL_SECONDS = 30 * 60


def is_safe_rel_path(path: str) -> bool:
    """Reject paths with ``..`` components or absolute prefixes."""
    if not path:
        return False
    parts = path.replace("\\", "/").split("/")
    return not any(p == ".." for p in parts) and not path.startswith("/")


def stage_uploads(files: list[UploadFile], paths: list[str] | None, temp_ref: str) -> Path:
    """Persist one or more uploads to disk and return the path a handler
    should inspect.

    Layout: ``<STAGING_DIR>/<temp_ref>/payload/<rel>``. Single-file
    uploads land at ``payload/<filename>`` and we return the file path.
    Folder uploads (``paths`` aligned with ``files`` 1:1) land at their
    ``webkitRelativePath`` position; we return ``payload/<root>`` where
    ``<root>`` is the common first path segment.
    """
    payload_dir = _STAGING_DIR / temp_ref / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)

    for i, upload in enumerate(files):
        rel = (paths[i] if paths else None) or upload.filename or f"file-{i}"
        rel = sanitise_rel_path(rel)
        dest = payload_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            shutil.copyfileobj(upload.file, f)

    return input_path_for_payload(payload_dir, files, paths)


def sanitise_rel_path(rel: str) -> str:
    """Strip leading slashes and reject ``..`` components. Preserves the
    ``webkitRelativePath`` layout while blocking path traversal."""
    parts = [p for p in rel.replace("\\", "/").split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise ValidationError(f"Invalid path component in upload: {rel!r}")
    return "/".join(parts) or "upload"


def input_path_for_payload(
    payload_dir: Path,
    files: list[UploadFile],
    paths: list[str] | None,
) -> Path:
    """Work out which path the handler should see.

    Single file upload -> the file itself. Folder upload -> the root
    directory (``payload_dir / <first segment of the common path>``).
    """
    if len(files) == 1 and not (paths and "/" in sanitise_rel_path(paths[0] or "")):
        # single file: return the file path directly
        rel = (paths[0] if paths else None) or files[0].filename or "upload"
        return payload_dir / sanitise_rel_path(rel)

    # folder upload: shared first segment across all paths
    roots: set[str] = set()
    for i, upload in enumerate(files):
        rel = (paths[i] if paths else None) or upload.filename or f"file-{i}"
        first = sanitise_rel_path(rel).split("/", 1)[0]
        roots.add(first)
    if len(roots) == 1:
        return payload_dir / next(iter(roots))
    return payload_dir


def resolve_staged(temp_ref: str) -> Path | None:
    stage_dir = _STAGING_DIR / temp_ref / "payload"
    if not stage_dir.is_dir():
        return None
    entries = list(stage_dir.iterdir())
    if not entries:
        return None
    if len(entries) == 1:
        return entries[0]
    # Multiple roots at payload level - return the payload dir so the
    # handler sees everything as one directory input.
    return stage_dir


def drop_staged(temp_ref: str) -> None:
    stage_dir = _STAGING_DIR / temp_ref
    shutil.rmtree(stage_dir, ignore_errors=True)


def gc_stale_staging() -> None:
    """Remove any staged upload older than the TTL. Called opportunistically
    during detect so the temp dir never grows without bound."""
    if not _STAGING_DIR.is_dir():
        return
    cutoff = datetime.now().timestamp() - _STAGING_TTL_SECONDS
    for child in _STAGING_DIR.iterdir():
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            continue
