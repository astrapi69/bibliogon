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

import asyncio
import json
import logging
import zipfile
from collections.abc import Awaitable, Callable
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

# ASYNC-IMPORT-PROGRESS-01: callback signature mirrors the audiobook
# precedent (``generate_audiobook(progress_callback=...)``). Each
# (event_type, payload) tuple is the same shape that gets published
# to ``job_store`` so the route worker can pass the store's
# ``publish_event`` directly without an adapter layer.
ProgressCallback = Callable[[str, dict[str, Any]], Awaitable[None]] | None


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
class ImportedComment:
    """MEDIUM-COMMENTS-IMPORT-01 commit 5. One short reply-shaped
    post that the heuristic classified as a comment and the
    importer routed to the ``article_comments`` table."""

    id: str
    filename: str
    body_preview: str
    responds_to_article_id: str | None


@dataclass
class SkippedComment:
    """A heuristic-classified comment that was dropped without
    persisting. ``reason`` is one of ``"mode_skip"``,
    ``"orphan_skip"``."""

    filename: str
    reason: str


@dataclass
class ImportResult:
    imported: list[ImportedArticle] = field(default_factory=list)
    skipped: list[SkippedArticle] = field(default_factory=list)
    errored: list[ErroredArticle] = field(default_factory=list)
    # MEDIUM-COMMENTS-IMPORT-01 commit 5: comment-routing counters.
    # Comments use their own lists so the article-side counts stay
    # comparable across imports made with different
    # ``import_comments_mode`` settings.
    imported_comments: list[ImportedComment] = field(default_factory=list)
    skipped_comments: list[SkippedComment] = field(default_factory=list)


async def import_zip(
    zip_bytes: bytes,
    *,
    download_images_enabled: bool = True,
    image_timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    skip_existing: bool = True,
    default_status: str = "published",
    default_language: str = "en",
    set_first_image_as_featured: bool = True,
    # MEDIUM-COMMENTS-IMPORT-01 commit 3+4: surface only. The
    # commit 5 wiring step interprets these and routes
    # comment-shaped posts to the ArticleComment table.
    #   import_comments_mode: "as_comments" | "as_articles" | "skip"
    #   orphan_comment_handling: "store" | "skip"
    import_comments_mode: str = "as_comments",
    orphan_comment_handling: str = "store",
    # MEDIUM-IMPORT-V2-01: when not None, only ``posts/<name>.html``
    # entries whose base name (the ``Path.name``) is in the set get
    # processed; the rest are silently skipped (not added to any
    # result list, not counted as skipped or errored). Set membership
    # is tested against ``path.name`` so the caller passes plain
    # filenames as they appear in the preview's per-row payload.
    # ``None`` keeps the legacy "import everything" behaviour the v1
    # endpoint depends on.
    selected_filenames: set[str] | None = None,
    # ASYNC-IMPORT-PROGRESS-01: optional progress sink. When set, the
    # orchestrator fires the same event sequence the audiobook
    # generator emits (``start`` -> per-post events -> ``done``) so
    # the async job worker can publish them to ``job_store``. When
    # None, the loop runs silently (mirrors the v1 + sync-v2
    # endpoint behaviour). Per-post events:
    #   ``post_start``   {index, total, filename}
    #   ``post_done``    {index, filename, article_id, title}
    #   ``post_skipped`` {index, filename, reason: "dedup",
    #                     existing_article_id, canonical_url}
    #   ``post_errored`` {index, filename, error}
    #   ``comment_done`` {index, filename, comment_id, body_preview}
    #   ``comment_skipped`` {index, filename, reason}
    progress_callback: ProgressCallback = None,
    http_client: httpx.Client | None = None,
) -> ImportResult:
    """Import every ``posts/*.html`` from the given Medium ZIP.

    Cooperative cancellation: between each post we ``await
    asyncio.sleep(0)`` so the asyncio loop can deliver a
    ``CancelledError`` if the surrounding ``job_store.cancel()`` was
    called. The DB write of the in-progress post still completes
    (no rollback mid-post), but no subsequent posts run.
    """
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
            await _emit(progress_callback, "start", {"total": 0})
            await _emit(progress_callback, "done", _summary(result))
            return result  # empty archive; nothing imported, no error

        if selected_filenames is not None:
            post_files = [p for p in post_files if p.name in selected_filenames]
            if not post_files:
                # All filenames filtered out. The v2 wizard normally
                # disables the Import button when the selection is
                # empty, so we should not see this in practice; the
                # empty-result return keeps the contract honest if it
                # does happen.
                await _emit(progress_callback, "start", {"total": 0})
                await _emit(progress_callback, "done", _summary(result))
                return result

        total = len(post_files)
        await _emit(progress_callback, "start", {"total": total})

        for index, path in enumerate(post_files, start=1):
            # Cooperative cancellation point. Cheap when nothing is
            # awaiting cancellation; raises CancelledError when the
            # surrounding job_store.cancel() fired. The exception
            # propagates out of import_zip, the job is marked
            # CANCELLED by job_store.cancel(), and no further posts
            # run.
            await asyncio.sleep(0)
            await _emit(
                progress_callback,
                "post_start",
                {"index": index, "total": total, "filename": path.name},
            )
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
                    import_comments_mode=import_comments_mode,
                    orphan_comment_handling=orphan_comment_handling,
                    http_client=http_client,
                )
            except Exception as exc:  # noqa: BLE001 - boundary handler
                logger.exception("medium-import: failed on %s", path.name)
                result.errored.append(ErroredArticle(filename=path.name, error=str(exc)))
                await _emit(
                    progress_callback,
                    "post_errored",
                    {"index": index, "filename": path.name, "error": str(exc)},
                )
                continue

            # Classify what _import_one_post did with the file so we
            # emit the matching per-post event. The result lists are
            # the source of truth - we walk them in append order which
            # mirrors the orchestrator's per-post path.
            await _emit_post_outcome(progress_callback, index, path.name, result)

        await _emit(progress_callback, "done", _summary(result))

    return result


async def _emit(callback: ProgressCallback, event_type: str, data: dict[str, Any]) -> None:
    """Fire ``callback`` if set; swallow its errors so a broken
    subscriber never kills a real import.

    Mirrors the audiobook generator's defensive wrapping: a progress
    callback is a diagnostic affordance, not a critical path.
    """
    if callback is None:
        return
    try:
        await callback(event_type, data)
    except Exception as exc:  # noqa: BLE001 - defensive
        logger.warning("medium-import progress callback raised on %s: %s", event_type, exc)


async def _emit_post_outcome(
    callback: ProgressCallback,
    index: int,
    filename: str,
    result: ImportResult,
) -> None:
    """Inspect ``result`` after a successful ``_import_one_post`` call
    and emit the matching per-post event.

    Detection: each branch of the orchestrator appends to exactly one
    of the result lists, and we know the most-recently-appended entry
    is ours iff its ``filename`` matches.
    """
    if result.errored and result.errored[-1].filename == filename:
        # Already emitted as post_errored from the except block above;
        # shouldn't reach here in practice.
        return
    if result.skipped and result.skipped[-1].filename == filename:
        skip = result.skipped[-1]
        await _emit(
            callback,
            "post_skipped",
            {
                "index": index,
                "filename": filename,
                "reason": "dedup",
                "existing_article_id": skip.existing_article_id,
                "canonical_url": skip.canonical_url,
            },
        )
        return
    if result.imported and result.imported[-1].canonical_url:
        # The article path appends to ``result.imported`` AFTER all
        # DB writes succeed. We can't pin a filename here because
        # ImportedArticle doesn't carry one; we rely on the
        # by-construction guarantee that this loop iteration's post
        # is the most-recently-imported one when no comment branch
        # fired.
        article = result.imported[-1]
        await _emit(
            callback,
            "post_done",
            {
                "index": index,
                "filename": filename,
                "article_id": article.id,
                "title": article.title,
                "canonical_url": article.canonical_url,
            },
        )
        return
    if (
        result.imported_comments
        and result.imported_comments[-1].filename == filename
    ):
        comment = result.imported_comments[-1]
        await _emit(
            callback,
            "comment_done",
            {
                "index": index,
                "filename": filename,
                "comment_id": comment.id,
                "body_preview": comment.body_preview,
            },
        )
        return
    if (
        result.skipped_comments
        and result.skipped_comments[-1].filename == filename
    ):
        skip_comment = result.skipped_comments[-1]
        await _emit(
            callback,
            "comment_skipped",
            {
                "index": index,
                "filename": filename,
                "reason": skip_comment.reason,
            },
        )
        return


def _summary(result: ImportResult) -> dict[str, int]:
    """Compact counter dict for the ``done`` event payload."""
    return {
        "imported_count": len(result.imported),
        "skipped_count": len(result.skipped),
        "errored_count": len(result.errored),
        "imported_comments_count": len(result.imported_comments),
        "skipped_comments_count": len(result.skipped_comments),
    }


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
    import_comments_mode: str,
    orphan_comment_handling: str,
    http_client: httpx.Client | None,
) -> None:
    """Import a single Medium HTML post.

    Lazy backend imports keep this module importable in plugin-only
    test runs that don't put the backend on the path.
    """
    from app.database import SessionLocal
    from app.models import Article, ArticleComment, ArticleImportSource, Publication

    html = path.read_text(encoding="utf-8")
    walker = MediumWalker()
    parsed: ParsedPost = walker.parse(html)

    # MEDIUM-COMMENTS-IMPORT-01 commit 5: comment routing.
    # ``as_articles`` ignores the heuristic and falls through to
    # the legacy article path; ``skip`` drops detected comments
    # silently; ``as_comments`` (default) routes to the
    # ArticleComment table. For Medium imports the comment is
    # always an orphan because the HTML carries no parent-article
    # reference.
    if parsed.is_comment and import_comments_mode != "as_articles":
        if import_comments_mode == "skip":
            result.skipped_comments.append(
                SkippedComment(filename=path.name, reason="mode_skip")
            )
            return
        # import_comments_mode == "as_comments"
        if orphan_comment_handling == "skip":
            # Medium's export carries no parent-article reference,
            # so every comment is an orphan. orphan_handling=skip
            # therefore drops every detected comment.
            result.skipped_comments.append(
                SkippedComment(filename=path.name, reason="orphan_skip")
            )
            return
        _persist_comment(path, parsed, result, default_language=default_language)
        return

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

        # Excerpt: long-form display summary. Prefer the authored
        # subtitle (same source as seo_description above). When the
        # post has no subtitle, fall back to a body-text slice — this
        # is intentionally MORE permissive than seo_description, which
        # the SEO-D precedent keeps strict-NULL. The publish-time
        # fallback (seo_description ← excerpt when seo_description is
        # NULL) is documented behavior; users who want strict SEO can
        # edit either field manually.
        excerpt = subtitle or _body_text_excerpt(parsed.content_doc)

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
            excerpt=excerpt,
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


def _persist_comment(
    path: Path,
    parsed: ParsedPost,
    result: ImportResult,
    *,
    default_language: str,
) -> None:
    """Insert one ArticleComment row + record it in the result.

    Medium-specific assumption: ``responds_to_article_id`` is
    always NULL because the HTML export carries no parent-article
    reference. ``responds_to_url`` is left NULL too in v1 (no
    inference); future importers that DO carry a parent reference
    can populate it. Image downloads + Publication / provenance
    rows are deliberately NOT created for comments - they're
    article-only concerns.
    """
    from app.database import SessionLocal
    from app.models import ArticleComment

    body_text = _flatten_body_text(parsed.content_doc)
    language = parsed.detected_language or default_language

    db = SessionLocal()
    try:
        comment = ArticleComment(
            author=parsed.author or None,
            body_text=body_text,
            body_json=json.dumps(parsed.content_doc),
            language=language,
            published_at=_parse_iso(parsed.published_at),
            canonical_url=parsed.canonical_url or None,
            # Medium: always orphan.
            responds_to_article_id=None,
            responds_to_url=None,
            imported_from="medium",
            source_filename=path.name,
        )
        db.add(comment)
        db.flush()
        comment_id = comment.id
        db.commit()
        result.imported_comments.append(
            ImportedComment(
                id=comment_id,
                filename=path.name,
                body_preview=body_text[:120],
                responds_to_article_id=None,
            )
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _flatten_body_text(content_doc: dict[str, Any]) -> str:
    """Concatenate all ``text`` node values inside a TipTap doc.
    Mirrors the heuristic's text extraction so the persisted
    ``body_text`` matches what the heuristic measured."""
    parts: list[str] = []

    def _walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                parts.append(str(node.get("text", "")))
            for child in node.get("content", []) or []:
                _walk(child)

    _walk(content_doc)
    return " ".join(p for p in parts if p.strip())


# MEDIUM-IMPORT-EXCERPT-AUTOFILL-01: when the post has no subtitle,
# fall back to a body-text slice for ``Article.excerpt`` (NOT for
# ``seo_description`` — that field stays strict-NULL per the SEO-D
# precedent in test_seo_description_null_when_post_has_no_subtitle).
# 300 chars is the typical feed-tile / OG-preview budget; 200 is the
# minimum slice before we accept a hard-truncate rather than a
# sentence-boundary cut.
_EXCERPT_MAX_CHARS = 300
_EXCERPT_MIN_SLICE = 200


def _body_text_excerpt(
    content_doc: dict[str, Any],
    max_chars: int = _EXCERPT_MAX_CHARS,
) -> str | None:
    """Build a display-excerpt from the article's body text.

    Walks the TipTap JSON and returns the longest prefix of the
    concatenated text that ends at a sentence boundary (``.``,
    ``!``, ``?`` followed by space) within ``max_chars``. Falls back
    to a hard-truncate at ``max_chars - 3`` + ``...`` when no
    sentence boundary appears at or above ``_EXCERPT_MIN_SLICE``.
    Returns None for an empty / structureless doc.
    """
    full = _flatten_body_text(content_doc)
    if not full:
        return None
    if len(full) <= max_chars:
        return full

    candidate = full[:max_chars]
    best_break = -1
    for marker in (". ", "! ", "? "):
        idx = candidate.rfind(marker)
        if idx > best_break:
            best_break = idx
    if best_break >= _EXCERPT_MIN_SLICE - 1:
        # Keep the sentence terminator, drop the trailing space.
        return full[: best_break + 1].rstrip()
    return full[: max_chars - 3].rstrip() + "..."


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
