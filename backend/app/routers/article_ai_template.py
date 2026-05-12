"""Article AI-template endpoints.

UNIVERSAL-AI-TEMPLATE-01 Session 1, commit 4/10.

Three endpoints:

- ``GET  /api/articles/{article_id}/ai-template`` — export the
  article's current state as a self-explanatory ``.biblio.yaml``
  file with reference block and per-field descriptions /
  examples / current_values.

- ``POST /api/articles/{article_id}/ai-template`` — import a
  filled (or partially filled) template back into the article.
  Force-override semantics per S6: ``force=false`` skips fields
  whose current article value is already populated;
  ``force=true`` overwrites them. AI-returned null / empty
  always skips, regardless of force.

- ``GET  /api/ai-templates/article?language=en`` — generate an
  empty / new-idea template. No reference block; ``language``
  lives at root so the file alone tells the downstream AI
  what language to respond in. The endpoint that turns this
  into a fresh Article (i.e. "New from template" workflow) is
  out of scope for Session 1; it lands with the dashboard
  button in Session 2.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.ai.template_schema import (
    APPLY_SKIP_EMPTY,
    APPLY_SKIP_POPULATED,
    APPLY_UPDATED,
    ArticleTemplate,
    TemplateSchemaError,
    apply_field,
    build_article_template_from_record,
    build_empty_article_template,
    parse_template_from_yaml,
    serialize_template_to_yaml,
)
from app.database import get_db
from app.models import Article
from app.schemas import ArticleOut

logger = logging.getLogger(__name__)


# Two routers in one module: per-article paths under
# ``/articles`` and the empty-template endpoint under
# ``/ai-templates``. Kept separate so FastAPI's tag grouping
# in /api/docs stays readable.
articles_router = APIRouter(prefix="/articles", tags=["article-ai-template"])
empty_router = APIRouter(prefix="/ai-templates", tags=["ai-template-empty"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# Mapping from template field name to (article column, is_json_list).
# Public so the AI-fill router (commit 5) can share the same source of
# truth for which article columns the template format is allowed to
# touch.
ARTICLE_TEMPLATE_FIELD_MAP: list[tuple[str, str, bool]] = [
    ("title", "title", False),
    ("seo_title", "seo_title", False),
    ("seo_description", "seo_description", False),
    ("excerpt", "excerpt", False),
    ("tags", "tags", True),
    ("topic", "topic", False),
    ("featured_image_prompt", "featured_image_prompt", False),
    ("inline_image_prompts", "inline_image_prompts", True),
]


def _slugify(title: str) -> str:
    """Folds umlauts to ASCII and keeps the slug RFC 6266-safe.
    Mirrors ``app.routers.article_export._slugify``."""
    folded = unicodedata.normalize("NFKD", title)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^\w\s-]", "", ascii_only).strip()
    cleaned = re.sub(r"[\s_-]+", "-", cleaned)
    return cleaned.lower() or "article"


def _load_article(article_id: str, db: Session) -> Article:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail=f"Article {article_id} not found")
    return article


def _apply_template_to_article(
    article: Article, template: ArticleTemplate, *, force: bool
) -> tuple[list[str], dict[str, str]]:
    """Apply a parsed template to an article row. Returns
    ``(updated_fields, skipped_with_reasons)``. Caller owns the
    DB transaction (commit / rollback / refresh). Uses the
    shared ``apply_field`` primitive so per-record and AI-fill
    paths share the force/skip semantics."""
    updated: list[str] = []
    skipped: dict[str, str] = {}
    for tpl_field, col_name, is_json_list in ARTICLE_TEMPLATE_FIELD_MAP:
        new_value = getattr(template, tpl_field).current_value
        result = apply_field(
            article,
            col_name,
            new_value,
            force=force,
            is_json_list=is_json_list,
        )
        if result == APPLY_UPDATED:
            updated.append(tpl_field)
        elif result == APPLY_SKIP_EMPTY:
            skipped[tpl_field] = APPLY_SKIP_EMPTY
        elif result == APPLY_SKIP_POPULATED:
            skipped[tpl_field] = APPLY_SKIP_POPULATED
    return updated, skipped


def _build_yaml_response(yaml_text: str, slug: str) -> Response:
    """Render YAML body with the correct Content-Type and
    Content-Disposition so browser-side downloads land with the
    expected filename."""
    return Response(
        content=yaml_text,
        media_type="text/yaml; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}.biblio.yaml"',
        },
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@articles_router.get("/{article_id}/ai-template")
def export_article_template(
    article_id: str,
    db: Session = Depends(get_db),
) -> Response:
    """Export the article as a self-explanatory ``.biblio.yaml``
    template. The response is a downloadable YAML file; the
    reference block carries ``id``, ``language``,
    ``body_word_count``, and a 500-word body preview so the
    consuming AI has enough context to fill the metadata
    fields meaningfully."""
    article = _load_article(article_id, db)
    template = build_article_template_from_record(article)
    yaml_text = serialize_template_to_yaml(template, include_header=True)
    return _build_yaml_response(yaml_text, _slugify(article.title))


@articles_router.post("/{article_id}/ai-template")
async def import_article_template(
    article_id: str,
    request: Request,
    force: bool = Query(
        default=False,
        description=(
            "When false (default), fields whose current article value is "
            "already populated are skipped. When true, every field for "
            "which the AI returned a non-empty value is overwritten."
        ),
    ),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Import a filled (or partially filled) template into the
    article. Accepts ``text/yaml`` (or any text Content-Type) as
    the raw request body. Returns the lists of updated and
    skipped fields plus reasons for skipping."""
    article = _load_article(article_id, db)

    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body")
    try:
        yaml_text = raw_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Request body is not valid UTF-8: {exc}",
        ) from exc

    try:
        template = parse_template_from_yaml(yaml_text)
    except TemplateSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(template, ArticleTemplate):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Template type is {template.type!r}; this endpoint accepts only article templates"
            ),
        )

    updated, skipped = _apply_template_to_article(article, template, force=force)

    if updated:
        db.add(article)
        db.commit()
        db.refresh(article)

    return {
        "article_id": article.id,
        "updated_fields": updated,
        "skipped_fields": list(skipped.keys()),
        "skip_reasons": skipped,
        "force": force,
    }


@articles_router.post(
    "/from-ai-template",
    status_code=status.HTTP_201_CREATED,
    response_model=ArticleOut,
)
async def create_article_from_ai_template(
    request: Request,
    db: Session = Depends(get_db),
) -> Article:
    """Create a new Article from a filled ``.biblio.yaml``
    template. The "New from template" workflow: user exports
    an empty template, fills it (manually or via AI), uploads
    it back here, and lands in the article editor with all the
    template fields applied.

    The template's ``title`` field is required (the only field
    that cannot be null on a new article). Other fields are
    applied via the same ``_apply_template_to_article`` pipeline
    used by the per-article import endpoint; force=True since
    every column starts empty on a fresh row."""
    raw_body = await request.body()
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty request body")
    try:
        yaml_text = raw_body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Request body is not valid UTF-8: {exc}",
        ) from exc

    try:
        template = parse_template_from_yaml(yaml_text)
    except TemplateSchemaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not isinstance(template, ArticleTemplate):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Template type is {template.type!r}; this endpoint accepts only article templates"
            ),
        )

    title_value = template.title.current_value
    if not isinstance(title_value, str) or not title_value.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "Article template's title field has no current_value; "
                "set a title in the template before importing it as a new article"
            ),
        )

    # Language: prefer reference.language (per-record export path)
    # over the root-level language (empty/new-idea template path).
    # Default to "en" so the article model's NOT NULL stays valid
    # even if both are missing.
    language = "en"
    if template.reference is not None and template.reference.language:
        language = template.reference.language
    elif template.language:
        language = template.language

    article = Article(title=title_value.strip(), language=language)
    db.add(article)
    db.flush()  # populate article.id before _apply_template_to_article reads it

    _apply_template_to_article(article, template, force=True)

    db.commit()
    db.refresh(article)
    return article


@empty_router.get("/article")
def empty_article_template(
    language: str = Query(
        default="en",
        min_length=2,
        max_length=10,
        description=(
            "Language code (e.g. 'en', 'de', 'pt-br'). Propagated to "
            "the root-level `language:` key so the downstream AI knows "
            "what language to respond in. The file carries no reference "
            "block (new-idea workflow); a paired 'New from template' "
            "Article-creation endpoint lands in Session 2."
        ),
    ),
) -> Response:
    """Generate an empty ``.biblio.yaml`` for the new-idea
    workflow. All ``current_value`` fields are null or empty
    lists; the AI fills them and the user uploads the result
    via Session 2's New-from-template flow."""
    template = build_empty_article_template(language=language)
    yaml_text = serialize_template_to_yaml(template, include_header=True)
    safe_lang = re.sub(r"[^a-z0-9-]", "-", language.lower()) or "lang"
    slug = f"new-article-{safe_lang}"
    return _build_yaml_response(yaml_text, slug)


# Exposed for ``app.main`` to register.
__all__ = ["articles_router", "empty_router"]


def _register_with_app() -> None:
    """No-op marker; kept so import-time side effects are
    explicit in main.py. The actual ``include_router`` calls
    happen there."""
    return None


# Status code re-exports for callers that want to assert on
# specific failure modes without importing FastAPI directly.
BAD_REQUEST = status.HTTP_400_BAD_REQUEST
NOT_FOUND = status.HTTP_404_NOT_FOUND
