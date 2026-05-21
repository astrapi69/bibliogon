"""Bibliogon hook specifications.

Defines the hooks that plugins can implement.
Uses pluggy's HookspecMarker for type-safe hook dispatch.

Dispatch-site status (see HOOKSPEC-DISPATCH-WIRING-01):
    content_pre_import  WIRED   - backend/app/services/backup/markdown_utils.py:106
    export_formats      UNWIRED - declared, no dispatch site
    export_execute      UNWIRED - declared, no dispatch site
    chapter_pre_save    UNWIRED - declared, no dispatch site or implementation

The three UNWIRED hookspecs represent intended architecture that has not
been completed. Do NOT add @hookimpl implementations for them until a
dispatch site is wired - they would be dead code (see
.claude/rules/lessons-learned.md "Half-wired feature lifecycle").
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

        TODO(HOOKSPEC-DISPATCH-WIRING-01): dispatch site not yet wired.
        plugin-export currently dispatches formats via a hardcoded
        SUPPORTED_FORMATS set + direct imports from bibliogon_audiobook.
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

        TODO(HOOKSPEC-DISPATCH-WIRING-01): dispatch site not yet wired.
        plugin-export's routes.py handles formats by direct imports
        (e.g. bibliogon_audiobook.generator) rather than via this hook.
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

        TODO(HOOKSPEC-DISPATCH-WIRING-01): dispatch site not yet wired.
        No plugin implements this hook and no save path dispatches it.
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
