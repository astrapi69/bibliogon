"""Architecture guard: a plugin never imports from another plugin (#818).

Plugins depend on core (``app.*``); core never depends on plugins;
plugins never depend on EACH OTHER. That last rule had no enforcement
- three #806 fixes quietly added exactly this kind of coupling
(audiobook/translation/story-bible reaching into plugin-export for
``html_to_plain_text``, moved to ``app.services.html_text`` in the same
change that added this test).

A handful of cross-plugin imports predate this test and are
architecturally legitimate - documented in CLAUDE.md's plugin table
and/or declared via pluginforge's ``depends_on`` class attribute. They
are the ALLOWLIST below. Any import pair not on it fails the test; any
allowlist entry that stops matching real code is dead and should be
removed the next time this file is touched (the open-set-discovery
discipline - see lessons-learned "Single-source-of-truth for
cross-cutting concerns").
"""

from __future__ import annotations

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PLUGINS_DIR = REPO_ROOT / "plugins"

#: (importing plugin, imported plugin) pairs that are allowed.
#:
#: kdp / comics / learnset -> export: each declares
#:   ``depends_on = ["export"]`` in its plugin.py (pluginforge
#:   activation ordering) and reaches into export's scaffolding /
#:   Pandoc / picture-book-PDF modules, which export owns.
#:   (kinderbuch also declares ``depends_on = ["export"]`` for
#:   activation ordering but has no actual Python import of export's
#:   modules - not listed here, since this allowlist tracks imports,
#:   not the separate pluginforge dependency declaration.)
#: kdp -> comics: the KDP package builder generates a comic-book's
#:   print PDF by calling plugin-comics' own PDF renderer directly,
#:   lazily and behind a try/except ImportError so the package
#:   builder still works when plugin-comics is absent.
#: export -> audiobook: the documented reverse-coupling exception
#:   (CLAUDE.md plugin table) - the synchronous export_execute
#:   hookspec cannot carry audiobook's async + SSE-streaming shape,
#:   so plugin-export dispatches into plugin-audiobook's generator
#:   directly instead of a hook.
#: ms-tools -> audiobook: predates this test. ms-tools' metrics
#:   endpoint reuses audiobook's ``extract_plain_text`` rather than a
#:   third copy of the same TipTap-flattening logic.
ALLOWED_CROSS_PLUGIN_IMPORTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("kdp", "export"),
        ("comics", "export"),
        ("learnset", "export"),
        ("kdp", "comics"),
        ("export", "audiobook"),
        ("ms-tools", "audiobook"),
    }
)


def _plugin_package_name(plugin_dir: Path) -> str:
    """``bibliogon-plugin-kdp`` -> ``bibliogon_kdp``."""
    return "bibliogon_" + plugin_dir.name.removeprefix("bibliogon-plugin-").replace("-", "_")


def _plugin_slug(package_name: str) -> str:
    """``bibliogon_kdp`` -> ``kdp``."""
    return package_name.removeprefix("bibliogon_").replace("_", "-")


def _plugin_dirs() -> list[Path]:
    return sorted(p for p in PLUGINS_DIR.glob("bibliogon-plugin-*") if p.is_dir())


def _imported_bibliogon_packages(source: str) -> set[str]:
    """Every ``bibliogon_<x>`` package name a module imports, at any
    depth (module-level or inside a function - #806's violations were
    all lazy, function-local imports)."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("bibliogon_"):
                    found.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module.startswith("bibliogon_"):
                found.add(node.module.split(".")[0])
    return found


def _cross_plugin_imports() -> list[tuple[str, str, Path]]:
    """Every (importer_slug, imported_slug, file) triple found across
    every plugin's own package - excluding imports of the plugin's own
    package (that is normal intra-plugin structure, not coupling)."""
    violations: list[tuple[str, str, Path]] = []
    for plugin_dir in _plugin_dirs():
        own_package = _plugin_package_name(plugin_dir)
        own_slug = _plugin_slug(own_package)
        package_dir = plugin_dir / own_package
        if not package_dir.is_dir():
            continue
        for py_file in package_dir.rglob("*.py"):
            if "__pycache__" in py_file.parts:
                continue
            source = py_file.read_text(encoding="utf-8")
            for imported_package in _imported_bibliogon_packages(source):
                if imported_package == own_package:
                    continue
                imported_slug = _plugin_slug(imported_package)
                violations.append((own_slug, imported_slug, py_file))
    return violations


def test_no_plugin_imports_from_another_plugin_outside_the_allowlist() -> None:
    found = _cross_plugin_imports()
    unexpected = [
        (importer, imported, path)
        for importer, imported, path in found
        if (importer, imported) not in ALLOWED_CROSS_PLUGIN_IMPORTS
    ]
    assert not unexpected, "New cross-plugin import(s) not on the allowlist:\n" + "\n".join(
        f"  {importer} -> {imported}  ({path.relative_to(REPO_ROOT)})"
        for importer, imported, path in unexpected
    )


def test_the_allowlist_has_no_stale_entries() -> None:
    """The open-set-discovery half: an allowlist entry with zero
    matching imports means the coupling it documented is gone and the
    entry should be deleted, not left to accumulate."""
    found_pairs = {(importer, imported) for importer, imported, _ in _cross_plugin_imports()}
    stale = ALLOWED_CROSS_PLUGIN_IMPORTS - found_pairs
    assert not stale, f"Allowlist entries with no matching import (remove them): {stale}"


def test_html_to_plain_text_is_not_reachable_from_a_plugin_package() -> None:
    """Regression pin for #806/#818: the function that caused the
    original violation now lives in core, not in plugin-export."""
    export_module = (
        PLUGINS_DIR / "bibliogon-plugin-export" / "bibliogon_export" / "html_to_markdown.py"
    )
    assert "html_to_plain_text" not in export_module.read_text(encoding="utf-8")
