"""Detection preview helpers for WBT imports.

Extracted from ``import_plugins/handlers/wbt.py`` (God-file split #12,
2026-06-14). Pure functions that read a WBT project directory and
return the protocol's DetectedChapter / DetectedAsset previews. No DB,
no session.
"""

from pathlib import Path

from app.import_plugins.protocol import DetectedAsset, DetectedChapter


def _detected_chapters(project_root: Path) -> list[DetectedChapter]:
    manuscript = project_root / "manuscript"
    if not manuscript.is_dir():
        return []
    md_files: list[Path] = []
    for folder in ("chapters", "front-matter", "back-matter"):
        sub = manuscript / folder
        if sub.is_dir():
            md_files.extend(sorted(sub.glob("*.md")))
    # Fallback: flat manuscript/*.md for authors who skipped the
    # chapter subdir convention.
    if not md_files:
        md_files = sorted(manuscript.glob("*.md"))
    out: list[DetectedChapter] = []
    for idx, path in enumerate(md_files):
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            content = ""
        out.append(
            DetectedChapter(
                title=_chapter_title(content, path.stem),
                position=idx,
                word_count=len(content.split()),
                content_preview=content[:200],
            )
        )
    return out


def _chapter_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return fallback.replace("-", " ").strip().title() or "Untitled"


def _detected_assets(project_root: Path) -> list[DetectedAsset]:
    out: list[DetectedAsset] = []
    assets_dir = project_root / "assets"
    if not assets_dir.is_dir():
        return out
    for path in sorted(assets_dir.rglob("*")):
        if not path.is_file():
            continue
        purpose = _purpose_from_path(path.relative_to(assets_dir))
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        out.append(
            DetectedAsset(
                filename=path.name,
                path=str(path.relative_to(project_root)),
                size_bytes=size,
                mime_type=_guess_mime(path),
                purpose=purpose,
            )
        )
    return out


def _purpose_from_path(rel_path: Path) -> str:
    parts = [p.lower() for p in rel_path.parts]
    if not parts:
        return "other"
    first = parts[0]
    if first in {"cover", "covers", "back-cover"}:
        return "cover"
    if first in {"author", "authors", "about-author"}:
        return "author-asset"
    if first in {"figures", "images", "img"}:
        return "figure"
    if first == "css" or rel_path.suffix.lower() == ".css":
        return "css"
    if first == "fonts" or rel_path.suffix.lower() in {".ttf", ".otf", ".woff", ".woff2"}:
        return "font"
    return "other"


def _guess_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".css":
        return "text/css"
    if suffix in {".md", ".markdown"}:
        return "text/markdown"
    return "application/octet-stream"
