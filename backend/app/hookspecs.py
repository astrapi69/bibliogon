"""Bibliogon hook specifications.

Defines the hooks that plugins can implement.
Uses pluggy's HookspecMarker for type-safe hook dispatch.
"""

from pathlib import Path
from typing import Any

import pluggy

hookspec = pluggy.HookspecMarker("bibliogon.plugins")


class BibliogonHookSpec:
    """Hook specifications for the Bibliogon application."""

    @hookspec
    def export_formats(self) -> list[dict[str, Any]]:  # type: ignore[empty-body]
        """Return list of supported export formats.

        Each format dict should have: id, label, extension, media_type.
        """
        ...

    @hookspec(firstresult=True)
    def export_execute(
        self, book: dict[str, Any], fmt: str, options: dict[str, Any]
    ) -> Path | None:
        """Execute an export. First plugin to return a result wins.

        Args:
            book: Book data dict.
            fmt: Export format id (e.g. "epub", "pdf", "project").
            options: Additional export options.

        Returns:
            Path to the generated output file.
        """
        ...

    @hookspec
    def chapter_pre_save(self, content: str, chapter_id: str) -> str | None:
        """Transform chapter content before saving.

        Args:
            content: The chapter content (TipTap JSON string).
            chapter_id: The chapter ID.

        Returns:
            Transformed content, or None to keep original.
        """
        ...

    @hookspec
    def content_pre_import(self, content: str, language: str) -> str | None:
        """Transform markdown content during book/chapter import.

        Runs on the raw markdown text before it is converted to HTML and
        written to the database. Plugins can use this to sanitize, normalize,
        or otherwise clean external content.

        Args:
            content: Raw markdown text read from the imported file.
            language: ISO language code of the target book (e.g. "de", "en").

        Returns:
            Transformed markdown, or None to keep the original.
        """
        ...
