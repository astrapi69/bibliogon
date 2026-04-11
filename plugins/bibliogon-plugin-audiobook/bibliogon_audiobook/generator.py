"""Audiobook generator: converts book chapters to MP3 files."""

import hashlib
import json
import logging
import shutil
import time
from collections.abc import Awaitable, Callable
from pathlib import Path

from .tts_engine import TTSEngine, get_engine

logger = logging.getLogger(__name__)

# Chapter types to skip in audiobook generation by default. Marketing
# back-matter (also_by_author, excerpt, call_to_action) is skipped so
# the listener does not get a "buy my next book" pitch in the middle
# of their audiobook download. Users can always override per book via
# Book.audiobook_skip_chapter_types.
SKIP_TYPES = {
    "toc", "imprint", "index", "bibliography", "endnotes",
    "also_by_author", "excerpt", "call_to_action",
}


def _normalize_skip_set(skip_types: set[str] | list[str] | None) -> set[str]:
    """Coerce the user-supplied skip list (or default) into a lowercased set."""
    raw = SKIP_TYPES if skip_types is None else skip_types
    return {str(s).strip().lower() for s in raw if str(s).strip()}


def _should_skip(ch_type: str, ch_title: str, skip_set: set[str]) -> bool:
    """A chapter is skipped if its type OR its lowercased title is in the set.

    Title-matching lets the user add free-form names like "Glossar" or
    "Danksagung" to the skip list in the audiobook plugin settings, even
    if those chapters are typed as plain ``chapter`` in the database.
    """
    if (ch_type or "").lower() in skip_set:
        return True
    return (ch_title or "").lower() in skip_set


# Per-language word for "Chapter" (used by the optional spoken intro).
_CHAPTER_WORD: dict[str, str] = {
    "de": "Kapitel",
    "en": "Chapter",
    "es": "Capitulo",
    "fr": "Chapitre",
    "el": "Κεφάλαιο",
    "pt": "Capitulo",
    "tr": "Bolum",
    "ja": "チャプター",
    "it": "Capitolo",
    "nl": "Hoofdstuk",
    "ru": "Глава",
    "zh": "章",
}

# Ordinal forms for the first ten chapter intros, where TTS sounds best
# with words instead of digits ("Erstes Kapitel" beats "Kapitel 1").
_CHAPTER_ORDINALS: dict[str, list[str]] = {
    "de": [
        "Erstes Kapitel", "Zweites Kapitel", "Drittes Kapitel", "Viertes Kapitel",
        "Fuenftes Kapitel", "Sechstes Kapitel", "Siebtes Kapitel", "Achtes Kapitel",
        "Neuntes Kapitel", "Zehntes Kapitel",
    ],
    "en": [
        "First chapter", "Second chapter", "Third chapter", "Fourth chapter",
        "Fifth chapter", "Sixth chapter", "Seventh chapter", "Eighth chapter",
        "Ninth chapter", "Tenth chapter",
    ],
}


def _build_chapter_intro(index: int, language: str) -> str:
    """Return the spoken intro for chapter ``index`` in ``language``.

    Uses ordinal words for chapters 1-10 in supported languages
    ("Erstes Kapitel"), falls back to "<word> <number>" everywhere else.
    """
    lang = (language or "en").lower().split("-")[0]
    if 1 <= index <= 10 and lang in _CHAPTER_ORDINALS:
        return _CHAPTER_ORDINALS[lang][index - 1]
    word = _CHAPTER_WORD.get(lang, "Chapter")
    return f"{word} {index}"

# Valid merge modes
MERGE_MODES = ("separate", "merged", "both")


def normalize_merge_mode(value: object) -> str:
    """Normalize a merge value to one of the canonical modes.

    Migration semantics for legacy boolean configs:
    - True  -> "merged"
    - False -> "separate"

    Strings already in MERGE_MODES pass through. Anything else
    falls back to the default "merged".
    """
    if value is True:
        return "merged"
    if value is False:
        return "separate"
    if isinstance(value, str) and value in MERGE_MODES:
        return value
    return "merged"


def extract_plain_text(content: object) -> str:
    """Extract plain text from TipTap content for TTS.

    Accepts either a stringified TipTap-JSON document (the editor's
    storage form) or an already-parsed ``dict`` (the export plugin's
    ``_serialize_chapters`` pre-parses chapter content for the
    scaffolder, so the audiobook export receives dicts in that flow).
    Plain text strings are passed through unchanged.
    """
    if not content:
        return ""

    if isinstance(content, dict):
        doc = content
    elif isinstance(content, str):
        if not content.strip():
            return ""
        try:
            doc = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            return content
    else:
        return ""

    if not isinstance(doc, dict):
        return ""

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
    rate: str = "",
    filename_title: str | None = None,
) -> Path | None:
    """Generate MP3 for a single chapter.

    Args:
        title: Optional spoken intro to prepend to the audio (e.g.
            "Erstes Kapitel"). Pass an empty string to get just the
            chapter body without any spoken header - that is the
            default behaviour for audiobook exports.
        content: TipTap JSON content.
        output_dir: Directory for output files.
        chapter_index: Chapter number for filename ordering.
        engine: TTS engine to use.
        voice: Voice identifier.
        language: Language code.
        filename_title: Title used for the on-disk filename slug. Falls
            back to ``title`` when not provided. Lets the caller decouple
            "name on disk" from "what the TTS reads aloud".

    Returns:
        Path to generated MP3, or None if chapter was skipped.
    """
    plain_text = extract_plain_text(content)
    if not plain_text.strip():
        return None

    # Only prepend spoken intro when the caller explicitly asked for one.
    full_text = f"{title}.\n\n{plain_text}" if title else plain_text

    slug_source = filename_title if filename_title is not None else title
    filename = f"{chapter_index:03d}-{_slugify(slug_source)}.mp3"
    output_path = output_dir / filename

    await engine.synthesize(full_text, output_path, voice=voice, language=language, rate=rate)
    return output_path


ProgressCallback = Callable[[str, dict], Awaitable[None]] | None


# ---------------------------------------------------------------------------
# Content-hash cache
# ---------------------------------------------------------------------------

def _content_hash(plain_text: str) -> str:
    """SHA-256 of the plain text that goes to the TTS engine."""
    return hashlib.sha256(plain_text.encode("utf-8")).hexdigest()


def _read_cache_meta(meta_path: Path) -> dict | None:
    """Read a sidecar .meta.json, returning None on any failure."""
    if not meta_path.exists():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _write_cache_meta(
    meta_path: Path, content_hash: str,
    engine: str, voice: str, speed: str,
) -> None:
    """Write the sidecar .meta.json next to the generated MP3."""
    meta_path.write_text(json.dumps({
        "content_hash": content_hash,
        "engine": engine,
        "voice": voice,
        "speed": speed,
    }, indent=2), encoding="utf-8")


def should_regenerate(
    plain_text: str,
    cached_mp3: Path,
    engine: str,
    voice: str,
    speed: str,
) -> bool:
    """Check whether a chapter needs re-generation.

    A cache hit requires ALL of: file exists, sidecar exists, and the
    content hash plus engine/voice/speed all match. Any mismatch ->
    regenerate.
    """
    if not cached_mp3.exists():
        return True
    meta = _read_cache_meta(cached_mp3.with_suffix(".meta.json"))
    if meta is None:
        return True
    return (
        meta.get("content_hash") != _content_hash(plain_text)
        or meta.get("engine") != engine
        or meta.get("voice") != voice
        or meta.get("speed") != speed
    )


async def generate_audiobook(
    book_title: str,
    chapters: list[dict],
    output_dir: Path,
    engine_id: str = "edge-tts",
    voice: str = "",
    language: str = "de",
    rate: str = "",
    skip_types: set[str] | None = None,
    merge: object = "merged",
    progress_callback: ProgressCallback = None,
    read_chapter_number: bool = False,
    cache_dir: Path | None = None,
) -> dict:
    """Generate audiobook MP3 files for all chapters.

    Args:
        book_title: Book title (for logging and the ``start`` event).
        chapters: List of chapter dicts with title, content, chapter_type, position.
        output_dir: Directory for output MP3 files.
        engine_id: TTS engine to use.
        voice: Voice identifier (engine-specific).
        language: Language code.
        skip_types: Chapter types OR titles to skip. Matched against the
            chapter_type AND the lowercased title (so "Glossar" matches a
            chapter named "Glossar" even if its type is just "chapter").
            Default: toc, imprint, index, bibliography, endnotes.
        progress_callback: Optional async ``(event_type, payload)`` callback.
            Called for ``start``, ``chapter_start``, ``chapter_done``,
            ``chapter_skipped``, ``chapter_reused``, ``chapter_error``,
            ``merge_start``, ``merge_done``, ``merge_error`` and ``done``.
        read_chapter_number: If False (default), the chapter title is NOT
            prepended to the spoken audio. If True, an intro like
            "Erstes Kapitel" / "First chapter" / "Kapitel 12" is spoken
            using the configured language.
        cache_dir: Optional path to a directory containing previously
            generated chapter MP3s + sidecar ``.meta.json`` files.
            When present, chapters whose content hash + engine + voice +
            speed match the cached version are copied from here instead
            of being re-generated via TTS. Saves money for paid engines
            (Google Cloud, ElevenLabs) and time for all of them.

    Returns:
        Dict with generated files, skipped chapters, reused chapters and errors.
    """
    merge_mode = normalize_merge_mode(merge)
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = get_engine(engine_id)
    skip_set = _normalize_skip_set(skip_types)
    speed_str = rate or "1.0"

    generated: list[str] = []
    skipped: list[str] = []
    reused: list[str] = []
    errors: list[dict[str, str]] = []

    sorted_chapters = sorted(chapters, key=lambda c: c.get("position", 0))

    async def emit(event_type: str, **payload: object) -> None:
        if progress_callback is None:
            return
        try:
            await progress_callback(event_type, payload)
        except Exception as e:
            # Never let a broken subscriber kill the export.
            logger.warning("progress_callback raised on %s: %s", event_type, e)

    await emit(
        "start",
        book_title=book_title,
        total=len(sorted_chapters),
        merge_mode=merge_mode,
    )

    for i, ch in enumerate(sorted_chapters, start=1):
        ch_type = ch.get("chapter_type", "chapter")
        ch_title = ch.get("title", f"Chapter {i}")

        if _should_skip(ch_type, ch_title, skip_set):
            skipped.append(ch_title)
            logger.info("Skipping %s (%s)", ch_title, ch_type)
            await emit("chapter_skipped", index=i, title=ch_title, reason=ch_type)
            continue

        # Extract plain text once — used by both the cache check and TTS.
        raw_content = ch.get("content", "")
        plain_text = extract_plain_text(raw_content)

        # --- Content-hash cache check ---
        # Build the expected on-disk filename so we can look it up in the
        # cache directory (the persistent uploads/{book_id}/audiobook/chapters/).
        expected_filename = f"{i:03d}-{_slugify(ch_title)}.mp3"
        if cache_dir and not should_regenerate(
            plain_text, cache_dir / expected_filename, engine_id, voice, speed_str,
        ):
            # Cache hit: copy the existing MP3 + sidecar into the temp
            # output dir so the rest of the pipeline (merge, bundle,
            # persist) sees the file as if we had just generated it.
            cached_mp3 = cache_dir / expected_filename
            dest_mp3 = output_dir / expected_filename
            shutil.copy2(cached_mp3, dest_mp3)
            cached_meta = cached_mp3.with_suffix(".meta.json")
            if cached_meta.exists():
                shutil.copy2(cached_meta, dest_mp3.with_suffix(".meta.json"))
            generated.append(expected_filename)
            reused.append(ch_title)
            await emit("chapter_reused", index=i, title=ch_title, filename=expected_filename)
            continue

        await emit("chapter_start", index=i, title=ch_title)
        chapter_started_at = time.monotonic()
        try:
            spoken_intro = (
                _build_chapter_intro(i, language) if read_chapter_number else ""
            )
            result = await generate_chapter_audio(
                title=spoken_intro,
                content=raw_content,
                output_dir=output_dir,
                chapter_index=i,
                engine=engine,
                voice=voice,
                language=language,
                rate=rate,
                filename_title=ch_title,
            )
            if result:
                generated.append(result.name)
                duration = round(time.monotonic() - chapter_started_at, 1)
                # Write the sidecar so the NEXT export can reuse this file.
                _write_cache_meta(
                    result.with_suffix(".meta.json"),
                    _content_hash(plain_text), engine_id, voice, speed_str,
                )
                await emit(
                    "chapter_done",
                    index=i, title=ch_title, filename=result.name,
                    duration_seconds=duration,
                )
            else:
                skipped.append(ch_title)
                await emit("chapter_skipped", index=i, title=ch_title, reason="empty")
        except Exception as e:
            errors.append({"chapter": ch_title, "error": str(e)})
            logger.error("Failed to generate audio for %s: %s", ch_title, e)
            await emit("chapter_error", index=i, title=ch_title, error=str(e))

    logger.info(
        "Audiobook '%s': %d generated (%d reused), %d skipped, %d errors",
        book_title, len(generated), len(reused), len(skipped), len(errors),
    )

    # Merge chapter MP3s into single audiobook file (for "merged" or "both" modes)
    merged_file: str | None = None
    if merge_mode in ("merged", "both") and len(generated) > 1:
        await emit("merge_start", count=len(generated))
        try:
            slug = _slugify(book_title)
            merged_path = output_dir / f"{slug}-audiobook.mp3"
            merge_mp3_files(
                [output_dir / f for f in generated],
                merged_path,
            )
            merged_file = merged_path.name
            logger.info("Merged %d files into %s", len(generated), merged_file)
            await emit("merge_done", filename=merged_file)
        except Exception as e:
            errors.append({"chapter": "_merge", "error": str(e)})
            logger.error("Failed to merge audiobook: %s", e)
            await emit("merge_error", error=str(e))

    # Cost estimation: only meaningful for paid engines (Google Cloud,
    # ElevenLabs). Free engines return None from estimate_cost().
    total_cost: float = 0.0
    reused_cost: float = 0.0
    try:
        from manuscripta.audiobook.tts import create_adapter as _create
        _cost_adapter = _create(engine_id, lang=language, voice=voice or "default")
        for ch in sorted_chapters:
            ch_type = ch.get("chapter_type", "chapter")
            ch_title = ch.get("title", "")
            if _should_skip(ch_type, ch_title, skip_set):
                continue
            pt = extract_plain_text(ch.get("content", ""))
            if not pt.strip():
                continue
            cost = _cost_adapter.estimate_cost(pt)
            if cost is not None:
                if ch_title in reused:
                    reused_cost += cost
                else:
                    total_cost += cost
    except Exception:  # noqa: BLE001
        # Cost estimation is nice-to-have, never fatal.
        pass

    await emit(
        "done",
        generated=len(generated),
        reused=len(reused),
        skipped=len(skipped),
        errors=len(errors),
        cost_usd=round(total_cost, 4) if total_cost > 0 else None,
        saved_usd=round(reused_cost, 4) if reused_cost > 0 else None,
    )

    return {
        "book_title": book_title,
        "engine": engine_id,
        "voice": voice or "default",
        "language": language,
        "merge_mode": merge_mode,
        "generated_files": generated,
        "generated_count": len(generated),
        "reused": reused,
        "reused_count": len(reused),
        "merged_file": merged_file,
        "skipped": skipped,
        "skipped_count": len(skipped),
        "errors": errors,
        "error_count": len(errors),
        "cost_usd": round(total_cost, 4) if total_cost > 0 else None,
        "saved_usd": round(reused_cost, 4) if reused_cost > 0 else None,
    }


def bundle_audiobook_output(result: dict, output_dir: Path, book_title: str) -> Path | None:
    """Bundle generator output into a final file based on the merge mode.

    - "separate": ZIP containing only the chapter MP3s.
    - "merged": single merged MP3 file.
    - "both": ZIP containing chapter MP3s plus the merged MP3.

    Returns None if nothing was generated.
    """
    import shutil
    import zipfile

    mode = result.get("merge_mode", "merged")
    generated = result.get("generated_files", [])
    merged_name = result.get("merged_file")
    slug = _slugify(book_title) or "audiobook"

    if mode == "merged" and merged_name:
        merged_path = output_dir / merged_name
        if merged_path.exists():
            return merged_path

    if not generated and not merged_name:
        return None

    zip_base = output_dir / f"{slug}-audiobook"
    if mode == "separate":
        zip_path = zip_base.with_suffix(".zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in generated:
                fpath = output_dir / fname
                if fpath.exists():
                    zf.write(fpath, fname)
        return zip_path

    if mode == "both":
        zip_path = zip_base.with_suffix(".zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in generated:
                fpath = output_dir / fname
                if fpath.exists():
                    zf.write(fpath, fname)
            if merged_name:
                merged_path = output_dir / merged_name
                if merged_path.exists():
                    zf.write(merged_path, merged_name)
        return zip_path

    # Fallback for "merged" without a merged file (e.g. single chapter): return that file
    if generated:
        single = output_dir / generated[0]
        if single.exists():
            return single

    # Last resort: zip whatever exists
    zip_path = shutil.make_archive(str(zip_base), "zip", str(output_dir))
    return Path(zip_path)


def merge_mp3_files(input_files: list[Path], output_path: Path) -> Path:
    """Merge multiple MP3 files into a single file using ffmpeg.

    Creates a concat list file and uses ffmpeg's concat demuxer.
    Requires ffmpeg to be installed on the system.

    Args:
        input_files: List of MP3 file paths in order.
        output_path: Path for the merged output file.

    Returns:
        Path to the merged file.

    Raises:
        RuntimeError: If ffmpeg is not installed or fails.
    """
    import subprocess

    if not input_files:
        raise ValueError("No input files to merge")

    if len(input_files) == 1:
        # Single file, just copy
        import shutil
        shutil.copy2(input_files[0], output_path)
        return output_path

    # Create concat list file for ffmpeg
    concat_file = output_path.parent / "concat_list.txt"
    with open(concat_file, "w", encoding="utf-8") as f:
        for mp3_file in input_files:
            # ffmpeg requires forward slashes and single-quoted paths
            escaped = str(mp3_file).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_file),
                "-c", "copy",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Install ffmpeg to merge audiobook files.")
    finally:
        concat_file.unlink(missing_ok=True)

    return output_path


def is_ffmpeg_available() -> bool:
    """Check if ffmpeg is installed and accessible."""
    import subprocess
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _slugify(text: str) -> str:
    """Simple slugify for filenames."""
    import re
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\-]", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")[:50]
