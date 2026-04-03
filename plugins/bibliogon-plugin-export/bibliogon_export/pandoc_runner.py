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


def run_pandoc(
    project_dir: Path,
    fmt: str,
    config: dict[str, Any],
    use_manual_toc: bool = False,
    cover_path: str | None = None,
) -> Path:
    """Export a scaffolded project to EPUB, PDF, or other formats via manuscripta.

    Args:
        project_dir: Path to the manuscripta-compatible project directory.
        fmt: Output format ("epub", "pdf", "docx", "html", "markdown").
        config: Plugin settings dict (toc_depth, etc.)
        use_manual_toc: If True, use the manual TOC chapter instead of auto-generating.

    Returns:
        Path to the generated output file.
    """
    settings = config.get("settings", {})
    toc_depth = settings.get("toc_depth", 2)

    # manuscripta expects to run from the project directory
    original_cwd = os.getcwd()
    try:
        os.chdir(str(project_dir))

        # Read section_order and output_file from scaffolded export-settings.yaml
        import yaml
        export_settings_path = project_dir / "config" / "export-settings.yaml"
        export_cfg: dict = {}
        if export_settings_path.exists():
            with open(export_settings_path, "r", encoding="utf-8") as f:
                export_cfg = yaml.safe_load(f) or {}

        book_type = BookType.EBOOK
        so = export_cfg.get("section_order", {})
        section_order = so.get("ebook", None) or pick_section_order(book_type, fmt)

        # Filter out missing files from section_order (e.g. appendix.md if not in project)
        filtered_order = []
        for entry in section_order:
            if entry == "chapters":
                filtered_order.append(entry)
            else:
                entry_path = Path("manuscript") / entry
                if entry_path.exists():
                    filtered_order.append(entry)
        section_order = filtered_order

        # Set manuscripta's global OUTPUT_FILE (normally set by CLI)
        import manuscripta.export.book as _mbook
        export_defaults = export_cfg.get("export_defaults", {})
        output_file = export_defaults.get("output_file", project_dir.name)
        type_suffix = settings.get("type_suffix_in_filename", True)
        if type_suffix:
            _mbook.OUTPUT_FILE = f"{output_file}_{book_type.value}"
        else:
            _mbook.OUTPUT_FILE = output_file

        # Resolve cover path relative to project directory
        resolved_cover = None
        if cover_path:
            cp = Path(cover_path)
            if cp.is_absolute() and cp.exists():
                resolved_cover = str(cp)
            elif (project_dir / cover_path).exists():
                resolved_cover = str(project_dir / cover_path)
            # Also check assets/covers/
            if not resolved_cover:
                for ext in ("png", "jpg", "jpeg"):
                    candidate = project_dir / "assets" / "covers" / f"cover.{ext}"
                    if candidate.exists():
                        resolved_cover = str(candidate)
                        break

        compile_book(
            format=fmt,
            section_order=section_order,
            book_type=book_type,
            cover_path=resolved_cover,
            toc_depth=toc_depth,
            use_manual_toc=use_manual_toc,
        )
    except Exception as e:
        raise PandocError(f"Export failed: {e}")
    finally:
        os.chdir(original_cwd)

    # Find the output file
    output_dir = project_dir / "output"
    ext_map = {"epub": "epub", "pdf": "pdf", "docx": "docx", "html": "html", "markdown": "md"}
    ext = ext_map.get(fmt, fmt)

    output_files = list(output_dir.glob(f"*.{ext}"))
    if not output_files:
        raise PandocError(f"No output file found for format '{fmt}'")

    return output_files[0]
