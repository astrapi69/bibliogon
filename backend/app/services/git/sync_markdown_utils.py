"""Markdown + slug helpers for git-sync diffing.

Extracted from ``services/git_sync_diff.py`` (God-file split #11,
2026-06-14). Pure string functions: conflict-marker building, H1
splitting, whitespace-tolerant normalization, and slugging. No git,
no DB, no dependency on the diff classifier.
"""

import re


def build_conflict_markdown(*, local_body: str, remote_body: str) -> str:
    """PGS-03-FU-01: build a git-style conflict block from two bodies.

    The block uses standard git conflict markers with explicit
    side labels (``Bibliogon`` / ``Repository``) so editors that
    syntax-highlight diffs render the chapter in conflict form.
    The user resolves by editing the chapter content and removing
    the markers manually.

    Pure function - bodies must already be H1-stripped (the
    caller knows the chapter title and prepends it separately if
    needed).
    """
    local_clean = (local_body or "").strip("\n")
    remote_clean = (remote_body or "").strip("\n")
    return f"<<<<<<< Bibliogon\n{local_clean}\n=======\n{remote_clean}\n>>>>>>> Repository\n"


def _strip_h1(markdown: str, *, fallback_title: str) -> tuple[str, str]:
    """Split off the first H1 line as the title, return (body, title)."""
    lines = markdown.splitlines()
    title = fallback_title
    body_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = stripped[2:].strip() or fallback_title
            body_start = i + 1
            break
        if stripped:
            break
    body = "\n".join(lines[body_start:]).lstrip("\n")
    return body, title


def _normalize(markdown: str) -> str:
    """Whitespace-tolerant comparison key.

    Strips trailing whitespace per line, collapses runs of blank
    lines, and trims leading/trailing whitespace. So the same
    chapter that round-trips through Bibliogon (which may add or
    drop a final newline) does not register as "changed".
    """
    lines = [ln.rstrip() for ln in markdown.splitlines()]
    collapsed: list[str] = []
    blank_run = 0
    for ln in lines:
        if ln == "":
            blank_run += 1
            if blank_run > 1:
                continue
        else:
            blank_run = 0
        collapsed.append(ln)
    return "\n".join(collapsed).strip()


_SLUG_NON_WORD = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    """Lowercase ASCII slug, hyphen-separated. Diacritics stripped."""
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_str = decomposed.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_NON_WORD.sub("-", ascii_str.lower()).strip("-")
    return slug or "untitled"


def _chapter_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            return stripped[2:].strip()
    return fallback.replace("-", " ").strip().title() or "Untitled"
