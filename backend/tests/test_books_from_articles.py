"""Article-to-book conversion (Phase 1) integration tests.

Backs ``POST /api/books/from-articles``. Per the user's confirmed
test checklist:

- sort strategies (date asc/desc, title asc/desc, manual),
- front-matter combinations (each individually, all together, none),
- back-matter combinations,
- transactional rollback on chapter-creation failure,
- Q10 validation (non-article content_type -> 422 with offending ids),
- Q11 validation (trashed articles -> 422 with offending ids),
- Q13 subtitle pre-fill (single-article case),
- Q15 cover image pre-fill (single-article with featured_image case),
- empty-body article produces empty chapter (no warning),
- tag aggregation (deduped union),
- series auto-fill from shared article series.

All offending ids surface in a single 422 response (no first-found-
first-failed), per the user's meta-point 3 confirmation.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Article, Book

client = TestClient(app)


# --- helpers -------------------------------------------------------------


def _create_article(
    title: str,
    *,
    content_json: str | None = None,
    tags: list[str] | None = None,
    series: str | None = None,
    subtitle: str | None = None,
    featured_image_url: str | None = None,
    created_at: datetime | None = None,
    deleted_at: datetime | None = None,
    content_type: str = "article",
) -> str:
    """Insert an Article directly via SQLAlchemy.

    Direct insert beats the API path for these tests because
    ArticleCreate intentionally rejects many of the fields we need
    to seed (content_json, tags, deleted_at, content_type, created_at).
    """
    session = SessionLocal()
    try:
        article = Article(
            title=title,
            subtitle=subtitle,
            content_json=content_json or "",
            tags=json.dumps(tags or []),
            series=series,
            featured_image_url=featured_image_url,
            content_type=content_type,
            deleted_at=deleted_at,
        )
        session.add(article)
        session.flush()
        if created_at is not None:
            article.created_at = created_at
        session.commit()
        return article.id
    finally:
        session.close()


def _convert(article_ids: list[str], **overrides) -> dict:
    """Default to a non-empty author so the mandatory-author gate
    in ``books._validate_author`` does not reject the request. Tests
    can still override via ``author=...`` to exercise the gate."""
    payload: dict = {
        "title": "Converted Book",
        "author": "Test Author",
        "article_ids": article_ids,
    }
    payload.update(overrides)
    resp = client.post("/api/books/from-articles", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- happy path ----------------------------------------------------------


def test_create_minimal_one_article_book() -> None:
    article_id = _create_article("Solo")
    body = _convert([article_id], title="One-chapter Book")
    assert body["title"] == "One-chapter Book"
    assert len(body["chapters"]) == 1
    assert body["chapters"][0]["title"] == "Solo"
    assert body["chapters"][0]["chapter_type"] == "chapter"
    assert body["chapters"][0]["position"] == 0


def test_create_multi_article_book_preserves_content() -> None:
    payload_content = json.dumps({"type": "doc", "content": []})
    a1 = _create_article("First", content_json=payload_content)
    a2 = _create_article("Second", content_json='{"type":"doc","content":[]}')
    body = _convert([a1, a2], sort_strategy="title_asc")
    assert len(body["chapters"]) == 2
    titles = [c["title"] for c in body["chapters"]]
    assert titles == ["First", "Second"]
    # Content survives byte-identical.
    assert body["chapters"][0]["content"] == payload_content


# --- sort strategies -----------------------------------------------------


def test_sort_strategy_date_asc_uses_created_at_fallback() -> None:
    earliest = datetime(2020, 1, 1, tzinfo=UTC)
    a_old = _create_article("Old", created_at=earliest)
    a_mid = _create_article("Mid", created_at=earliest + timedelta(days=10))
    a_new = _create_article("New", created_at=earliest + timedelta(days=20))
    body = _convert([a_new, a_mid, a_old], sort_strategy="date_asc")
    assert [c["title"] for c in body["chapters"]] == ["Old", "Mid", "New"]


def test_sort_strategy_date_desc() -> None:
    base = datetime(2020, 1, 1, tzinfo=UTC)
    a1 = _create_article("Old", created_at=base)
    a2 = _create_article("New", created_at=base + timedelta(days=5))
    body = _convert([a1, a2], sort_strategy="date_desc")
    assert [c["title"] for c in body["chapters"]] == ["New", "Old"]


def test_sort_strategy_title_asc_case_insensitive() -> None:
    a_lower = _create_article("apple")
    a_upper = _create_article("Banana")
    a_third = _create_article("cherry")
    body = _convert([a_third, a_upper, a_lower], sort_strategy="title_asc")
    assert [c["title"] for c in body["chapters"]] == ["apple", "Banana", "cherry"]


def test_sort_strategy_title_desc() -> None:
    a_a = _create_article("Alpha")
    a_b = _create_article("Beta")
    body = _convert([a_a, a_b], sort_strategy="title_desc")
    assert [c["title"] for c in body["chapters"]] == ["Beta", "Alpha"]


def test_sort_strategy_manual_uses_explicit_order() -> None:
    a1 = _create_article("First-by-name")
    a2 = _create_article("Second-by-name")
    a3 = _create_article("Third-by-name")
    body = _convert(
        [a1, a2, a3],
        sort_strategy="manual",
        manual_order=[a3, a1, a2],
    )
    assert [c["title"] for c in body["chapters"]] == [
        "Third-by-name",
        "First-by-name",
        "Second-by-name",
    ]


def test_sort_strategy_manual_requires_manual_order() -> None:
    a1 = _create_article("A")
    resp = client.post(
        "/api/books/from-articles",
        json={
            "title": "X",
            "author": "T",
            "article_ids": [a1],
            "sort_strategy": "manual",
        },
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"]["code"] == "manual_order_required"


def test_sort_strategy_manual_rejects_mismatched_order() -> None:
    a1 = _create_article("A")
    a2 = _create_article("B")
    resp = client.post(
        "/api/books/from-articles",
        json={
            "title": "X",
            "author": "T",
            "article_ids": [a1, a2],
            "sort_strategy": "manual",
            "manual_order": [a1, a1],  # duplicate, missing a2
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "manual_order_mismatch"


# --- front-matter --------------------------------------------------------


def test_front_matter_title_page_only() -> None:
    a1 = _create_article("Article")
    body = _convert(
        [a1],
        title="Volume One",
        front_matter={"include_title_page": True},
    )
    assert len(body["chapters"]) == 2
    assert body["chapters"][0]["title"] == "Volume One"
    assert body["chapters"][0]["chapter_type"] == "title_page"
    assert body["chapters"][0]["position"] == 0
    assert body["chapters"][1]["title"] == "Article"


def test_front_matter_all_three_ordering() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        title="Full Front",
        front_matter={
            "include_title_page": True,
            "include_dedication": True,
            "dedication_text": "For everyone.",
            "include_introduction": True,
            "introduction_text": "This book matters.",
        },
    )
    types = [c["chapter_type"] for c in body["chapters"]]
    assert types == ["title_page", "dedication", "introduction", "chapter"]
    # Dedication text wrapped as a single-paragraph TipTap doc.
    dedication_doc = json.loads(body["chapters"][1]["content"])
    assert dedication_doc["type"] == "doc"
    assert dedication_doc["content"][0]["content"][0]["text"] == "For everyone."


def test_front_matter_dedication_only_no_text_yields_empty_content() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        front_matter={"include_dedication": True},
    )
    assert body["chapters"][0]["chapter_type"] == "dedication"
    assert body["chapters"][0]["content"] == ""


def test_front_matter_omitted_produces_no_extra_chapters() -> None:
    a1 = _create_article("Body")
    body = _convert([a1])
    assert len(body["chapters"]) == 1
    assert body["chapters"][0]["chapter_type"] == "chapter"


def test_front_matter_custom_titles_override_defaults() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        front_matter={
            "include_dedication": True,
            "dedication_title": "Widmung",
            "include_introduction": True,
            "introduction_title": "Einleitung",
        },
    )
    assert body["chapters"][0]["title"] == "Widmung"
    assert body["chapters"][1]["title"] == "Einleitung"


# --- back-matter ---------------------------------------------------------


def test_back_matter_both_in_order() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        back_matter={
            "include_acknowledgments": True,
            "acknowledgments_text": "Thanks.",
            "include_author_bio": True,
            "author_bio_text": "An author.",
        },
    )
    types = [c["chapter_type"] for c in body["chapters"]]
    assert types == ["chapter", "acknowledgments", "about_author"]


def test_back_matter_acknowledgments_only() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        back_matter={"include_acknowledgments": True},
    )
    types = [c["chapter_type"] for c in body["chapters"]]
    assert types == ["chapter", "acknowledgments"]


def test_front_and_back_matter_together() -> None:
    a1 = _create_article("Body")
    body = _convert(
        [a1],
        front_matter={"include_title_page": True, "include_introduction": True},
        back_matter={"include_acknowledgments": True, "include_author_bio": True},
    )
    types = [c["chapter_type"] for c in body["chapters"]]
    assert types == [
        "title_page",
        "introduction",
        "chapter",
        "acknowledgments",
        "about_author",
    ]
    positions = [c["position"] for c in body["chapters"]]
    assert positions == [0, 1, 2, 3, 4]


# --- Q10 + Q11 validation gates ------------------------------------------


def test_rejects_non_article_content_type_with_422() -> None:
    a_ok = _create_article("OK")
    a_bad = _create_article("Tweet", content_type="tweet")
    resp = client.post(
        "/api/books/from-articles",
        json={"title": "X", "author": "T", "article_ids": [a_ok, a_bad]},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["code"] == "invalid_articles"
    bad_ids = [item["id"] for item in detail["non_article"]]
    assert bad_ids == [a_bad]
    assert detail["non_article"][0]["content_type"] == "tweet"


def test_rejects_trashed_article_with_422() -> None:
    a_ok = _create_article("OK")
    a_trash = _create_article("Trashed", deleted_at=datetime.now(UTC))
    resp = client.post(
        "/api/books/from-articles",
        json={"title": "X", "author": "T", "article_ids": [a_ok, a_trash]},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    trashed_ids = [item["id"] for item in detail["trashed"]]
    assert trashed_ids == [a_trash]


def test_rejects_unknown_article_id_with_422() -> None:
    a_ok = _create_article("OK")
    resp = client.post(
        "/api/books/from-articles",
        json={
            "title": "X",
            "author": "T",
            "article_ids": [a_ok, "deadbeefdeadbeefdeadbeefdeadbeef"],
        },
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["not_found_ids"] == ["deadbeefdeadbeefdeadbeefdeadbeef"]


def test_collects_all_offending_ids_in_single_response() -> None:
    """User's meta-point 3: surface ALL offending IDs in single response.

    Trashed + non-article + not-found should ALL be listed in the
    same 422 so the user can fix the entire selection in one pass.
    """
    a_ok = _create_article("OK")
    a_trash = _create_article("Trash", deleted_at=datetime.now(UTC))
    a_tweet = _create_article("Tweet", content_type="tweet")
    unknown = "0123456789abcdef0123456789abcdef"
    resp = client.post(
        "/api/books/from-articles",
        json={"title": "X", "author": "T", "article_ids": [a_ok, a_trash, a_tweet, unknown]},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert {item["id"] for item in detail["trashed"]} == {a_trash}
    assert {item["id"] for item in detail["non_article"]} == {a_tweet}
    assert detail["not_found_ids"] == [unknown]


# --- Q13 + Q15 single-article pre-fills ----------------------------------


def test_q13_pre_fills_subtitle_from_single_article() -> None:
    a1 = _create_article("Solo", subtitle="My Subtitle")
    body = _convert([a1], title="A Book")  # no subtitle in payload
    assert body["subtitle"] == "My Subtitle"


def test_q13_explicit_subtitle_wins_over_article_subtitle() -> None:
    a1 = _create_article("Solo", subtitle="Article Subtitle")
    body = _convert([a1], title="A Book", subtitle="Wizard Subtitle")
    assert body["subtitle"] == "Wizard Subtitle"


def test_q13_multi_article_does_not_pre_fill_subtitle() -> None:
    a1 = _create_article("First", subtitle="Sub1")
    a2 = _create_article("Second", subtitle="Sub2")
    body = _convert([a1, a2], title="A Book")
    assert body["subtitle"] is None


def test_q15_pre_fills_cover_from_single_article_featured_image() -> None:
    a1 = _create_article("Solo", featured_image_url="https://example/img.jpg")
    body = _convert([a1], title="A Book")
    assert body["cover_image"] == "https://example/img.jpg"


def test_q15_multi_article_does_not_pre_fill_cover() -> None:
    a1 = _create_article("First", featured_image_url="https://example/1.jpg")
    a2 = _create_article("Second", featured_image_url="https://example/2.jpg")
    body = _convert([a1, a2], title="A Book")
    assert body["cover_image"] is None


# --- empty body produces empty chapter (no warning) ----------------------


def test_empty_body_article_produces_empty_chapter() -> None:
    a1 = _create_article("Empty", content_json="")
    body = _convert([a1])
    assert body["chapters"][0]["title"] == "Empty"
    assert body["chapters"][0]["content"] == ""


# --- tag aggregation -----------------------------------------------------


def test_keywords_aggregate_article_tags_deduped() -> None:
    a1 = _create_article("A", tags=["health", "fitness"])
    a2 = _create_article("B", tags=["Health", "Nutrition"])  # case-dup of "health"
    body = _convert([a1, a2], title="Combined")
    # Case-insensitive dedup; first-seen casing preserved.
    assert body["keywords"] == ["health", "fitness", "Nutrition"]


def test_keywords_payload_wins_over_article_tags_in_order() -> None:
    a1 = _create_article("A", tags=["health"])
    body = _convert(
        [a1],
        title="Combined",
        keywords=["Explicit", "Health"],  # case-dup of article tag
    )
    # Explicit first (user intent), article tags second; dedup case-
    # insensitive.
    assert body["keywords"] == ["Explicit", "Health"]


# --- shared-series auto-fill --------------------------------------------


def test_series_auto_filled_when_articles_share_value() -> None:
    a1 = _create_article("A", series="Living Health")
    a2 = _create_article("B", series="Living Health")
    body = _convert([a1, a2], title="Combined")
    assert body["series"] == "Living Health"


def test_series_explicit_override_wins() -> None:
    a1 = _create_article("A", series="Living Health")
    body = _convert([a1], title="Combined", series="My Custom Series")
    assert body["series"] == "My Custom Series"


def test_series_none_when_articles_disagree() -> None:
    a1 = _create_article("A", series="Series-1")
    a2 = _create_article("B", series="Series-2")
    body = _convert([a1, a2], title="Combined")
    assert body["series"] is None


def test_series_none_when_one_article_unset() -> None:
    """Partial-fill counts as 'mixed': don't auto-fill from a
    minority. The spec says 'shared by every article'."""
    a1 = _create_article("A", series="Some Series")
    a2 = _create_article("B")  # series None
    body = _convert([a1, a2], title="Combined")
    assert body["series"] is None


# --- transactional rollback ----------------------------------------------


def test_rollback_on_chapter_creation_failure(monkeypatch) -> None:
    """Force the chapter-creation step to fail mid-way and assert that
    no orphaned Book row survives.

    Starlette's TestClient re-raises unhandled exceptions by default.
    Use a scoped client with ``raise_server_exceptions=False`` so the
    test sees a 500 response (production behaviour) instead of the
    exception propagating into the test code. Then verify the DB
    directly — the API path itself isn't load-bearing for this
    assertion; rollback semantics are.
    """
    from app.routers import books as books_router

    a1 = _create_article("Should Roll Back: source article")

    original_chapter = books_router.Chapter

    class BoomChapter:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(books_router, "Chapter", BoomChapter)

    try:
        with TestClient(app, raise_server_exceptions=False) as boom_client:
            resp = boom_client.post(
                "/api/books/from-articles",
                json={
                    "title": "Should Roll Back",
                    "author": "T",
                    "article_ids": [a1],
                },
            )
            assert resp.status_code == 500
    finally:
        monkeypatch.setattr(books_router, "Chapter", original_chapter)

    # No book with the rollback-test title should survive; query the
    # DB directly so the assertion is independent of the API path.
    session = SessionLocal()
    try:
        surviving = session.query(Book).filter(Book.title == "Should Roll Back").all()
        assert surviving == []
    finally:
        session.close()


# --- original Article rows untouched -------------------------------------


def test_source_articles_persist_after_conversion() -> None:
    """Decoupled lifecycle: original Articles stay live and unchanged."""
    a1 = _create_article("Original A")
    a2 = _create_article("Original B")
    body = _convert([a1, a2], sort_strategy="title_asc")
    assert len(body["chapters"]) == 2

    # Both source articles still resolvable, still active.
    for aid, title in ((a1, "Original A"), (a2, "Original B")):
        resp = client.get(f"/api/articles/{aid}")
        assert resp.status_code == 200, resp.text
        article = resp.json()
        assert article["title"] == title
        assert article["deleted_at"] is None


# --- validation ----------------------------------------------------------


def test_empty_article_ids_rejected_as_422() -> None:
    resp = client.post(
        "/api/books/from-articles",
        json={"title": "X", "author": "T", "article_ids": []},
    )
    assert resp.status_code == 422


def test_missing_title_rejected_as_422() -> None:
    a1 = _create_article("A")
    resp = client.post("/api/books/from-articles", json={"author": "T", "article_ids": [a1]})
    assert resp.status_code == 422
