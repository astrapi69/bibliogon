"""Contract for import format handlers.

Every format that Bibliogon can import (``.bgb``, single Markdown,
write-book-template ZIP, git URL, ...) implements :class:`ImportPlugin`.

Two-phase design: :meth:`ImportPlugin.detect` is read-only, returns a
:class:`DetectedProject` for the wizard's preview panel. The user
reviews/overrides, then :meth:`ImportPlugin.execute` commits the
import in a second call.

See ``docs/explorations/core-import-orchestrator.md`` for the full
architecture.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class DetectedAsset(BaseModel):
    """A file the handler would import as a book asset."""

    filename: str
    path: str
    size_bytes: int
    mime_type: str
    purpose: str  # "cover" | "figure" | "css" | "font" | "other"


class DetectedChapter(BaseModel):
    """A chapter the handler would create during import."""

    title: str
    position: int  # 0-based
    word_count: int
    content_preview: str  # first ~200 chars of plain text


class DetectedProject(BaseModel):
    """Everything the handler found in the input, with no side effects yet.

    The wizard renders this directly. ``source_identifier`` drives the
    duplicate-detection check in core.
    """

    format_name: str  # e.g. "bgb" | "markdown" | "wbt-zip"
    source_identifier: str  # URL / SHA-256 / content signature
    title: str | None = None
    author: str | None = None
    language: str | None = None
    chapters: list[DetectedChapter] = Field(default_factory=list)
    assets: list[DetectedAsset] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    plugin_specific_data: dict = Field(default_factory=dict)


class ImportPlugin(Protocol):
    """Contract every import format handler implements.

    Implementations may be in-process core handlers under
    ``app.import_plugins.handlers.*`` or separate pluggy-discovered
    plugins. The dispatch loop treats both uniformly.
    """

    format_name: str  # stable identifier, used by priority config

    def can_handle(self, input_path: str) -> bool:
        """Quick capability check.

        MUST be side-effect-free and fast (file-extension check,
        peek at first bytes, list ZIP entries). Called once per
        registered plugin during dispatch.
        """
        ...

    def detect(self, input_path: str) -> DetectedProject:
        """Deep inspection, no side effects, no DB writes.

        Returns what WOULD be created, with warnings. Safe to
        call repeatedly.
        """
        ...

    def execute(
        self,
        input_path: str,
        detected: DetectedProject,
        overrides: dict,
        duplicate_action: str = "create",
        existing_book_id: str | None = None,
    ) -> str:
        """Commit the import. Returns the new (or replaced) book_id.

        - ``input_path``: same source as passed to ``detect``.
        - ``detected``: the :class:`DetectedProject` from ``detect``.
        - ``overrides``: dict keyed by field path
          (``"title"``, ``"assets[3].purpose"``, ...) with user-chosen
          values; unknown keys should raise.
        - ``duplicate_action``: ``"create"`` | ``"overwrite"`` | ``"cancel"``.
          If ``"overwrite"``, ``existing_book_id`` must be set and the
          plugin performs a transactional replace.
        """
        ...
