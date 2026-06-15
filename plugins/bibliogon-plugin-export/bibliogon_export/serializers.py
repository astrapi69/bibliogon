"""ORM-to-dict serializers for the export pipeline.

Pure functions that turn Book / Chapter / Page / ComicPanel / ComicBubble
ORM rows into the plain-dict shapes the rendering pipeline consumes. No DB
access, no HTTP, no globals.
"""

from __future__ import annotations

import json
from typing import Any


def _serialize_comic_panel(panel: Any) -> dict[str, Any]:
    """Serialize a ComicPanel ORM row to a dict matching the
    ``ComicPanelOut`` schema. JSON-as-Text columns (``bounds`` +
    ``panel_config``) decoded on read; malformed JSON degrades to
    an empty dict (defensive against future hand-edited rows).
    """
    raw_bounds = getattr(panel, "bounds", None) or ""
    try:
        bounds = json.loads(raw_bounds) if raw_bounds else {}
    except (json.JSONDecodeError, TypeError):
        bounds = {}
    raw_config = getattr(panel, "panel_config", None)
    panel_config: dict[str, Any] | None
    if raw_config:
        try:
            panel_config = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            panel_config = {}
    else:
        panel_config = None
    return {
        "id": panel.id,
        "page_id": panel.page_id,
        "position": panel.position,
        "image_asset_id": panel.image_asset_id,
        "bounds": bounds if isinstance(bounds, dict) else {},
        "panel_config": panel_config,
    }


def _serialize_comic_bubble(bubble: Any) -> dict[str, Any]:
    """Serialize a ComicBubble ORM row to a dict matching the
    ``ComicBubbleOut`` schema. Tail fields are sibling columns
    (NOT inside bubble_config); ``anchor`` + ``bubble_config`` are
    JSON-as-Text, decoded on read.
    """
    raw_anchor = getattr(bubble, "anchor", None) or ""
    try:
        anchor = json.loads(raw_anchor) if raw_anchor else {}
    except (json.JSONDecodeError, TypeError):
        anchor = {}
    raw_config = getattr(bubble, "bubble_config", None)
    bubble_config: dict[str, Any] | None
    if raw_config:
        try:
            bubble_config = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            bubble_config = {}
    else:
        bubble_config = None
    return {
        "id": bubble.id,
        "panel_id": bubble.panel_id,
        "position": bubble.position,
        "bubble_type": bubble.bubble_type,
        "anchor": anchor if isinstance(anchor, dict) else {},
        "width_pct": bubble.width_pct,
        "height_pct": bubble.height_pct,
        "tail_direction": bubble.tail_direction,
        "tail_position_pct": bubble.tail_position_pct,
        "tail_length_px": bubble.tail_length_px,
        "bubble_config": bubble_config,
        "text_content": bubble.text_content,
    }


def _serialize_page(page: Any) -> dict[str, Any]:
    """Serialize a Page ORM object to the PageOut-shaped dict the
    WeasyPrint generator consumes.

    Decodes ``layout_config`` from its JSON-encoded Text-column form
    to a parsed dict before returning. The generator at
    ``picture_book_pdf.generate_picture_book_pdf`` expects the
    parsed shape (anchor_position / opacity / image_position / etc.
    as keys, not as a JSON string). Malformed JSON degrades to an
    empty dict — defensive against legacy rows from the
    speech_bubble_config -> layout_config rename in Session 4c.
    """
    raw_config = getattr(page, "layout_config", None)
    layout_config: dict[str, Any] | None
    if raw_config:
        try:
            layout_config = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            layout_config = {}
    else:
        layout_config = None
    return {
        "id": page.id,
        "book_id": page.book_id,
        "position": page.position,
        "layout": page.layout,
        "text_content": page.text_content,
        "image_asset_id": page.image_asset_id,
        "layout_config": layout_config,
    }


def _serialize_book(book: Any) -> dict[str, Any]:
    """Serialize a Book ORM object to a dict."""
    return {
        "id": book.id,
        "title": book.title,
        "subtitle": book.subtitle,
        "author": book.author,
        "language": book.language,
        "series": book.series,
        "series_index": book.series_index,
        "description": book.description,
        "cover_image": book.cover_image,
        "custom_css": book.custom_css,
        "ai_assisted": getattr(book, "ai_assisted", False),
        "tts_engine": getattr(book, "tts_engine", None),
        "tts_voice": getattr(book, "tts_voice", None),
        "tts_language": getattr(book, "tts_language", None),
        "tts_speed": getattr(book, "tts_speed", None),
        "audiobook_overwrite_existing": bool(getattr(book, "audiobook_overwrite_existing", False)),
        "audiobook_skip_chapter_types": _decode_skip_chapter_types(
            getattr(book, "audiobook_skip_chapter_types", None)
        ),
        # PB-PHASE4 Session 6: surface the content discriminator
        # for export-route dispatch. NAMING COLLISION WARNING:
        # this `book_type` is Bibliogon's CONTENT discriminator
        # (prose | picture_book | future comic_book). The export
        # route's same-named query parameter `book_type` is
        # manuscripta's PRINT-EDITION concept (ebook | paperback
        # | hardcover | audiobook). Different namespaces, same
        # name. Disambiguate by source: model field = content;
        # query param = print edition.
        "book_type": getattr(book, "book_type", "prose"),
    }


def _decode_skip_chapter_types(raw: Any) -> list[str]:
    """Decode the JSON-encoded ``audiobook_skip_chapter_types`` Text column.

    Returns an empty list when the column is unset, empty, or malformed
    so the export pipeline can simply ``len(...)`` to decide whether to
    apply a per-book filter or fall back to the generator's built-in
    SKIP_TYPES default.
    """
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(v) for v in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [str(v) for v in parsed]
    return []


def _serialize_chapters(chapters: list) -> list[dict[str, Any]]:
    """Serialize chapter ORM objects to dicts."""
    result = []
    for ch in sorted(chapters, key=lambda c: c.position):
        content = ch.content
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            pass
        result.append(
            {
                "title": ch.title,
                "content": content,
                "position": ch.position,
                "chapter_type": ch.chapter_type,
            }
        )
    return result
