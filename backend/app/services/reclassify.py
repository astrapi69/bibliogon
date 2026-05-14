"""Article ⇄ ArticleComment reclassification.

UX-Polish v0.32.0 F2b. Companion to the two-tier comment-detection
heuristic in plugins/bibliogon-plugin-medium-import/walker.py:
when the heuristic misclassifies a post (in either direction),
the user reclassifies via these endpoints.

Both directions are a transactional MOVE, not a copy. The source
row is deleted in the same commit as the destination row is
inserted, so an interrupted call (network drop, DB crash) either
leaves both rows OR neither — never the source-only or
destination-only state.

Lossy direction (Article → Comment): the Article schema is wider
than ArticleComment. Subtitle, tags, topic, seo_*, series,
featured_image_*, inline_image_prompts, status, publications, and
assets are dropped on the move. The reciprocal Comment → Article
direction populates Article with the comment's fields plus a
title derived from the body text; the user is expected to edit
the title afterwards if the auto-derivation is awkward.

The functions in this module are pure service functions: they
take the SQLAlchemy session as an argument, perform the work, and
return the new entity's id. They do NOT commit — the caller
(router or test) commits so callers can compose multiple
operations atomically. Routers ``raise HTTPException`` for the
"not found" / "already trashed" branches; the service raises
plain ValueError for invariant violations and lets the router
translate.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.ai.template_schema import extract_body_text
from app.models import Article, ArticleComment, ArticleImportSource

# Maximum length of the title auto-derived from comment body text.
# Picked from the Article.title column's String(500) limit and the
# observation that a comment-as-article in real use is short — the
# user almost always edits the title anyway. Hard-truncating at 200
# leaves room for the trailing "..." marker without exceeding the
# DB-side cap.
_TITLE_FROM_BODY_MAX_CHARS = 200
_TITLE_FROM_BODY_ELLIPSIS = "..."


def article_to_comment(
    article: Article,
    db: Session,
    *,
    responds_to_url: str | None = None,
    responds_to_article_id: str | None = None,
) -> ArticleComment:
    """Move an Article row to ArticleComment.

    Returns the newly-inserted ArticleComment (with ``id``
    populated). Caller commits.

    Field translation:

    - ``Article.author`` → ``ArticleComment.author``
    - ``Article.language`` → ``ArticleComment.language``
    - ``Article.content_json`` → ``ArticleComment.body_json``
      (plus plain-text extraction → ``body_text``, which the
      comment-detection heuristic and future search index both
      use)
    - ``Article.canonical_url`` → ``ArticleComment.canonical_url``
    - ``Article.created_at`` → ``ArticleComment.imported_at``
      (preserves the "when did this first enter Bibliogon?"
      timestamp; on the article side that lives in created_at,
      on the comment side it lives in imported_at)
    - ``Article.created_at`` → ``ArticleComment.created_at``
    - ``Article.updated_at`` → ``ArticleComment.updated_at``
    - ``Article.deleted_at`` → ``ArticleComment.deleted_at``
      (trash state inherited)
    - ``Article.import_source.source_type`` → ``imported_from``
      (with ``source_filename`` populated from
      ``import_source.import_metadata["source_filename"]`` when
      available, NULL otherwise)
    - If no ``import_source`` exists, ``imported_from`` defaults
      to ``"manual"`` per the
      MEDIUM-COMMENT-MANUAL-ENTRY-01 discriminator convention.

    Discarded fields (acknowledged data loss, surfaced in the
    UI confirm dialog):

    - title, subtitle, content_type, status
    - tags, topic, seo_title, seo_description, excerpt, series
    - featured_image_url, featured_image_prompt,
      inline_image_prompts
    - ai_tokens_used
    - publications (cascade delete via the Article row)
    - assets (cascade delete via the Article row)
    """
    imported_from, source_filename = _derive_source_metadata(article)

    comment = ArticleComment(
        author=article.author,
        body_text=extract_body_text(article.content_json),
        body_json=article.content_json or None,
        language=article.language,
        published_at=None,
        canonical_url=article.canonical_url,
        responds_to_article_id=responds_to_article_id,
        responds_to_url=responds_to_url,
        imported_from=imported_from,
        imported_at=article.created_at,
        source_filename=source_filename,
        created_at=article.created_at,
        updated_at=article.updated_at,
        deleted_at=article.deleted_at,
    )
    db.add(comment)
    db.flush()  # populate comment.id

    db.delete(article)
    db.flush()
    return comment


def comment_to_article(comment: ArticleComment, db: Session) -> Article:
    """Move an ArticleComment row to Article.

    Returns the newly-inserted Article (with ``id`` populated).
    Caller commits.

    Field translation:

    - ``ArticleComment.author`` → ``Article.author``
    - ``ArticleComment.body_json`` → ``Article.content_json``
      (falls back to ``""`` when the comment carried no JSON —
      the Article column requires non-NULL)
    - ``ArticleComment.language`` → ``Article.language``
    - ``ArticleComment.canonical_url`` → ``Article.canonical_url``
    - ``ArticleComment.created_at`` → ``Article.created_at``
    - ``ArticleComment.updated_at`` → ``Article.updated_at``
    - ``ArticleComment.deleted_at`` → ``Article.deleted_at``
    - ``Article.title`` derived from the first 200 chars of
      ``body_text`` with word-boundary trim + ``"..."`` when
      truncated. Empty body produces "Reclassified comment".
    - When the comment carries a non-"manual" ``imported_from``,
      a paired ``ArticleImportSource`` row is created so the
      "where did this come from?" provenance survives the
      reclassify.
    """
    title = _derive_title_from_body(comment.body_text)

    article = Article(
        title=title,
        subtitle=None,
        author=comment.author,
        language=comment.language,
        content_type="article",
        content_json=comment.body_json or "",
        status="draft",
        canonical_url=comment.canonical_url,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        deleted_at=comment.deleted_at,
    )
    db.add(article)
    db.flush()  # populate article.id

    if comment.imported_from != "manual" and comment.canonical_url:
        # Recreate provenance so a downstream re-import detects
        # the reclassified article as a duplicate. Skip when the
        # comment has no canonical_url (source_identifier is NOT
        # NULL on the model, so we can't insert a blank one).
        source = ArticleImportSource(
            article_id=article.id,
            source_identifier=comment.canonical_url,
            source_type=comment.imported_from,
            format_name=f"{comment.imported_from}_reclassified",
            imported_at=comment.imported_at,
            import_metadata="{}",
            importer_version=None,
            conversion_warnings="[]",
        )
        db.add(source)

    db.delete(comment)
    db.flush()
    return article


def _derive_source_metadata(article: Article) -> tuple[str, str | None]:
    """Inspect ``article.import_source`` and return
    ``(imported_from, source_filename)``.

    Returns ``("manual", None)`` when the article has no
    import_source row — native Bibliogon articles get the
    ``"manual"`` discriminator per the model docstring.
    """
    if article.import_source is None:
        return "manual", None
    source_type = article.import_source.source_type or "manual"
    source_filename: str | None = None
    metadata_raw = article.import_source.import_metadata or "{}"
    try:
        metadata = json.loads(metadata_raw)
        if isinstance(metadata, dict):
            filename = metadata.get("source_filename")
            if isinstance(filename, str) and filename:
                source_filename = filename
    except (ValueError, TypeError):
        # Malformed metadata is non-fatal; the reclassify keeps
        # going with source_filename=None.
        source_filename = None
    return source_type, source_filename


def _derive_title_from_body(body_text: str) -> str:
    """Build an Article.title from a comment's body text.

    The Article model requires a non-empty title. For an empty
    body, fall back to a generic stub the user is expected to
    rename.
    """
    if not body_text or not body_text.strip():
        return "Reclassified comment"
    # First sentence first — comments usually start with a
    # single greeting / reaction sentence that makes a passable
    # title. Fall through to plain hard-truncate when no
    # sentence boundary lands inside the limit.
    candidate = body_text.strip()
    if len(candidate) <= _TITLE_FROM_BODY_MAX_CHARS:
        return candidate
    truncated = candidate[:_TITLE_FROM_BODY_MAX_CHARS]
    # Word-boundary trim — find the last space within the cap so
    # we don't cut a word in half.
    space = truncated.rfind(" ")
    if space > 0:
        truncated = truncated[:space]
    return truncated + _TITLE_FROM_BODY_ELLIPSIS
