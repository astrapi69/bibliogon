"""TipTap body-text extraction for AI templates.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

import json


def extract_body_text(tiptap_json: str | None) -> str:
    """Walk a serialised TipTap doc and return concatenated plain
    text. Origin: moved from ``app.routers.articles._extract_plain_text``
    so the AI template module owns the helper that produces its own
    body preview.

    An imported article/chapter is HTML until someone opens and
    saves it in the editor (#787), so a bare ``json.loads`` failure
    does not mean "no content" - it usually means "HTML content"
    (#824). Route that case through the shared HTML stripper rather
    than returning empty text, which fed the AI-fill/bulk-fill path
    an empty body for every never-opened imported record.
    """
    if not tiptap_json:
        return ""
    stripped = tiptap_json.strip()
    if not stripped:
        return ""
    try:
        doc = json.loads(tiptap_json)
    except (ValueError, TypeError):
        if stripped.startswith("<"):
            from app.services.html_text import html_to_plain_text

            return html_to_plain_text(tiptap_json)
        return stripped

    parts: list[str] = []

    def walk(node: object) -> None:
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str):
            parts.append(text)
        children = node.get("content")
        if isinstance(children, list):
            for child in children:
                walk(child)

    walk(doc)
    return "\n".join(p for p in parts if p).strip()


def extract_body_preview(tiptap_json: str | None, word_limit: int = 500) -> tuple[str, int]:
    """Return ``(preview, total_word_count)`` for the body.

    The preview is the first ``word_limit`` words of the body
    plus a ``[...]`` ellipsis when truncation occurred. The
    total word count reflects the full body, not the preview -
    callers want to surface the full size so the AI knows how
    much context the preview represents."""
    text = extract_body_text(tiptap_json)
    if not text:
        return "", 0
    words = text.split()
    total = len(words)
    if total <= word_limit:
        return text, total
    return " ".join(words[:word_limit]) + " [...]", total


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
