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

import ast
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


# ---------------------------------------------------------------------------
# Second failure mode: a destructive action taken on an EMPTY extraction
# ---------------------------------------------------------------------------
#
# The walker check above looks for modules that parse TipTap themselves.
# It could not see book_serializer (#843), whose failure was different: it
# called a converter correctly, got None back for an imported chapter, and
# DELETED the chapter's Markdown file in that branch. A module can use the
# shared converters perfectly and still do this.
#
# So this second detector ignores how text is produced and looks at what
# happens when the produced text is missing: an ``if`` that tests a
# render/extract result for None/emptiness, whose empty branch deletes a
# file or row, or writes an empty literal over something.
#
# Skipping (``continue``/``return``) on an empty result is deliberately NOT
# a failure here - it is usually correct (no text, nothing to narrate or
# measure), and the sites that do it today report the skip rather than
# hide it. Only destruction is gated.

#: Call names treated as producing extracted/rendered text. A variable
#: assigned from one of these is tracked.
_PRODUCER_RE = re.compile(
    r"render|extract|convert|to_markdown|to_plain_text|to_text|to_html|plain_text|markdown",
    re.IGNORECASE,
)

#: Method/function names that destroy data when called.
_DESTRUCTIVE_CALLS = frozenset({"unlink", "rmtree", "rmdir", "remove", "delete"})

#: ``(relative path, function name)`` pairs where a destructive action on
#: an empty extraction is intended. Empty today; an entry needs a reason.
_DESTRUCTIVE_ALLOWLIST: dict[tuple[str, str], str] = {}


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Attribute):
            return func.attr
        if isinstance(func, ast.Name):
            return func.id
    return ""


def _empty_branch(test: ast.expr, tracked: set[str]) -> str | None:
    """Which branch of an ``if`` runs when a tracked result is empty.

    Returns ``"body"`` or ``"orelse"``, or None when the test is not an
    emptiness check on a tracked name.
    """
    if isinstance(test, ast.Compare) and len(test.ops) == 1 and isinstance(test.left, ast.Name):
        comparator = test.comparators[0]
        if test.left.id in tracked and isinstance(comparator, ast.Constant):
            operator = test.ops[0]
            if comparator.value is None and isinstance(operator, ast.Is):
                return "body"
            if comparator.value is None and isinstance(operator, ast.IsNot):
                return "orelse"
            if comparator.value == "" and isinstance(operator, ast.Eq):
                return "body"
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        operand = test.operand
        if isinstance(operand, ast.Name) and operand.id in tracked:
            return "body"
        if (
            isinstance(operand, ast.Call)
            and isinstance(operand.func, ast.Attribute)
            and isinstance(operand.func.value, ast.Name)
            and operand.func.value.id in tracked
        ):
            return "body"
    if isinstance(test, ast.Name) and test.id in tracked:
        return "orelse"
    return None


def _destructive_calls_in(statements: list[ast.stmt]) -> list[str]:
    found: list[str] = []
    for statement in statements:
        for node in ast.walk(statement):
            name = _call_name(node)
            if name in _DESTRUCTIVE_CALLS:
                found.append(name)
            elif name in {"write_text", "write_bytes"} and isinstance(node, ast.Call) and node.args:
                first = node.args[0]
                if isinstance(first, ast.Constant) and first.value in ("", b""):
                    found.append(f"{name}(empty)")
    return found


def _destructive_on_empty_extraction(source: str) -> list[tuple[str, int, list[str]]]:
    """``(function, line, destructive calls)`` for every violation in ``source``."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    violations: list[tuple[str, int, list[str]]] = []
    for function in ast.walk(tree):
        if not isinstance(function, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        tracked = {
            target.id
            for node in ast.walk(function)
            if isinstance(node, ast.Assign) and _PRODUCER_RE.search(_call_name(node.value))
            for target in node.targets
            if isinstance(target, ast.Name)
        }
        if not tracked:
            continue
        for node in ast.walk(function):
            if not isinstance(node, ast.If):
                continue
            branch = _empty_branch(node.test, tracked)
            if branch is None:
                continue
            calls = _destructive_calls_in(getattr(node, branch))
            if calls:
                violations.append((function.name, node.lineno, calls))
    return violations


def _destructive_scan_files() -> list[Path]:
    """Same roots as the walker check, plus ``scripts/`` - repair scripts
    write user data, so a destructive branch there matters as much."""
    files = _scanned_files()
    scripts = _REPO_ROOT / "scripts"
    if scripts.is_dir():
        files.extend(p for p in scripts.rglob("*.py") if "tests" not in p.parts)
    return sorted(set(files))


def test_no_destructive_action_is_taken_on_an_empty_extraction() -> None:
    offenders: list[str] = []
    for path in _destructive_scan_files():
        relative = path.relative_to(_REPO_ROOT).as_posix()
        for function, line, calls in _destructive_on_empty_extraction(
            path.read_text(encoding="utf-8")
        ):
            if (relative, function) in _DESTRUCTIVE_ALLOWLIST:
                continue
            offenders.append(f"{relative}:{line} in {function}() -> {', '.join(calls)}")

    assert not offenders, (
        "These branches destroy data when a render/extract result is empty or "
        "None. An empty extraction must abort with an error naming the item, "
        "never delete or blank a file (#843). Raise instead, or add "
        "(path, function) to _DESTRUCTIVE_ALLOWLIST with a reason:\n  " + "\n  ".join(offenders)
    )


def test_destructive_allowlist_has_no_stale_entries() -> None:
    stale: list[str] = []
    for relative, function in _DESTRUCTIVE_ALLOWLIST:
        path = _REPO_ROOT / relative
        if not path.is_file():
            stale.append(f"{relative} (file no longer exists)")
            continue
        names = {name for name, _, _ in _destructive_on_empty_extraction(path.read_text("utf-8"))}
        if function not in names:
            stale.append(f"{relative}:{function} (no longer matches)")
    assert not stale, "Stale _DESTRUCTIVE_ALLOWLIST entries:\n  " + "\n  ".join(stale)


def test_the_destructive_detector_recognises_the_book_serializer_shape() -> None:
    """Pins the detector on the exact shape #843 shipped, and on the three
    ways an emptiness check is commonly written."""
    shipped = """
def write(chapter, md_path):
    md = render_chapter_markdown(chapter)
    if md is not None:
        md_path.write_text(md)
    elif md_path.exists():
        md_path.unlink()
"""
    assert _destructive_on_empty_extraction(shipped) == [("write", 4, ["unlink"])]

    for check in ("if not md:", "if md is None:", "if not md.strip():"):
        variant = f"""
def write(chapter, path):
    md = extract_text(chapter)
    {check}
        path.unlink()
"""
        assert _destructive_on_empty_extraction(variant), check

    blanking = """
def write(chapter, path):
    text = content_to_plain_text(chapter)
    if not text:
        path.write_text("")
"""
    assert _destructive_on_empty_extraction(blanking) == [("write", 4, ["write_text(empty)"])]


def test_the_destructive_detector_ignores_safe_shapes() -> None:
    fixed = """
def write(chapter, path):
    md = render_chapter_markdown(chapter)
    if not md.strip():
        raise ChapterMarkdownError("empty")
    path.write_text(md)
"""
    skip = """
def metrics(chapters):
    for ch in chapters:
        text = extract_plain_text(ch)
        if not text.strip():
            continue
"""
    unrelated = """
def cleanup(path):
    value = load_settings()
    if value is None:
        path.unlink()
"""
    for source in (fixed, skip, unrelated):
        assert _destructive_on_empty_extraction(source) == []
