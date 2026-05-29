"""Tests for the StoryEntity SQLAlchemy model
(STORY-BIBLE-PLUGIN-01 Session 2).

Coverage scope:
- Table creation reachable via Base.metadata (Alembic migration
  w2a3b4c5d6e7_add_story_entities.py).
- Required-field insert + defaults (position=0, entity_metadata
  None, description None).
- Round-trip of the JSON-as-Text entity_metadata + TipTap-JSON
  description (stored as opaque strings at the model layer).
- CASCADE: hard-deleting a Book removes its story_entities
  (FK ondelete=CASCADE; PRAGMA foreign_keys=ON in the test DB).
- image_asset_id SET NULL is declared (FK present).
- Repr formatting (pinned so downstream debugging stays
  predictable).
"""

from __future__ import annotations

import json

from app.database import SessionLocal
from app.models import Asset, Book, StoryEntity


def _make_book(session, title: str = "Bible Book") -> Book:
    book = Book(title=title, author="Author", book_type="prose")
    session.add(book)
    session.flush()
    return book


def test_creates_entity_with_defaults() -> None:
    with SessionLocal() as session:
        book = _make_book(session)
        entity = StoryEntity(
            book_id=book.id,
            entity_type="character",
            name="Alice",
        )
        session.add(entity)
        session.flush()
        session.refresh(entity)
        assert entity.id
        assert entity.book_id == book.id
        assert entity.entity_type == "character"
        assert entity.name == "Alice"
        # Defaults.
        assert entity.position == 0
        assert entity.description is None
        assert entity.entity_metadata is None
        assert entity.image_asset_id is None
        assert entity.created_at is not None
        assert entity.updated_at is not None


def test_round_trips_description_and_metadata() -> None:
    with SessionLocal() as session:
        book = _make_book(session)
        tiptap = json.dumps({"type": "doc", "content": []})
        meta = json.dumps({"role": "protagonist", "aliases": "The Wanderer"})
        entity = StoryEntity(
            book_id=book.id,
            entity_type="character",
            name="Bob",
            description=tiptap,
            entity_metadata=meta,
            position=3,
        )
        session.add(entity)
        session.flush()
        fetched = session.get(StoryEntity, entity.id)
        assert fetched is not None
        assert json.loads(fetched.description) == {"type": "doc", "content": []}
        assert json.loads(fetched.entity_metadata)["role"] == "protagonist"
        assert fetched.position == 3


def test_image_asset_id_fk_accepts_asset() -> None:
    with SessionLocal() as session:
        book = _make_book(session)
        asset = Asset(
            book_id=book.id,
            filename="cover.png",
            asset_type="figure",
            path="/tmp/cover.png",
        )
        session.add(asset)
        session.flush()
        entity = StoryEntity(
            book_id=book.id,
            entity_type="item",
            name="Sword",
            image_asset_id=asset.id,
        )
        session.add(entity)
        session.flush()
        session.refresh(entity)
        assert entity.image_asset_id == asset.id


def test_cascade_delete_book_removes_entities() -> None:
    with SessionLocal() as session:
        book = _make_book(session)
        for et, nm in [("character", "C1"), ("lore", "L1")]:
            session.add(
                StoryEntity(book_id=book.id, entity_type=et, name=nm)
            )
        session.flush()
        assert (
            session.query(StoryEntity).filter_by(book_id=book.id).count() == 2
        )
        session.delete(book)
        session.flush()
        assert (
            session.query(StoryEntity).filter_by(book_id=book.id).count() == 0
        )


def test_repr_includes_type_and_name() -> None:
    with SessionLocal() as session:
        book = _make_book(session)
        entity = StoryEntity(
            book_id=book.id, entity_type="setting", name="Rivendell"
        )
        session.add(entity)
        session.flush()
        text = repr(entity)
        assert "StoryEntity" in text
        assert "setting" in text
        assert "Rivendell" in text
