"""Tests for the articles segment of the backup pipeline.

Covers the v2.0 manifest contract (articles + publications +
article-assets included in `.bgb`) plus backwards-compat with the
legacy v1.0 manifest that has no ``articles/`` segment.

The roundtrip test is the key contract: create N articles + their
publications + featured-image asset rows, run export, wipe the DB,
run import, and assert everything came back identically.
"""

from __future__ import annotations

import json
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Article, ArticleAsset, Book, Chapter, Publication
from app.services.backup.archive_utils import find_articles_dir, find_manifest
from app.services.backup.backup_export import export_backup_archive
from app.services.backup.backup_import import import_backup_archive

client = TestClient(app)


# --- helpers ---


def _create_article(title: str = "Test Article", *, status: str = "draft") -> dict:
    resp = client.post("/api/articles", json={"title": title, "language": "en"})
    assert resp.status_code == 201
    article = resp.json()
    if status != "draft":
        client.patch(f"/api/articles/{article['id']}", json={"status": status})
    return article


def _patch_article(article_id: str, **fields) -> None:
    resp = client.patch(f"/api/articles/{article_id}", json=fields)
    assert resp.status_code == 200, resp.text


def _create_publication(article_id: str, platform: str = "medium") -> dict:
    """Insert directly via the ORM. The HTTP route validates against a
    per-platform schema (medium expects ``title`` + ``tags``) which is
    irrelevant to the backup contract under test - we want a row with
    the article_id FK set, not a fully-validated publish."""
    db = SessionLocal()
    try:
        pub = Publication(
            article_id=article_id,
            platform=platform,
            status="planned",
            platform_metadata="{}",
        )
        db.add(pub)
        db.commit()
        db.refresh(pub)
        return {"id": pub.id, "article_id": pub.article_id, "platform": pub.platform}
    finally:
        db.close()


def _purge_articles(db) -> None:
    """Hard-delete every Article + cascading children. The session
    fixture across tests does not give us a fresh DB so this resets
    just the article-relevant tables for the roundtrip test."""
    db.query(ArticleAsset).delete()
    db.query(Publication).delete()
    db.query(Article).delete()
    db.commit()


def _purge_books(db) -> None:
    db.query(Chapter).delete()
    db.query(Book).delete()
    db.commit()


def _file_upload_from_path(path: Path):
    """Wrap a path as the FastAPI ``UploadFile`` shape via TestClient
    multipart. Returns a fake UploadFile object for the direct service
    call; ``import_backup_archive`` only consumes ``.filename`` and
    ``.file``.
    """

    class _UF:
        def __init__(self, p: Path) -> None:
            self.filename = p.name
            self.file = p.open("rb")

    return _UF(path)


# --- manifest 2.0 export ---


def test_export_manifest_carries_article_counts(tmp_path) -> None:
    """Manifest v2.0 has article_count + publication_count +
    article_asset_count alongside the legacy book_count."""
    db = SessionLocal()
    try:
        _purge_articles(db)
        article = _create_article("Manifest Test")
        _create_publication(article["id"], platform="medium")

        bgb_path, _ = export_backup_archive(db)
    finally:
        db.close()

    extracted = tmp_path / "extracted"
    extracted.mkdir()
    with zipfile.ZipFile(bgb_path, "r") as zf:
        zf.extractall(extracted)

    manifest = find_manifest(extracted)
    assert manifest is not None
    data = json.loads(manifest.read_text(encoding="utf-8"))
    assert data["version"] == "2.0"
    assert data["article_count"] >= 1
    assert data["publication_count"] >= 1
    assert "article_asset_count" in data


def test_export_with_zero_articles_writes_no_articles_dir(tmp_path) -> None:
    """Empty article list = no ``articles/`` directory in the ZIP.
    Manifest still records ``article_count: 0``."""
    db = SessionLocal()
    try:
        _purge_articles(db)
        bgb_path, _ = export_backup_archive(db)
    finally:
        db.close()

    extracted = tmp_path / "extracted"
    extracted.mkdir()
    with zipfile.ZipFile(bgb_path, "r") as zf:
        zf.extractall(extracted)

    manifest_data = json.loads((find_manifest(extracted) or Path()).read_text(encoding="utf-8"))
    assert manifest_data["article_count"] == 0
    assert find_articles_dir(extracted) is None


# --- roundtrip ---


def test_article_roundtrip_preserves_fields_publications_and_status() -> None:
    """Export -> wipe articles -> import. Every Article column +
    Publication row survives. Soft-deleted articles round-trip with
    their ``deleted_at``. Mirrors the books-side roundtrip contract.
    """
    article_a = _create_article("Article A", status="published")
    _patch_article(
        article_a["id"],
        subtitle="Sub A",
        author="Asterios",
        topic="philosophy",
        seo_title="SEO A",
        seo_description="SEO desc A",
        excerpt="Excerpt A",
        canonical_url="https://example.org/a",
        featured_image_url="https://cdn/a.png",
        tags=["ai", "ml"],
        content_json='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}',
    )
    pub_a = _create_publication(article_a["id"], platform="medium")

    article_b = _create_article("Article B")
    _patch_article(article_b["id"], subtitle="Sub B")

    # Trash article_b so its deleted_at survives the roundtrip.
    client.delete(f"/api/articles/{article_b['id']}")

    db = SessionLocal()
    try:
        bgb_path, _ = export_backup_archive(db)
    finally:
        db.close()

    # Wipe articles only - books segment of the export is not under test.
    db = SessionLocal()
    try:
        _purge_articles(db)
        assert db.query(Article).count() == 0
    finally:
        db.close()

    # Restore via the public service.
    upload = _file_upload_from_path(bgb_path)
    db = SessionLocal()
    try:
        result = import_backup_archive(upload, db)
    finally:
        db.close()
    assert result["imported_articles"] >= 2

    db = SessionLocal()
    try:
        restored_a = db.get(Article, article_a["id"])
        restored_b = db.get(Article, article_b["id"])
        assert restored_a is not None
        assert restored_b is not None

        assert restored_a.title == "Article A"
        assert restored_a.status == "published"
        assert restored_a.subtitle == "Sub A"
        assert restored_a.author == "Asterios"
        assert restored_a.topic == "philosophy"
        assert restored_a.seo_title == "SEO A"
        assert restored_a.seo_description == "SEO desc A"
        assert restored_a.excerpt == "Excerpt A"
        assert restored_a.canonical_url == "https://example.org/a"
        assert restored_a.featured_image_url == "https://cdn/a.png"
        # tags column stores JSON-text; both sides should match.
        assert json.loads(restored_a.tags) == ["ai", "ml"]
        assert "hello" in restored_a.content_json

        # Publication round-tripped.
        pubs = db.query(Publication).filter(Publication.article_id == article_a["id"]).all()
        assert any(p.id == pub_a["id"] and p.platform == "medium" for p in pubs)

        # Trashed article restored AS trashed.
        assert restored_b.deleted_at is not None
    finally:
        db.close()


# --- backwards-compat: manifest 1.0 (legacy) ---


def test_legacy_manifest_v1_restores_books_only_no_crash(tmp_path) -> None:
    """A backup with manifest version 1.0 + no ``articles/`` segment
    must restore cleanly with ``imported_articles == 0``. Defends the
    upgrade path where users restore old backups against a newer
    Bibliogon."""
    # Build a synthetic v1.0 backup ZIP with one minimal book.
    backup_root = tmp_path / "legacy-backup"
    backup_root.mkdir()
    (backup_root / "manifest.json").write_text(
        json.dumps(
            {
                "format": "bibliogon-backup",
                "version": "1.0",
                "created_at": "2026-04-01T00:00:00+00:00",
                "book_count": 1,
                "includes_audiobook": False,
            }
        ),
        encoding="utf-8",
    )
    book_id = "legacybookrestore0000000000000001"
    book_dir = backup_root / "books" / book_id
    book_dir.mkdir(parents=True)
    (book_dir / "book.json").write_text(
        json.dumps(
            {
                "id": book_id,
                "title": "Legacy Book",
                "author": "Legacy Author",
                "language": "en",
                "ai_assisted": False,
            }
        ),
        encoding="utf-8",
    )
    (book_dir / "chapters").mkdir()

    bgb_path = tmp_path / "legacy.bgb"
    with zipfile.ZipFile(bgb_path, "w") as zf:
        for path in backup_root.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(tmp_path))

    db = SessionLocal()
    try:
        # Drop any conflicting book/article rows.
        _purge_books(db)
        _purge_articles(db)
    finally:
        db.close()

    upload = _file_upload_from_path(bgb_path)
    db = SessionLocal()
    try:
        result = import_backup_archive(upload, db)
    finally:
        db.close()

    assert result["imported_books"] == 1
    assert result["imported_articles"] == 0


# --- ID conflict / idempotent ---


def test_restore_skips_live_article_with_same_id() -> None:
    """Restoring a backup whose article id matches an already-live
    article skips the row (mirror of books idempotency). Returns 0 in
    ``imported_articles`` for that row."""
    article = _create_article("Idempotency Host")

    db = SessionLocal()
    try:
        bgb_path, _ = export_backup_archive(db)
    finally:
        db.close()

    upload = _file_upload_from_path(bgb_path)
    db = SessionLocal()
    try:
        result = import_backup_archive(upload, db)
    finally:
        db.close()

    # Live article was already there; restore counts it as 0 (skipped).
    db = SessionLocal()
    try:
        # Article still exists exactly once.
        rows = db.query(Article).filter(Article.id == article["id"]).all()
        assert len(rows) == 1
    finally:
        db.close()
    # imported_articles may be 0 (this row skipped) but other articles
    # in the same export could have been re-imported; just assert it
    # is a non-negative integer.
    assert isinstance(result["imported_articles"], int)
    assert result["imported_articles"] >= 0


# --- HTTP user-path: CIO orchestrator restores articles ---


def _articles_only_bgb_bytes(article_id: str = "user-path-art-1") -> bytes:
    """Build a manifest-2.0 .bgb that has zero books and one article.
    Mirrors the shape ``backup_export.export_backup_archive`` produces
    when the install has only articles."""
    buf = BytesIO()
    article_blob = {
        "id": article_id,
        "title": "User-Path Article",
        "language": "en",
        "content_type": "article",
        "content_json": '{"type":"doc","content":[]}',
        "status": "draft",
        "tags": "[]",
        "ai_tokens_used": 0,
        "deleted_at": None,
        "created_at": "2026-04-29T00:00:00+00:00",
        "updated_at": "2026-04-29T00:00:00+00:00",
    }
    manifest = {
        "format": "bibliogon-backup",
        "version": "2.0",
        "article_count": 1,
        "publication_count": 0,
        "article_asset_count": 0,
        "book_count": 0,
        "includes_audiobook": False,
    }
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        # backup_export always materializes books/ for the
        # ``_require_books_dir`` validator, so emit it even though
        # there are no books in this fixture.
        zf.writestr("books/", "")
        zf.writestr(f"articles/{article_id}/article.json", json.dumps(article_blob))
    return buf.getvalue()


def test_cio_articles_only_bgb_restores_through_http_user_path() -> None:
    """The user-flow Import button posts to ``/api/import/detect`` +
    ``/api/import/execute`` (CIO), not directly to
    ``/api/backup/import``. Pin that articles-only .bgb survives that
    HTTP path: detect emits no false 'no book.json' warning, execute
    creates the article row, response shape stays valid."""
    db = SessionLocal()
    try:
        _purge_articles(db)
    finally:
        db.close()

    payload = _articles_only_bgb_bytes()
    detect_resp = client.post(
        "/api/import/detect",
        files=[("files", ("articles-only.bgb", payload, "application/octet-stream"))],
    )
    assert detect_resp.status_code == 200, detect_resp.text
    detected = detect_resp.json()
    assert detected["detected"]["format_name"] == "bgb"
    # The articles-only archive must NOT trigger the legacy warning.
    assert "No book.json inside the backup." not in detected["detected"]["warnings"]
    temp_ref = detected["temp_ref"]

    execute_resp = client.post(
        "/api/import/execute",
        json={"temp_ref": temp_ref, "overrides": {}, "duplicate_action": "create"},
    )
    assert execute_resp.status_code == 200, execute_resp.text
    body = execute_resp.json()
    # Articles-only archive yields no Book row; status still 'created'.
    assert body["status"] == "created"
    assert body["book_id"] in ("", None)

    db = SessionLocal()
    try:
        restored = db.get(Article, "user-path-art-1")
        assert restored is not None
        assert restored.title == "User-Path Article"
    finally:
        db.close()


def test_cio_detect_emits_no_book_json_warning_only_when_archive_is_empty(
    tmp_path,
) -> None:
    """The 'no book.json' warning is reserved for genuinely empty
    archives. Articles-only and books-only must both pass cleanly."""
    from app.import_plugins.handlers.bgb import BgbImportHandler

    handler = BgbImportHandler()
    empty = tmp_path / "empty.bgb"
    with zipfile.ZipFile(empty, "w") as zf:
        zf.writestr(
            "manifest.json",
            json.dumps({"format": "bibliogon-backup", "version": "2.0"}),
        )
    detected_empty = handler.detect(str(empty))
    assert "No book.json inside the backup." in detected_empty.warnings

    articles_only = tmp_path / "articles-only.bgb"
    articles_only.write_bytes(_articles_only_bgb_bytes(article_id="warn-test-art"))
    detected_articles = handler.detect(str(articles_only))
    assert "No book.json inside the backup." not in detected_articles.warnings


# --- helper kept module-clean for IDE; silences unused-import lint ---

_ = BytesIO  # type: ignore[unused-ignore]
