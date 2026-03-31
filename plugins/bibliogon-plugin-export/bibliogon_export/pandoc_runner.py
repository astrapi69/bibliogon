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

        book_type = BookType.EBOOK
        section_order = pick_section_order(book_type, fmt)

        compile_book(
            format=fmt,
            section_order=section_order,
            book_type=book_type,
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
