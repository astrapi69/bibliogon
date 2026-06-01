"""Chapter-snapshot service (CHAPTER-SNAPSHOTS-01).

Pure helpers for diffing a stored ``ChapterVersion`` against the
current chapter content. Content is TipTap JSON serialised as a string
(or legacy plain text); both are flattened to line-broken plain text
before a ``difflib.ndiff`` line diff. No FastAPI types (per the
architecture rule).
"""

from __future__ import annotations

import difflib
import json

from app.services.writing_stats import _flatten_tiptap


def snapshot_plain_text(content: str | None) -> str:
    """Flatten a chapter's stored content to line-broken plain text.

    Mirrors ``writing_stats.count_words`` parsing: TipTap JSON (a
    string starting with ``{``) is flattened via ``_flatten_tiptap``,
    which already inserts newlines between block nodes; legacy plain
    text passes through. Empty/blank lines are dropped so the diff is
    line-oriented over real content.
    """
    raw = (content or "").strip()
    if not raw:
        return ""
    plain = raw
    if raw.startswith("{"):
        try:
            plain = _flatten_tiptap(json.loads(raw))
        except (ValueError, TypeError):
            plain = raw
    lines = [line.strip() for line in plain.split("\n")]
    return "\n".join(line for line in lines if line)


def line_diff(text_a: str, text_b: str) -> list[dict[str, str]]:
    """Line-oriented diff from ``text_a`` (snapshot) to ``text_b``
    (current).

    Each entry is ``{type, text}`` with type in
    ``{unchanged, added, removed}``. ``added`` = present in current
    but not the snapshot; ``removed`` = in the snapshot but gone now.
    Matches the shape used by the backup-compare + ms-tools preview
    endpoints so the frontend reuses its rendering pattern.
    """
    lines_a = text_a.splitlines()
    lines_b = text_b.splitlines()
    result: list[dict[str, str]] = []
    for entry in difflib.ndiff(lines_a, lines_b):
        prefix = entry[:2]
        text = entry[2:]
        if prefix == "  ":
            result.append({"type": "unchanged", "text": text})
        elif prefix == "+ ":
            result.append({"type": "added", "text": text})
        elif prefix == "- ":
            result.append({"type": "removed", "text": text})
        # '? ' hints from ndiff are not line content; skip them.
    return result
