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


class DetectedGitRepo(BaseModel):
    """Metadata about a ``.git/`` directory found in an import source.

    Populated when the handler's extracted source contains an
    adoptable git repository. The wizard renders this in Step 3 so
    the user can choose between adopting the history, adopting
    history + remote, or starting fresh. None on DetectedProject
    means the source had no .git/ directory.
    """

    present: bool
    size_bytes: int = 0
    current_branch: str | None = None
    head_sha: str | None = None
    commit_count: int | None = None
    remote_url: str | None = None
    has_lfs: bool = False
    has_submodules: bool = False
    is_shallow: bool = False
    is_corrupted: bool = False
    #: Human-readable warnings from the security scan. Each entry
    #: describes a sanitization action that WILL be taken on adoption
    #: (credential helper stripped, extraheader stripped, etc.) or a
    #: caveat the user should know about (custom hooks not adopted).
    security_warnings: list[str] = Field(default_factory=list)


class DetectedProject(BaseModel):
    """Everything the handler found in the input, with no side effects yet.

    The wizard renders this directly. ``source_identifier`` drives the
    duplicate-detection check in core.

    Full parity with the ``Book`` model's import-relevant columns:
    every metadata field the BookMetadataEditor surfaces is mirrored
    here, so the wizard can show real values (not just presence
    flags) and let the user edit or deselect each one before import.
    Long-form content (description, custom_css, ...) is a nullable
    string; the wizard renders scrollable/collapsible panels when
    the content is large. ``None`` means the source did not provide
    the field; existing handlers that don't read a given field pass
    ``None`` and the wizard hides the row.
    """

    format_name: str  # e.g. "bgb" | "markdown" | "wbt-zip"
    source_identifier: str  # URL / SHA-256 / content signature

    # --- basics ---
    title: str | None = None
    subtitle: str | None = None
    author: str | None = None
    language: str | None = None

    # --- series / classification ---
    series: str | None = None
    series_index: int | None = None
    genre: str | None = None

    # --- edition / publishing ---
    description: str | None = None
    edition: str | None = None
    publisher: str | None = None
    publisher_city: str | None = None
    publish_date: str | None = None

    # --- identifiers ---
    isbn_ebook: str | None = None
    isbn_paperback: str | None = None
    isbn_hardcover: str | None = None
    asin_ebook: str | None = None
    asin_paperback: str | None = None
    asin_hardcover: str | None = None

    # --- marketing / long-form ---
    keywords: list[str] | None = None  # deserialized from Book.keywords JSON
    html_description: str | None = None
    backpage_description: str | None = None
    backpage_author_bio: str | None = None

    # --- cover + styling ---
    cover_image: str | None = None  # filename/path hint; cover asset has full details
    custom_css: str | None = None

    # --- structure (unchanged) ---
    chapters: list[DetectedChapter] = Field(default_factory=list)
    assets: list[DetectedAsset] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    #: Metadata about a .git/ directory found in the source, or None
    #: if the source has no adoptable git repository. Handlers that
    #: don't support git adoption leave this at None.
    git_repo: DetectedGitRepo | None = None
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
