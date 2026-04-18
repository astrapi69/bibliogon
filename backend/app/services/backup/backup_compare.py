"""Compare two .bgb backup files without persisting anything.

This is a stop-gap for ROADMAP V-02 until the Git-based Sicherung feature
lands. It reads two uploaded .bgb archives, extracts their book + chapter
JSONs into memory, and returns a per-chapter diff plus a metadata summary.
No data touches the database.
"""

import difflib
import html
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from app.services.backup.archive_utils import find_books_dir, find_manifest

# --- Public entry point ---


def compare_backups(file_a: UploadFile, file_b: UploadFile) -> dict[str, Any]:
    """Compare two .bgb archives.

    Both files must contain at least one common book (matched by id).
    Returns a structured diff with per-book and per-chapter sections plus
    a metadata-level summary of Book field changes.
    """
    _validate_filename(file_a.filename, label="A")
    _validate_filename(file_b.filename, label="B")

    tmp_root = Path(tempfile.mkdtemp(prefix="bibliogon_compare_"))
    try:
        dir_a = _extract_upload(file_a, tmp_root / "a", label="A")
        dir_b = _extract_upload(file_b, tmp_root / "b", label="B")

        books_a = _load_books(dir_a)
        books_b = _load_books(dir_b)

        common_ids = sorted(books_a.keys() & books_b.keys())
        only_in_a = sorted(books_a.keys() - books_b.keys())
        only_in_b = sorted(books_b.keys() - books_a.keys())

        if not common_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Die beiden Backups enthalten keine gemeinsamen Buecher. "
                    "Ein Vergleich ist nur moeglich wenn dasselbe Buch in beiden "
                    "Dateien vorkommt."
                ),
            )

        books_diff = [_diff_book(books_a[bid], books_b[bid]) for bid in common_ids]

        return {
            "summary": {
                "books_in_both": len(common_ids),
                "books_only_in_a": only_in_a,
                "books_only_in_b": only_in_b,
                "filename_a": file_a.filename,
                "filename_b": file_b.filename,
            },
            "books": books_diff,
        }
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


# --- Validation + extraction ---


def _validate_filename(filename: str | None, label: str) -> None:
    if not filename:
        raise HTTPException(status_code=400, detail=f"Backup {label}: keine Datei hochgeladen")
    if not filename.endswith(".bgb"):
        raise HTTPException(
            status_code=400,
            detail=f"Backup {label}: Datei muss eine .bgb-Datei sein (erhalten: {filename})",
        )


def _extract_upload(file: UploadFile, dest: Path, label: str) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    zip_path = dest / "backup.bgb"
    with open(zip_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    extracted = dest / "extracted"
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extracted)
    except zipfile.BadZipFile as e:
        raise HTTPException(
            status_code=400,
            detail=f"Backup {label}: Datei ist beschaedigt und kann nicht gelesen werden",
        ) from e

    manifest = find_manifest(extracted)
    if manifest:
        manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
        if manifest_data.get("format") != "bibliogon-backup":
            raise HTTPException(
                status_code=400,
                detail=f"Backup {label}: kein gueltiges Bibliogon-Backup-Format",
            )

    books_dir = find_books_dir(extracted)
    if not books_dir:
        raise HTTPException(
            status_code=400,
            detail=f"Backup {label}: kein 'books'-Verzeichnis gefunden",
        )
    return books_dir


def _load_books(books_dir: Path) -> dict[str, dict[str, Any]]:
    """Read every book in ``books_dir`` into a dict keyed by book id."""
    result: dict[str, dict[str, Any]] = {}
    for book_dir in sorted(books_dir.iterdir()):
        if not book_dir.is_dir():
            continue
        book_json = book_dir / "book.json"
        if not book_json.exists():
            continue
        book_data = json.loads(book_json.read_text(encoding="utf-8"))
        book_data["_chapters"] = _load_chapters(book_dir / "chapters")
        result[book_data["id"]] = book_data
    return result


def _load_chapters(chapters_dir: Path) -> list[dict[str, Any]]:
    if not chapters_dir.exists():
        return []
    chapters: list[dict[str, Any]] = []
    for ch_file in sorted(chapters_dir.glob("*.json")):
        chapters.append(json.loads(ch_file.read_text(encoding="utf-8")))
    chapters.sort(key=lambda c: c.get("position", 0))
    return chapters


# --- Diff logic ---


# Book fields worth surfacing as a metadata-level diff. Internal bookkeeping
# (timestamps, ids) and large derived blobs (html_description, custom_css)
# are skipped: they're either noise or better viewed in a chapter diff.
_BOOK_METADATA_FIELDS: tuple[str, ...] = (
    "title", "subtitle", "author", "language",
    "series", "series_index", "description", "genre",
    "edition", "publisher", "publisher_city", "publish_date",
    "isbn_ebook", "isbn_paperback", "isbn_hardcover",
    "asin_ebook", "asin_paperback", "asin_hardcover",
    "keywords", "backpage_description", "backpage_author_bio",
    "cover_image", "ai_assisted",
    "tts_engine", "tts_voice", "tts_language", "tts_speed",
    "audiobook_merge", "audiobook_filename",
    "ms_tools_max_sentence_length",
    "ms_tools_repetition_window",
    "ms_tools_max_filler_ratio",
)


def _diff_book(book_a: dict[str, Any], book_b: dict[str, Any]) -> dict[str, Any]:
    metadata_changes = _diff_metadata(book_a, book_b)

    chapters_a = {c["id"]: c for c in book_a.get("_chapters", [])}
    chapters_b = {c["id"]: c for c in book_b.get("_chapters", [])}

    added_ids = sorted(chapters_b.keys() - chapters_a.keys())
    removed_ids = sorted(chapters_a.keys() - chapters_b.keys())
    common_ids = chapters_a.keys() & chapters_b.keys()

    chapter_diffs: list[dict[str, Any]] = []
    for cid in removed_ids:
        chapter_diffs.append(_chapter_change(chapters_a[cid], None, "removed"))
    for cid in added_ids:
        chapter_diffs.append(_chapter_change(None, chapters_b[cid], "added"))
    for cid in common_ids:
        diff = _chapter_change(chapters_a[cid], chapters_b[cid], "changed")
        if diff["has_changes"]:
            chapter_diffs.append(diff)

    chapter_diffs.sort(key=lambda d: (d["position"], d["chapter_id"]))

    return {
        "book_id": book_a["id"],
        "title_a": book_a.get("title"),
        "title_b": book_b.get("title"),
        "metadata_changes": metadata_changes,
        "chapter_count_a": len(chapters_a),
        "chapter_count_b": len(chapters_b),
        "chapters": chapter_diffs,
    }


def _diff_metadata(
    book_a: dict[str, Any],
    book_b: dict[str, Any],
) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for field in _BOOK_METADATA_FIELDS:
        value_a = book_a.get(field)
        value_b = book_b.get(field)
        if value_a != value_b:
            changes.append({"field": field, "before": value_a, "after": value_b})
    return changes


def _chapter_change(
    chapter_a: dict[str, Any] | None,
    chapter_b: dict[str, Any] | None,
    change_type: str,
) -> dict[str, Any]:
    """Build one chapter entry. ``change_type`` is added/removed/changed."""
    reference = chapter_b or chapter_a or {}
    plain_a = _chapter_plain_text(chapter_a) if chapter_a else ""
    plain_b = _chapter_plain_text(chapter_b) if chapter_b else ""

    title_a = chapter_a.get("title") if chapter_a else None
    title_b = chapter_b.get("title") if chapter_b else None
    type_a = chapter_a.get("chapter_type") if chapter_a else None
    type_b = chapter_b.get("chapter_type") if chapter_b else None

    lines = _line_diff(plain_a, plain_b)
    has_text_changes = any(line["type"] != "unchanged" for line in lines)
    title_changed = chapter_a is not None and chapter_b is not None and title_a != title_b
    type_changed = chapter_a is not None and chapter_b is not None and type_a != type_b

    return {
        "chapter_id": reference.get("id", ""),
        "position": reference.get("position", 0),
        "change_type": change_type,
        "title_a": title_a,
        "title_b": title_b,
        "chapter_type_a": type_a,
        "chapter_type_b": type_b,
        "title_changed": title_changed,
        "type_changed": type_changed,
        "lines": lines,
        "has_changes": change_type != "changed" or has_text_changes or title_changed or type_changed,
    }


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_BLOCK_CLOSE_RE = re.compile(r"</(p|h[1-6]|li|blockquote|div)>", re.IGNORECASE)


def _chapter_plain_text(chapter: dict[str, Any]) -> str:
    """Extract reasonably line-broken plain text from chapter content.

    Backups store the TipTap content as HTML. We insert newlines after
    block-level closing tags, strip all tags, decode entities, then collapse
    runs of whitespace on each line. This produces a line-oriented text
    stream that difflib can work with meaningfully.
    """
    raw = chapter.get("content") or ""
    if not isinstance(raw, str):
        return ""
    with_breaks = _BLOCK_CLOSE_RE.sub(lambda m: m.group(0) + "\n", raw)
    without_tags = _TAG_RE.sub("", with_breaks)
    unescaped = html.unescape(without_tags)
    lines = [_WS_RE.sub(" ", line).strip() for line in unescaped.split("\n")]
    return "\n".join(line for line in lines if line)


def _line_diff(text_a: str, text_b: str) -> list[dict[str, Any]]:
    """Produce a line-oriented diff using difflib.ndiff.

    Each entry is ``{type, text}`` with type in {unchanged, added, removed}.
    Matches the shape used by the ms-tools sanitize/preview endpoint so the
    frontend can reuse its rendering pattern.
    """
    lines_a = text_a.splitlines()
    lines_b = text_b.splitlines()
    result: list[dict[str, Any]] = []
    for entry in difflib.ndiff(lines_a, lines_b):
        prefix = entry[:2]
        text = entry[2:]
        if prefix == "  ":
            result.append({"type": "unchanged", "text": text})
        elif prefix == "+ ":
            result.append({"type": "added", "text": text})
        elif prefix == "- ":
            result.append({"type": "removed", "text": text})
        # '? ' hints from ndiff are skipped; they're not line content.
    return result
