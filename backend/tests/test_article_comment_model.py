"""Tests for the ArticleComment model.

MEDIUM-COMMENTS-IMPORT-01 commit 1. Covers create, the FK
relationship to Article, NULL FK for orphans, and the
SET-NULL-on-article-delete semantics (comments survive
article deletion as orphans, deliberately NOT cascade-deleted).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Article, ArticleComment


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_article(db: Session, title: str = "Host Article") -> Article:
    article = Article(title=title, language="en")
    db.add(article)
    db.flush()
    return article


def test_create_with_article_link(db: Session) -> None:
    article = _make_article(db)
    db.add(
        ArticleComment(
            body_text="Thanks for the writeup!",
            language="en",
            responds_to_article_id=article.id,
            responds_to_url="https://example.com/host",
            imported_from="medium",
        )
    )
    db.flush()
    row = (
        db.query(ArticleComment)
        .filter_by(responds_to_article_id=article.id)
        .one()
    )
    assert row.body_text == "Thanks for the writeup!"
    assert row.imported_from == "medium"
    assert row.responds_to_url == "https://example.com/host"
    assert row.deleted_at is None


def test_orphan_comment_has_null_fk(db: Session) -> None:
    db.add(
        ArticleComment(
            body_text="Orphan response, host article unknown",
            language="en",
            responds_to_url="https://example.com/some-other-article",
            imported_from="medium",
        )
    )
    db.flush()
    row = (
        db.query(ArticleComment)
        .filter_by(responds_to_url="https://example.com/some-other-article")
        .one()
    )
    assert row.responds_to_article_id is None
    assert row.responds_to_url == "https://example.com/some-other-article"


def test_article_comments_relationship_loads_linked_comments(db: Session) -> None:
    article = _make_article(db)
    db.add_all(
        [
            ArticleComment(
                body_text="First reply",
                published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                responds_to_article_id=article.id,
                imported_from="medium",
            ),
            ArticleComment(
                body_text="Second reply",
                published_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
                responds_to_article_id=article.id,
                imported_from="medium",
            ),
        ]
    )
    db.flush()
    db.refresh(article)
    assert [c.body_text for c in article.comments] == ["First reply", "Second reply"]


def test_article_delete_sets_fk_to_null_not_cascade(db: Session) -> None:
    """Deleting an article must NOT delete the comments that
    respond to it - they survive as orphans. The FK flips to
    NULL via ``ON DELETE SET NULL``."""
    article = _make_article(db, title="Doomed Host")
    db.add(
        ArticleComment(
            body_text="Will outlive the article",
            responds_to_article_id=article.id,
            responds_to_url="https://example.com/doomed",
            imported_from="medium",
        )
    )
    db.flush()
    comment_id = (
        db.query(ArticleComment.id)
        .filter_by(responds_to_article_id=article.id)
        .scalar()
    )
    assert comment_id is not None

    db.delete(article)
    db.commit()

    surviving = db.query(ArticleComment).filter_by(id=comment_id).one()
    assert surviving.responds_to_article_id is None
    # URL preserved for re-linkage.
    assert surviving.responds_to_url == "https://example.com/doomed"


def test_imported_from_is_required(db: Session) -> None:
    """``imported_from`` is NOT NULL at the DB level. v1 always
    sets it to ``"medium"``; future importers set their own value."""
    db.add(
        ArticleComment(
            body_text="Should fail without imported_from",
            language="en",
        )
    )
    with pytest.raises(Exception):
        db.flush()


def test_default_language_is_en(db: Session) -> None:
    comment = ArticleComment(
        body_text="Defaults to English",
        imported_from="medium",
    )
    db.add(comment)
    db.flush()
    db.refresh(comment)
    assert comment.language == "en"
