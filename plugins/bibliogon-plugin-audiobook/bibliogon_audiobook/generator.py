"""Audiobook generator: converts book chapters to MP3 files."""

import json
import logging
from pathlib import Path

from .tts_engine import TTSEngine, get_engine

logger = logging.getLogger(__name__)

# Chapter types to skip in audiobook generation
SKIP_TYPES = {"toc", "imprint", "index", "bibliography", "endnotes"}


def extract_plain_text(content: str) -> str:
    """Extract plain text from TipTap JSON content for TTS.

    Strips all formatting, returns clean readable text.
    """
    if not content or not content.strip():
        return ""

    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return content

    texts: list[str] = []
    _walk_nodes(doc, texts)
    return "\n".join(texts).strip()


def _walk_nodes(node: dict | list, texts: list[str]) -> None:
    """Recursively extract text from TipTap JSON."""
    if isinstance(node, list):
        for item in node:
            _walk_nodes(item, texts)
        return

    if not isinstance(node, dict):
        return

    node_type = node.get("type", "")

    if node_type == "text":
        text = node.get("text", "")
        if text:
            texts.append(text)
    elif "content" in node:
        for child in node["content"]:
            _walk_nodes(child, texts)
        # Add breaks after block elements
        if node_type in ("paragraph", "heading", "blockquote", "listItem"):
            texts.append("")


async def generate_chapter_audio(
    title: str,
    content: str,
    output_dir: Path,
    chapter_index: int,
    engine: TTSEngine,
    voice: str = "",
    language: str = "de",
    include_title: bool = True,
) -> Path | None:
    """Generate MP3 for a single chapter.

    Args:
        title: Chapter title.
        content: TipTap JSON content.
        output_dir: Directory for output files.
        chapter_index: Chapter number for filename ordering.
        engine: TTS engine to use.
        voice: Voice identifier.
        language: Language code.
        include_title: Whether to prepend the title to the audio.

    Returns:
        Path to generated MP3, or None if chapter was skipped.
    """
    plain_text = extract_plain_text(content)
    if not plain_text.strip():
        return None

    # Prepend title for spoken chapter header
    if include_title and title:
        full_text = f"{title}.\n\n{plain_text}"
    else:
        full_text = plain_text

    filename = f"{chapter_index:03d}-{_slugify(title)}.mp3"
    output_path = output_dir / filename

    await engine.synthesize(full_text, output_path, voice=voice, language=language)
    return output_path


async def generate_audiobook(
    book_title: str,
    chapters: list[dict],
    output_dir: Path,
    engine_id: str = "edge-tts",
    voice: str = "",
    language: str = "de",
    skip_types: set[str] | None = None,
) -> dict:
    """Generate audiobook MP3 files for all chapters.

    Args:
        book_title: Book title (for logging).
        chapters: List of chapter dicts with title, content, chapter_type, position.
        output_dir: Directory for output MP3 files.
        engine_id: TTS engine to use.
        voice: Voice identifier (engine-specific).
        language: Language code.
        skip_types: Chapter types to skip (default: toc, imprint, index, bibliography, endnotes).

    Returns:
        Dict with generated files, skipped chapters, and errors.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = get_engine(engine_id)
    types_to_skip = skip_types if skip_types is not None else SKIP_TYPES

    generated: list[str] = []
    skipped: list[str] = []
    errors: list[dict[str, str]] = []

    sorted_chapters = sorted(chapters, key=lambda c: c.get("position", 0))

    for i, ch in enumerate(sorted_chapters, start=1):
        ch_type = ch.get("chapter_type", "chapter")
        ch_title = ch.get("title", f"Chapter {i}")

        if ch_type in types_to_skip:
            skipped.append(ch_title)
            logger.info("Skipping %s (%s)", ch_title, ch_type)
            continue

        try:
            result = await generate_chapter_audio(
                title=ch_title,
                content=ch.get("content", ""),
                output_dir=output_dir,
                chapter_index=i,
                engine=engine,
                voice=voice,
                language=language,
            )
            if result:
                generated.append(result.name)
            else:
                skipped.append(ch_title)
        except Exception as e:
            errors.append({"chapter": ch_title, "error": str(e)})
            logger.error("Failed to generate audio for %s: %s", ch_title, e)

    logger.info(
        "Audiobook '%s': %d generated, %d skipped, %d errors",
        book_title, len(generated), len(skipped), len(errors),
    )

    return {
        "book_title": book_title,
        "engine": engine_id,
        "voice": voice or "default",
        "language": language,
        "generated_files": generated,
        "generated_count": len(generated),
        "skipped": skipped,
        "skipped_count": len(skipped),
        "errors": errors,
        "error_count": len(errors),
    }


def _slugify(text: str) -> str:
    """Simple slugify for filenames."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\-]", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")[:50]
