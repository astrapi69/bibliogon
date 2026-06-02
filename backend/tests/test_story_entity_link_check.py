"""Regression pins for QA L4: the DB-level CHECK on
``story_entity_page_links`` enforces page_id XOR chapter_id (exactly one
set). Previously route-only; now a raw insert is rejected too.
"""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import Book, Chapter, Page, StoryEntity, StoryEntityPageLink


def _seed(session) -> tuple[str, str, str]:
    book = Book(title="B", author="A", book_type="picture_book")
    session.add(book)
    session.flush()
    ent = StoryEntity(book_id=book.id, entity_type="character", name="Hero")
    page = Page(book_id=book.id, position=0, layout="text_only")
    ch = Chapter(book_id=book.id, title="C", content="{}", position=0)
    session.add_all([ent, page, ch])
    session.flush()
    return ent.id, page.id, ch.id


def test_link_with_only_page_id_ok() -> None:
    with SessionLocal() as s:
        eid, pid, _ = _seed(s)
        s.add(StoryEntityPageLink(entity_id=eid, page_id=pid))
        s.flush()  # no error


def test_link_with_only_chapter_id_ok() -> None:
    with SessionLocal() as s:
        eid, _, cid = _seed(s)
        s.add(StoryEntityPageLink(entity_id=eid, chapter_id=cid))
        s.flush()


def test_link_with_both_set_is_rejected() -> None:
    with SessionLocal() as s:
        eid, pid, cid = _seed(s)
        s.add(StoryEntityPageLink(entity_id=eid, page_id=pid, chapter_id=cid))
        with pytest.raises(IntegrityError):
            s.flush()


def test_link_with_neither_set_is_rejected() -> None:
    with SessionLocal() as s:
        eid, _, _ = _seed(s)
        s.add(StoryEntityPageLink(entity_id=eid))
        with pytest.raises(IntegrityError):
            s.flush()
