"""Publication changelog: tracks when each version of a book was exported/published."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_CHANGELOG_DIR = Path("config/changelogs")


class PublicationEntry:
    """A single publication event."""

    def __init__(
        self,
        version: str,
        format: str,
        timestamp: str = "",
        book_type: str = "ebook",
        notes: str = "",
    ) -> None:
        self.version = version
        self.format = format
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()
        self.book_type = book_type
        self.notes = notes

    def to_dict(self) -> dict[str, str]:
        return {
            "version": self.version,
            "format": self.format,
            "timestamp": self.timestamp,
            "book_type": self.book_type,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "PublicationEntry":
        return cls(
            version=data.get("version", ""),
            format=data.get("format", ""),
            timestamp=data.get("timestamp", ""),
            book_type=data.get("book_type", "ebook"),
            notes=data.get("notes", ""),
        )


def get_changelog(book_id: str) -> list[dict[str, str]]:
    """Get the publication changelog for a book."""
    path = _CHANGELOG_DIR / f"{book_id}.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def add_entry(
    book_id: str,
    version: str,
    format: str,
    book_type: str = "ebook",
    notes: str = "",
) -> dict[str, str]:
    """Add a publication entry to a book's changelog."""
    _CHANGELOG_DIR.mkdir(parents=True, exist_ok=True)
    entries = get_changelog(book_id)
    entry = PublicationEntry(
        version=version, format=format, book_type=book_type, notes=notes
    )
    entries.insert(0, entry.to_dict())
    path = _CHANGELOG_DIR / f"{book_id}.json"
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Changelog: book=%s version=%s format=%s", book_id, version, format)
    return entry.to_dict()


def export_changelog_markdown(book_id: str, book_title: str = "") -> str:
    """Export changelog as Markdown text."""
    entries = get_changelog(book_id)
    if not entries:
        return f"# Changelog: {book_title or book_id}\n\nNo publications recorded.\n"

    lines = [f"# Changelog: {book_title or book_id}\n"]
    for e in entries:
        ts = e.get("timestamp", "")[:10]  # date only
        version = e.get("version", "?")
        fmt = e.get("format", "?").upper()
        book_type = e.get("book_type", "")
        notes = e.get("notes", "")
        line = f"- **{version}** ({ts}) - {fmt}"
        if book_type and book_type != "ebook":
            line += f" [{book_type}]"
        if notes:
            line += f" - {notes}"
        lines.append(line)

    return "\n".join(lines) + "\n"
