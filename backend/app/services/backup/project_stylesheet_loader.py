"""Stylesheet discovery for write-book-template project imports.

Split out of ``project_import`` (God-file split #1, 2026-06-14). Holds the
single concern of locating a user-provided CSS file anywhere in an imported
project tree. ``project_metadata_parser`` and the backfill helpers in
``project_import`` consume :func:`_read_custom_css`.
"""

import logging
from pathlib import Path

from app.services.backup.markdown_utils import read_file_if_exists

logger = logging.getLogger(__name__)


def _read_custom_css(config_dir: Path, project_root: Path) -> str | None:
    """Find a user-provided stylesheet anywhere in the project.

    Strategy (first non-empty file wins):

    1. List every file in ``config/`` and pick the first ``*.css``.
       write-book-template projects in the wild name this file in
       every possible way (``styles.css``, ``style.css``, ``custom.css``,
       ``book.css``, language-specific like ``styles-de.css``, and
       translated names such as ``stile.css``). A directory listing
       catches every one; the old hardcoded filename list missed them
       one by one.
    2. List ``assets/css/`` and ``assets/styles/`` the same way.
    3. Fall back to ``rglob("*.css")`` anywhere under ``project_root``
       (excluding ``node_modules``, ``__MACOSX``, ``.git``).

    Returns the content of the first match, or ``None`` if nothing
    turns up.
    """
    listed: list[str] = []

    for directory in (
        config_dir,
        project_root / "assets" / "css",
        project_root / "assets" / "styles",
    ):
        if not directory.is_dir():
            continue
        for entry in sorted(directory.iterdir()):
            if entry.is_file() and entry.suffix.lower() == ".css":
                listed.append(str(entry))
                content = read_file_if_exists(entry)
                if content:
                    logger.warning("custom_css: picked directory scan %s", entry)
                    return content

    for css_path in sorted(project_root.rglob("*.css")):
        if any(segment in css_path.parts for segment in ("node_modules", "__MACOSX", ".git")):
            continue
        listed.append(str(css_path))
        content = read_file_if_exists(css_path)
        if content:
            logger.warning("custom_css: picked rglob fallback %s", css_path)
            return content

    logger.warning(
        "custom_css: NO stylesheet for import. project_root=%s listed=%s",
        project_root,
        listed,
    )
    return None
