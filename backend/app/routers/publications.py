"""AR-02 Phase 2: per-Article Publication CRUD + drift detection.

Endpoints under ``/api/articles/{article_id}/publications``:

- POST                          create publication
- GET                           list publications for article
- GET    /{pub_id}               get one
- PATCH  /{pub_id}               partial update
- DELETE /{pub_id}               delete
- POST   /{pub_id}/mark-published  snapshot content + status=published
- POST   /{pub_id}/verify-live     refresh last_verified_at, clear out_of_sync

Plus a sibling endpoint for platform schemas (used by the frontend
form renderer):

- GET /api/articles/platform-schemas

Drift detection. After a publication is marked ``published`` the
service stores a snapshot of ``Article.content_json`` and remembers
it in ``Publication.content_snapshot_at_publish``. On every read,
``_effective_status`` compares the snapshot to the article's current
``content_json``; mismatch flips the persisted status to
``out_of_sync`` (and the persisted change is committed so subsequent
reads stop re-doing the comparison).
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.models import Article, Publication
from app.repositories.publications import (
    PublicationRepository,
    get_publication_repository,
)
from app.schemas import (
    MarkPublishedRequest,
    PlatformSchemaOut,
    PublicationCreate,
    PublicationOut,
    PublicationUpdate,
)
from app.services.platform_schema import (
    load_platform_schemas,
    validate_platform_metadata,
)

logger = logging.getLogger(__name__)

# Two routers: one nested under articles for the CRUD, one flat for
# platform-schemas.
publications_router = APIRouter(prefix="/articles/{article_id}/publications", tags=["publications"])
# Top-level path to avoid collision with /articles/{article_id}.
platform_schemas_router = APIRouter(prefix="/article-platforms", tags=["publications"])


def _get_article_or_404(article_id: str, repo: PublicationRepository) -> Article:
    article = repo.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


def _get_publication_or_404(
    article_id: str, pub_id: str, repo: PublicationRepository
) -> Publication:
    pub = repo.get(article_id, pub_id)
    if not pub:
        raise HTTPException(status_code=404, detail="Publication not found")
    return pub


def _validate_or_400(platform: str, metadata: dict[str, Any]) -> None:
    ok, errors = validate_platform_metadata(platform, metadata)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "platform_metadata_invalid",
                "platform": platform,
                "errors": errors,
            },
        )


def _check_drift(pub: Publication, article: Article, repo: PublicationRepository) -> Publication:
    """Persist ``out_of_sync`` if the live snapshot diverges.

    Only published publications are subject to drift. Once a
    publication is flipped to ``out_of_sync`` the user clears it via
    the verify-live or re-mark-published endpoints.
    """
    if pub.status != "published":
        return pub
    if pub.content_snapshot_at_publish is None:
        return pub
    if pub.content_snapshot_at_publish != article.content_json:
        pub.status = "out_of_sync"
        repo.save(pub)
    return pub


# --- CRUD ---


@publications_router.post("", response_model=PublicationOut, status_code=status.HTTP_201_CREATED)
def create_publication(
    article_id: str,
    payload: PublicationCreate,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> Publication:
    _get_article_or_404(article_id, repo)
    _validate_or_400(payload.platform, payload.platform_metadata)

    pub = Publication(
        article_id=article_id,
        platform=payload.platform,
        is_promo=payload.is_promo,
        status="planned",
        platform_metadata=json.dumps(payload.platform_metadata or {}),
        scheduled_at=payload.scheduled_at,
        notes=payload.notes,
    )
    return repo.add(pub)


@publications_router.get("", response_model=list[PublicationOut])
def list_publications(
    article_id: str,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> list[Publication]:
    article = _get_article_or_404(article_id, repo)
    rows = list(repo.list(article_id))
    for pub in rows:
        _check_drift(pub, article, repo)
    return rows


@publications_router.get("/{pub_id}", response_model=PublicationOut)
def get_publication(
    article_id: str,
    pub_id: str,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> Publication:
    article = _get_article_or_404(article_id, repo)
    pub = _get_publication_or_404(article_id, pub_id, repo)
    return _check_drift(pub, article, repo)


@publications_router.patch("/{pub_id}", response_model=PublicationOut)
def update_publication(
    article_id: str,
    pub_id: str,
    payload: PublicationUpdate,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> Publication:
    article = _get_article_or_404(article_id, repo)
    pub = _get_publication_or_404(article_id, pub_id, repo)
    updates = payload.model_dump(exclude_unset=True)
    if "platform_metadata" in updates and updates["platform_metadata"] is not None:
        _validate_or_400(pub.platform, updates["platform_metadata"])
        updates["platform_metadata"] = json.dumps(updates["platform_metadata"])
    for key, value in updates.items():
        setattr(pub, key, value)
    repo.save(pub)
    return _check_drift(pub, article, repo)


@publications_router.delete("/{pub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_publication(
    article_id: str,
    pub_id: str,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> None:
    pub = _get_publication_or_404(article_id, pub_id, repo)
    repo.delete(pub)


# --- Lifecycle helpers ---


@publications_router.post("/{pub_id}/mark-published", response_model=PublicationOut)
def mark_as_published(
    article_id: str,
    pub_id: str,
    payload: MarkPublishedRequest,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> Publication:
    """Snapshot content + flip status to ``published``.

    Per AR-02 design: the snapshot is what enables drift detection.
    Storing the live URL in ``platform_metadata.published_url`` keeps
    the published_url retrieval logic uniform across platforms (no
    parallel column).
    """
    article = _get_article_or_404(article_id, repo)
    pub = _get_publication_or_404(article_id, pub_id, repo)

    pub.status = "published"
    pub.content_snapshot_at_publish = article.content_json
    pub.published_at = payload.published_at or datetime.now(UTC)
    pub.last_verified_at = pub.published_at

    if payload.published_url:
        try:
            existing_meta = json.loads(pub.platform_metadata or "{}")
        except json.JSONDecodeError:
            existing_meta = {}
        if not isinstance(existing_meta, dict):
            existing_meta = {}
        existing_meta["published_url"] = payload.published_url
        pub.platform_metadata = json.dumps(existing_meta)

    return repo.save(pub)


@publications_router.post("/{pub_id}/verify-live", response_model=PublicationOut)
def verify_live_matches(
    article_id: str,
    pub_id: str,
    repo: PublicationRepository = Depends(get_publication_repository),
) -> Publication:
    """User asserts the live version matches the local snapshot.

    Resets the snapshot to the current article content (so drift
    detection compares against the user's fresh affirmation), bumps
    last_verified_at, and clears out_of_sync if it was set.
    """
    article = _get_article_or_404(article_id, repo)
    pub = _get_publication_or_404(article_id, pub_id, repo)

    pub.content_snapshot_at_publish = article.content_json
    pub.last_verified_at = datetime.now(UTC)
    if pub.status == "out_of_sync":
        pub.status = "published"
    return repo.save(pub)


# --- Platform schemas (sibling endpoint, no article scope) ---


@platform_schemas_router.get("", response_model=dict[str, PlatformSchemaOut])
def get_platform_schemas() -> dict[str, dict[str, Any]]:
    """Return the loaded platform_schemas.yaml mapping.

    Frontend uses this to render per-platform forms (which fields are
    required vs optional) without hardcoding platform knowledge.
    """
    return load_platform_schemas()
