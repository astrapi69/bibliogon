"""Story Bible entity CRUD routes (STORY-BIBLE-PLUGIN-01 Session 2 C3).

Routes live under ``/api/story-bible/...`` and are NESTED inside the
plugin's single top-level router (Single-Router-Per-Plugin
convention; see routes.py).

- ``GET    /story-bible/entity-types`` — the SSoT registry (5 types
  + per-type metadata fields) for the frontend editor.
- ``GET    /story-bible/books/{book_id}/entities`` — list a book's
  entities (optional ``?entity_type=`` filter), ordered by position.
- ``POST   /story-bible/books/{book_id}/entities`` — create; position
  is server-assigned (append-to-end within the entity_type).
- ``GET    /story-bible/entities/{entity_id}`` — read one entity.
- ``PATCH  /story-bible/entities/{entity_id}`` — partial update.
- ``DELETE /story-bible/entities/{entity_id}`` — delete.

Per-book scope (v1): entities attach to ANY book (no book_type gate;
the plugin's activation + the Session-2 sidebar gate availability).
Models + schemas are core (app.models / app.schemas); this module is
the plugin-owned route + business-logic layer, importing them inside
the full backend app context (the plugin's isolated venv does not
install sqlalchemy, so routes.py imports this lazily).
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Book, StoryEntity
from app.schemas import StoryEntityCreate, StoryEntityOut, StoryEntityUpdate
from app.services.story_entity_registry import (
    StoryEntityTypeDef,
    load_story_entity_types,
)

router = APIRouter(prefix="/story-bible", tags=["story-bible"])


def _get_book_or_404(book_id: str, db: Session) -> Book:
    """Resolve a non-soft-deleted book or raise 404."""
    book = (
        db.query(Book)
        .filter(Book.id == book_id, Book.deleted_at.is_(None))
        .first()
    )
    if not book:
        raise HTTPException(status_code=404, detail=f"Book {book_id} not found")
    return book


def _get_entity_or_404(entity_id: str, db: Session) -> StoryEntity:
    """Resolve a story entity by id or raise 404."""
    entity = db.query(StoryEntity).filter(StoryEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(
            status_code=404, detail=f"Story entity {entity_id} not found"
        )
    return entity


def _serialize_metadata(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


@router.get("/entity-types", response_model=dict[str, StoryEntityTypeDef])
def list_entity_types() -> dict[str, StoryEntityTypeDef]:
    """Return the {id: StoryEntityTypeDef} mapping from the SSoT yaml.

    The frontend editor consumes this to render per-type metadata
    fields + labels (mirrors GET /api/content-types)."""
    return load_story_entity_types()


@router.get(
    "/books/{book_id}/entities",
    response_model=list[StoryEntityOut],
)
def list_entities(
    book_id: str,
    entity_type: str | None = None,
    db: Session = Depends(get_db),
) -> list[StoryEntity]:
    """List a book's story entities ordered by position. An optional
    ``entity_type`` query param narrows to one type."""
    _get_book_or_404(book_id, db)
    query = db.query(StoryEntity).filter(StoryEntity.book_id == book_id)
    if entity_type is not None:
        query = query.filter(StoryEntity.entity_type == entity_type)
    return query.order_by(
        StoryEntity.entity_type.asc(), StoryEntity.position.asc()
    ).all()


@router.post(
    "/books/{book_id}/entities",
    response_model=StoryEntityOut,
    status_code=status.HTTP_201_CREATED,
)
def create_entity(
    book_id: str,
    payload: StoryEntityCreate,
    db: Session = Depends(get_db),
) -> StoryEntity:
    """Create a story entity. Position is server-assigned to
    ``max(existing positions for this entity_type) + 1`` so authors
    don't manage position values."""
    _get_book_or_404(book_id, db)
    max_pos = (
        db.query(func.max(StoryEntity.position))
        .filter(
            StoryEntity.book_id == book_id,
            StoryEntity.entity_type == payload.entity_type,
        )
        .scalar()
    )
    entity = StoryEntity(
        book_id=book_id,
        entity_type=payload.entity_type,
        name=payload.name,
        description=payload.description,
        entity_metadata=_serialize_metadata(payload.entity_metadata),
        image_asset_id=payload.image_asset_id,
        position=(max_pos or 0) + 1,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@router.get("/entities/{entity_id}", response_model=StoryEntityOut)
def get_entity(entity_id: str, db: Session = Depends(get_db)) -> StoryEntity:
    """Read a single story entity by id."""
    return _get_entity_or_404(entity_id, db)


@router.patch("/entities/{entity_id}", response_model=StoryEntityOut)
def update_entity(
    entity_id: str,
    payload: StoryEntityUpdate,
    db: Session = Depends(get_db),
) -> StoryEntity:
    """Partial update on a story entity."""
    entity = _get_entity_or_404(entity_id, db)
    update_data = payload.model_dump(exclude_unset=True)
    if "entity_metadata" in update_data:
        update_data["entity_metadata"] = _serialize_metadata(
            update_data["entity_metadata"]
        )
    for field, value in update_data.items():
        setattr(entity, field, value)
    db.commit()
    db.refresh(entity)
    return entity


@router.delete(
    "/entities/{entity_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_entity(entity_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a story entity."""
    entity = _get_entity_or_404(entity_id, db)
    db.delete(entity)
    db.commit()
