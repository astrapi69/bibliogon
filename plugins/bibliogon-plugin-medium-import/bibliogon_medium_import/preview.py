"""Dry-run preview pipeline for the Medium-import v2 workflow.

The v1 endpoint (``POST /api/medium-import/import``) extracts the
uploaded ZIP, walks every ``posts/*.html``, and persists each result
in one pass. The v2 wizard breaks that into two steps so the user can
deselect unwanted posts before any DB write happens:

  1. ``POST /api/medium-import/preview`` — accepts the ZIP, walks the
     posts to build a per-row table, caches the original ZIP bytes
     under ``get_data_dir() / "tmp" / "medium-import-previews" /
     {preview_id}.zip``, returns the table plus a ``preview_id`` token.
     No DB writes.

  2. ``POST /api/medium-import/import/{preview_id}`` — accepts a
     selection of filenames, reads the cached ZIP, calls
     :func:`import_zip` with ``selected_filenames={...}``, deletes the
     cached ZIP on success, returns the standard ``ImportResult``.

The cache lifecycle has three reapers:

  - On-success delete inside the import endpoint.
  - TTL sweep on every ``create_preview`` call (cheap; runs in the
    same request the user is already waiting for).
  - Explicit ``DELETE /api/medium-import/preview/{preview_id}`` for
    cancel-from-UI.

The TTL is intentionally short (30 min) — Medium archives can be
~200MB, so abandoned previews must not pile up. Tests can override
via ``PREVIEW_TTL_SECONDS``.

Lazy backend imports (``app.database`` / ``app.models``) keep this
module importable in plugin-only test runs that don't put the
backend on the path. Mirrors the discipline already in
``importer.py``.
"""

from __future__ import annotations

import logging
import time
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .walker import MediumWalker, ParsedPost

logger = logging.getLogger(__name__)

# 30 minutes. Long enough for a user to scroll through a 200-row
# preview table, short enough that an abandoned 200MB archive does
# not stay on disk for the next user. Tests override via the
# constructor of :class:`PreviewCache`.
PREVIEW_TTL_SECONDS = 30 * 60

# Body-text preview length surfaced for each comment row. Mirrors
# the cap used by ``ImportedComment.body_preview`` so the v2 preview
# UI shows the same length the v1 result UI does.
_COMMENT_BODY_PREVIEW_CHARS = 120


@dataclass
class PreviewItem:
    """One ``posts/*.html`` entry rendered for the preview table.

    All fields are JSON-safe so the route handler can hand the
    dataclass straight to its Pydantic response model without a
    second serialization pass. The Pydantic layer adds field-level
    validation; this dataclass keeps the importer / cache code free
    of Pydantic at the data-model level.
    """

    filename: str
    title: str
    subtitle: str
    author: str
    published_at: str | None
    canonical_url: str
    detected_language: str | None
    # "article" or "comment". Mirrors the walker's ``is_comment``
    # bit one-to-one; surfaced as a string so the frontend can
    # render a badge without re-deriving from a boolean.
    classification: str
    # Whether the importer would skip this row with
    # ``skip_existing_canonical_urls=True``. Computed at preview
    # time via a SELECT against ``Article.canonical_url``. None
    # when the post has no canonical_url at all (the importer
    # records that as an error during the actual run, NOT as a
    # dedup skip — see :func:`import_zip`).
    existing_article_id: str | None
    # Body-text preview for comment rows so the user can recognise
    # what they're keeping or dropping. Empty for article rows.
    body_preview: str
    # Walker warnings caught during the parse pass. Empty list when
    # nothing to surface. The preview UI renders a count badge and
    # an expandable details panel.
    warnings: list[str] = field(default_factory=list)


@dataclass
class PreviewResult:
    """Full preview payload returned to the route handler."""

    preview_id: str
    total_posts: int
    items: list[PreviewItem]
    # Posts the walker skipped entirely (filename couldn't be read,
    # ZIP entry was empty, etc.). Surfaced so the user knows the
    # archive shape mismatch is real, not a UI bug.
    errored: list[dict[str, str]] = field(default_factory=list)
    expires_at: float = 0.0  # Unix timestamp


class PreviewCache:
    """File-backed cache for the uploaded ZIP bytes between preview
    and import calls.

    Backed by the filesystem (not in-memory) so the cache survives
    worker restarts in async setups and so we don't tie up Python
    memory with 200MB+ archives. The on-disk layout is intentionally
    flat: one ``.zip`` per preview, named by the UUID, no metadata
    sidecar. The ``mtime`` of the file is the TTL anchor.

    All operations resolve paths fresh via :func:`get_data_dir` so
    the test conftest's ``BIBLIOGON_DATA_DIR`` env-var override
    actually takes effect. NEVER cache the cache_dir at module
    import time.
    """

    def __init__(self, ttl_seconds: float = PREVIEW_TTL_SECONDS) -> None:
        self._ttl = float(ttl_seconds)

    def _cache_dir(self) -> Path:
        # Lazy import keeps the plugin importable in test runs that
        # don't put the backend on sys.path; mirrors importer.py.
        from app.paths import get_data_dir

        cache_dir = get_data_dir() / "tmp" / "medium-import-previews"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _path_for(self, preview_id: str) -> Path:
        return self._cache_dir() / f"{preview_id}.zip"

    def store(self, zip_bytes: bytes) -> str:
        """Persist ``zip_bytes`` under a fresh UUID and return it."""
        preview_id = uuid.uuid4().hex
        target = self._path_for(preview_id)
        target.write_bytes(zip_bytes)
        return preview_id

    def load(self, preview_id: str) -> bytes | None:
        """Return the cached ZIP for ``preview_id`` or ``None``.

        Returns ``None`` for both "never existed" and "expired";
        callers don't need to distinguish for the 404 path. A miss
        also opportunistically deletes the file if it exists but
        is past TTL, so a single 404 reaps the stale entry.
        """
        path = self._path_for(preview_id)
        if not path.exists():
            return None
        if self._is_expired(path):
            try:
                path.unlink()
            except OSError as exc:
                logger.warning(
                    "medium-import: preview cleanup failed for %s: %s",
                    preview_id,
                    exc,
                )
            return None
        return path.read_bytes()

    def delete(self, preview_id: str) -> bool:
        """Best-effort delete. Returns True iff a file existed."""
        path = self._path_for(preview_id)
        if not path.exists():
            return False
        try:
            path.unlink()
            return True
        except OSError as exc:
            logger.warning(
                "medium-import: explicit cancel failed for %s: %s",
                preview_id,
                exc,
            )
            return False

    def reap_expired(self) -> int:
        """Delete every cached preview past TTL. Returns the count."""
        try:
            cache_dir = self._cache_dir()
        except OSError as exc:
            logger.warning("medium-import: cache reap failed: %s", exc)
            return 0
        reaped = 0
        for path in cache_dir.glob("*.zip"):
            if self._is_expired(path):
                try:
                    path.unlink()
                    reaped += 1
                except OSError as exc:
                    logger.warning(
                        "medium-import: cache reap failed for %s: %s",
                        path.name,
                        exc,
                    )
        return reaped

    def _is_expired(self, path: Path) -> bool:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return True
        return (time.time() - mtime) > self._ttl

    def expires_at(self, preview_id: str) -> float:
        """Unix timestamp at which the given preview will expire.
        Returns 0.0 when the preview is unknown."""
        path = self._path_for(preview_id)
        if not path.exists():
            return 0.0
        try:
            return path.stat().st_mtime + self._ttl
        except OSError:
            return 0.0


# Module-level singleton. The cache is stateless except for the
# files it owns on disk, which means tests do NOT need to monkeypatch
# this away — the BIBLIOGON_DATA_DIR override that runs before
# ``app.*`` imports lands the on-disk cache under a tmp dir per
# conftest. Plus an explicit fixture in test_preview.py reaps the
# cache between tests for extra hygiene.
_DEFAULT_CACHE = PreviewCache()


def get_default_cache() -> PreviewCache:
    """Single accessor so route handlers don't import the symbol
    directly. Lets a future test that wants to swap the singleton
    monkeypatch this function instead of the module attribute."""
    return _DEFAULT_CACHE


def build_preview(zip_bytes: bytes, cache: PreviewCache | None = None) -> PreviewResult:
    """Parse every post for preview + cache the ZIP under a new id.

    Does NOT persist anything to the DB; only reads ``Article``
    rows to compute dedup status. The walker pass is the same one
    the actual importer uses, so what the user sees in the preview
    table is exactly what the importer would emit (modulo the
    DB-write side effects).

    Raises ``ValueError`` for malformed input the same way
    :func:`import_zip` does so the route handler maps both to 400.
    """
    cache = cache or _DEFAULT_CACHE

    # Reap expired entries opportunistically. Cheap (single glob
    # over a tmp dir) and means TTL eviction does not need its own
    # background task.
    reaped = cache.reap_expired()
    if reaped:
        logger.info("medium-import: reaped %d expired preview entries", reaped)

    items, errored = _walk_for_preview(zip_bytes)
    preview_id = cache.store(zip_bytes)
    return PreviewResult(
        preview_id=preview_id,
        total_posts=len(items),
        items=items,
        errored=errored,
        expires_at=cache.expires_at(preview_id),
    )


def _walk_for_preview(zip_bytes: bytes) -> tuple[list[PreviewItem], list[dict[str, str]]]:
    """Walk every post in the ZIP and emit one PreviewItem per file.

    Returns ``(items, errored)``. ``errored`` carries per-file parse
    failures so the preview UI can surface them; the importer's
    per-file try/except already covers the same shape on the
    actual run.

    Validates the ZIP shape the same way :func:`import_zip` does
    (raises ``ValueError`` for "not a zip" and "no posts/ dir") so
    the route handler maps both to 400 without duplicating the
    check.
    """
    import io
    import tempfile

    items: list[PreviewItem] = []
    errored: list[dict[str, str]] = []

    with tempfile.TemporaryDirectory(prefix="medium-preview-") as tmp_str:
        tmp = Path(tmp_str)
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                zf.extractall(tmp)
        except zipfile.BadZipFile as exc:
            raise ValueError(f"Not a valid ZIP archive: {exc}") from exc

        posts_dir = _find_posts_dir(tmp)
        if posts_dir is None:
            raise ValueError(
                "ZIP does not contain a 'posts/' directory; "
                "this does not look like a Medium HTML export."
            )

        # Pre-load every canonical_url on existing Articles so we
        # answer the dedup question with one query instead of N.
        existing_by_url = _load_existing_canonical_urls()

        for path in sorted(posts_dir.glob("*.html")):
            try:
                html = path.read_text(encoding="utf-8")
                walker = MediumWalker()
                parsed = walker.parse(html)
                items.append(_to_preview_item(path.name, parsed, existing_by_url))
            except Exception as exc:  # noqa: BLE001 - boundary handler
                logger.exception("medium-import preview: failed on %s", path.name)
                errored.append({"filename": path.name, "error": str(exc)})

    return items, errored


def _to_preview_item(
    filename: str,
    parsed: ParsedPost,
    existing_by_url: dict[str, str],
) -> PreviewItem:
    """Adapt a ``ParsedPost`` into the JSON-safe preview row shape."""
    existing_id = (
        existing_by_url.get(parsed.canonical_url)
        if parsed.canonical_url
        else None
    )
    classification = "comment" if parsed.is_comment else "article"
    body_preview = ""
    if parsed.is_comment:
        body_preview = _extract_body_preview(parsed.content_doc)
    return PreviewItem(
        filename=filename,
        title=parsed.title or "(untitled)",
        subtitle=parsed.subtitle or "",
        author=parsed.author or "",
        published_at=parsed.published_at,
        canonical_url=parsed.canonical_url or "",
        detected_language=parsed.detected_language,
        classification=classification,
        existing_article_id=existing_id,
        body_preview=body_preview,
        warnings=list(parsed.warnings),
    )


def _extract_body_preview(content_doc: dict[str, Any]) -> str:
    """First N chars of flattened body text. Mirrors
    ``ImportedComment.body_preview`` semantics from importer.py so
    the preview and the post-import result UIs surface the same
    snippet for the same row."""
    bits: list[str] = []

    def _walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                bits.append(str(node.get("text", "")))
            for child in node.get("content", []) or []:
                _walk(child)

    _walk(content_doc)
    return " ".join(b for b in bits if b.strip())[:_COMMENT_BODY_PREVIEW_CHARS]


def _load_existing_canonical_urls() -> dict[str, str]:
    """Return ``{canonical_url: article_id}`` for every Article that
    carries a non-NULL canonical_url.

    One query per preview build. Returns empty dict in environments
    where the backend isn't importable (covers the plugin-only test
    runs that monkey out the DB). The dedup-badge in the UI just
    shows "new" for every row in that case, which is honest.
    """
    try:
        from app.database import SessionLocal
        from app.models import Article
    except ImportError:
        return {}

    db = SessionLocal()
    try:
        rows = (
            db.query(Article.id, Article.canonical_url)
            .filter(Article.canonical_url.isnot(None))
            .filter(Article.canonical_url != "")
            .all()
        )
        return {url: article_id for article_id, url in rows}
    finally:
        db.close()


def _find_posts_dir(root: Path) -> Path | None:
    """Same logic as ``importer._find_posts_dir``. Kept here as a
    private helper so the preview pipeline does not import a
    leading-underscore symbol from a sibling module."""
    direct = root / "posts"
    if direct.is_dir():
        return direct
    for child in root.iterdir():
        if not child.is_dir():
            continue
        candidate = child / "posts"
        if candidate.is_dir():
            return candidate
    return None
