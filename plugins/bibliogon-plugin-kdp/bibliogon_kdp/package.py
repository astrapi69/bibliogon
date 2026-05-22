"""KDP Publishing Wizard — package builder.

Builds the KDP-ready ZIP per the Pre-Inspection Track 6 + A4
adjudication. Layout (from A4 + adapted for Phase 1 MVP):

    {book-slug}-kdp-package.zip
      metadata.json                  # KDP-shaped book metadata
      cover.{ext}                    # the book's existing cover
      cover-validation-report.json   # KDP cover-spec check result
      manuscript-ebook.epub          # prose only
      manuscript-paperback.pdf       # all book types
      publishing-state-snapshot.json # editorial state snapshot
      README.txt                     # user-readable summary

Per A3: direct Python import from plugin-export +
plugin-comics for manuscript generation. Plugin-kdp
``depends_on=["export"]`` already; the comics import is
lazy + gated on ``book_type == "comic_book"`` so the comics
plugin can be absent without breaking the prose / picture-book
paths.

Per A5 (Phase 1 MVP): no ``BookPublishingState`` persistence
yet. The ``publishing-state-snapshot.json`` is built from
the existing ``Book`` fields only.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from .cover_validator import (
    KDP_COVER_REQUIREMENTS,
    generate_kdp_metadata,
    validate_cover,
)
from .metadata_checker import check_metadata_completeness

logger = logging.getLogger(__name__)


class KdpPackageError(Exception):
    """Raised on package-build failure with a user-readable message."""


def _slugify(text: str) -> str:
    """Minimal slug: lowercase ASCII letters/digits, hyphens between."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return slug or "book"


def _book_to_dict(book: Any) -> dict[str, Any]:
    """Serialise a Book ORM to the shape both the KDP helpers and
    the manuscript pipeline consume.

    Decodes JSON-encoded list columns (keywords / categories /
    bisac_codes) so downstream code receives ``list[str]``.
    """

    def _list_col(raw: Any) -> list[str]:
        if not raw:
            return []
        if isinstance(raw, list):
            return [str(v) for v in raw]
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, json.JSONDecodeError):
            return []
        return [str(v) for v in parsed] if isinstance(parsed, list) else []

    return {
        "id": book.id,
        "title": book.title or "",
        "subtitle": book.subtitle,
        "author": book.author or "",
        "language": book.language or "en",
        "series": book.series,
        "series_index": book.series_index,
        "description": book.description,
        "html_description": book.html_description,
        "backpage_description": book.backpage_description,
        "cover_image": book.cover_image,
        "publisher": book.publisher,
        "publish_date": book.publish_date,
        "isbn_ebook": book.isbn_ebook,
        "isbn_paperback": book.isbn_paperback,
        "asin_ebook": book.asin_ebook,
        "asin_paperback": book.asin_paperback,
        "keywords": _list_col(book.keywords),
        "categories": _list_col(book.categories),
        "bisac_codes": _list_col(book.bisac_codes),
        "ai_assisted": bool(getattr(book, "ai_assisted", False)),
        "book_type": getattr(book, "book_type", "prose"),
    }


def _chapter_to_dict(chapter: Any) -> dict[str, Any]:
    """Mirror plugin-export's ``_serialize_chapters`` shape."""
    content: Any = chapter.content
    try:
        content = json.loads(content) if content else content
    except (TypeError, json.JSONDecodeError):
        pass
    return {
        "title": chapter.title,
        "content": content,
        "position": chapter.position,
        "chapter_type": chapter.chapter_type,
    }


def _assets_for_book(book_id: str, db: Any, with_id: bool) -> list[dict[str, Any]]:
    """Mirror plugin-export's two asset-serialisation shapes."""
    from app.models import Asset

    rows = db.query(Asset).filter(Asset.book_id == book_id).all()
    if with_id:
        return [
            {"id": a.id, "filename": a.filename, "asset_type": a.asset_type, "path": a.path}
            for a in rows
        ]
    return [
        {"filename": a.filename, "asset_type": a.asset_type, "path": a.path}
        for a in rows
    ]


def _generate_prose_manuscripts(
    book_data: dict[str, Any],
    chapters: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    out_dir: Path,
) -> dict[str, Path]:
    """Generate prose epub + pdf into ``out_dir``. Returns ``{fmt: path}``.

    Uses the public ``scaffold_project`` + ``run_pandoc`` modules
    from plugin-export per A3 (direct import).
    """
    from bibliogon_export.pandoc_runner import run_pandoc
    from bibliogon_export.scaffolder import scaffold_project

    config: dict[str, Any] = {}
    try:
        import yaml

        config_path = Path("config/plugins/export.yaml")
        if config_path.exists():
            with open(config_path, encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
    except Exception:
        config = {}

    export_settings = config.get("settings", {})
    use_manual_toc = any(ch.get("chapter_type") == "toc" for ch in chapters)
    cover_path = book_data.get("cover_image")

    project_dir = scaffold_project(book_data, chapters, out_dir, export_settings, assets)
    produced: dict[str, Path] = {}
    for fmt in ("epub", "pdf"):
        try:
            output_path = run_pandoc(
                project_dir,
                fmt,
                config,
                use_manual_toc=use_manual_toc,
                cover_path=cover_path,
            )
            staged = out_dir / f"manuscript-{'ebook' if fmt == 'epub' else 'paperback'}{'.epub' if fmt == 'epub' else '.pdf'}"
            shutil.copy2(output_path, staged)
            produced[fmt] = staged
        except Exception as exc:  # noqa: BLE001
            logger.warning("Prose %s generation failed: %s", fmt, exc)
    return produced


def _generate_picture_book_manuscript(
    book_id: str,
    db: Any,
    out_dir: Path,
) -> Path | None:
    """Generate picture-book PDF via the public picture_book_pdf module."""
    from bibliogon_export.picture_book_pdf import generate_picture_book_pdf

    from app.models import Page
    from app.paths import get_upload_dir

    book_query = db.query(Page).filter(Page.book_id == book_id).order_by(Page.position.asc()).all()
    pages_data: list[dict[str, Any]] = []
    for p in book_query:
        raw_config = getattr(p, "layout_config", None)
        layout_config: dict[str, Any] | None = None
        if raw_config:
            try:
                layout_config = json.loads(raw_config)
            except (TypeError, json.JSONDecodeError):
                layout_config = {}
        pages_data.append({
            "id": p.id,
            "book_id": p.book_id,
            "position": p.position,
            "layout": p.layout,
            "text_content": p.text_content,
            "image_asset_id": p.image_asset_id,
            "layout_config": layout_config,
        })

    # Reload book through the SQLAlchemy session.
    from app.models import Book

    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        return None
    book_data = _book_to_dict(book)
    assets = _assets_for_book(book_id, db, with_id=True)

    upload_dir = get_upload_dir() / book_id
    out_path = out_dir / "manuscript-paperback.pdf"
    try:
        generate_picture_book_pdf(
            book_data=book_data,
            pages=pages_data,
            assets=assets,
            upload_dir=upload_dir,
            output_path=out_path,
        )
        return out_path
    except Exception as exc:  # noqa: BLE001
        logger.warning("Picture-book PDF generation failed: %s", exc)
        return None


def _generate_comic_book_manuscript(
    book_id: str,
    db: Any,
    out_dir: Path,
) -> Path | None:
    """Generate comic-book PDF via plugin-comics public module.

    Lazy-imported so the package builder still works when plugin-
    comics is absent (only relevant for prose / picture-book books).
    """
    try:
        from bibliogon_comics.comic_book_pdf import generate_comic_book_pdf
    except ImportError as exc:
        logger.warning("plugin-comics not available for comic-book package: %s", exc)
        return None

    from app.models import Book, Page
    from app.paths import get_upload_dir

    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        return None
    book_data = _book_to_dict(book)
    pages = db.query(Page).filter(Page.book_id == book_id).order_by(Page.position.asc()).all()
    pages_data = [
        {
            "id": p.id,
            "book_id": p.book_id,
            "position": p.position,
            "layout": p.layout,
        }
        for p in pages
    ]

    try:
        from bibliogon_comics.models import ComicBubble, ComicPanel

        panel_rows = (
            db.query(ComicPanel)
            .filter(ComicPanel.page_id.in_([p.id for p in pages]))
            .order_by(ComicPanel.position.asc())
            .all()
        )
        panels_data = [
            {"id": p.id, "page_id": p.page_id, "position": p.position}
            for p in panel_rows
        ]
        bubble_rows = (
            db.query(ComicBubble)
            .filter(ComicBubble.panel_id.in_([p.id for p in panel_rows]))
            .order_by(ComicBubble.position.asc())
            .all()
        )
        bubbles_data = [
            {"id": b.id, "panel_id": b.panel_id, "position": b.position}
            for b in bubble_rows
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("comic-book panels/bubbles load failed: %s", exc)
        panels_data, bubbles_data = [], []

    assets = _assets_for_book(book_id, db, with_id=True)
    upload_dir = get_upload_dir() / book_id
    out_path = out_dir / "manuscript-paperback.pdf"
    try:
        generate_comic_book_pdf(
            book_data=book_data,
            pages=pages_data,
            panels=panels_data,
            bubbles=bubbles_data,
            assets=assets,
            upload_dir=upload_dir,
            output_path=out_path,
        )
        return out_path
    except Exception as exc:  # noqa: BLE001
        logger.warning("Comic-book PDF generation failed: %s", exc)
        return None


def _stage_cover(book_data: dict[str, Any], out_dir: Path) -> tuple[Path | None, dict[str, Any]]:
    """Copy the cover image into ``out_dir`` and run the KDP
    cover-validator on it. Returns ``(staged_cover_path, report_dict)``.

    Cover path resolution mirrors plugin-export's lookup pattern:
    1. ``book_data["cover_image"]`` (path or filename relative to
       the book's upload dir)
    2. Fallback: nothing — no cover is a hard error on the validator
       side anyway.
    """
    from app.paths import get_upload_dir

    cover_value = book_data.get("cover_image")
    if not cover_value:
        return None, {
            "valid": False,
            "errors": ["No cover image set on the book."],
            "warnings": [],
            "info": {},
        }

    upload_dir = get_upload_dir() / book_data["id"]
    candidate = Path(cover_value)
    if not candidate.is_absolute():
        candidate = upload_dir / Path(cover_value).name
    if not candidate.exists():
        return None, {
            "valid": False,
            "errors": [f"Cover file not found at {candidate!s}"],
            "warnings": [],
            "info": {},
        }

    ext = candidate.suffix.lstrip(".").lower() or "jpg"
    staged = out_dir / f"cover.{ext}"
    try:
        shutil.copy2(candidate, staged)
    except OSError as exc:
        return None, {
            "valid": False,
            "errors": [f"Cover copy failed: {exc}"],
            "warnings": [],
            "info": {},
        }

    result = validate_cover(staged, KDP_COVER_REQUIREMENTS)
    return staged, result.to_dict()


def _build_readme(book_data: dict[str, Any], book_type: str) -> str:
    """User-readable summary of the package contents."""
    lines = [
        f"# KDP Publishing Package — {book_data.get('title', 'Untitled')}",
        "",
        f"Book ID: {book_data.get('id')}",
        f"Author: {book_data.get('author') or '(unset)'}",
        f"Language: {book_data.get('language', 'en')}",
        f"Book type: {book_type}",
        "",
        "## Contents",
        "",
        "- metadata.json — KDP-shaped book metadata. Use this when",
        "  filling in KDP's listing form.",
        "- cover.* — your book's cover image, copied as-is.",
        "- cover-validation-report.json — result of running KDP's",
        "  cover-spec checks (DPI, dimensions, format) on the cover.",
        "- manuscript-*.* — manuscript file(s) per edition.",
        "- publishing-state-snapshot.json — snapshot of the book's",
        "  editorial state at the time the package was built.",
        "",
        "## Next steps",
        "",
        "1. Review cover-validation-report.json. Fix any 'errors'",
        "   before uploading to KDP.",
        "2. Upload the matching manuscript file to KDP under the",
        "   product type you're publishing (ebook / paperback).",
        "3. Use metadata.json as a cross-check against KDP's listing",
        "   form — categories, keywords, BISAC codes, descriptions.",
        "",
        "Bibliogon does NOT upload to KDP automatically. You're",
        "the publisher of record; review every field before",
        "clicking Publish on Amazon's side.",
    ]
    return "\n".join(lines) + "\n"


def build_kdp_package(book_id: str) -> Path:
    """Build the KDP-package ZIP for ``book_id``.

    Returns the path to the produced ZIP file. The caller is
    responsible for FileResponse-streaming + tmpdir cleanup
    (FastAPI's BackgroundTasks-or-finally pattern; the surrounding
    /api/kdp/package route does this).

    Raises:
        KdpPackageError on user-facing failures (book not found,
        metadata not complete, manuscript generation failed).
    """
    from app.database import SessionLocal
    from app.models import Book

    tmp_dir = Path(tempfile.mkdtemp(prefix="kdp_package_"))
    db = SessionLocal()
    try:
        book = db.query(Book).filter(Book.id == book_id).first()
        if not book:
            raise KdpPackageError(f"Book {book_id} not found")

        book_data = _book_to_dict(book)
        book_type = book_data["book_type"]
        chapters = [_chapter_to_dict(c) for c in book.chapters]

        # Gate: metadata must pass the same completeness check the
        # wizard's Step 1 runs. Re-checking server-side prevents
        # the client gate from being bypassed (defence in depth).
        meta_check = check_metadata_completeness({
            **book_data,
            "keywords": book_data["keywords"],
            "categories": book_data["categories"],
            "bisac_codes": book_data["bisac_codes"],
            "chapters": chapters,
        })
        # BOOK-TYPES-SSOT-YAML-01 C9: page-based books don't use
        # chapters; drop the client-side filter's equivalent
        # server-side. Mirrors MetadataChecklist.filterIssues
        # ForBookType (C7) — same content_model gate.
        #
        # Lazy import + ImportError fallback for the standalone
        # plugin pytest path (same shape as plugin-getstarted's
        # registry consumption in C8).
        try:
            from app.services.book_type_registry import get_book_type

            bt_def = get_book_type(book_type)
            content_model = bt_def.content_model if bt_def else None
        except ImportError:
            content_model = (
                "chapters" if book_type == "prose" else "pages"
            )
        if content_model == "pages":
            meta_check.issues = [i for i in meta_check.issues if i.field != "chapters"]
        if not meta_check.is_complete:
            error_fields = [i.field for i in meta_check.issues if i.severity == "error"]
            raise KdpPackageError(
                "Metadata incomplete — fix these fields before exporting: "
                + ", ".join(error_fields)
            )

        manuscripts: dict[str, Path] = {}
        if book_type == "prose":
            assets = _assets_for_book(book_id, db, with_id=False)
            manuscripts = _generate_prose_manuscripts(
                book_data, chapters, assets, tmp_dir
            )
        elif book_type == "picture_book":
            path = _generate_picture_book_manuscript(book_id, db, tmp_dir)
            if path:
                manuscripts["pdf"] = path
        elif book_type == "comic_book":
            path = _generate_comic_book_manuscript(book_id, db, tmp_dir)
            if path:
                manuscripts["pdf"] = path
        else:
            raise KdpPackageError(
                f"Unsupported book_type {book_type!r}; expected one of "
                f"prose / picture_book / comic_book."
            )

        if not manuscripts:
            raise KdpPackageError(
                "Manuscript generation produced no output. Check the"
                " server log for the underlying error."
            )

        cover_path, cover_report = _stage_cover(book_data, tmp_dir)

        metadata = generate_kdp_metadata(
            book_data,
            categories=book_data["categories"],
            keywords=book_data["keywords"],
        )
        (tmp_dir / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        (tmp_dir / "cover-validation-report.json").write_text(
            json.dumps(cover_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        (tmp_dir / "publishing-state-snapshot.json").write_text(
            json.dumps(book_data, indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        (tmp_dir / "README.txt").write_text(
            _build_readme(book_data, book_type),
            encoding="utf-8",
        )

        # Build the ZIP. Filename = slugified title + "kdp-package".
        slug = _slugify(book_data["title"] or book_id)
        zip_path = tmp_dir / f"{slug}-kdp-package.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in [
                tmp_dir / "metadata.json",
                cover_path,
                tmp_dir / "cover-validation-report.json",
                *manuscripts.values(),
                tmp_dir / "publishing-state-snapshot.json",
                tmp_dir / "README.txt",
            ]:
                if entry and entry.exists():
                    zf.write(entry, entry.name)

        return zip_path
    finally:
        db.close()
