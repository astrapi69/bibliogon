"""Run Pandoc to convert Markdown to EPUB/PDF."""

import subprocess
from pathlib import Path
from typing import Any


class PandocError(Exception):
    pass


def run_pandoc(project_dir: Path, fmt: str, config: dict[str, Any]) -> Path:
    """Run Pandoc on a scaffolded project to produce EPUB or PDF.

    Args:
        project_dir: Path to the write-book-template project directory.
        fmt: Output format ("epub" or "pdf").
        config: Plugin settings dict (pandoc_path, pdf_engine, toc_depth, etc.)

    Returns:
        Path to the generated output file.
    """
    settings = config.get("settings", {})
    pandoc_path = settings.get("pandoc_path", "pandoc")
    toc_depth = settings.get("toc_depth", 2)
    pdf_engine = settings.get("pdf_engine", "xelatex")

    # Collect all chapter Markdown files in order
    chapters_dir = project_dir / "manuscript" / "chapters"
    md_files = sorted(chapters_dir.glob("*.md"))

    if not md_files:
        raise PandocError("No chapter files found for export")

    metadata_yaml = project_dir / "config" / "metadata.yaml"
    output_file = project_dir / "output" / f"book.{fmt}"
    output_file.parent.mkdir(parents=True, exist_ok=True)

    cmd: list[str] = [pandoc_path]

    # Add metadata file if it exists
    if metadata_yaml.exists():
        cmd.extend(["--metadata-file", str(metadata_yaml)])

    # Add all chapter files
    cmd.extend(str(f) for f in md_files)

    cmd.extend(["-o", str(output_file), "--standalone", "--toc", f"--toc-depth={toc_depth}"])

    if fmt == "pdf":
        cmd.append(f"--pdf-engine={pdf_engine}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise PandocError("Pandoc is not installed or not in PATH")
    except subprocess.TimeoutExpired:
        raise PandocError("Pandoc export timed out")

    if result.returncode != 0:
        raise PandocError(f"Pandoc failed: {result.stderr}")

    return output_file
