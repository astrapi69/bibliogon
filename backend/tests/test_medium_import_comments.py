"""End-to-end tests for MEDIUM-COMMENTS-IMPORT-01.

Covers all three ``import_comments_mode`` values + both
``orphan_comment_handling`` values + the response-payload
shape that callers depend on for counts.

Walker / heuristic-internal coverage lives in the plugin's
test_walker.py. Settings-normalization unit tests live in the
plugin's test_plugin.py. This file is end-to-end:
HTTP request -> walker -> importer -> DB -> response.
"""

from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleComment


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Inline HTML fixtures
# ---------------------------------------------------------------------------


_COMMENT_HTML = """\
<!DOCTYPE html><html><head><title>Thanks</title></head><body>
<article>
<header>
  <a class="p-canonical" href="https://medium.com/@u/thanks-c0ffee01"></a>
  <h1 class="p-name">Thanks for the writeup!</h1>
</header>
<section data-field="subtitle"></section>
<section data-field="body">
  <section class="section section--body"><div class="section-content"><div class="section-inner">
    <p class="graf graf--p">Thanks for sharing this. Really useful breakdown.</p>
  </div></div></section>
</section>
</article>
</body></html>
"""


# Mirrors the Medium auto-filled-subtitle case from the 209-file
# pre-inspection audit: subtitle is the second paragraph of the
# reply body. Heuristic must still classify this as a comment
# because we dropped the empty-subtitle criterion.
_COMMENT_WITH_AUTOFILL_SUBTITLE_HTML = """\
<!DOCTYPE html><html><head><title>Pointing out</title></head><body>
<article>
<header>
  <a class="p-canonical" href="https://medium.com/@u/pointing-out-c0ffee02"></a>
  <h1 class="p-name">Thanks for pointing that out</h1>
</header>
<section data-field="subtitle" class="p-summary">
The script is here on GitHub.
</section>
<section data-field="body">
  <section class="section section--body"><div class="section-content"><div class="section-inner">
    <p class="graf graf--p">Thanks for pointing that out - you're right. I'll fix the link.</p>
    <p class="graf graf--p">The script is here on GitHub.</p>
  </div></div></section>
</section>
</article>
</body></html>
"""


# Articles need either body >= 500 chars or a structural node.
# This one uses a heading so the heuristic rules it out as a comment.
_ARTICLE_HTML = """\
<!DOCTYPE html><html><head><title>Real article</title></head><body>
<article>
<header>
  <a class="p-canonical" href="https://medium.com/@u/article-deadbeef"></a>
  <h1 class="p-name">A real article with structure</h1>
</header>
<section data-field="subtitle" class="p-summary">My subtitle</section>
<section data-field="body">
  <section class="section section--body"><div class="section-content"><div class="section-inner">
    <h3 class="graf graf--h3">Section heading</h3>
    <p class="graf graf--p">Long enough body with structural element above.</p>
  </div></div></section>
</section>
</article>
</body></html>
"""


def _build_zip(named: list[tuple[str, str]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, html in named:
            zf.writestr(f"posts/{name}", html.encode("utf-8"))
    return buf.getvalue()


def _post_zip(client: TestClient, zip_bytes: bytes, settings: dict) -> dict:
    """POST a zip + override settings via set_config; returns the
    response JSON body. Always patches download_images to a no-op
    so we don't try to fetch from cdn-images-1.medium.com in tests."""
    from bibliogon_medium_import import routes as mi_routes
    from bibliogon_medium_import.image_downloader import DownloadResult
    from unittest.mock import patch

    def _fake_download(images, article_id, **kwargs):
        return DownloadResult(url_rewrites={}, saved_filenames=[], warnings=[])

    full = {"settings": settings}
    previous = mi_routes._config
    try:
        mi_routes._config = full
        with patch(
            "bibliogon_medium_import.importer.download_images",
            side_effect=_fake_download,
        ):
            resp = client.post(
                "/api/medium-import/import",
                files={
                    "file": (
                        "test.zip",
                        zip_bytes,
                        "application/zip",
                    )
                },
            )
    finally:
        mi_routes._config = previous
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# import_comments_mode = "as_comments" (default)
# ---------------------------------------------------------------------------


def test_as_comments_routes_comment_to_article_comments_table(
    client: TestClient, db: Session
) -> None:
    body = _post_zip(
        client,
        _build_zip([("comment.html", _COMMENT_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    assert body["imported_count"] == 0
    assert body["imported_comments_count"] == 1
    # DB state: zero new articles, one new comment, comment is orphan.
    comment_id = body["imported_comments"][0]["id"]
    row = db.query(ArticleComment).filter_by(id=comment_id).one()
    assert row.responds_to_article_id is None
    assert row.imported_from == "medium"
    assert "Thanks for sharing" in row.body_text


def test_as_comments_keeps_article_shaped_post_as_article(
    client: TestClient, db: Session
) -> None:
    body = _post_zip(
        client,
        _build_zip([("article.html", _ARTICLE_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    assert body["imported_count"] == 1
    assert body["imported_comments_count"] == 0


def test_as_comments_partitions_mixed_batch(
    client: TestClient, db: Session
) -> None:
    body = _post_zip(
        client,
        _build_zip(
            [
                ("article.html", _ARTICLE_HTML),
                ("comment.html", _COMMENT_HTML),
            ]
        ),
        {"import_comments_mode": "as_comments"},
    )
    assert body["imported_count"] == 1
    assert body["imported_comments_count"] == 1
    assert body["skipped_comments_count"] == 0


def test_as_comments_handles_medium_autofill_subtitle_case(
    client: TestClient, db: Session
) -> None:
    """The pre-inspection audit found that Medium auto-fills
    data-field='subtitle' with the second paragraph of the reply
    body when the author wrote no explicit subtitle. The
    heuristic must classify this as a comment - dropping the
    empty-subtitle criterion was the whole point of the
    refinement (8/209 detection vs 6/209 under the original)."""
    body = _post_zip(
        client,
        _build_zip([("autofill.html", _COMMENT_WITH_AUTOFILL_SUBTITLE_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    assert body["imported_count"] == 0
    assert body["imported_comments_count"] == 1


# ---------------------------------------------------------------------------
# import_comments_mode = "as_articles" (legacy)
# ---------------------------------------------------------------------------


def test_as_articles_ignores_heuristic(client: TestClient, db: Session) -> None:
    """Legacy mode: every post becomes an Article regardless of
    heuristic output. Comment table stays empty."""
    body = _post_zip(
        client,
        _build_zip(
            [
                ("comment.html", _COMMENT_HTML),
                ("article.html", _ARTICLE_HTML),
            ]
        ),
        {"import_comments_mode": "as_articles"},
    )
    assert body["imported_count"] == 2
    assert body["imported_comments_count"] == 0
    assert body["skipped_comments_count"] == 0


# ---------------------------------------------------------------------------
# import_comments_mode = "skip"
# ---------------------------------------------------------------------------


def test_skip_drops_comment_without_persisting(
    client: TestClient, db: Session
) -> None:
    body = _post_zip(
        client,
        _build_zip([("comment.html", _COMMENT_HTML)]),
        {"import_comments_mode": "skip"},
    )
    assert body["imported_count"] == 0
    assert body["imported_comments_count"] == 0
    assert body["skipped_comments_count"] == 1
    assert body["skipped_comments"][0]["reason"] == "mode_skip"


def test_skip_keeps_article_shaped_post_as_article(
    client: TestClient, db: Session
) -> None:
    """skip mode only drops heuristic-classified comments; the
    article path is unaffected."""
    body = _post_zip(
        client,
        _build_zip([("article.html", _ARTICLE_HTML)]),
        {"import_comments_mode": "skip"},
    )
    assert body["imported_count"] == 1
    assert body["skipped_comments_count"] == 0


# ---------------------------------------------------------------------------
# orphan_comment_handling
# ---------------------------------------------------------------------------


def test_orphan_handling_store_default_keeps_orphan(
    client: TestClient, db: Session
) -> None:
    """Default orphan_handling=store: comment lands in the DB
    with responds_to_article_id NULL."""
    body = _post_zip(
        client,
        _build_zip([("comment.html", _COMMENT_HTML)]),
        {
            "import_comments_mode": "as_comments",
            "orphan_comment_handling": "store",
        },
    )
    assert body["imported_comments_count"] == 1
    row = (
        db.query(ArticleComment)
        .filter_by(id=body["imported_comments"][0]["id"])
        .one()
    )
    assert row.responds_to_article_id is None


def test_orphan_handling_skip_drops_medium_comment(
    client: TestClient, db: Session
) -> None:
    """Medium HTML carries no parent-article reference at all so
    every Medium comment IS an orphan. orphan_handling=skip
    therefore drops the comment with reason='orphan_skip'."""
    body = _post_zip(
        client,
        _build_zip([("comment.html", _COMMENT_HTML)]),
        {
            "import_comments_mode": "as_comments",
            "orphan_comment_handling": "skip",
        },
    )
    assert body["imported_count"] == 0
    assert body["imported_comments_count"] == 0
    assert body["skipped_comments_count"] == 1
    assert body["skipped_comments"][0]["reason"] == "orphan_skip"


# ---------------------------------------------------------------------------
# Response payload shape
# ---------------------------------------------------------------------------


def test_response_carries_comment_counts_even_when_zero(
    client: TestClient, db: Session
) -> None:
    """The new counters must always be present in the response,
    even on an article-only import. Callers (frontend) shouldn't
    have to defensively check for missing keys."""
    body = _post_zip(
        client,
        _build_zip([("article.html", _ARTICLE_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    assert "imported_comments_count" in body
    assert "skipped_comments_count" in body
    assert "imported_comments" in body
    assert "skipped_comments" in body
    assert body["imported_comments_count"] == 0
    assert body["skipped_comments_count"] == 0


def test_imported_comment_payload_carries_preview_and_filename(
    client: TestClient, db: Session
) -> None:
    body = _post_zip(
        client,
        _build_zip([("the-reply.html", _COMMENT_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    entry = body["imported_comments"][0]
    assert entry["filename"] == "the-reply.html"
    assert entry["responds_to_article_id"] is None
    assert "Thanks" in entry["body_preview"]
    assert len(entry["body_preview"]) <= 120


# ---------------------------------------------------------------------------
# Composition with the GET endpoints
# ---------------------------------------------------------------------------


def test_imported_comments_visible_in_admin_listing(
    client: TestClient, db: Session
) -> None:
    """End-to-end: importing a comment makes it visible through
    the /api/comments admin endpoint (commit 7), filterable by
    imported_from=medium."""
    _post_zip(
        client,
        _build_zip([("c.html", _COMMENT_HTML)]),
        {"import_comments_mode": "as_comments"},
    )
    listed = client.get(
        "/api/comments?imported_from=medium&orphans_only=true&limit=500"
    ).json()
    assert len(listed) >= 1
    assert any(c["imported_from"] == "medium" for c in listed)
