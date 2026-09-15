"""Architecture guard: no hand-rolled TipTap-to-text extraction that
silently drops HTML content (#824, closing the #787/#806/#808/#811/
#815/#817 class).

``Chapter.content`` (and ``Article.content_json``) is documented as
TipTap JSON, but the write-book-template importer stores HTML there
until a human opens and saves the record in the editor. Measured on
the dev library at the #806 audit: 778 of 833 chapters were HTML, 0
were TipTap JSON. A bare ``json.loads`` therefore fails for almost
every imported record, and whatever the ``except`` branch does IS the
behavior for real user data.

Each time this was fixed per-site (#787 export, #808/#811/#815
plugins, #817 story-bible) the next audit found another site: ms-tools
kept a SECOND, separate walker in the same file the #806 fix had
already touched, and it fed raw markup into the Quality tab's
readability metrics for two release cycles. Fixing instances one at a
time does not converge - this guard does.

The rule: a module may walk TipTap nodes itself, but if it does, it
must ALSO route the non-JSON case through one of the shared
converters:

- ``app.services.html_text.html_to_plain_text`` (plain text)
- ``bibliogon_export.scaffolder.content_to_markdown`` (Markdown)

A module that walks nodes without either is presumed to silently
empty (or silently pass through raw markup for) every imported
record, and fails this test until it either delegates or is
explicitly allowlisted below with a reason.
"""

from __future__ import annotations

import re
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

#: Files that walk TipTap nodes but legitimately do NOT need an HTML
#: fallback. Each entry states WHY - "it's inconvenient" is not a
#: reason; "this column is never written by the HTML-import pipeline"
#: is.
_ALLOWLIST: dict[str, str] = {
    "plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf/page_renderer.py": (
        "Reads Page.text_content (picture-book pages), which the "
        "write-book-template HTML importer never writes - it imports "
        "prose chapters, not pages. The existing leading-'{' guard "
        "addresses a different bug (raw TipTap JSON leaking into the "
        "rendered page), not the HTML-import class."
    ),
    "plugins/bibliogon-plugin-story-bible/bibliogon_story_bible/export.py": (
        "Reads StoryEntity.description, authored in-app through the "
        "editor (always TipTap JSON) or left as legacy plain text. No "
        "importer writes HTML into this column, and the raw-string "
        "fallback is the documented behavior for the plain-text case."
    ),
}

#: A module is treated as walking TipTap nodes itself when it parses
#: JSON and reaches for both the ``content`` and ``text`` node keys.
_JSON_PARSE_RE = re.compile(r"json\.loads")
_CONTENT_KEY_RE = re.compile(r"""\.get\(\s*["']content["']""")
_TEXT_KEY_RE = re.compile(r"""\.get\(\s*["']text["']""")

#: Either shared converter counts as delegating.
_DELEGATES_RE = re.compile(r"html_to_plain_text|content_to_markdown")


def _scanned_files() -> list[Path]:
    roots = [_REPO_ROOT / "backend" / "app", *(_REPO_ROOT / "plugins").glob("*/bibliogon_*")]
    files: list[Path] = []
    for root in roots:
        if not root.is_dir():
            continue
        files.extend(p for p in root.rglob("*.py") if "tests" not in p.parts)
    return sorted(files)


def _walks_tiptap_nodes(source: str) -> bool:
    return bool(
        _JSON_PARSE_RE.search(source)
        and _CONTENT_KEY_RE.search(source)
        and _TEXT_KEY_RE.search(source)
    )


def test_every_tiptap_walker_delegates_html_to_the_shared_converter() -> None:
    offenders: list[str] = []
    for path in _scanned_files():
        source = path.read_text(encoding="utf-8")
        if not _walks_tiptap_nodes(source):
            continue
        relative = path.relative_to(_REPO_ROOT).as_posix()
        if relative in _ALLOWLIST:
            continue
        if not _DELEGATES_RE.search(source):
            offenders.append(relative)

    assert not offenders, (
        "These modules walk TipTap nodes but never route the non-JSON "
        "case through app.services.html_text.html_to_plain_text or "
        "bibliogon_export.scaffolder.content_to_markdown. An imported, "
        "never-opened chapter is HTML (#787), so this silently drops or "
        "garbles its content (#824). Delegate, or add the file to "
        "_ALLOWLIST with a reason:\n  " + "\n  ".join(offenders)
    )


def test_allowlist_has_no_stale_entries() -> None:
    """An allowlisted file that no longer walks TipTap nodes (or was
    moved/deleted) must drop off the list, so the allowlist can't grow
    into a graveyard that hides a re-introduced walker."""
    stale: list[str] = []
    for relative in _ALLOWLIST:
        path = _REPO_ROOT / relative
        if not path.is_file():
            stale.append(f"{relative} (file no longer exists)")
            continue
        if not _walks_tiptap_nodes(path.read_text(encoding="utf-8")):
            stale.append(f"{relative} (no longer walks TipTap nodes)")

    assert not stale, "Stale _ALLOWLIST entries; remove them:\n  " + "\n  ".join(stale)


def test_the_guard_actually_detects_a_hand_rolled_walker() -> None:
    """Pins the detector itself: the #824 shape (parse JSON, walk
    content/text keys, no shared-converter fallback) must be
    recognised, and the fixed shape must not be."""
    unsafe = """
import json

def extract(raw):
    try:
        doc = json.loads(raw)
    except ValueError:
        return ""
    parts = []
    def walk(node):
        text = node.get("text")
        if text:
            parts.append(text)
        for child in node.get("content", []):
            walk(child)
    walk(doc)
    return " ".join(parts)
"""
    assert _walks_tiptap_nodes(unsafe)
    assert not _DELEGATES_RE.search(unsafe)

    safe = unsafe.replace(
        'return ""',
        "return html_to_plain_text(raw)",
    )
    assert _walks_tiptap_nodes(safe)
    assert _DELEGATES_RE.search(safe)
