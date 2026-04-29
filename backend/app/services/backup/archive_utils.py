"""Archive layout discovery for extracted backup / project ZIPs."""

from pathlib import Path


def find_manifest(extracted: Path) -> Path | None:
    """Find ``manifest.json`` in an extracted archive (indicates backup format).

    Looks at the root and one level down (ZIPs often wrap a top-level folder).
    """
    if (extracted / "manifest.json").exists():
        return extracted / "manifest.json"
    for child in extracted.iterdir():
        if child.is_dir() and (child / "manifest.json").exists():
            return child / "manifest.json"
    return None


def find_books_dir(extracted: Path) -> Path | None:
    """Find the ``books/`` directory inside an extracted backup."""
    if (extracted / "books").is_dir():
        return extracted / "books"
    for child in extracted.iterdir():
        if child.is_dir() and (child / "books").is_dir():
            return child / "books"
    return None


def find_articles_dir(extracted: Path) -> Path | None:
    """Find the ``articles/`` directory inside an extracted backup.

    Returns ``None`` when missing - legacy backups (manifest version
    1.0) have no articles segment and the restore path treats the
    absence as "0 articles imported".
    """
    if (extracted / "articles").is_dir():
        return extracted / "articles"
    for child in extracted.iterdir():
        if child.is_dir() and (child / "articles").is_dir():
            return child / "articles"
    return None


def find_project_root(extracted: Path) -> Path | None:
    """Find the write-book-template project root (root or one level deep)."""
    if (extracted / "manuscript").is_dir():
        return extracted
    if (extracted / "config" / "metadata.yaml").exists():
        return extracted
    for child in extracted.iterdir():
        if not child.is_dir():
            continue
        if (child / "manuscript").is_dir() or (child / "config" / "metadata.yaml").exists():
            return child
    return None
