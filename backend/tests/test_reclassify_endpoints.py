"""Tests for the reciprocal reclassify endpoints (v0.32.0 F2b).

Two endpoints under test:
- POST /api/articles/{id}/reclassify-as-comment
- POST /api/comments/{id}/reclassify-as-article

Both are transactional move (insert + delete in one commit).
Field translation lives in ``app.services.reclassify``; routers
under test just exercise the HTTP layer + the not-found / 400
branches.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleComment, ArticleImportSource

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_article(title: str = "Host Article", **extra) -> str:
    payload = {"title": title, **extra}
    resp = client.post("/api/articles", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _seed_article_with_tiptap(title: str, body_text: str) -> str:
    article_id = _create_article(title)
    tiptap = json.dumps(
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": body_text}],
                }
            ],
        }
    )
    resp = client.patch(f"/api/articles/{article_id}", json={"content_json": tiptap})
    assert resp.status_code == 200, resp.text
    return article_id


def _seed_comment(
    body_text: str,
    *,
    imported_from: str = "medium",
    canonical_url: str | None = None,
    author: str | None = None,
) -> str:
    """Insert a comment directly via the DB (no public POST endpoint)."""
    db = SessionLocal()
    try:
        comment = ArticleComment(
            author=author,
            body_text=body_text,
            body_json=json.dumps(
                {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": body_text}],
                        }
                    ],
                }
            ),
            language="en",
            canonical_url=canonical_url,
            imported_from=imported_from,
            imported_at=datetime.now(UTC),
        )
        db.add(comment)
        db.commit()
        return comment.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Article -> Comment
# ---------------------------------------------------------------------------


def test_reclassify_article_as_comment_happy_path() -> None:
    article_id = _seed_article_with_tiptap(
        "Misclassified reply", "Your point about X is well taken. What do you think?"
    )

    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["deleted_article_id"] == article_id
    comment_id = body["comment_id"]
    assert comment_id and comment_id != article_id

    # Article is gone (hard-deleted as part of the move).
    assert client.get(f"/api/articles/{article_id}").status_code == 404

    # Comment exists with the expected fields.
    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).one()
        assert comment.body_text == "Your point about X is well taken. What do you think?"
        assert comment.language == "en"
        assert comment.imported_from == "manual"  # no import_source on the article
        assert comment.responds_to_url is None
        assert comment.responds_to_article_id is None
    finally:
        db.close()


def test_reclassify_article_as_comment_with_target_link() -> None:
    """When responds_to_article_id is provided AND points at a real
    article, the new comment is linked, not an orphan."""
    target_id = _create_article("Target host")
    source_id = _seed_article_with_tiptap("Should be a comment", "Reply body. ")

    resp = client.post(
        f"/api/articles/{source_id}/reclassify-as-comment",
        json={"responds_to_article_id": target_id},
    )
    assert resp.status_code == 200, resp.text
    comment_id = resp.json()["comment_id"]

    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).one()
        assert comment.responds_to_article_id == target_id
    finally:
        db.close()


def test_reclassify_article_as_comment_with_url_pointer() -> None:
    """responds_to_url is preserved without requiring the linked
    article to exist in the local DB (the external-pointer case)."""
    article_id = _seed_article_with_tiptap("Should be a comment", "Reply body. ")
    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={"responds_to_url": "https://medium.com/p/external"},
    )
    assert resp.status_code == 200
    comment_id = resp.json()["comment_id"]

    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).one()
        assert comment.responds_to_url == "https://medium.com/p/external"
        assert comment.responds_to_article_id is None
    finally:
        db.close()


def test_reclassify_article_as_comment_404_when_article_missing() -> None:
    resp = client.post(
        "/api/articles/does-not-exist/reclassify-as-comment",
        json={},
    )
    assert resp.status_code == 404


def test_reclassify_article_as_comment_400_when_target_article_missing() -> None:
    article_id = _seed_article_with_tiptap("Reply candidate", "Reply body. ")
    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={"responds_to_article_id": "ghost-article-id"},
    )
    assert resp.status_code == 400
    # Original article must still be present — the 400 fires BEFORE
    # any state mutation.
    assert client.get(f"/api/articles/{article_id}").status_code == 200


def test_reclassify_article_preserves_provenance_via_import_source() -> None:
    """When the source article had an ArticleImportSource row, the
    comment carries the source_type as imported_from."""
    article_id = _seed_article_with_tiptap("Imported reply", "Reply body. ")
    db = SessionLocal()
    try:
        source = ArticleImportSource(
            article_id=article_id,
            source_identifier="https://medium.com/p/abc",
            source_type="medium",
            format_name="medium_html_export",
            import_metadata=json.dumps({"source_filename": "2025-01-01_reply.html"}),
        )
        db.add(source)
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={},
    )
    assert resp.status_code == 200
    comment_id = resp.json()["comment_id"]

    db = SessionLocal()
    try:
        comment = db.query(ArticleComment).filter(ArticleComment.id == comment_id).one()
        assert comment.imported_from == "medium"
        assert comment.source_filename == "2025-01-01_reply.html"
    finally:
        db.close()


def test_reclassify_article_as_comment_is_atomic() -> None:
    """Sanity-check that on success exactly one row exists in each
    table for the moved entity — no source-only or destination-only
    half-state."""
    article_id = _seed_article_with_tiptap("Atomic check", "Reply body. ")
    db = SessionLocal()
    try:
        article_count_before = db.query(Article).filter(Article.id == article_id).count()
        comment_count_before = db.query(ArticleComment).count()
    finally:
        db.close()

    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={},
    )
    assert resp.status_code == 200
    comment_id = resp.json()["comment_id"]

    db = SessionLocal()
    try:
        article_count_after = db.query(Article).filter(Article.id == article_id).count()
        comment_count_after = db.query(ArticleComment).count()
        assert article_count_before == 1
        assert article_count_after == 0
        assert comment_count_after == comment_count_before + 1
        # And the new comment is the one named in the response.
        assert db.query(ArticleComment).filter(ArticleComment.id == comment_id).count() == 1
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Comment -> Article
# ---------------------------------------------------------------------------


def test_reclassify_comment_as_article_happy_path() -> None:
    comment_id = _seed_comment(
        "This is actually a real article about a topic. " * 5,
        imported_from="manual",
        author="Asterios",
    )

    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["deleted_comment_id"] == comment_id
    article_id = body["article_id"]

    # Article exists and carries the comment's fields.
    resp = client.get(f"/api/articles/{article_id}")
    assert resp.status_code == 200
    article = resp.json()
    assert article["author"] == "Asterios"
    assert article["language"] == "en"
    # Title derived from body — first sentence-ish, capped at 200 chars.
    assert article["title"].startswith("This is actually a real article")

    # Comment is hard-deleted.
    db = SessionLocal()
    try:
        assert db.query(ArticleComment).filter(ArticleComment.id == comment_id).count() == 0
    finally:
        db.close()


def test_reclassify_comment_as_article_long_body_truncates_title() -> None:
    """When body_text exceeds 200 chars, the derived title is
    truncated at word boundary + ``...``."""
    long_body = "Word " * 80  # 400 chars
    comment_id = _seed_comment(long_body)

    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200
    title = client.get(f"/api/articles/{resp.json()['article_id']}").json()["title"]
    assert title.endswith("...")
    # The auto-cap is 200 chars + "..." (3) = max 203 chars.
    assert len(title) <= 203
    # Word-boundary trim — no half-word at the end (apart from "...").
    head = title[:-3].rstrip()
    assert not head.endswith("Wor")


def test_reclassify_comment_as_article_empty_body_uses_stub_title() -> None:
    comment_id = _seed_comment("")
    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200
    title = client.get(f"/api/articles/{resp.json()['article_id']}").json()["title"]
    assert title == "Reclassified comment"


def test_reclassify_comment_recreates_import_source() -> None:
    """When the comment carries a non-manual imported_from AND a
    canonical_url, the new article gets an ArticleImportSource
    row so provenance survives."""
    comment_id = _seed_comment(
        "Body text. " * 5,
        imported_from="medium",
        canonical_url="https://medium.com/p/xyz",
    )

    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200
    article_id = resp.json()["article_id"]

    db = SessionLocal()
    try:
        source = (
            db.query(ArticleImportSource)
            .filter(ArticleImportSource.article_id == article_id)
            .first()
        )
        assert source is not None
        assert source.source_type == "medium"
        assert source.source_identifier == "https://medium.com/p/xyz"
    finally:
        db.close()


def test_reclassify_comment_skips_import_source_when_manual() -> None:
    """Native (imported_from='manual') comments don't get a
    spurious ArticleImportSource row even when they happen to
    carry a canonical_url."""
    comment_id = _seed_comment(
        "Body text. " * 5,
        imported_from="manual",
        canonical_url="https://example.com/local",
    )

    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200
    article_id = resp.json()["article_id"]

    db = SessionLocal()
    try:
        source_count = (
            db.query(ArticleImportSource)
            .filter(ArticleImportSource.article_id == article_id)
            .count()
        )
        assert source_count == 0
    finally:
        db.close()


def test_reclassify_comment_404_when_missing() -> None:
    resp = client.post("/api/comments/ghost-comment-id/reclassify-as-article", json={})
    assert resp.status_code == 404


def test_reclassify_comment_round_trip_preserves_body() -> None:
    """Article → Comment → Article round-trip: body_json survives
    the two moves intact. (Title and other Article-only fields
    are NOT preserved — they're discarded on the first move and
    derived/defaulted on the way back.)"""
    body_text = "Round-trip body for the preservation check. " * 3
    article_id = _seed_article_with_tiptap("Trip-1 title", body_text)
    original_content = client.get(f"/api/articles/{article_id}").json()["content_json"]

    resp = client.post(
        f"/api/articles/{article_id}/reclassify-as-comment",
        json={},
    )
    assert resp.status_code == 200
    comment_id = resp.json()["comment_id"]

    resp = client.post(f"/api/comments/{comment_id}/reclassify-as-article", json={})
    assert resp.status_code == 200
    article_back_id = resp.json()["article_id"]

    article_back = client.get(f"/api/articles/{article_back_id}").json()
    assert article_back["content_json"] == original_content
    assert article_back["language"] == "en"
