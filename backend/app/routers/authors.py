"""Authors-Database endpoints (Bug 8 Phase 1, Commit 2).

CRUD for the standalone ``authors`` table introduced by
migration ``ma2b3c4d5e6f``. Powers the Wizard author-dropdown
(Phase 2) and the new Settings "Authors-Database" tab (Commit 5).

The Authors-DB is decoupled from existing free-text ``author``
columns on Book, Article and ArticleComment per D5 — those columns
do NOT carry a foreign key, and the wizard's author input remains
free-text-valid even when the typed name is absent from the DB.

Endpoints:

  GET    /api/authors                — list (with optional
                                       name-substring ``search``
                                       and ``limit``)
  GET    /api/authors/{id}           — retrieve
  POST   /api/authors                — create with server-side
                                       slug auto-generation +
                                       collision-suffixing
  PATCH  /api/authors/{id}           — update name and/or bio;
                                       slug is immutable
  DELETE /api/authors/{id}           — hard delete (idempotent —
                                       204 on already-deleted)

Slug auto-generation is plain ASCII lowercase + hyphens. German
umlauts (ä/ö/ü/ß) transliterate to their ASCII equivalents
BEFORE NFKD normalisation so they survive the unicode strip
(e.g. ``Müller`` → ``mueller``, not ``mller``). Remaining
diacritics fall back to NFKD ASCII-fold (``Naïve`` → ``naive``).
Empty result (e.g. all-emoji name) falls back to ``"author"`` so
collision-suffixing has a base string to extend.
"""

from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models import Author
from app.repositories.authors import AuthorRepository, get_author_repository
from app.schemas import AuthorCreate, AuthorOut, AuthorUpdate

router = APIRouter(prefix="/authors", tags=["authors"])


# ---------------------------------------------------------------------------
# Slug derivation helpers
# ---------------------------------------------------------------------------


# Transliterate German + Nordic diacritics BEFORE NFKD strips them,
# so the slug carries the intended phonetic equivalent rather than a
# bare consonant. The general NFKD path then handles the rest of
# Latin-extended (Naïve → naive, Łukasz → ukasz, etc.).
_TRANSLITERATE = str.maketrans(
    {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "ß": "ss",
        "Ä": "Ae",
        "Ö": "Oe",
        "Ü": "Ue",
        "æ": "ae",
        "Æ": "Ae",
        "œ": "oe",
        "Œ": "Oe",
        "ø": "o",
        "Ø": "O",
        "å": "a",
        "Å": "A",
    }
)


def _slugify(name: str) -> str:
    """Return a URL-safe lowercase-hyphenated slug for ``name``.

    Falls back to ``"author"`` when normalisation strips the input
    down to an empty string (e.g. all-emoji or all-symbol input);
    the caller is responsible for collision-suffixing.
    """
    transliterated = name.translate(_TRANSLITERATE)
    folded = unicodedata.normalize("NFKD", transliterated).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", folded).strip("-").lower()
    return slug or "author"


def _unique_slug(repo: AuthorRepository, base: str) -> str:
    """Return ``base`` or ``base-N`` for the lowest free ``N >= 2``."""
    if not repo.slug_exists(base):
        return base
    suffix = 2
    while repo.slug_exists(f"{base}-{suffix}"):
        suffix += 1
    return f"{base}-{suffix}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[AuthorOut])
def list_authors(
    repo: AuthorRepository = Depends(get_author_repository),
    search: str | None = Query(
        default=None,
        description=(
            "Case-insensitive substring filter on ``name``. Omit to "
            "list all authors. Empty / whitespace-only treated as omitted."
        ),
    ),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[Author]:
    """List authors ordered by name, newest-tiebreak by created_at desc."""
    return list(repo.list(search=search, limit=limit))


@router.get("/{author_id}", response_model=AuthorOut)
def get_author(
    author_id: str,
    repo: AuthorRepository = Depends(get_author_repository),
) -> Author:
    author = repo.get(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail=f"Author {author_id} not found")
    return author


@router.post("", response_model=AuthorOut, status_code=status.HTTP_201_CREATED)
def create_author(
    payload: AuthorCreate,
    repo: AuthorRepository = Depends(get_author_repository),
) -> Author:
    """Create an author. Slug is server-generated and collision-suffixed."""
    base_slug = _slugify(payload.name)
    slug = _unique_slug(repo, base_slug)
    author = Author(
        name=payload.name,
        slug=slug,
        bio=payload.bio,
        is_profile_author=payload.is_profile_author,
    )
    return repo.add(author)


@router.patch("/{author_id}", response_model=AuthorOut)
def update_author(
    author_id: str,
    payload: AuthorUpdate,
    repo: AuthorRepository = Depends(get_author_repository),
) -> Author:
    """Partial update. Slug is immutable; name edits do not regenerate it."""
    author = repo.get(author_id)
    if author is None:
        raise HTTPException(status_code=404, detail=f"Author {author_id} not found")
    fields = payload.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(author, key, value)
    return repo.save(author)


@router.delete("/{author_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_author(
    author_id: str,
    repo: AuthorRepository = Depends(get_author_repository),
) -> None:
    """Hard-delete. Idempotent: already-gone returns 204 too.

    Deleting an absent author is a no-op (not a 404) so the frontend's
    "delete -> refetch" cycle works even if the row was already removed
    in another tab. No FK references the authors table (the Authors-DB
    stays decoupled from the free-text ``author`` columns on Book /
    Article / ArticleComment per D5), so hard-delete is safe — no
    cascading rows to worry about.
    """
    author = repo.get(author_id)
    if author is None:
        return
    repo.delete(author)
