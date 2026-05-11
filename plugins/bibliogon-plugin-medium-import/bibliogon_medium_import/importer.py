"""Bulk-import orchestrator for Medium archive ZIPs.

Workflow per ZIP:

  1. Caller hands us the ZIP bytes plus the request-time
     plugin settings.
  2. Extract under a temp dir.
  3. Enumerate every ``.html`` under ``posts/``.
  4. For each post:
     - Parse via :class:`MediumWalker`.
     - Dedup against ``Article.canonical_url``; skip if matched
       and ``skip_existing_canonical_urls=True``.
     - Persist Article (status=published by default), download
       images via :func:`download_images` (when enabled),
       rewrite image URLs in the TipTap doc, then commit.
     - Create one Publication (platform=medium) and one
       ArticleImportSource (provenance).
  5. Return :class:`ImportResult` with per-file outcomes.

Transaction discipline: each post lives in its own SessionLocal()
block. One bad post never rolls back the others. A post that
crashes mid-write is rolled back individually and logged as
errored; the rest of the batch continues.
"""

from __future__ import annotations

import json
import logging
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from . import __version__ as IMPORTER_VERSION
from .image_downloader import download_images, rewrite_image_urls
from .walker import MediumWalker, ParsedPost

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30.0


@dataclass
class ImportedArticle:
    """One article that landed successfully."""

    id: str
    title: str
    canonical_url: str
    warnings: list[str] = field(default_factory=list)


@dataclass
class SkippedArticle:
    """One article that was skipped because canonical_url already
    exists on a Bibliogon Article (the dedup branch)."""

    filename: str
    canonical_url: str
    existing_article_id: str


@dataclass
class ErroredArticle:
    """One article whose import crashed; surfaced to the caller so
    the user can retry that one without re-running the whole
    archive."""

    filename: str
    error: str


@dataclass
class ImportResult:
    imported: list[ImportedArticle] = field(default_factory=list)
    skipped: list[SkippedArticle] = field(default_factory=list)
    errored: list[ErroredArticle] = field(default_factory=list)


def import_zip(
    zip_bytes: bytes,
    *,
    download_images_enabled: bool = True,
    image_timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    skip_existing: bool = True,
    default_status: str = "published",
    default_language: str = "en",
    set_first_image_as_featured: bool = True,
    http_client: httpx.Client | None = None,
) -> ImportResult:
    """Import every ``posts/*.html`` from the given Medium ZIP."""
    import tempfile

    result = ImportResult()

    with tempfile.TemporaryDirectory(prefix="medium-import-") as tmp_str:
        tmp = Path(tmp_str)
        try:
            with zipfile.ZipFile(_BytesIO(zip_bytes)) as zf:
                zf.extractall(tmp)
        except zipfile.BadZipFile as exc:
            raise ValueError(f"Not a valid ZIP archive: {exc}") from exc

        posts_dir = _find_posts_dir(tmp)
        if posts_dir is None:
            raise ValueError(
                "ZIP does not contain a 'posts/' directory; "
                "this does not look like a Medium HTML export."
            )

        # Sort for deterministic processing order.
        post_files = sorted(posts_dir.glob("*.html"))
        if not post_files:
            return result  # empty archive; nothing imported, no error

        for path in post_files:
            try:
                _import_one_post(
                    path,
                    result,
                    download_images_enabled=download_images_enabled,
                    image_timeout_seconds=image_timeout_seconds,
                    skip_existing=skip_existing,
                    default_status=default_status,
                    default_language=default_language,
                    set_first_image_as_featured=set_first_image_as_featured,
                    http_client=http_client,
                )
            except Exception as exc:  # noqa: BLE001 - boundary handler
                logger.exception("medium-import: failed on %s", path.name)
                result.errored.append(ErroredArticle(filename=path.name, error=str(exc)))

    return result


def _import_one_post(
    path: Path,
    result: ImportResult,
    *,
    download_images_enabled: bool,
    image_timeout_seconds: float,
    skip_existing: bool,
    default_status: str,
    default_language: str,
    set_first_image_as_featured: bool,
    http_client: httpx.Client | None,
) -> None:
    """Import a single Medium HTML post.

    Lazy backend imports keep this module importable in plugin-only
    test runs that don't put the backend on the path.
    """
    from app.database import SessionLocal
    from app.models import Article, ArticleImportSource, Publication

    html = path.read_text(encoding="utf-8")
    walker = MediumWalker()
    parsed: ParsedPost = walker.parse(html)

    if not parsed.canonical_url:
        result.errored.append(
            ErroredArticle(
                filename=path.name,
                error="post has no canonical URL; cannot dedup or track",
            )
        )
        return

    db = SessionLocal()
    try:
        # Dedup. canonical_url is a non-unique String column on
        # Article, so this is a normal SELECT, not a constraint
        # violation. Application-layer dedup keeps the future
        # ``--update`` re-import flag flexible.
        if skip_existing:
            existing = (
                db.query(Article).filter(Article.canonical_url == parsed.canonical_url).first()
            )
            if existing is not None:
                result.skipped.append(
                    SkippedArticle(
                        filename=path.name,
                        canonical_url=parsed.canonical_url,
                        existing_article_id=existing.id,
                    )
                )
                return

        # Language: prefer langdetect's high-confidence call from the
        # walker; fall back to ``default_language`` when the body was
        # too short / mixed for confident detection. Medium HTML has
        # no canonical language attribute, so statistical detection
        # over the body text is the only signal available.
        language = parsed.detected_language or default_language

        # SEO defaults. Medium HTML export strips every SEO meta tag
        # (verified across the 209-post production corpus: no <meta
        # description>, og:title, og:description, or og:image on any
        # sampled file). So the only authored SEO-adjacent signals
        # are the article title and the Medium subtitle/kicker. We
        # mirror them into the dedicated SEO fields so the dashboard
        # tile and the public meta tags have sane defaults on import.
        # User can edit either in the editor; the existing AI-generate
        # button stays available for explicit refinement.
        title = parsed.title or "(untitled)"
        subtitle = parsed.subtitle or None
        seo_title = title  # always populated, mirrors article.title
        seo_description = subtitle  # NULL when post had no subtitle

        # Persist the Article first so we have an id for assets.
        article = Article(
            title=title,
            subtitle=subtitle,
            author=parsed.author or None,
            language=language,
            status=default_status,
            content_type="article",
            canonical_url=parsed.canonical_url,
            content_json=json.dumps(parsed.content_doc),
            tags="[]",
            seo_title=seo_title,
            seo_description=seo_description,
        )
        db.add(article)
        db.flush()  # populates article.id
        article_id = article.id

        # Download images (if enabled) under a separate session
        # opened by the downloader; commit first so the article is
        # already persisted by the time the FK is referenced.
        db.commit()

        warnings: list[str] = list(parsed.warnings)
        url_rewrites: dict[str, str] = {}
        if download_images_enabled and parsed.images:
            download_result = download_images(
                parsed.images,
                article_id,
                timeout_seconds=image_timeout_seconds,
                client=http_client,
            )
            warnings.extend(download_result.warnings)
            url_rewrites = download_result.url_rewrites
            if url_rewrites:
                rewritten = rewrite_image_urls(parsed.content_doc, url_rewrites)
                # Update the article's content_json with rewritten doc.
                article = db.query(Article).filter(Article.id == article_id).one()
                article.content_json = json.dumps(rewritten)
                db.commit()

        # Featured image: take the first body image's URL. After the
        # rewrite block, ``url_rewrites`` maps CDN -> local; when
        # download_images is OFF or the image failed to download, the
        # CDN URL falls through. Mirrors the user's mental model:
        # "the featured image is the same image you see at the top of
        # the article body". Skipped silently when the post has no
        # images or the toggle is OFF.
        if set_first_image_as_featured and parsed.images:
            first_src = parsed.images[0].src
            local_src = url_rewrites.get(first_src)
            article = db.query(Article).filter(Article.id == article_id).one()
            article.featured_image_url = local_src or first_src
            db.commit()

        # Provenance.
        import_metadata = {
            "original_published_at": parsed.published_at,
            "author_name": parsed.author,
            "source_filename": path.name,
        }
        provenance = ArticleImportSource(
            article_id=article_id,
            source_identifier=parsed.canonical_url,
            source_type="medium",
            format_name="medium_html_export",
            import_metadata=json.dumps(import_metadata),
            importer_version=IMPORTER_VERSION,
            conversion_warnings=json.dumps(warnings),
        )
        db.add(provenance)

        # Publication. Platform metadata follows
        # platform_schemas.yaml -> medium (title required, tags
        # required; tags is empty list per the v1 design).
        publication_metadata: dict[str, Any] = {
            "title": parsed.title or "(untitled)",
            "tags": [],
            "canonical_url": parsed.canonical_url,
            "published_url": parsed.canonical_url,
        }
        if parsed.subtitle:
            publication_metadata["subtitle"] = parsed.subtitle
        publication = Publication(
            article_id=article_id,
            platform="medium",
            status="published",
            platform_metadata=json.dumps(publication_metadata),
            published_at=_parse_iso(parsed.published_at),
            content_snapshot_at_publish=article.content_json,
        )
        db.add(publication)
        db.commit()

        result.imported.append(
            ImportedArticle(
                id=article_id,
                title=article.title,
                canonical_url=parsed.canonical_url,
                warnings=warnings,
            )
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _find_posts_dir(root: Path) -> Path | None:
    """Locate the ``posts/`` directory inside an extracted Medium
    archive. Tolerant of one extra wrapper directory the way Medium
    sometimes ships archives (e.g. ``medium-export-2024/posts/``).
    """
    direct = root / "posts"
    if direct.is_dir():
        return direct
    # Single-wrapper case: pick the first immediate subdir that
    # contains a posts/ folder.
    for child in root.iterdir():
        if not child.is_dir():
            continue
        candidate = child / "posts"
        if candidate.is_dir():
            return candidate
    return None


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # Medium emits "2024-01-01T00:00:00.000Z"; fromisoformat
        # accepts most ISO shapes from Python 3.11 onward.
        # Strip trailing "Z" -> "+00:00" so older parsers stay happy.
        cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return None


# Avoids depending on io at the module level for a single use.
def _BytesIO(data: bytes):  # noqa: N802 - tiny shim to keep imports terse
    import io

    return io.BytesIO(data)
