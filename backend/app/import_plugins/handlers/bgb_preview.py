"""BGB blob -> detection-preview helpers.

Extracted from ``import_plugins/handlers/bgb.py`` (God-file split #13,
2026-06-14). Pure functions turning a book blob into the protocol's
DetectedChapter / DetectedAsset previews.
"""

from app.import_plugins.protocol import DetectedAsset, DetectedChapter


def _detected_chapters(book_blob: dict) -> list[DetectedChapter]:
    return [
        DetectedChapter(
            title=ch.get("title", "Untitled"),
            position=int(ch.get("position", idx)),
            word_count=_word_count(ch.get("content", "")),
            content_preview=_preview_of(ch.get("content", "")),
        )
        for idx, ch in enumerate(book_blob.get("chapters", []) or [])
    ]


def _detected_assets(book_blob: dict) -> list[DetectedAsset]:
    return [
        DetectedAsset(
            filename=a.get("filename", ""),
            path=a.get("path", a.get("filename", "")),
            size_bytes=int(a.get("size_bytes", 0)),
            mime_type=a.get("mime_type", "application/octet-stream"),
            purpose=a.get("asset_type", "other"),
        )
        for a in book_blob.get("assets", []) or []
    ]


def _word_count(content: str) -> int:
    if not content:
        return 0
    return len(content.split())


def _preview_of(content: str) -> str:
    return (content or "")[:200]
