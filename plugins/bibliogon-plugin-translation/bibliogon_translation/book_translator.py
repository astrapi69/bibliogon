"""Book translation service: translates all chapters and creates a new book."""

import logging
from typing import Any

from .deepl_client import DeepLClient, DeepLError
from .lmstudio_client import LMStudioClient, LMStudioError

logger = logging.getLogger(__name__)


class TranslationProgress:
    """Tracks progress of a book translation."""

    def __init__(self, total_chapters: int) -> None:
        self.total = total_chapters
        self.completed = 0
        self.errors: list[dict[str, str]] = []

    @property
    def percentage(self) -> int:
        if self.total == 0:
            return 100
        return int(self.completed / self.total * 100)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "completed": self.completed,
            "percentage": self.percentage,
            "errors": self.errors,
        }


async def translate_chapter_content(
    text: str,
    target_lang: str,
    source_lang: str | None,
    provider: str,
    deepl_client: DeepLClient | None,
    lmstudio_client: LMStudioClient | None,
) -> str:
    """Translate a single chapter's plain text content.

    Returns translated text or original on error.
    """
    if not text.strip():
        return text

    try:
        if provider == "deepl" and deepl_client:
            result = await deepl_client.translate(
                text=text,
                target_lang=target_lang,
                source_lang=source_lang,
            )
            return result["translated_text"]
        elif provider == "lmstudio" and lmstudio_client:
            result = await lmstudio_client.translate(
                text=text,
                target_lang=target_lang,
                source_lang=source_lang or "auto",
            )
            return result["translated_text"]
        else:
            return text
    except (DeepLError, LMStudioError) as e:
        logger.warning("Translation failed for chunk: %s", e)
        return text


def extract_plain_text_from_tiptap(content: str) -> str:
    """Extract plain text from TipTap JSON for translation.

    Simple extraction: gets all text nodes from the JSON structure.
    """
    import json

    if not content or not content.strip():
        return ""

    try:
        doc = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        # Content might be HTML or plain text
        return content

    texts: list[str] = []
    _extract_text_nodes(doc, texts)
    return "\n".join(texts)


def _extract_text_nodes(node: dict | list, texts: list[str]) -> None:
    """Recursively extract text from TipTap JSON nodes."""
    if isinstance(node, list):
        for item in node:
            _extract_text_nodes(item, texts)
        return

    if not isinstance(node, dict):
        return

    if node.get("type") == "text":
        text = node.get("text", "")
        if text:
            texts.append(text)
    elif "content" in node:
        for child in node["content"]:
            _extract_text_nodes(child, texts)
        # Add paragraph break after block-level elements
        if node.get("type") in ("paragraph", "heading", "blockquote", "listItem"):
            texts.append("")


def rebuild_tiptap_with_translation(
    original_content: str, translated_text: str
) -> str:
    """Replace text nodes in TipTap JSON with translated text.

    Preserves the document structure (formatting, marks, attrs) but
    replaces text content. Maps text segments by order of appearance.
    """
    import json

    if not original_content or not original_content.strip():
        return original_content

    try:
        doc = json.loads(original_content)
    except (json.JSONDecodeError, TypeError):
        return translated_text

    # Split translated text into segments (matching paragraph breaks)
    segments = translated_text.split("\n")
    segments = [s for s in segments if s]  # remove empty
    segment_iter = iter(segments)

    _replace_text_nodes(doc, segment_iter)
    return json.dumps(doc, ensure_ascii=False)


def _replace_text_nodes(node: dict | list, segments: Any) -> None:
    """Recursively replace text nodes with translated segments."""
    if isinstance(node, list):
        for item in node:
            _replace_text_nodes(item, segments)
        return

    if not isinstance(node, dict):
        return

    if node.get("type") == "text":
        try:
            node["text"] = next(segments)
        except StopIteration:
            pass  # Keep original if we run out of segments
    elif "content" in node:
        for child in node["content"]:
            _replace_text_nodes(child, segments)
