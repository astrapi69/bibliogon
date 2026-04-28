"""AR editor-parity Phase 3: article export router.

Exports a single Article to Markdown / HTML / PDF / DOCX. Unlike
the book export (which scaffolds a write-book-template directory
and feeds it through manuscripta's run_export), an article is one
TipTap document with no chapter list, no series metadata, no
section-order config - so the pipeline is simpler:

  Article.content_json (TipTap JSON)
    -> tiptap_to_markdown (pure-Python, reused from plugin-export)
    -> Pandoc subprocess for HTML / PDF / DOCX
    -> FileResponse

Markdown skips the Pandoc subprocess - the helper output is the
canonical .md form already.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Final

# Reuse the export plugin's tiptap-to-markdown converter. The
# plugin is path-installed in the backend venv (see
# plugins/bibliogon-plugin-export/pyproject.toml).
from bibliogon_export.tiptap_to_md import tiptap_to_markdown
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/articles/{article_id}/export", tags=["article-export"])

# Formats the article exporter supports. Excludes EPUB / audiobook /
# project-zip - those are book-only by design (parity analysis).
_SUPPORTED_FORMATS: Final = ("markdown", "md", "html", "pdf", "docx")
_FORMAT_ALIASES: Final = {"md": "markdown"}
_PANDOC_TARGETS: Final = {"html": "html", "pdf": "pdf", "docx": "docx"}
_OUTPUT_EXTENSIONS: Final = {
    "markdown": "md",
    "html": "html",
    "pdf": "pdf",
    "docx": "docx",
}
_MEDIA_TYPES: Final = {
    "markdown": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _slugify(title: str) -> str:
    """Produce an ASCII-safe filename slug from the article title.

    Content-Disposition headers must be ASCII per RFC 6266 (the
    extended ``filename*`` form supports UTF-8 but starlette's
    test client decodes the value as plain UTF-8 and chokes on
    Latin-1-byte fallbacks). Folds umlauts to their ASCII
    equivalent and drops anything else non-ASCII.
    """
    import unicodedata

    folded = unicodedata.normalize("NFKD", title)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^\w\s-]", "", ascii_only).strip()
    cleaned = re.sub(r"[\s_-]+", "-", cleaned)
    return cleaned.lower() or "article"


def _load_article(article_id: str, db: Session) -> Article:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


def _build_markdown(article: Article) -> str:
    """Render the article as a self-contained Markdown document."""
    body_md = ""
    raw = article.content_json or ""
    if raw.strip():
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError:
            # Stored as plain text fallback - emit verbatim.
            body_md = raw
        else:
            body_md = tiptap_to_markdown(doc)

    parts: list[str] = []
    parts.append(f"# {article.title}")
    if article.subtitle:
        parts.append(f"_{article.subtitle}_")
    if article.author:
        parts.append(f"*by {article.author}*")
    if body_md:
        parts.append("")
        parts.append(body_md)
    return "\n\n".join(parts).rstrip() + "\n"


def _run_pandoc(markdown: str, target: str) -> bytes:
    """Convert markdown -> target via Pandoc. Returns the raw bytes."""
    if shutil.which("pandoc") is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Pandoc is not installed on the server. "
                "Install pandoc to enable HTML / PDF / DOCX export."
            ),
        )
    pandoc_target = _PANDOC_TARGETS[target]
    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = Path(tmpdir) / "input.md"
        out_path = Path(tmpdir) / f"output.{_OUTPUT_EXTENSIONS[target]}"
        in_path.write_text(markdown, encoding="utf-8")
        cmd = ["pandoc", str(in_path), "-o", str(out_path), "--from=gfm", f"--to={pandoc_target}"]
        if target == "pdf":
            # Wider PDF engine compatibility - xelatex if installed,
            # else default. Pandoc picks a reasonable default.
            cmd.extend(["--pdf-engine=xelatex"])
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60, check=False)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail=f"Pandoc timed out after 60s exporting to {target}",
            ) from exc
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            logger.error(
                "article-export pandoc failed: target=%s rc=%s stderr=%s",
                target, result.returncode, stderr[-500:],
            )
            raise HTTPException(
                status_code=502,
                detail=f"Pandoc failed (exit {result.returncode}): {stderr[-300:]}",
            )
        if not out_path.exists():
            raise HTTPException(
                status_code=502,
                detail=f"Pandoc produced no output for target {target}",
            )
        return out_path.read_bytes()


@router.get("/{fmt}")
def export_article(article_id: str, fmt: str, db: Session = Depends(get_db)) -> Response:
    """Export an article as Markdown / HTML / PDF / DOCX.

    Markdown skips Pandoc (handled in pure Python). The other
    formats spawn ``pandoc`` as a subprocess; without Pandoc
    installed the route returns 502.
    """
    fmt_lower = fmt.lower()
    if fmt_lower not in _SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported format {fmt!r}. "
                f"Allowed: {', '.join(sorted(set(_SUPPORTED_FORMATS)))}"
            ),
        )
    target = _FORMAT_ALIASES.get(fmt_lower, fmt_lower)
    article = _load_article(article_id, db)

    markdown = _build_markdown(article)
    slug = _slugify(article.title)
    filename = f"{slug}.{_OUTPUT_EXTENSIONS[target]}"
    media_type = _MEDIA_TYPES[target]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    if target == "markdown":
        return Response(
            content=markdown.encode("utf-8"),
            media_type=media_type,
            status_code=status.HTTP_200_OK,
            headers=headers,
        )

    payload = _run_pandoc(markdown, target)
    return Response(
        content=payload,
        media_type=media_type,
        status_code=status.HTTP_200_OK,
        headers=headers,
    )


@router.get("")
def list_supported_formats(article_id: str, db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """Discoverability: lists the formats the article exporter
    supports. Article must exist (mirrors book export endpoint
    discovery shape so the frontend can hide unsupported targets)."""
    _load_article(article_id, db)
    return {
        "formats": ["markdown", "html", "pdf", "docx"],
        "pandoc_required": ["html", "pdf", "docx"],
    }
