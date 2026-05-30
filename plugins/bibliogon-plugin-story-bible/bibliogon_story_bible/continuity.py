"""Story-continuity checker (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C11).

Advisory analysis surfaced as warning badges on the Storyboard. The
rules are data-driven from StoryEntityPageLinks + page order, so the
pure ``compute_continuity_warnings`` function is unit-testable without
a DB (the route just adapts ORM rows into the plain dicts it expects).

Rules (v1):

- ``entity_disappears``: an entity's last appearance leaves >= threshold
  trailing pages (it vanishes and never returns) — "Max disappears
  after page 5".
- ``entity_gap``: an entity is absent for a >= threshold internal gap
  between two appearances — "Lisa is absent between page 3 and 9".
- ``empty_page``: a page has no entity links at all — might be
  intentional (a mood/scenery page), but worth flagging.

The "location referenced before it is introduced" rule needs text
mention-detection (C13/C14) and is deferred. Warnings carry a
``page_id`` so the frontend can badge the relevant card, plus a
``code`` + params so it localizes the message.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db

DEFAULT_GAP_THRESHOLD = 5

router = APIRouter(prefix="/story-bible", tags=["story-bible"])


def compute_continuity_warnings(
    pages: list[dict[str, Any]],
    links: list[dict[str, Any]],
    *,
    gap_threshold: int = DEFAULT_GAP_THRESHOLD,
) -> list[dict[str, Any]]:
    """Return advisory continuity warnings.

    Args:
        pages: ``[{"id": str, "position": int}, ...]`` (any order).
        links: ``[{"page_id": str, "entity_id": str, "entity_name": str}, ...]``.
        gap_threshold: minimum gap (in pages) before an absence is flagged.

    Returns:
        A list of ``{"code", "page_id", "page_position", ...}`` dicts.
    """
    ordered = sorted(pages, key=lambda p: p["position"])
    if not ordered:
        return []
    pos_by_id = {p["id"]: p["position"] for p in ordered}
    last_position = ordered[-1]["position"]
    warnings: list[dict[str, Any]] = []

    # Rule: empty pages (no entity links).
    linked_page_ids = {link["page_id"] for link in links}
    for page in ordered:
        if page["id"] not in linked_page_ids:
            warnings.append(
                {
                    "code": "empty_page",
                    "page_id": page["id"],
                    "page_position": page["position"],
                }
            )

    # Group appearances by entity, keeping (position, page_id) sorted.
    by_entity: dict[str, dict[str, Any]] = {}
    for link in links:
        page_id = link["page_id"]
        if page_id not in pos_by_id:
            continue  # link to a page outside this book — skip defensively
        entry = by_entity.setdefault(
            link["entity_id"],
            {"name": link.get("entity_name", ""), "appearances": []},
        )
        entry["appearances"].append((pos_by_id[page_id], page_id))

    for entity_id, entry in by_entity.items():
        appearances = sorted(entry["appearances"])
        name = entry["name"]
        # Internal gaps between consecutive appearances.
        for (prev_pos, prev_page), (next_pos, _next_page) in zip(
            appearances, appearances[1:]
        ):
            if next_pos - prev_pos - 1 >= gap_threshold:
                warnings.append(
                    {
                        "code": "entity_gap",
                        "page_id": prev_page,
                        "page_position": prev_pos,
                        "entity_id": entity_id,
                        "entity_name": name,
                        "gap_to_position": next_pos,
                    }
                )
        # Trailing absence after the last appearance.
        last_pos, last_page = appearances[-1]
        if last_position - last_pos >= gap_threshold:
            warnings.append(
                {
                    "code": "entity_disappears",
                    "page_id": last_page,
                    "page_position": last_pos,
                    "entity_id": entity_id,
                    "entity_name": name,
                }
            )

    return warnings


@router.get("/books/{book_id}/continuity-check")
def continuity_check(
    book_id: str, db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    """Advisory continuity warnings for a book's Storyboard.

    Loads the book's pages + entity links and runs the pure rule
    function. Empty list when the book has no pages (e.g. prose).
    """
    from app.models import Page, StoryEntityPageLink

    pages = (
        db.query(Page)
        .filter(Page.book_id == book_id)
        .order_by(Page.position.asc())
        .all()
    )
    if not pages:
        return []
    page_ids = [p.id for p in pages]
    link_rows = (
        db.query(StoryEntityPageLink)
        .filter(StoryEntityPageLink.page_id.in_(page_ids))
        .all()
    )
    return compute_continuity_warnings(
        [{"id": p.id, "position": p.position} for p in pages],
        [
            {
                "page_id": link.page_id,
                "entity_id": link.entity_id,
                "entity_name": link.entity.name if link.entity else "",
            }
            for link in link_rows
        ],
    )
