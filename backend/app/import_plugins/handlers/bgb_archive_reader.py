"""BGB archive reading + manifest/blob helpers.

Extracted from ``import_plugins/handlers/bgb.py`` (God-file split #13,
2026-06-14). Pure parsing of a .bgb ZIP: manifest validation, book-blob
extraction, counts, keyword decoding, file hashing. No DB, no session.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path


def _parse_keywords_field(raw: object) -> list[str] | None:
    """Book.keywords is serialized as a JSON string in the .bgb blob;
    older backups may serialize as a list directly. Accept both and
    return a list[str] for the preview panel's chip renderer."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return [str(k) for k in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw) if raw.strip() else None
        except (ValueError, TypeError):
            return [raw] if raw.strip() else None
        if isinstance(parsed, list):
            return [str(k) for k in parsed]
        if parsed is not None:
            return [str(parsed)]
    return None


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _validate_manifest(zf: zipfile.ZipFile, warnings: list[str]) -> None:
    names = zf.namelist()
    manifest_name = next((n for n in names if n.endswith("manifest.json")), None)
    if manifest_name is None:
        warnings.append("No manifest.json found; file may not be a Bibliogon backup.")
        return
    try:
        data = json.loads(zf.read(manifest_name).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        warnings.append("manifest.json is not valid JSON.")
        return
    if data.get("format") != "bibliogon-backup":
        warnings.append(
            f"Unexpected manifest format: {data.get('format')!r} (expected bibliogon-backup)."
        )


def _book_blobs(zf: zipfile.ZipFile) -> list[dict]:
    out: list[dict] = []
    for name in zf.namelist():
        if name.endswith("/book.json"):
            try:
                out.append(json.loads(zf.read(name).decode("utf-8")))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
    return out


def _article_count(zf: zipfile.ZipFile) -> int:
    """Count restorable articles in the archive.

    A .bgb produced by ``backup_export.export_backup_archive`` writes
    one ``article.json`` per article under ``articles/<id>/``.
    Manifest version 1.0 backups have none. Version 2.0+ may have
    zero, some, or all of the install's articles.
    """
    return sum(1 for n in zf.namelist() if n.endswith("/article.json"))


def _first_book_blob(zf: zipfile.ZipFile, warnings: list[str]) -> dict | None:
    blobs = _book_blobs(zf)
    if not blobs:
        warnings.append("No book.json inside the backup.")
        return None
    if len(blobs) > 1:
        warnings.append(f"Backup contains {len(blobs)} books; preview reflects the first one only.")
    return blobs[0]


def _book_count(path: Path) -> int:
    with zipfile.ZipFile(path, "r") as zf:
        return sum(1 for n in zf.namelist() if n.endswith("/book.json"))
