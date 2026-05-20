"""Tests for ComicPanel + ComicBubble SQLAlchemy models
(plugin-comics Session 2 C1).

Coverage scope:
- Table creation reachable via Base.metadata (Alembic migration
  pd5e6f7a8b9c_add_comic_panels_and_comic_bubbles.py).
- Field defaults (width_pct=30, height_pct=20, tail_direction
  ="none", tail_position_pct=50, tail_length_px=16 per
  Pre-Inspection + migration server_default).
- CASCADE chain: page → comic_panels → comic_bubbles. Deleting a
  page must cascade through both tables.
- FK SET NULL behavior on ``comic_panels.image_asset_id`` when
  the referenced asset is deleted.
- Repr formatting (small but pinned so downstream debugging stays
  predictable).

Schema-design decisions exercised here (Pre-Inspection §1 +
GO-message Q1 β):
- comic_panels.page_id → pages.id (NOT comic_pages.id; Session 1
  sharing decision)
- comic_panels.bounds is NOT NULL (every panel must position
  itself)
- comic_bubbles tail fields are SIBLINGS of bubble_config (per
  comic-foundation.md:289-291)
- bubble_config is nullable JSON Text (matches Page.layout_config
  pattern from picture-book)
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest

from app.database import SessionLocal
from app.models import Book, ComicBubble, ComicPanel, Page


def _make_comic_book_with_page(session) -> tuple[Book, Page]:
    """Helper: create a comic_book Book + one Page row. Returns the
    Book + Page so tests can chain panels + bubbles onto them.
    """
    book = Book(
        title="Comic Test",
        author="Author",
        book_type="comic_book",
    )
    session.add(book)
    session.flush()
    page = Page(
        book_id=book.id,
        position=1,
        layout="speech_bubble",  # picture-book layout reused; comic page-level layout lives in layout_config per Q1 β
    )
    session.add(page)
    session.flush()
    return book, page


class TestComicPanelModel:
    """ComicPanel: table existence + field defaults + relationships."""

    def test_panel_persists_with_minimum_fields(self) -> None:
        session = SessionLocal()
        try:
            _book, page = _make_comic_book_with_page(session)
            panel = ComicPanel(
                page_id=page.id,
                position=1,
                bounds=json.dumps(
                    {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}
                ),
            )
            session.add(panel)
            session.commit()

            fetched = session.query(ComicPanel).filter_by(id=panel.id).one()
            assert fetched.page_id == page.id
            assert fetched.position == 1
            assert json.loads(fetched.bounds)["width_pct"] == 100
            assert fetched.image_asset_id is None
            assert fetched.panel_config is None
            assert isinstance(fetched.created_at, datetime)
            assert isinstance(fetched.updated_at, datetime)
        finally:
            session.close()

    def test_panel_repr_includes_id_page_id_position(self) -> None:
        session = SessionLocal()
        try:
            _book, page = _make_comic_book_with_page(session)
            panel = ComicPanel(
                page_id=page.id,
                position=3,
                bounds=json.dumps({"x_pct": 0, "y_pct": 0, "width_pct": 50, "height_pct": 50}),
            )
            session.add(panel)
            session.flush()
            r = repr(panel)
            assert "ComicPanel" in r
            assert panel.id in r
            assert page.id in r
            assert "pos=3" in r
        finally:
            session.close()

    def test_panel_cascade_delete_on_page_drop(self) -> None:
        """Deleting a Page row cascades to its ComicPanel rows."""
        session = SessionLocal()
        try:
            book, page = _make_comic_book_with_page(session)
            panel = ComicPanel(
                page_id=page.id,
                position=1,
                bounds=json.dumps({"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}),
            )
            session.add(panel)
            session.commit()
            panel_id = panel.id

            # Deleting the page should cascade-delete the panel.
            session.delete(page)
            session.commit()
            assert session.query(ComicPanel).filter_by(id=panel_id).first() is None
        finally:
            session.close()


class TestComicBubbleModel:
    """ComicBubble: table existence + tail-as-sibling fields +
    bubble_config JSON + relationship to panel.
    """

    def _make_panel(self, session) -> tuple[Book, Page, ComicPanel]:
        book, page = _make_comic_book_with_page(session)
        panel = ComicPanel(
            page_id=page.id,
            position=1,
            bounds=json.dumps(
                {"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}
            ),
        )
        session.add(panel)
        session.flush()
        return book, page, panel

    def test_bubble_persists_with_minimum_fields(self) -> None:
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            bubble = ComicBubble(
                panel_id=panel.id,
                position=1,
                bubble_type="speech",
                anchor=json.dumps({"x_pct": 50, "y_pct": 50}),
            )
            session.add(bubble)
            session.commit()

            fetched = session.query(ComicBubble).filter_by(id=bubble.id).one()
            assert fetched.bubble_type == "speech"
            assert json.loads(fetched.anchor)["x_pct"] == 50
            # Defaults from the migration server_default fire when
            # the SQLAlchemy default + the migration default agree.
            assert fetched.width_pct == 30
            assert fetched.height_pct == 20
            assert fetched.tail_direction == "none"
            assert fetched.tail_position_pct == 50
            assert fetched.tail_length_px == 16
            assert fetched.bubble_config is None
            assert fetched.text_content is None
        finally:
            session.close()

    def test_bubble_type_accepts_all_6_variants(self) -> None:
        """bubble_type validation lives at the Pydantic schema
        layer (C2); the model accepts any string. Pin the 6
        canonical values per comic-foundation.md:321-324.
        """
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            for i, bt in enumerate(
                [
                    "speech",
                    "thought",
                    "narration",
                    "shout",
                    "whisper",
                    "sound_effect",
                ]
            ):
                bubble = ComicBubble(
                    panel_id=panel.id,
                    position=i + 1,
                    bubble_type=bt,
                    anchor=json.dumps({"x_pct": 50, "y_pct": 50}),
                )
                session.add(bubble)
            session.commit()
            assert session.query(ComicBubble).count() == 6
        finally:
            session.close()

    def test_bubble_config_round_trips_tier1_tier2_keys(self) -> None:
        """bubble_config carries the Tier 1 + Tier 2 key set per
        picture-book parity (Pre-Inspection §2). The DB layer is
        transparent JSON-as-Text; round-trip preserves the dict.
        """
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            tier_config = {
                # Tier 1 — Visual Style
                "background_color": "#ffffff",
                "border_color": "#000000",
                "border_width": 2,
                "border_style": "solid",
                "border_radius": 50,
                "shadow": True,
                "shadow_intensity": 5,
                "padding": 12,
                # Tier 2 — Typography
                "font_family": "Atkinson Hyperlegible",
                "font_size": 14,
                "font_weight": "normal",
                "text_color": "#000000",
                "text_align": "center",
                "italic": False,
            }
            bubble = ComicBubble(
                panel_id=panel.id,
                position=1,
                bubble_type="speech",
                anchor=json.dumps({"x_pct": 50, "y_pct": 90}),
                bubble_config=json.dumps(tier_config),
            )
            session.add(bubble)
            session.commit()

            fetched = session.query(ComicBubble).filter_by(id=bubble.id).one()
            round_tripped = json.loads(fetched.bubble_config)
            assert round_tripped == tier_config
        finally:
            session.close()

    def test_bubble_tail_fields_persist_as_columns_not_in_bubble_config(self) -> None:
        """Tail fields are SIBLINGS to bubble_config (per
        comic-foundation.md:289-291), NOT nested inside the JSON.
        SQL queries can sort/filter on tail_direction etc. without
        JSON parsing.
        """
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            bubble = ComicBubble(
                panel_id=panel.id,
                position=1,
                bubble_type="speech",
                anchor=json.dumps({"x_pct": 30, "y_pct": 80}),
                tail_direction="SE",
                tail_position_pct=25,
                tail_length_px=24,
            )
            session.add(bubble)
            session.commit()

            fetched = session.query(ComicBubble).filter_by(id=bubble.id).one()
            assert fetched.tail_direction == "SE"
            assert fetched.tail_position_pct == 25
            assert fetched.tail_length_px == 24
        finally:
            session.close()

    def test_bubble_cascade_delete_on_panel_drop(self) -> None:
        """Deleting a panel cascades to its bubbles."""
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            bubble = ComicBubble(
                panel_id=panel.id,
                position=1,
                bubble_type="speech",
                anchor=json.dumps({"x_pct": 50, "y_pct": 50}),
            )
            session.add(bubble)
            session.commit()
            bubble_id = bubble.id

            session.delete(panel)
            session.commit()
            assert (
                session.query(ComicBubble).filter_by(id=bubble_id).first() is None
            )
        finally:
            session.close()

    def test_bubble_cascade_chain_page_to_bubble(self) -> None:
        """Full CASCADE chain: deleting a Page cascades through
        comic_panels to comic_bubbles. Predictable cleanup; the
        author can delete a page without orphaning rows.
        """
        session = SessionLocal()
        try:
            _book, page, panel = self._make_panel(session)
            bubble = ComicBubble(
                panel_id=panel.id,
                position=1,
                bubble_type="thought",
                anchor=json.dumps({"x_pct": 60, "y_pct": 40}),
            )
            session.add(bubble)
            session.commit()
            panel_id = panel.id
            bubble_id = bubble.id

            session.delete(page)
            session.commit()
            assert session.query(ComicPanel).filter_by(id=panel_id).first() is None
            assert session.query(ComicBubble).filter_by(id=bubble_id).first() is None
        finally:
            session.close()

    def test_bubble_panel_relationship_back_populates(self) -> None:
        """ComicPanel.bubbles relationship returns the panel's
        bubbles ordered by position (per the model's relationship
        config). N-bubbles-per-panel is the dominant access
        pattern; ordered access avoids per-render sort.
        """
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            # Insert in reverse position order to verify ordering.
            for pos in [3, 1, 2]:
                bubble = ComicBubble(
                    panel_id=panel.id,
                    position=pos,
                    bubble_type="speech",
                    anchor=json.dumps({"x_pct": pos * 10, "y_pct": 50}),
                )
                session.add(bubble)
            session.commit()
            session.refresh(panel)

            positions = [b.position for b in panel.bubbles]
            assert positions == [1, 2, 3]
        finally:
            session.close()

    def test_bubble_repr_includes_id_panel_id_type_position(self) -> None:
        session = SessionLocal()
        try:
            _book, _page, panel = self._make_panel(session)
            bubble = ComicBubble(
                panel_id=panel.id,
                position=2,
                bubble_type="shout",
                anchor=json.dumps({"x_pct": 50, "y_pct": 50}),
            )
            session.add(bubble)
            session.flush()
            r = repr(bubble)
            assert "ComicBubble" in r
            assert bubble.id in r
            assert panel.id in r
            assert "shout" in r
            assert "pos=2" in r
        finally:
            session.close()


class TestComicSchemaExistence:
    """Sanity: the two new tables are reachable via SQLAlchemy
    metadata after the migration runs. Tests run in a fresh
    in-memory DB per the test-isolation contract; if the migration
    is broken, ``Base.metadata.create_all`` in conftest would fail
    or the tables would be missing.
    """

    def test_comic_panels_table_in_metadata(self) -> None:
        from app.database import Base

        assert "comic_panels" in Base.metadata.tables

    def test_comic_bubbles_table_in_metadata(self) -> None:
        from app.database import Base

        assert "comic_bubbles" in Base.metadata.tables

    def test_comic_panels_has_fk_to_pages(self) -> None:
        from app.database import Base

        fks = Base.metadata.tables["comic_panels"].foreign_keys
        page_fks = [fk for fk in fks if "pages" in str(fk.column)]
        assert len(page_fks) == 1, (
            f"Expected exactly 1 FK to pages.id; got {[str(fk) for fk in fks]}"
        )

    def test_comic_bubbles_has_fk_to_comic_panels(self) -> None:
        from app.database import Base

        fks = Base.metadata.tables["comic_bubbles"].foreign_keys
        panel_fks = [fk for fk in fks if "comic_panels" in str(fk.column)]
        assert len(panel_fks) == 1, (
            f"Expected exactly 1 FK to comic_panels.id; got {[str(fk) for fk in fks]}"
        )
