"""Backup history store: logs every backup and restore with metadata."""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_PATH = "config/backup_history.json"
_MAX_ENTRIES = 100


class BackupHistory:
    """Stores a chronological log of backup and restore operations."""

    def __init__(self, path: str | Path = _DEFAULT_PATH) -> None:
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

        Args:
            action: One of "backup", "restore", "import", "smart-import"
            book_count: Number of books in the backup/import
            chapter_count: Total chapters
            file_size_bytes: Size of the backup file
            filename: Original filename
            details: Additional info (e.g. detected format)
        """
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
        """Return recent history entries, newest first."""
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
