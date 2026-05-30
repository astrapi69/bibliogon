"""Story-entity <-> page/chapter link routes (STORY-BIBLE-STORYBOARD-
INTEGRATION-01 Session B C4).

The core Storyboard <-> Story Bible connection: "Character X appears
on page Y". Routes live under ``/api/story-bible/...`` and are NESTED
inside the plugin's single top-level router (Single-Router-Per-Plugin
convention; see routes.py).

- ``GET    /story-bible/entities/{entity_id}/appearances`` — every
  page/chapter this entity is linked to.
- ``GET    /story-bible/pages/{page_id}/entities`` — every entity
  linked to this page (drives the storyboard-card badges).
- ``POST   /story-bible/links`` — create a link (entity + page XOR
  chapter).
- ``DELETE /story-bible/links/{link_id}`` — remove a link.

Models + schemas are core (app.models / app.schemas); this module is
the plugin-owned route layer, imported lazily inside the full backend
app context (the plugin's isolated venv has no sqlalchemy).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Chapter, Page, StoryEntity, StoryEntityPageLink
from app.schemas import StoryEntityLinkCreate, StoryEntityLinkOut

router = APIRouter(prefix="/story-bible", tags=["story-bible"])


def _get_entity_or_404(entity_id: str, db: Session) -> StoryEntity:
    entity = db.query(StoryEntity).filter(StoryEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"Story entity {entity_id} not found")
    return entity


@router.get(
    "/entities/{entity_id}/appearances",
    response_model=list[StoryEntityLinkOut],
)
def list_appearances(entity_id: str, db: Session = Depends(get_db)) -> list[StoryEntityPageLink]:
    """Every page/chapter where this entity appears, oldest link first."""
    _get_entity_or_404(entity_id, db)
    return (
        db.query(StoryEntityPageLink)
        .filter(StoryEntityPageLink.entity_id == entity_id)
        .order_by(StoryEntityPageLink.created_at.asc())
        .all()
    )


@router.get(
    "/pages/{page_id}/entities",
    response_model=list[StoryEntityLinkOut],
)
def list_page_entities(page_id: str, db: Session = Depends(get_db)) -> list[StoryEntityPageLink]:
    """Every entity linked to this page (drives storyboard-card
    badges). Each row embeds the entity (name + type)."""
    return (
        db.query(StoryEntityPageLink)
        .filter(StoryEntityPageLink.page_id == page_id)
        .order_by(StoryEntityPageLink.created_at.asc())
        .all()
    )


@router.post(
    "/links",
    response_model=StoryEntityLinkOut,
    status_code=status.HTTP_201_CREATED,
)
def create_link(
    payload: StoryEntityLinkCreate, db: Session = Depends(get_db)
) -> StoryEntityPageLink:
    """Link an entity to a page (picture/comic) or chapter (prose).

    Exactly one of ``page_id`` / ``chapter_id`` must be set, and the
    referenced rows must exist.
    """
    if bool(payload.page_id) == bool(payload.chapter_id):
        raise HTTPException(
            status_code=400,
            detail="Exactly one of page_id / chapter_id must be set.",
        )
    _get_entity_or_404(payload.entity_id, db)
    if payload.page_id:
        if not db.query(Page).filter(Page.id == payload.page_id).first():
            raise HTTPException(status_code=404, detail=f"Page {payload.page_id} not found")
    else:
        if not db.query(Chapter).filter(Chapter.id == payload.chapter_id).first():
            raise HTTPException(status_code=404, detail=f"Chapter {payload.chapter_id} not found")
    link = StoryEntityPageLink(
        entity_id=payload.entity_id,
        page_id=payload.page_id,
        chapter_id=payload.chapter_id,
        role=payload.role,
        notes=payload.notes,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(link_id: str, db: Session = Depends(get_db)) -> None:
    """Remove a single entity-page/chapter link."""
    link = db.query(StoryEntityPageLink).filter(StoryEntityPageLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail=f"Link {link_id} not found")
    db.delete(link)
    db.commit()
