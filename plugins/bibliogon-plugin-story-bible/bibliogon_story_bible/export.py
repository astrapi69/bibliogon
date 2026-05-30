"""Story Bible document export (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C12).

Builds a standalone Markdown document of a book's Story Bible -
entities grouped by type, each with its description (TipTap JSON ->
plain text) + the pages/chapters it appears on. Shareable with a
co-author, editor, or illustrator.

The pure ``build_story_bible_markdown`` function is unit-testable
without a DB; the route adapts ORM rows. PDF export is a deferred
follow-up (the Markdown is the v1 shareable artifact); the response
carries the rendered Markdown + a filename for a client-side download.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/story-bible", tags=["story-bible"])

# Entity-type display order in the document (matches the registry's
# conceptual order; unknown types append at the end).
_TYPE_ORDER = ["character", "setting", "plot_point", "item", "lore"]


def _tiptap_to_text(description: str | None) -> str:
    """Extract plain text from a TipTap JSON description string.

    Falls back to the raw string for legacy/plain descriptions. Walks
    the node tree collecting ``text`` leaves; joins block nodes with
    blank lines. Never raises - a malformed description yields "".
    """
    if not description:
        return ""
    try:
        doc = json.loads(description)
    except (ValueError, TypeError):
        return description.strip()
    if not isinstance(doc, dict):
        return ""

    parts: list[str] = []

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "text" and isinstance(node.get("text"), str):
            parts.append(node["text"])
        for child in node.get("content", []) or []:
            walk(child)
        # Paragraph/heading boundaries -> blank line separator.
        if node.get("type") in {"paragraph", "heading"}:
            parts.append("\n\n")

    walk(doc)
    text = "".join(parts)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _slug(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return s or "story-bible"


def build_story_bible_markdown(
    book_title: str,
    type_labels: dict[str, str],
    entities: list[dict[str, Any]],
    appearances_by_entity: dict[str, list[str]],
) -> str:
    """Render the Story Bible as Markdown.

    Args:
        book_title: the book's title (document H1).
        type_labels: ``{entity_type: human label}``.
        entities: ``[{"id", "entity_type", "name", "description"}, ...]``.
        appearances_by_entity: ``{entity_id: ["Page 1", "Chapter 2", ...]}``.
    """
    lines: list[str] = [f"# Story Bible: {book_title}", ""]
    types_present = [t for t in _TYPE_ORDER if any(e["entity_type"] == t for e in entities)]
    # Append any unknown types after the known order.
    for e in entities:
        if e["entity_type"] not in types_present:
            types_present.append(e["entity_type"])

    for type_id in types_present:
        members = [e for e in entities if e["entity_type"] == type_id]
        if not members:
            continue
        lines.append(f"## {type_labels.get(type_id, type_id)}")
        lines.append("")
        for entity in members:
            lines.append(f"### {entity['name']}")
            lines.append("")
            desc = _tiptap_to_text(entity.get("description"))
            if desc:
                lines.append(desc)
                lines.append("")
            appearances = appearances_by_entity.get(entity["id"], [])
            if appearances:
                lines.append(f"**Appearances:** {', '.join(appearances)}")
                lines.append("")
    return "\n".join(lines).rstrip() + "\n"


@router.get("/books/{book_id}/export")
def export_story_bible(
    book_id: str, db: Session = Depends(get_db)
) -> dict[str, str]:
    """Return the book's Story Bible as a downloadable Markdown payload
    (``{filename, content, format}``)."""
    from app.models import Book, Chapter, Page, StoryEntity, StoryEntityPageLink
    from app.services.story_entity_registry import load_story_entity_types

    book = db.query(Book).filter(Book.id == book_id).first()
    book_title = book.title if book else book_id

    entities = (
        db.query(StoryEntity)
        .filter(StoryEntity.book_id == book_id)
        .order_by(StoryEntity.entity_type.asc(), StoryEntity.position.asc())
        .all()
    )
    entity_ids = [e.id for e in entities]

    # Resolve appearances -> human labels per entity.
    page_pos = {
        p.id: p.position
        for p in db.query(Page).filter(Page.book_id == book_id).all()
    }
    chapter_titles = {
        c.id: c.title
        for c in db.query(Chapter).filter(Chapter.book_id == book_id).all()
    }
    appearances_by_entity: dict[str, list[str]] = {}
    if entity_ids:
        links = (
            db.query(StoryEntityPageLink)
            .filter(StoryEntityPageLink.entity_id.in_(entity_ids))
            .all()
        )
        for link in links:
            if link.page_id and link.page_id in page_pos:
                label = f"Page {page_pos[link.page_id]}"
            elif link.chapter_id and link.chapter_id in chapter_titles:
                label = chapter_titles[link.chapter_id]
            else:
                continue
            appearances_by_entity.setdefault(link.entity_id, []).append(label)

    type_defs = load_story_entity_types()
    # label_key -> we only have the key here; the frontend localizes,
    # but the document is standalone, so fall back to a title-cased id.
    type_labels = {tid: tid.replace("_", " ").title() for tid in type_defs}

    content = build_story_bible_markdown(
        book_title,
        type_labels,
        [
            {
                "id": e.id,
                "entity_type": e.entity_type,
                "name": e.name,
                "description": e.description,
            }
            for e in entities
        ],
        appearances_by_entity,
    )
    return {
        "filename": f"story-bible-{_slug(book_title)}.md",
        "content": content,
        "format": "markdown",
    }
