"""Archive layout discovery for extracted backup / project ZIPs."""

import zipfile
from pathlib import Path

from app.exceptions import ValidationError


def safe_extractall(zf: zipfile.ZipFile, target_dir: Path | str) -> None:
    """Extract a ZIP, refusing any member that escapes ``target_dir``.

    Guards against Zip Slip (CWE-22): a crafted archive with ``../``
    components or absolute paths can otherwise write files anywhere on
    disk via ``ZipFile.extractall``. Every member's resolved
    destination must lie inside ``target_dir``; the first offender
    aborts the whole extraction with a :class:`ValidationError` (no
    partial extraction of a malicious archive).

    Use this everywhere instead of a bare ``zf.extractall(...)``.
    """
    target = Path(target_dir).resolve()
    for member in zf.namelist():
        # ``Path.resolve`` collapses ``..`` and makes absolute members
        # absolute, so the containment check below catches both vectors.
        dest = (target / member).resolve()
        if dest != target and target not in dest.parents:
            raise ValidationError(f"Unsicherer Pfad im Archiv (Path-Traversal): '{member}'")
    zf.extractall(target)


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
