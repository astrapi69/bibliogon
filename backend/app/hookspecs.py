"""Bibliogon hook specifications.

Defines the hooks that plugins can implement.
Uses pluggy's HookspecMarker for type-safe hook dispatch.

Dispatch-site status (post HOOKSPEC-DISPATCH-WIRING-01 adjudication
2026-05-22):
    content_pre_import  WIRED   - backend/app/services/backup/markdown_utils.py:106
    export_formats      UNWIRED - status-quo per adjudication
                                  (hardcoded SUPPORTED_FORMATS set in
                                  plugin-export covers today's single-
                                  export-plugin reality; re-evaluate
                                  when a 2nd export plugin lands)
    export_execute      UNWIRED - planned wire-up tracked separately as
                                  HOOKSPEC-EXPORT-EXECUTE-WIRE-01 (P3);
                                  do not add @hookimpl implementations
                                  until that session lands (would be
                                  dead code per the Half-wired feature
                                  lifecycle Lessons-Learned rule)

Deleted hookspec (2026-05-22): chapter_pre_save. Zero implementations
existed after multiple release cycles; the sibling content_pre_import
covers the import-side case (the only one with a real plugin consumer).
Re-file with a concrete use case + named consumer if pre-save
transformation ever becomes a real need.
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

        Status quo (HOOKSPEC-DISPATCH-WIRING-01 adjudication 2026-05-22):
        plugin-export owns the hardcoded SUPPORTED_FORMATS set in
        plugins/bibliogon-plugin-export/bibliogon_export/routes.py and
        is the single export-plugin today. Wiring this hook would
        require splitting the format catalog across plugins — useful
        when a 2nd export plugin lands, speculative today. Re-evaluate
        on first 2nd-export-plugin proposal.
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

        Wire-up planned in HOOKSPEC-EXPORT-EXECUTE-WIRE-01 (P3,
        separate session). The cleanup removes 6 cross-plugin direct-
        import sites in plugin-export's routes.py (audiobook
        dispatch) and plugin-comics's comic_book_pdf.py
        (picture_book_pdf reuse). Do NOT add @hookimpl
        implementations in plugins until that session lands; they
        would be dead code today.
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
