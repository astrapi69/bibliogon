import subprocess
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from app.models import Book


class ExportError(Exception):
    pass


def _book_to_markdown(book: Book) -> str:
    """Convert a book with its chapters to a single Markdown string."""
    lines: list[str] = []
    lines.append(f"---")
    lines.append(f"title: \"{book.title}\"")
    if book.subtitle:
        lines.append(f"subtitle: \"{book.subtitle}\"")
    lines.append(f"author: \"{book.author}\"")
    lines.append(f"lang: {book.language}")
    lines.append(f"---")
    lines.append("")

    for chapter in book.chapters:
        lines.append(f"# {chapter.title}")
        lines.append("")
        lines.append(chapter.content)
        lines.append("")

    return "\n".join(lines)


def export_book(
    db: Session,
    book_id: str,
    fmt: str = "epub",
) -> Path:
    """
    Export a book as EPUB or PDF via Pandoc.

    Returns the path to the generated file.
    """
    if fmt not in ("epub", "pdf"):
        raise ExportError(f"Unsupported format: {fmt}")

    book = (
        db.query(Book)
        .options(joinedload(Book.chapters))
        .filter(Book.id == book_id)
        .first()
    )
    if not book:
        raise ExportError("Book not found")

    markdown = _book_to_markdown(book)

    tmp_dir = Path(tempfile.mkdtemp(prefix="bibliogon_"))
    input_file = tmp_dir / "book.md"
    output_file = tmp_dir / f"book.{fmt}"

    input_file.write_text(markdown, encoding="utf-8")

    cmd = [
        "pandoc",
        str(input_file),
        "-o",
        str(output_file),
        "--standalone",
    ]

    if fmt == "epub":
        cmd.extend(["--toc", "--toc-depth=2"])
    elif fmt == "pdf":
        cmd.extend(["--pdf-engine=xelatex", "--toc"])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        raise ExportError("Pandoc is not installed or not in PATH")
    except subprocess.TimeoutExpired:
        raise ExportError("Pandoc export timed out")

    if result.returncode != 0:
        raise ExportError(f"Pandoc failed: {result.stderr}")

    return output_file
