"""Auto-detect Story Bible entity mentions in chapter / page text
(STORY-BIBLE C14).

Scans a book's chapters (TipTap JSON content) and pages (text_content)
for occurrences of each entity's name and proposes a link wherever a
name occurs but no StoryEntityPageLink exists yet.

Conservative by design (the Stop-Condition: false positives erode
trust):

- Exact name match only, case-insensitive, on word boundaries
  (``\bname\b``) so "Al" doesn't match inside "Alice".
- Names shorter than ``MIN_NAME_LEN`` chars are skipped (1-2 char
  names like initials produce noise).
- Only UNLINKED (entity, page/chapter) pairs are proposed; existing
  links are excluded.

The detector returns proposals; creating the links is the caller's
choice (the frontend "auto-link" button POSTs each via the existing
create-link endpoint).
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models import Chapter, Page, StoryEntity, StoryEntityPageLink

#: Names shorter than this are skipped to avoid noise (initials, "I").
MIN_NAME_LEN = 3


def _tiptap_to_text(content: str | None) -> str:
    """Flatten a TipTap JSON document, HTML, or plain text to plain
    text. Never raises.

    An imported chapter is HTML until someone opens and saves it
    (#787). Passing the raw markup straight to the word-boundary
    matcher below produced two failures on real content (#806): a
    multi-word entity name split across two adjacent inline tags
    (``<em>Frau</em> <strong>Mueller</strong>``) never matched the
    literal string ``"Frau Mueller"``, and a name occurring inside an
    href or other attribute value counted as a false-positive mention
    that was never really in the prose. Stripping HTML first (rather
    than leaving tags in place) fixes both at once.
    """
    if not content:
        return ""
    stripped = content.lstrip()
    if stripped.startswith("{"):
        try:
            doc = json.loads(content)
        except (ValueError, TypeError):
            return content
        parts: list[str] = []

        def walk(node: Any) -> None:
            if not isinstance(node, dict):
                return
            if node.get("type") == "text" and isinstance(node.get("text"), str):
                parts.append(node["text"])
            for child in node.get("content", []) or []:
                walk(child)
            if node.get("type") in {"paragraph", "heading"}:
                parts.append("\n")

        walk(doc)
        return " ".join(parts)
    if stripped.startswith("<"):
        from bibliogon_export.html_to_markdown import html_to_plain_text

        return html_to_plain_text(content)
    return content


def _count_occurrences(name: str, text: str) -> int:
    """Case-insensitive, word-boundary occurrence count of ``name`` in
    ``text``."""
    if not text:
        return 0
    pattern = r"\b" + re.escape(name) + r"\b"
    return len(re.findall(pattern, text, flags=re.IGNORECASE))


def detect_unlinked_mentions(book_id: str, db: Session) -> list[dict[str, Any]]:
    """Return proposed entity-appearance links for ``book_id``.

    Each proposal dict matches the StoryEntityAutoDetectProposal schema.
    """
    entities = db.query(StoryEntity).filter(StoryEntity.book_id == book_id).all()
    if not entities:
        return []
    entity_ids = [e.id for e in entities]

    chapters = db.query(Chapter).filter(Chapter.book_id == book_id).all()
    pages = db.query(Page).filter(Page.book_id == book_id).all()

    # Existing (entity_id, page_id) / (entity_id, chapter_id) pairs.
    existing: set[tuple[str, str]] = set()
    for link in (
        db.query(StoryEntityPageLink).filter(StoryEntityPageLink.entity_id.in_(entity_ids)).all()
    ):
        target = link.page_id or link.chapter_id
        if target:
            existing.add((link.entity_id, target))

    chapter_text = {c.id: _tiptap_to_text(c.content) for c in chapters}
    page_text = {p.id: _tiptap_to_text(p.text_content) for p in pages}

    proposals: list[dict[str, Any]] = []
    for entity in entities:
        name = (entity.name or "").strip()
        if len(name) < MIN_NAME_LEN:
            continue
        for chapter in chapters:
            if (entity.id, chapter.id) in existing:
                continue
            count = _count_occurrences(name, chapter_text[chapter.id])
            if count > 0:
                proposals.append(
                    {
                        "entity_id": entity.id,
                        "entity_name": entity.name,
                        "entity_type": entity.entity_type,
                        "page_id": None,
                        "chapter_id": chapter.id,
                        "ref_label": chapter.title or chapter.id,
                        "occurrences": count,
                    }
                )
        for page in pages:
            if (entity.id, page.id) in existing:
                continue
            count = _count_occurrences(name, page_text[page.id])
            if count > 0:
                proposals.append(
                    {
                        "entity_id": entity.id,
                        "entity_name": entity.name,
                        "entity_type": entity.entity_type,
                        "page_id": page.id,
                        "chapter_id": None,
                        "ref_label": f"Page {page.position}",
                        "occurrences": count,
                    }
                )
    return proposals
