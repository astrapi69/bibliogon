"""Bibliogon hook specifications.

Defines the hooks that plugins can implement.
Uses pluggy's HookspecMarker for type-safe hook dispatch.

Dispatch-site status (updated 2026-05-23 after
HOOKSPEC-EXPORT-EXECUTE-WIRE-01 γ):
    content_pre_import  WIRED   - backend/app/services/backup/markdown_utils.py:106
    export_formats      UNWIRED - status-quo per adjudication
                                  (hardcoded SUPPORTED_FORMATS set in
                                  plugin-export covers today's single-
                                  export-plugin reality; re-evaluate
                                  when a 2nd export plugin lands)
    export_execute      WIRED   - plugins/bibliogon-plugin-export/
                                  bibliogon_export/routes.py
                                  ``_export_comic_book_pdf``. Sole
                                  hookimpl: plugin-comics handles
                                  ``book_type == "comic_book"`` +
                                  ``fmt == "pdf"``. The audiobook
                                  case is a DOCUMENTED EXCEPTION
                                  (see ``export_execute`` docstring
                                  below).

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
            book: Book data dict (must include ``book_type`` for
                implementations that gate on content shape).
            fmt: Export format id (e.g. "epub", "pdf", "project").
            options: Additional export options. Shape is dispatch-
                site-specific; e.g. comic-book PDF carries
                ``pages``, ``panels``, ``bubbles``, ``assets``,
                ``upload_dir``, ``output_path``,
                ``picture_book_format``, ``picture_book_bleed_marks``.

        Returns:
            Path to the generated output file, or None when the
            implementation does not handle this (book, fmt) pair.

        Wired sites (post HOOKSPEC-EXPORT-EXECUTE-WIRE-01 γ, 2026-05-23):

        - plugin-comics ``ComicsPlugin.export_execute`` handles
          ``book_type == "comic_book"`` + ``fmt == "pdf"`` and
          replaces the prior plugin-export → plugin-comics
          reverse-import in routes.py:365.

        Documented exception — audiobook stays as a direct-import
        dispatch in plugin-export's ``_run_audiobook_job``:

        - Audiobook generation is async (minutes-long), streams
          SSE progress events via ``job_store.publish_event``, and
          returns a job-result dict rather than a single Path.
          The sync ``Path | None`` signature here cannot carry
          that state. Wiring audiobook through this hook would
          require either an async signature variant or out-of-
          band global state — both larger than the
          coupling-removal value justifies today. Re-evaluate
          when a SECOND async streaming-export plugin proposes
          to register, at which point a separate hookspec
          (e.g. ``export_execute_async``) becomes the right
          shape. Until then, plugin-export ↔ plugin-audiobook
          stays directly coupled by design, NOT by oversight.
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
