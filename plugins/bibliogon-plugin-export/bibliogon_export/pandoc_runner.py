"""Run book export via manuscripta's compile_book.

Delegates the actual Pandoc invocation to manuscripta, which handles
section ordering, metadata, cover images, TOC generation, and format-specific
flags (EPUB/PDF/DOCX/HTML/Markdown).
"""

import os
from pathlib import Path
from typing import Any

from manuscripta.enums.book_type import BookType
from manuscripta.export.book import compile_book, pick_section_order


class PandocError(Exception):
    pass


_OUTPUT_EXTENSIONS = {"epub": "epub", "pdf": "pdf", "docx": "docx", "html": "html", "markdown": "md"}


def run_pandoc(
    project_dir: Path,
    fmt: str,
    config: dict[str, Any],
    use_manual_toc: bool = False,
    cover_path: str | None = None,
) -> Path:
    """Export a scaffolded project to EPUB/PDF/DOCX/HTML/Markdown via manuscripta.

    Args:
        project_dir: Path to the manuscripta-compatible project directory.
        fmt: Output format ("epub", "pdf", "docx", "html", "markdown").
        config: Plugin settings dict (toc_depth, type_suffix_in_filename, ...).
        use_manual_toc: If True, use the manual TOC chapter instead of
            auto-generating one.
        cover_path: Optional explicit cover path; ``None`` falls back to
            ``assets/covers/cover.{png,jpg,jpeg}``.

    Returns:
        Path to the generated output file.
    """
    settings = config.get("settings", {})
    book_type = BookType.EBOOK

    original_cwd = os.getcwd()
    try:
        os.chdir(str(project_dir))
        export_cfg = _read_export_settings(project_dir)
        section_order = _resolve_section_order(export_cfg, book_type, fmt)
        _set_manuscripta_output_file(export_cfg, settings, book_type, project_dir.name)
        resolved_cover = _resolve_cover_path(project_dir, cover_path)

        compile_book(
            format=fmt,
            section_order=section_order,
            book_type=book_type,
            cover_path=resolved_cover,
            toc_depth=settings.get("toc_depth", 2),
            use_manual_toc=use_manual_toc,
        )
    except Exception as e:
        raise PandocError(f"Export failed: {e}")
    finally:
        os.chdir(original_cwd)

    output = _find_output_file(project_dir, fmt)
    if fmt == "epub":
        _run_epubcheck(output)
    return output


# --- run_pandoc step helpers ---


def _read_export_settings(project_dir: Path) -> dict[str, Any]:
    """Load ``config/export-settings.yaml`` from the scaffolded project."""
    import yaml
    path = project_dir / "config" / "export-settings.yaml"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _resolve_section_order(
    export_cfg: dict[str, Any],
    book_type: BookType,
    fmt: str,
) -> list[str]:
    """Pick a section order and drop entries whose .md file doesn't exist."""
    so = export_cfg.get("section_order", {})
    section_order = so.get("ebook", None) or pick_section_order(book_type, fmt)
    filtered: list[str] = []
    for entry in section_order:
        if entry == "chapters":
            filtered.append(entry)
            continue
        if (Path("manuscript") / entry).exists():
            filtered.append(entry)
    return filtered


def _set_manuscripta_output_file(
    export_cfg: dict[str, Any],
    settings: dict[str, Any],
    book_type: BookType,
    fallback_name: str,
) -> None:
    """Mutate manuscripta's module-global OUTPUT_FILE (normally set by its CLI)."""
    import manuscripta.export.book as _mbook
    export_defaults = export_cfg.get("export_defaults", {})
    output_file = export_defaults.get("output_file", fallback_name)
    if settings.get("type_suffix_in_filename", True):
        _mbook.OUTPUT_FILE = f"{output_file}_{book_type.value}"
    else:
        _mbook.OUTPUT_FILE = output_file


def _resolve_cover_path(project_dir: Path, cover_path: str | None) -> str | None:
    """Resolve an explicit cover path, then fall back to ``assets/covers/cover.*``."""
    if cover_path:
        cp = Path(cover_path)
        if cp.is_absolute() and cp.exists():
            return str(cp)
        if (project_dir / cover_path).exists():
            return str(project_dir / cover_path)
    for ext in ("png", "jpg", "jpeg"):
        candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
        if candidate.exists():
            return str(candidate)
    return None


def _find_output_file(project_dir: Path, fmt: str) -> Path:
    """Locate the file manuscripta wrote in ``output/``."""
    ext = _OUTPUT_EXTENSIONS.get(fmt, fmt)
    output_files = list((project_dir / "output").glob(f"*.{ext}"))
    if not output_files:
        raise PandocError(f"No output file found for format '{fmt}'")
    return output_files[0]


def _run_epubcheck(epub_path: Path) -> None:
    """Run epubcheck on an EPUB file and log results. Non-blocking."""
    import logging
    import shutil
    import subprocess

    logger = logging.getLogger(__name__)

    epubcheck_bin = shutil.which("epubcheck")
    if not epubcheck_bin:
        logger.info("epubcheck not found, skipping validation")
        return

    try:
        result = subprocess.run(
            [epubcheck_bin, str(epub_path)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            logger.info("epubcheck: EPUB is valid (%s)", epub_path.name)
            print(f"epubcheck: EPUB is valid ({epub_path.name})")
        else:
            # Parse warnings and errors from stderr
            errors = []
            warnings = []
            for line in result.stderr.splitlines():
                if "ERROR" in line:
                    errors.append(line.strip())
                elif "WARNING" in line:
                    warnings.append(line.strip())

            if errors:
                logger.warning("epubcheck: %d errors in %s", len(errors), epub_path.name)
                for e in errors[:5]:
                    logger.warning("  %s", e)
            if warnings:
                logger.info("epubcheck: %d warnings in %s", len(warnings), epub_path.name)

            print(f"epubcheck: {len(errors)} errors, {len(warnings)} warnings ({epub_path.name})")

            # Store results as JSON next to the EPUB
            import json
            results_path = epub_path.with_suffix(".epubcheck.json")
            results_path.write_text(json.dumps({
                "valid": result.returncode == 0,
                "errors": errors,
                "warnings": warnings,
                "error_count": len(errors),
                "warning_count": len(warnings),
            }, indent=2), encoding="utf-8")

    except subprocess.TimeoutExpired:
        logger.warning("epubcheck timed out for %s", epub_path.name)
    except Exception as e:
        logger.warning("epubcheck failed: %s", e)
