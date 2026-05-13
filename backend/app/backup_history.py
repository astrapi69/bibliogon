"""Backup history store: logs every backup and restore with metadata.

Path resolution: the default ``path`` is ``None`` and resolved
lazily via ``app.paths.get_data_dir()`` at instance construction.
The previous default (``"config/backup_history.json"``,
CWD-relative) was a path-isolation violation per
``.claude/rules/lessons-learned.md`` ("Filesystem isolation:
production data lives outside the project tree") and crashed
with ``PermissionError`` for any deployment whose CWD pointed
at a read-only project tree — the standard Docker setup is one
such deployment. Tests may still pass an explicit path.

Cross-instance consistency: three modules each instantiate their
own ``BackupHistory()`` at import time
(``routers/backup.py``, ``services/backup/backup_export.py``,
``services/backup/backup_import.py``). Without disk-rehydration
on every read+write, instances diverge — the GET endpoint reads
its router's stale in-memory list and never sees writes the
export service made through its own instance, OR a second worker
writes an entry that clobbers a first worker's entry because its
in-memory ``_entries`` was loaded at module import. ``list()``
and ``add()`` therefore both call ``_load()`` first so the
JSON file is the single source of truth and all instances/workers
converge through it. Cost: one read per call (small file, max 100
entries). The file is not large enough to warrant locking;
file-level OS locks would be a separate hardening pass (filed as
follow-up if a hot-loop add() collision is ever observed).
"""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.paths import get_data_dir

logger = logging.getLogger(__name__)

_MAX_ENTRIES = 100


class BackupHistory:
    """Stores a chronological log of backup and restore operations."""

    def __init__(self, path: str | Path | None = None) -> None:
        if path is None:
            path = get_data_dir() / "backup_history.json"
        self.path = Path(path)
        self._entries: list[dict[str, Any]] = []
        self._load()

    def add(
        self,
        action: str,
        book_count: int = 0,
        chapter_count: int = 0,
        file_size_bytes: int = 0,
        filename: str = "",
        details: str = "",
    ) -> dict[str, Any]:
        """Log a backup/restore/import event.

        Reloads from disk first so a different instance's earlier
        writes are not silently clobbered.

        Args:
            action: One of "backup", "restore", "import", "smart-import"
            book_count: Number of books in the backup/import
            chapter_count: Total chapters
            file_size_bytes: Size of the backup file
            filename: Original filename
            details: Additional info (e.g. detected format)
        """
        self._load()
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "action": action,
            "book_count": book_count,
            "chapter_count": chapter_count,
            "file_size_bytes": file_size_bytes,
            "filename": filename,
            "details": details,
        }
        self._entries.insert(0, entry)  # newest first
        if len(self._entries) > _MAX_ENTRIES:
            self._entries = self._entries[:_MAX_ENTRIES]
        self._save()
        logger.info("Backup history: %s (%s, %d books)", action, filename, book_count)
        return entry

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return recent history entries, newest first.

        Reloads from disk so a GET caller sees writes made by any
        other instance (different module-level singletons + multi-
        worker uvicorn setups both converge through the JSON file).
        """
        self._load()
        return self._entries[:limit]

    def clear(self) -> None:
        """Clear all history entries."""
        self._entries = []
        self._save()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            self._entries = []
            return
        # Defensive: an older or hand-edited file may contain a dict (e.g.
        # {}) which would crash add()/insert later. Coerce to a list.
        self._entries = data if isinstance(data, list) else []

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self._entries, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
