"""Tests for the ArticleImportSource model.

Parallel of test_book_import_source.py. Covers create, lookup by
identifier+type, cascade delete with the parent Article, and the
one-source-per-article relationship.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Article, ArticleImportSource


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_article(db: Session, title: str = "Test Article") -> Article:
    article = Article(title=title, language="en")
    db.add(article)
    db.flush()
    return article


def test_create_and_roundtrip(db: Session) -> None:
    article = _make_article(db)
    db.add(
        ArticleImportSource(
            article_id=article.id,
            source_identifier="https://medium.com/@user/foo-deadbeef",
            source_type="medium",
            format_name="medium_html_export",
            import_metadata=json.dumps({"original_published_at": "2024-01-01"}),
            importer_version="1.0.0",
        )
    )
    db.flush()

    row = db.query(ArticleImportSource).filter_by(article_id=article.id).one()
    assert row.source_identifier == "https://medium.com/@user/foo-deadbeef"
    assert row.source_type == "medium"
    assert row.format_name == "medium_html_export"
    assert row.imported_at is not None
    assert row.importer_version == "1.0.0"
    assert json.loads(row.import_metadata) == {"original_published_at": "2024-01-01"}
    assert json.loads(row.conversion_warnings) == []


def test_query_by_source_identifier_and_type(db: Session) -> None:
    article_a = _make_article(db, title="A")
    article_b = _make_article(db, title="B")
    db.add_all(
        [
            ArticleImportSource(
                article_id=article_a.id,
                source_identifier="https://medium.com/p/aaa",
                source_type="medium",
                format_name="medium_html_export",
            ),
            ArticleImportSource(
                article_id=article_b.id,
                source_identifier="https://substack.com/p/bbb",
                source_type="substack",
                format_name="substack_export",
            ),
        ]
    )
    db.flush()

    hit = (
        db.execute(
            select(ArticleImportSource).where(
                ArticleImportSource.source_identifier == "https://medium.com/p/aaa",
                ArticleImportSource.source_type == "medium",
            )
        )
        .scalars()
        .one()
    )
    assert hit.article_id == article_a.id


def test_cascade_delete_removes_import_source(db: Session) -> None:
    article = _make_article(db)
    db.add(
        ArticleImportSource(
            article_id=article.id,
            source_identifier="https://medium.com/p/ccc",
            source_type="medium",
            format_name="medium_html_export",
        )
    )
    db.flush()
    article_id = article.id
    db.delete(article)
    db.flush()
    assert db.query(ArticleImportSource).filter_by(article_id=article_id).count() == 0, (
        "ArticleImportSource should cascade-delete with its Article"
    )


def test_article_import_source_relationship_is_single(db: Session) -> None:
    """Article.import_source is uselist=False; each article has at most one."""
    article = _make_article(db)
    db.add(
        ArticleImportSource(
            article_id=article.id,
            source_identifier="https://medium.com/p/ddd",
            source_type="medium",
            format_name="medium_html_export",
        )
    )
    db.flush()
    db.refresh(article)
    assert article.import_source is not None
    assert article.import_source.source_identifier == "https://medium.com/p/ddd"


def test_unique_per_article(db: Session) -> None:
    """Two import-source rows on the same article must be rejected.

    The article_id column carries a UNIQUE constraint so the
    one-to-one (uselist=False) relationship is enforced at the DB
    layer, not just by SQLAlchemy bookkeeping.
    """
    article = _make_article(db)
    db.add(
        ArticleImportSource(
            article_id=article.id,
            source_identifier="https://medium.com/p/eee",
            source_type="medium",
            format_name="medium_html_export",
        )
    )
    db.flush()
    db.add(
        ArticleImportSource(
            article_id=article.id,
            source_identifier="https://substack.com/p/eee",
            source_type="substack",
            format_name="substack_export",
        )
    )
    with pytest.raises(Exception):  # noqa: BLE001 - SQLAlchemy raises IntegrityError
        db.flush()


def test_conversion_warnings_default_empty_list(db: Session) -> None:
    article = _make_article(db)
    src = ArticleImportSource(
        article_id=article.id,
        source_identifier="https://medium.com/p/fff",
        source_type="medium",
        format_name="medium_html_export",
    )
    db.add(src)
    db.flush()
    db.refresh(src)
    assert json.loads(src.conversion_warnings) == []
    assert json.loads(src.import_metadata) == {}
