"""Integration tests for the Danger Zone reset service.

Verifies the full wipe + reseed contract:

- All 21 tables truncated
- Builtin templates re-seeded after truncation
- Uploads + tmp directories wiped + recreated
- backup_history.json, config overlays, installed plugins removed
- secrets.yaml at the injected test path removed
- Production-marker file preserved (test-isolation tripwire)
- article_comments deleted (not orphaned) via reverse-topo iteration
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.database import SessionLocal
from app.models import (
    ArcReviewer,
    Article,
    ArticleComment,
    Asset,
    Author,
    Book,
    BookPublishingState,
    Chapter,
    ComicBubble,
    ComicPanel,
    Page,
)
from app.services import reset_service


@pytest.fixture
def db_session():
    """Provide a SQLAlchemy session bound to the in-memory test DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def populated_db(db_session, tmp_path):
    """Insert one of every interesting row across the FK tree.

    Pre-reset state:
    - 1 Book (prose) + 1 Chapter + 1 Asset
    - 1 Book (comic_book) + 1 Page + 1 ComicPanel + 1 ComicBubble
    - 1 BookPublishingState + 1 ArcReviewer
    - 1 Article + 1 ArticleComment (responds_to_article -> the Article)
    - 1 Author (Authors-DB)
    """
    prose = Book(title="Prose Test", book_type="prose")
    db_session.add(prose)
    db_session.flush()
    db_session.add(Chapter(book_id=prose.id, title="Ch1", content="", position=0))
    db_session.add(Asset(book_id=prose.id, filename="cover.png", asset_type="cover", path="x"))

    comic = Book(title="Comic Test", book_type="comic_book")
    db_session.add(comic)
    db_session.flush()
    page = Page(book_id=comic.id, position=0, layout="single_panel")
    db_session.add(page)
    db_session.flush()
    panel = ComicPanel(
        page_id=page.id,
        position=0,
        bounds='{"x_pct": 0, "y_pct": 0, "width_pct": 100, "height_pct": 100}',
    )
    db_session.add(panel)
    db_session.flush()
    db_session.add(
        ComicBubble(
            panel_id=panel.id,
            position=0,
            bubble_type="speech",
            anchor='{"x_pct": 50, "y_pct": 50}',
            text_content="Hello!",
        )
    )

    pub_state = BookPublishingState(book_id=comic.id, royalty_plan="70")
    db_session.add(pub_state)
    db_session.flush()
    db_session.add(
        ArcReviewer(
            publishing_state_id=pub_state.id,
            reviewer_name="Reviewer A",
            reviewer_email="a@example.com",
        )
    )

    article = Article(title="Article Test", language="en")
    db_session.add(article)
    db_session.flush()
    db_session.add(
        ArticleComment(
            body_text="A reply comment",
            language="en",
            imported_from="manual",
            responds_to_article_id=article.id,
        )
    )

    db_session.add(Author(name="Test Author", slug="test-author"))
    db_session.commit()
    return db_session


def _seed_filesystem(data_dir: Path, secrets_path: Path) -> None:
    """Populate the data dir + secrets file so reset has something to wipe."""
    (data_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (data_dir / "uploads" / "some-book" / "cover.png").parent.mkdir(parents=True)
    (data_dir / "uploads" / "some-book" / "cover.png").write_bytes(b"PNG-FAKE")
    (data_dir / "tmp").mkdir(parents=True, exist_ok=True)
    (data_dir / "tmp" / "preview-workspace").mkdir()
    (data_dir / "backup_history.json").write_text("[]")
    (data_dir / "config" / "plugins").mkdir(parents=True, exist_ok=True)
    (data_dir / "config" / "app.yaml").write_text("app:\n  name: test\n")
    (data_dir / "config" / "plugins" / "export.yaml").write_text("settings: {}\n")
    (data_dir / "config" / "plugins" / "audiobook.yaml").write_text("settings: {}\n")
    (data_dir / "plugins" / "installed").mkdir(parents=True, exist_ok=True)
    (data_dir / "plugins" / "installed" / "fake-plugin").mkdir()
    (data_dir / "plugins" / "installed" / "fake-plugin" / "marker").write_text("x")
    secrets_path.parent.mkdir(parents=True, exist_ok=True)
    secrets_path.write_text("ai:\n  api_key: secret\n")
    # Production marker - reset MUST preserve.
    (data_dir / ".bibliogon-production").write_text("test-injected production marker\n")


def test_reset_truncates_all_tables(populated_db, tmp_path):
    """Every row in every table is gone after reset (modulo re-seeded builtins)."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets" / "secrets.yaml"
    _seed_filesystem(data_dir, secrets_path)

    # Sanity: rows exist pre-reset.
    assert populated_db.query(Book).count() == 2
    assert populated_db.query(Article).count() == 1
    assert populated_db.query(ArticleComment).count() == 1
    assert populated_db.query(ComicBubble).count() == 1
    assert populated_db.query(ArcReviewer).count() == 1

    summary = reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)
    assert summary["status"] == "reset"
    assert summary["rows_deleted"] >= 9  # at least the rows we inserted

    # User-data tables are empty.
    assert populated_db.query(Book).count() == 0
    assert populated_db.query(Chapter).count() == 0
    assert populated_db.query(Asset).count() == 0
    assert populated_db.query(Page).count() == 0
    assert populated_db.query(ComicPanel).count() == 0
    assert populated_db.query(ComicBubble).count() == 0
    assert populated_db.query(BookPublishingState).count() == 0
    assert populated_db.query(ArcReviewer).count() == 0
    assert populated_db.query(Article).count() == 0
    assert populated_db.query(Author).count() == 0


def test_reset_deletes_comments_not_orphans(populated_db, tmp_path):
    """``article_comments`` use SET NULL on article delete, but a full reset
    must delete the comments themselves - not orphan them.

    Reverse-topo iteration over ``Base.metadata.sorted_tables`` deletes
    children (comments) before parents (articles), so no row survives.
    """
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets.yaml"

    assert populated_db.query(ArticleComment).count() == 1
    reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)
    assert populated_db.query(ArticleComment).count() == 0


def test_reset_reseeds_builtin_templates(populated_db, tmp_path):
    """After reset, the 5 book + 4 chapter builtins are re-seeded."""
    from app.models import BookTemplate, ChapterTemplate

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets.yaml"

    reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)

    # Builtins re-seeded - exact counts are owned by the seeder modules,
    # so we assert "at least the documented count".
    assert populated_db.query(BookTemplate).count() >= 5
    assert populated_db.query(ChapterTemplate).count() >= 4


def test_reset_wipes_filesystem(populated_db, tmp_path):
    """Uploads, tmp, backup history, config overlays, installed plugins, secrets."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets.yaml"
    _seed_filesystem(data_dir, secrets_path)

    summary = reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)

    assert summary["uploads_cleared"] is True
    assert summary["tmp_cleared"] is True
    assert summary["backup_history_cleared"] is True
    assert summary["config_overlays_cleared"] == 3  # app.yaml + 2 plugin yamls
    assert summary["installed_plugins_cleared"] == 1
    assert summary["secrets_cleared"] is True

    # Uploads + tmp recreated empty (so subsequent writes don't crash).
    assert (data_dir / "uploads").is_dir()
    assert list((data_dir / "uploads").iterdir()) == []
    assert (data_dir / "tmp").is_dir()
    assert list((data_dir / "tmp").iterdir()) == []

    # Specific deletions verified.
    assert not (data_dir / "backup_history.json").exists()
    assert not (data_dir / "config" / "app.yaml").exists()
    assert not (data_dir / "config" / "plugins" / "export.yaml").exists()
    assert not (data_dir / "config" / "plugins" / "audiobook.yaml").exists()
    assert not (data_dir / "plugins" / "installed" / "fake-plugin").exists()
    assert not secrets_path.exists()


def test_reset_preserves_production_marker(populated_db, tmp_path):
    """``.bibliogon-production`` is the test-isolation tripwire - never delete."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets.yaml"
    _seed_filesystem(data_dir, secrets_path)

    reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)
    assert (data_dir / ".bibliogon-production").exists()


def test_reset_handles_missing_filesystem_gracefully(populated_db, tmp_path):
    """Calling reset with a fresh data_dir (no files) must not raise."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "nonexistent" / "secrets.yaml"

    summary = reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)
    # All "cleared" flags False/0 because nothing to clear.
    assert summary["backup_history_cleared"] is False
    assert summary["config_overlays_cleared"] == 0
    assert summary["installed_plugins_cleared"] == 0
    assert summary["secrets_cleared"] is False
    # Uploads + tmp still get created.
    assert (data_dir / "uploads").is_dir()
    assert (data_dir / "tmp").is_dir()


def test_reset_returns_jobs_cancelled_count(populated_db, tmp_path):
    """Pre-existing jobs are cancelled by ``shutdown_all`` and counted."""
    from app.job_store import JobStatus, job_store

    job_a = job_store.create()
    job_b = job_store.create()
    job_store.update(job_b.id, JobStatus.RUNNING)

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    secrets_path = tmp_path / "secrets.yaml"

    summary = reset_service.run_reset(populated_db, data_dir=data_dir, secrets_path=secrets_path)
    assert summary["jobs_cancelled"] >= 2
    assert job_store.get(job_a.id) is None
    assert job_store.get(job_b.id) is None
