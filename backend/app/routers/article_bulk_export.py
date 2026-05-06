"""Bulk article export.

Exports a caller-supplied list of articles in one operation. Two
output modes:

- ``zip``: one file per article in the chosen format, packed into a
  single ZIP. ``zipfile`` (stdlib) handles the archive; per-article
  rendering reuses the per-article export helpers from
  :mod:`app.routers.article_export` (``_build_markdown`` and
  ``_run_pandoc``) so the bulk path is not a parallel reimplementation.

- ``combined``: all articles concatenated into one document with a
  ``---`` separator and ``## <Title>`` heading per article. For
  HTML / PDF / DOCX the combined Markdown feeds Pandoc once with
  ``--toc`` so the user gets a real table of contents in the output.

Order is the order in which the caller sends the IDs (the frontend
sends them in display-sort order). The DB query loads the matching
rows then re-sorts them client-side because SQL ``IN (...)`` does not
preserve list order.

A hard server-side limit (``MAX_BULK_ARTICLES``) backs up the
client-side warnings - the frontend can lie or be bypassed by direct
API users, the server cannot.

Pandoc has a longer timeout for combined runs because a 30-article
PDF rendering is realistically minutes. The per-article 60s cap stays.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article
from app.routers.article_export import (
    _OUTPUT_EXTENSIONS,
    _PANDOC_TARGETS,
    _build_markdown,
    _slugify,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles/bulk-export", tags=["article-export"])

MAX_BULK_ARTICLES: Final = 200
COMBINED_PANDOC_TIMEOUT_SECONDS: Final = 180

_BULK_FORMATS: Final = ("markdown", "html", "pdf", "docx")
_BULK_MODES: Final = ("zip", "combined")
_COMBINED_MEDIA_TYPES: Final = {
    "markdown": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class BulkExportRequest(BaseModel):
    article_ids: list[str] = Field(min_length=1, max_length=MAX_BULK_ARTICLES)
    format: Literal["markdown", "html", "pdf", "docx"]
    mode: Literal["zip", "combined"]


def _load_articles_in_order(article_ids: list[str], db: Session) -> list[Article]:
    """Fetch the requested rows and return them in the input order.

    SQL ``IN`` does not preserve list order; we look up by ID in a
    single round-trip, then sort in Python. Missing IDs raise 404
    with the offending ID surfaced - safer than silently dropping
    them, which would yield a smaller export than the user asked for.
    """
    rows = (
        db.query(Article)
        .filter(Article.id.in_(article_ids))
        .filter(Article.deleted_at.is_(None))
        .all()
    )
    by_id = {a.id: a for a in rows}
    missing = [aid for aid in article_ids if aid not in by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Articles not found or trashed: {', '.join(missing[:5])}"
            + ("..." if len(missing) > 5 else ""),
        )
    return [by_id[aid] for aid in article_ids]


def _strip_h1_heading(markdown: str) -> str:
    """Drop the leading ``# Title`` line from a per-article markdown.

    The combined document re-introduces the title as ``## Title`` so
    Pandoc's TOC pulls in section-level entries instead of one giant
    document title per article. ``_build_markdown`` always emits
    ``# {title}`` as the first non-empty line, so this is a single
    regex pass on the head of the string.
    """
    return re.sub(r"^#\s+[^\n]*\n+", "", markdown, count=1)


def _build_combined_markdown(articles: list[Article]) -> str:
    """Concatenate articles into a single Markdown source.

    Each article becomes a ``## <Title>`` section. Per-article body
    is the existing Markdown render minus its ``# Title`` line (so
    Pandoc treats the ``##`` headings as the chapter level and the
    auto-generated TOC has one entry per article). Sections are
    separated by ``---`` thematic breaks per the project convention.

    Articles also lack a YAML frontmatter today, so there is no
    frontmatter strip step - the Markdown emitted by ``_build_markdown``
    is already body-only with the title as the first heading.
    """
    parts: list[str] = []
    for idx, article in enumerate(articles):
        body = _strip_h1_heading(_build_markdown(article))
        title = article.title
        chunk = f"## {title}"
        if article.subtitle:
            chunk += f"\n\n_{article.subtitle}_"
        if article.author:
            chunk += f"\n\n*by {article.author}*"
        if body.strip():
            chunk += f"\n\n{body.rstrip()}"
        parts.append(chunk)
        if idx != len(articles) - 1:
            parts.append("---")
    return "\n\n".join(parts).rstrip() + "\n"


def _run_pandoc_combined(markdown: str, target: str) -> bytes:
    """Render combined Markdown to a target via Pandoc.

    Spawns Pandoc with ``--toc --toc-depth=2`` so the output has a
    real table of contents; PDF additionally uses
    ``--top-level-division=chapter`` so each ``##`` becomes a chapter.
    Timeout is the bulk-specific :data:`COMBINED_PANDOC_TIMEOUT_SECONDS`
    (180s) because 30-article runs realistically need that much
    headroom.

    On failure the error surfaces the last chunk of Pandoc stderr
    plus the article count being processed so the user can correlate
    "which export attempt blew up". The fail-loud-on-images contract
    means we don't try to recover; the user picks a different
    selection.
    """
    if shutil.which("pandoc") is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Pandoc is not installed on the server. "
                "Install pandoc to enable HTML / PDF / DOCX bulk export."
            ),
        )
    pandoc_target = _PANDOC_TARGETS[target]
    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = Path(tmpdir) / "combined.md"
        out_path = Path(tmpdir) / f"combined.{_OUTPUT_EXTENSIONS[target]}"
        in_path.write_text(markdown, encoding="utf-8")
        cmd = [
            "pandoc",
            str(in_path),
            "-o",
            str(out_path),
            "--from=gfm",
            f"--to={pandoc_target}",
            "--toc",
            "--toc-depth=2",
        ]
        if target == "html":
            cmd.append("--standalone")
        if target == "pdf":
            cmd.extend(
                [
                    "--pdf-engine=xelatex",
                    "--top-level-division=chapter",
                ]
            )
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=COMBINED_PANDOC_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail=(
                    f"Pandoc timed out after {COMBINED_PANDOC_TIMEOUT_SECONDS}s "
                    f"on combined {target} export. Reduce the selection or "
                    f"split into smaller batches."
                ),
            ) from exc
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            logger.error(
                "bulk-export combined pandoc failed: target=%s rc=%s stderr=%s",
                target,
                result.returncode,
                stderr[-500:],
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Combined Pandoc export failed (exit {result.returncode}). "
                    f"Common cause: an unreachable image URL in one of the "
                    f"selected articles. Check the articles' embedded images "
                    f"and try again. Pandoc stderr tail: {stderr[-300:]}"
                ),
            )
        if not out_path.exists():
            raise HTTPException(
                status_code=502,
                detail=f"Pandoc produced no output for combined {target}",
            )
        return out_path.read_bytes()


def _build_combined(articles: list[Article], fmt: str) -> Response:
    """Top-level dispatch: combined Markdown OR combined Pandoc target."""
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    ext = _OUTPUT_EXTENSIONS[fmt]
    filename = f"articles-{today}.{ext}"
    media_type = _COMBINED_MEDIA_TYPES[fmt]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    combined_md = _build_combined_markdown(articles)
    if fmt == "markdown":
        return Response(
            content=combined_md.encode("utf-8"),
            media_type=media_type,
            status_code=status.HTTP_200_OK,
            headers=headers,
        )
    payload = _run_pandoc_combined(combined_md, fmt)
    return Response(
        content=payload,
        media_type=media_type,
        status_code=status.HTTP_200_OK,
        headers=headers,
    )


def _per_article_payload(article: Article, fmt: str) -> bytes:
    """Render one article in the chosen format.

    Wraps the per-article pipeline so any Pandoc failure carries the
    article's title in the surfaced error - the user can immediately
    correlate "which article broke" without scanning logs. Reuses
    :func:`app.routers.article_export._build_markdown` and Pandoc;
    Markdown skips Pandoc entirely.
    """
    from app.routers.article_export import _run_pandoc

    md = _build_markdown(article)
    if fmt == "markdown":
        return md.encode("utf-8")
    try:
        return _run_pandoc(md, fmt)
    except HTTPException as exc:
        # Re-raise with article context so the frontend toast can tell
        # the user exactly which article is broken.
        raise HTTPException(
            status_code=exc.status_code,
            detail=f"Failed exporting article {article.title!r}: {exc.detail}",
        ) from exc


def _build_zip(articles: list[Article], fmt: str) -> Response:
    """Pack one file per article into a ZIP and return it.

    Filename pattern is ``<slug>.<ext>``. Slugs collide on articles
    with similar titles; the second encounter gets ``-2``, third gets
    ``-3``, etc. Numeric suffix is the conservative pick (per spec
    Q4 default) and survives URL-safe contexts the way UUID suffixes
    don't necessarily.
    """
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    zip_filename = f"articles-{today}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{zip_filename}"'}
    ext = _OUTPUT_EXTENSIONS[fmt]
    seen_slugs: dict[str, int] = {}
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / zip_filename
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for article in articles:
                base = _slugify(article.title)
                count = seen_slugs.get(base, 0)
                seen_slugs[base] = count + 1
                if count == 0:
                    name = f"{base}.{ext}"
                else:
                    name = f"{base}-{count + 1}.{ext}"
                payload = _per_article_payload(article, fmt)
                zf.writestr(name, payload)
        zip_bytes = zip_path.read_bytes()
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        status_code=status.HTTP_200_OK,
        headers=headers,
    )


@router.post("")
def bulk_export(req: BulkExportRequest, db: Session = Depends(get_db)) -> Response:
    """Export multiple articles as a ZIP-of-files OR a combined document.

    ``article_ids`` order is preserved through to the output (combined
    document section order; ZIP iteration order). Empty lists are 422
    via Pydantic; over-limit lists are also 422 via the ``max_length``
    constraint - both surface a clear validation message rather than
    a generic 400.
    """
    articles = _load_articles_in_order(req.article_ids, db)
    if req.mode == "zip":
        return _build_zip(articles, req.format)
    return _build_combined(articles, req.format)
