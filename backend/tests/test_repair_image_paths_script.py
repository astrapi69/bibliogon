"""Tests for the image-path repair script (#789).

The rewrite itself is covered by ``test_asset_rewrite.py``; this file
covers the script's own contract: per-book reporting, the dry-run
promise, and idempotency.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Asset, Book, Chapter

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "repair_image_paths.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("repair_image_paths", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


repair = _load_module()

BROKEN = "<p><img src=„assets/figures/diagram. jpg“ alt=„Bild“ /></p>"


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _seed(db: Session, book_id: str, content: str = BROKEN) -> None:
    db.add(Book(id=book_id, title=f"Buch {book_id}", author="A", language="de"))
    db.add(
        Asset(
            book_id=book_id,
            filename="diagram.jpg",
            asset_type="figure",
            path=f"/tmp/{book_id}/diagram.jpg",
        )
    )
    db.add(
        Chapter(
            book_id=book_id,
            title="Kapitel",
            content=content,
            position=1,
            chapter_type="chapter",
        )
    )
    db.commit()


class TestRepair:
    def test_dry_run_reports_the_book_but_writes_nothing(self, db: Session) -> None:
        _seed(db, "rep-1")
        report = repair.repair_all(db, dry_run=True)
        assert report.chapters_repaired == 1
        assert "rep-1" in {outcome.book_id for outcome in report.books}

        db.expire_all()
        chapter = db.query(Chapter).filter(Chapter.book_id == "rep-1").one()
        assert "„assets" in chapter.content

    def test_apply_rewrites_the_source_to_the_asset_api(self, db: Session) -> None:
        _seed(db, "rep-2")
        repair.repair_all(db, dry_run=False)

        db.expire_all()
        chapter = db.query(Chapter).filter(Chapter.book_id == "rep-2").one()
        assert 'src="/api/books/rep-2/assets/file/diagram.jpg"' in chapter.content

    def test_a_second_run_changes_nothing(self, db: Session) -> None:
        _seed(db, "rep-3")
        repair.repair_all(db, dry_run=False)
        second = repair.repair_all(db, dry_run=False)
        assert second.chapters_repaired == 0

    def test_an_already_correct_book_is_left_alone(self, db: Session) -> None:
        _seed(db, "rep-4", content='<p><img src="/api/books/rep-4/assets/file/diagram.jpg" /></p>')
        report = repair.repair_all(db, dry_run=False)
        assert report.chapters_repaired == 0

    def test_a_book_can_be_targeted_by_id(self, db: Session) -> None:
        _seed(db, "rep-5")
        _seed(db, "rep-6")
        report = repair.repair_all(db, dry_run=False, book_ids=["rep-5"])
        assert {outcome.book_id for outcome in report.books} == {"rep-5"}

        db.expire_all()
        untouched = db.query(Chapter).filter(Chapter.book_id == "rep-6").one()
        assert "„assets" in untouched.content

    def test_report_renders_the_per_book_counts(self, db: Session) -> None:
        _seed(db, "rep-7")
        rendered = repair.render_report(repair.repair_all(db, dry_run=True))
        assert "rep-7" in rendered
        assert "dry run" in rendered.lower()
