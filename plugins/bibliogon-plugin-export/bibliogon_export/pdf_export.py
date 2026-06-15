"""Picture-book + comic-book PDF export dispatch.

Branches the WeasyPrint PDF path by book type: takes the pre-loaded
page/panel data, calls the per-book-type generator, and returns a
``FileResponse``. Lazy-imports the generators so the chapter-based pipeline
stays importable when WeasyPrint's native deps are absent.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse


def _export_comic_book_pdf(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    panels: list[dict[str, Any]],
    bubbles: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    picture_book_format: str | None = None,
    picture_book_bleed_marks: bool = False,
) -> FileResponse:
    """Render a comic book to PDF and return a ``FileResponse``.

    Dispatches via the ``export_execute`` plugin hook
    (HOOKSPEC-EXPORT-EXECUTE-WIRE-01 γ, 2026-05-23). plugin-comics
    registers an ``@hookimpl`` for ``book_type == "comic_book"``
    + ``fmt == "pdf"``; plugin-export only composes the filename,
    resolves paths, and wraps the resulting Path in a FileResponse.
    The hook dispatch replaces the prior lazy ``from
    bibliogon_comics.comic_book_pdf import ...`` reverse-import.

    Filename suffix policy: same as picture-book per Q4 a (reuse
    picture-book formats + bleed flag). ``<slug>.pdf`` for default
    format + no bleed; ``-<format>`` + ``-bleed`` suffixes
    composed in the same order (format-first-then-bleed).

    Caller MUST have verified ``book_data["book_type"] ==
    "comic_book"`` and ``fmt == "pdf"`` before calling.
    """
    from app.main import manager
    from app.paths import get_upload_dir
    from bibliogon_export.picture_book_pdf import (
        DEFAULT_PICTURE_BOOK_FORMAT,
        _resolve_picture_book_format,
    )

    title = (book_data.get("title") or "comic-book").strip()
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-") or "comic-book"

    canonical_format, _w, _h = _resolve_picture_book_format(
        picture_book_format,
    )
    parts = [slug]
    if canonical_format != DEFAULT_PICTURE_BOOK_FORMAT:
        parts.append(canonical_format)
    if picture_book_bleed_marks:
        parts.append("bleed")
    filename = "-".join(parts) + ".pdf"

    upload_dir = get_upload_dir() / book_data["id"]
    tmp_dir = Path(tempfile.mkdtemp(prefix="comic_book_pdf_"))
    output_path = tmp_dir / filename

    try:
        result_path = manager.call_hook(
            "export_execute",
            firstresult=True,
            book=book_data,
            fmt="pdf",
            options={
                "pages": pages,
                "panels": panels,
                "bubbles": bubbles,
                "assets": assets,
                "upload_dir": upload_dir,
                "output_path": output_path,
                "picture_book_format": canonical_format,
                "picture_book_bleed_marks": picture_book_bleed_marks,
            },
        )
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=(f"WeasyPrint is not installed in the export plugin's environment: {e}"),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Comic-book PDF generation failed: {e}",
        ) from e

    if result_path is None:
        raise HTTPException(
            status_code=500,
            detail=(
                "No plugin handled comic-book PDF export. Is plugin-comics installed and active?"
            ),
        )

    return FileResponse(
        path=str(result_path),
        filename=filename,
        media_type="application/pdf",
    )


def _export_picture_book_pdf(
    book_data: dict[str, Any],
    pages: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    picture_book_format: str | None = None,
    picture_book_bleed_marks: bool = False,
) -> FileResponse:
    """Render a picture-book to PDF via the WeasyPrint generator
    and return a ``FileResponse``.

    Resolves ``upload_dir`` from ``app.paths.get_upload_dir()`` per
    the filesystem-isolation rule (NEVER use CWD-relative paths) +
    appends the book id to scope assets to the right directory.
    Creates a process-scoped temp dir for the output PDF; the
    FileResponse caller owns deletion semantics.

    Filename suffix policy:
    - PDF-KDP-FORMATS-01 Q7: the default ``8.5x8.5`` keeps the
      back-compat filename ``<slug>.pdf``; non-default formats
      append the format id as a suffix (``<slug>-<format>.pdf``).
    - PDF-BLEED-MARKS-01 Q4: when ``bleed=true``, append ``-bleed``
      AFTER the format suffix. Combinations:
        default + bleed=false    -> ``<slug>.pdf``
        default + bleed=true     -> ``<slug>-bleed.pdf``
        non-default + bleed=false -> ``<slug>-<format>.pdf``
        non-default + bleed=true -> ``<slug>-<format>-bleed.pdf``
      Format first, bleed flag second — nominal grouping in
      directory listings.

    Caller MUST have verified ``book_data["book_type"] ==
    "picture_book"`` and ``fmt == "pdf"`` before calling.
    """
    from app.paths import get_upload_dir

    from .picture_book_pdf import (
        DEFAULT_PICTURE_BOOK_FORMAT,
        _resolve_picture_book_format,
        generate_picture_book_pdf,
    )

    title = (book_data.get("title") or "picture-book").strip()
    # Lightweight slugifier — picture-book filenames don't need
    # manuscripta's print-edition suffix (book_type query param)
    # because the print-edition concept doesn't apply here. Same
    # ASCII-fold + hyphen-collapse pattern manuscripta uses.
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-") or "picture-book"

    canonical_format, _w, _h = _resolve_picture_book_format(
        picture_book_format,
    )
    parts = [slug]
    if canonical_format != DEFAULT_PICTURE_BOOK_FORMAT:
        parts.append(canonical_format)
    if picture_book_bleed_marks:
        parts.append("bleed")
    filename = "-".join(parts) + ".pdf"

    upload_dir = get_upload_dir() / book_data["id"]
    tmp_dir = Path(tempfile.mkdtemp(prefix="picture_book_pdf_"))
    output_path = tmp_dir / filename

    try:
        generate_picture_book_pdf(
            book_data=book_data,
            pages=pages,
            assets=assets,
            upload_dir=upload_dir,
            output_path=output_path,
            picture_book_format=canonical_format,
            picture_book_bleed_marks=picture_book_bleed_marks,
        )
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=(f"WeasyPrint is not installed in the export plugin's environment: {e}"),
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Picture-book PDF generation failed: {e}",
        ) from e

    return FileResponse(
        path=str(output_path),
        filename=filename,
        media_type="application/pdf",
    )
