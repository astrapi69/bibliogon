"""Image downloader for Medium imports.

Walks the ImageRef list captured during HTML parsing, downloads
each image from cdn-images-1.medium.com to local storage under
``{upload_dir}/articles/{article_id}/imported_image/{filename}``,
creates an ArticleAsset row per image, and returns a URL-rewrite
map the caller uses to replace cdn URLs in the produced TipTap
doc with the local served path
``/api/articles/{article_id}/assets/file/{filename}``.

Why local storage by default. Medium CDN URLs are notorious for
breaking; the v0.30.0 design decision (data sovereignty over
convenience) makes ``download_images = true`` the default. The
plugin config exposes the toggle for power users who explicitly
want remote URLs.

Failure handling. Per-image failures (timeout, 404, network) emit
a conversion warning and leave the original cdn URL in place so
the article is still usable post-import. The downloader does NOT
abort the import on a single failed image - that would punish
the user for one broken upstream out of dozens.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from .walker import ImageRef

logger = logging.getLogger(__name__)


# Anything that's not a letter, digit, dot, hyphen, or underscore
# becomes an underscore. Keeps Medium's data-image-id values
# (e.g. ``1*cDW3rymJIJxWKQ4asJx1gw.jpeg``) intact while sanitising
# anything weirder.
_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]")
_DEFAULT_EXT = ".jpg"


@dataclass
class DownloadResult:
    """Outcome of a downloader run for one article."""

    # Original cdn URL -> local served path. Used to rewrite the
    # TipTap doc before persisting.
    url_rewrites: dict[str, str]
    # Names of files written under uploads/articles/<id>/imported_image/.
    # Same order as the input ImageRef list.
    saved_filenames: list[str]
    # Per-image warnings. Appended to the post-level warnings by
    # the importer.
    warnings: list[str]


def filename_for(image: ImageRef) -> str:
    """Derive a filesystem-safe filename for an image reference.

    Prefers ``data-image-id`` (Medium's unique image hash) over a
    URL hash so the same image referenced twice in different posts
    lands at the same filename without a hash collision.
    """
    if image.data_image_id:
        return _FILENAME_SAFE.sub("_", image.data_image_id)

    # Fall back: take the last path segment from the URL. Strip any
    # query string (Medium's CDN URLs include ``?q=...`` for some
    # routes) and sanitise.
    last_segment = image.src.rsplit("/", 1)[-1].split("?", 1)[0]
    if not last_segment:
        last_segment = "medium-image"
    safe = _FILENAME_SAFE.sub("_", last_segment)
    if "." not in safe:
        safe += _DEFAULT_EXT
    return safe


def download_images(
    images: list[ImageRef],
    article_id: str,
    *,
    timeout_seconds: float = 30.0,
    client: httpx.Client | None = None,
) -> DownloadResult:
    """Download every image and create ArticleAsset rows for them.

    Args:
        images: Images captured by ``MediumWalker.parse``.
        article_id: The Article's primary-key UUID (already
            persisted; the downloader does not create the Article).
        timeout_seconds: Per-image HTTP timeout. Tuned via the
            plugin config.
        client: Optional httpx.Client to reuse across calls (e.g.
            during a bulk import). Tests inject a mock here.

    The function imports ``app.*`` lazily so the module can be
    parsed without the backend being on the path (the plugin's
    own pytest run, for example).
    """
    from app.database import SessionLocal
    from app.models import ArticleAsset
    from app.paths import get_upload_dir

    rewrites: dict[str, str] = {}
    saved: list[str] = []
    warnings: list[str] = []

    target_dir = get_upload_dir() / "articles" / article_id / "imported_image"
    target_dir.mkdir(parents=True, exist_ok=True)

    owns_client = client is None
    if client is None:
        client = httpx.Client(timeout=timeout_seconds, follow_redirects=True)

    db = SessionLocal()
    try:
        for image in images:
            if not image.src:
                continue
            if image.src in rewrites:
                # Same URL appeared twice in the post; reuse the
                # already-saved file. (Rare but cheap to handle.)
                saved.append(filename_for(image))
                continue

            try:
                response = client.get(image.src, timeout=timeout_seconds)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("medium-import: image download failed: %s (%s)", image.src, exc)
                warnings.append(f"image download failed for {image.src}: {exc}")
                continue

            filename = filename_for(image)
            file_path = target_dir / filename
            file_path.write_bytes(response.content)
            saved.append(filename)

            db.add(
                ArticleAsset(
                    article_id=article_id,
                    filename=filename,
                    asset_type="imported_image",
                    path=str(file_path),
                )
            )

            served_path = f"/api/articles/{article_id}/assets/file/{filename}"
            rewrites[image.src] = served_path

        db.commit()
    finally:
        db.close()
        if owns_client:
            client.close()

    return DownloadResult(
        url_rewrites=rewrites,
        saved_filenames=saved,
        warnings=warnings,
    )


def rewrite_image_urls(doc: dict[str, Any], rewrites: dict[str, str]) -> dict[str, Any]:
    """Return a copy of ``doc`` with image src URLs rewritten in place.

    Applied after a successful ``download_images`` run. Uses an
    in-place mutation on the cloned dict; the input doc is not
    modified.
    """
    if not rewrites:
        return doc

    # Walker emits ``imageFigure`` (Bibliogon's editor schema; see
    # lessons-learned). ``image`` is kept as a defensive fallback so a
    # second oversight from a future walker rename does not silently
    # leak CDN URLs into persisted docs.
    def _walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") in ("imageFigure", "image"):
            attrs = node.get("attrs") or {}
            current_src = attrs.get("src")
            if isinstance(current_src, str) and current_src in rewrites:
                attrs["src"] = rewrites[current_src]
        for child in node.get("content") or []:
            _walk(child)

    # Shallow copy at the top level is enough because _walk mutates
    # the same nested dicts; for caller safety we deep-clone via
    # JSON roundtrip though, since the doc is small enough that the
    # cost is irrelevant.
    import json as _json

    cloned: dict[str, Any] = _json.loads(_json.dumps(doc))
    _walk(cloned)
    return cloned
