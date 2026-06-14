"""ZIP extraction cache + signature helpers for WBT imports.

Extracted from ``import_plugins/handlers/wbt.py`` (God-file split #12,
2026-06-14). File hashing, directory-layout signature, and the
out-of-payload ZIP extraction cache (with partial-extraction sentinel).
"""

from __future__ import annotations

import hashlib
import shutil
import zipfile
from pathlib import Path

from app.services.backup.archive_utils import find_project_root, safe_extractall


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _folder_signature(project_root: Path) -> str:
    """Stable identifier for a directory WBT project.

    Walks the manuscript directory for relative path names (not content)
    so re-imports of the same layout - even after in-place chapter
    edits - collide for duplicate detection. Matches the same semantics
    as the markdown-folder signature.
    """
    h = hashlib.sha256()
    manuscript = project_root / "manuscript"
    if manuscript.is_dir():
        for p in sorted(manuscript.rglob("*")):
            if p.is_file():
                h.update(str(p.relative_to(project_root)).encode("utf-8"))
                h.update(b"\0")
    h.update(project_root.name.encode("utf-8"))
    return f"signature:{h.hexdigest()}"


def _extracted_root(zip_path: Path) -> Path:
    """Extract the ZIP to an out-of-payload directory and return the
    project root.

    Cache key is the ZIP's SHA-256 short prefix so two different
    archives with the same filename produce different targets - a
    previous iteration keyed on filename stem, which made the test
    suite see stale extraction data when the same zip name was reused
    across tests. Keeping the extraction out of the orchestrator's
    ``payload/`` directory avoids ``_resolve_staged`` seeing both the
    ZIP and the extracted dir and re-dispatching to the markdown-folder
    handler on execute. Staging GC cleans up the ``temp_ref`` tree on
    TTL or on execute success.
    """
    digest = _sha256_of_file(zip_path)[:16]
    target = zip_path.parent.parent / "wbt-extracted" / digest
    # Sentinel guards against the "partial extraction" hazard: the
    # previous version checked ``target.is_dir()`` only, so if a
    # prior detect call crashed between ``mkdir`` and the end of
    # ``extractall`` (OS signal, disk full, Ctrl+C), the dir existed
    # with a partial tree and subsequent detects reused it silently.
    # Symptom in the wild: a real repo imported with missing CSS,
    # missing chapters, or wrong metadata, with no error surfaced.
    # Now we write ``.extraction-complete`` after extractall returns
    # and refuse to reuse the cache without it.
    sentinel = target / ".extraction-complete"
    if not sentinel.exists():
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            safe_extractall(zf, target)
        sentinel.write_text("ok", encoding="utf-8")
    root = find_project_root(target)
    if root is None:
        raise RuntimeError("Extracted ZIP has no WBT project root")
    return root
