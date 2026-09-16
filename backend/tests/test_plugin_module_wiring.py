"""Guard: every module inside a plugin package is imported by something (#869).

#865 shipped ``bibliogon_aplus/image_prompts.py`` with its own passing
tests and no caller: the builder's contract was tested, its use was
not. The same shape as the TipTap walkers (#824/#860, existence checked,
delegation not) and the Makefile aggregates (#863, target defined,
never listed): what was tested was the part, not the connection.

This guard walks every ``.py`` under ``backend/app``, ``scripts`` and
every ``plugins/*/bibliogon_*`` package (tests excluded), collects the
modules each one imports - absolute and relative - and fails when a
plugin module has no importer at all. Two kinds of module are exempt:
``__init__.py`` (a package, not a unit of behaviour) and the module a
plugin's ``pyproject.toml`` names as its ``bibliogon.plugins`` entry
point, which PluginForge loads by name. Anything else that is
legitimately reached without an import statement goes into
``ALLOWLIST`` with a written reason; an entry whose module has gained
an importer since fails too, so the list cannot go stale.

``unwired_plugin_modules`` takes the repo root as an argument so the
detector can be pointed at another checkout. Run against the tree
before #865's fix (commit 6d10deb8) it names
``bibliogon_aplus.image_prompts`` - the red pin recorded in #869.
"""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_EXTRA_SCAN_ROOTS = ("backend/app", "scripts")
_SKIP_PARTS = frozenset({"tests", "__pycache__", "mutants", "node_modules", ".venv"})

#: ``module -> reason``. Only for modules that production reaches
#: without an import statement (importlib by string, a subprocess
#: entry, a template loader). A real gap gets an issue and a fix, not
#: an entry here.
ALLOWLIST: dict[str, str] = {}


def _plugin_packages(repo_root: Path) -> list[tuple[Path, Path]]:
    """``(plugin dir, package dir)`` for every plugin with a pyproject."""
    found: list[tuple[Path, Path]] = []
    for plugin_dir in sorted((repo_root / "plugins").glob("bibliogon-plugin-*")):
        if not (plugin_dir / "pyproject.toml").is_file():
            continue
        for package_dir in sorted(plugin_dir.glob("bibliogon_*")):
            if (package_dir / "__init__.py").is_file():
                found.append((plugin_dir, package_dir))
    return found


def _entry_point_modules(plugin_dir: Path) -> set[str]:
    """Modules named in the plugin's ``bibliogon.plugins`` entry points."""
    data = tomllib.loads((plugin_dir / "pyproject.toml").read_text(encoding="utf-8"))
    groups = [
        data.get("tool", {}).get("poetry", {}).get("plugins", {}).get("bibliogon.plugins", {}),
        data.get("project", {}).get("entry-points", {}).get("bibliogon.plugins", {}),
    ]
    return {target.split(":", 1)[0] for group in groups for target in group.values()}


def _python_files(root: Path) -> list[Path]:
    return sorted(
        path
        for path in root.rglob("*.py")
        if not any(part in _SKIP_PARTS for part in path.relative_to(root).parts)
    )


def _module_name(package_dir: Path, file: Path) -> str:
    relative = file.relative_to(package_dir.parent).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def _imported_modules(file: Path, own_module: str | None) -> set[str]:
    """Every module name an import statement in ``file`` can refer to.

    ``from pkg import name`` may name a submodule or an attribute, so
    both ``pkg`` and ``pkg.name`` are recorded. Relative imports are
    resolved against ``own_module`` (None for files outside a plugin
    package, where relative imports cannot reach plugin code).
    """
    tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = _resolve_base(node, file, own_module)
            if base is None:
                continue
            if base:
                names.add(base)
            names.update(f"{base}.{alias.name}" if base else alias.name for alias in node.names)
    return names


def _resolve_base(node: ast.ImportFrom, file: Path, own_module: str | None) -> str | None:
    if node.level == 0:
        return node.module or ""
    if own_module is None:
        return None
    package_parts = own_module.split(".")
    if file.name != "__init__.py":
        package_parts = package_parts[:-1]
    if node.level > 1:
        package_parts = package_parts[: len(package_parts) - (node.level - 1)]
    return ".".join(package_parts + ([node.module] if node.module else []))


def unwired_plugin_modules(repo_root: Path) -> dict[str, Path]:
    """Plugin modules with no importer anywhere in the scanned roots.

    Returns ``{module name: file}``. Entry-point modules and
    ``__init__.py`` are never reported; the allowlist is NOT applied
    here so the tests can check it both ways.
    """
    candidates: dict[str, Path] = {}
    imported: set[str] = set()

    for plugin_dir, package_dir in _plugin_packages(repo_root):
        entry_points = _entry_point_modules(plugin_dir)
        for file in _python_files(package_dir):
            module = _module_name(package_dir, file)
            imported |= _imported_modules(file, module)
            if file.name != "__init__.py" and module not in entry_points:
                candidates[module] = file

    for relative in _EXTRA_SCAN_ROOTS:
        root = repo_root / relative
        if root.is_dir():
            for file in _python_files(root):
                imported |= _imported_modules(file, None)

    return {module: file for module, file in candidates.items() if module not in imported}


def test_every_plugin_module_is_imported_somewhere() -> None:
    unwired = {
        module: file
        for module, file in unwired_plugin_modules(_REPO_ROOT).items()
        if module not in ALLOWLIST
    }
    assert not unwired, (
        "These plugin modules are imported by nothing outside their tests, so their "
        "code never runs in production however green their own tests are:\n  "
        + "\n  ".join(
            f"{module}  ({file.relative_to(_REPO_ROOT)})" for module, file in unwired.items()
        )
        + "\nWire the module in, delete it, or add it to ALLOWLIST with the reason it is "
        "reached without an import statement."
    )


def test_allowlist_entries_are_justified_and_still_unwired() -> None:
    unwired = unwired_plugin_modules(_REPO_ROOT)
    problems = [
        f"{module}: reason missing" for module, reason in ALLOWLIST.items() if not reason.strip()
    ] + [
        f"{module}: now has an importer, drop the entry"
        for module in ALLOWLIST
        if module not in unwired
    ]
    assert not problems, "\n  ".join(problems)


def test_the_scan_sees_real_wiring_not_an_empty_graph() -> None:
    """A parser that silently returns nothing would make the guard pass
    on any tree. Pin one relative and one absolute edge that exist."""
    aplus = _REPO_ROOT / "plugins" / "bibliogon-plugin-aplus" / "bibliogon_aplus"
    generator_imports = _imported_modules(aplus / "generator.py", "bibliogon_aplus.generator")
    assert "bibliogon_aplus.image_prompts" in generator_imports
    plugin_imports = _imported_modules(aplus / "plugin.py", "bibliogon_aplus.plugin")
    assert "bibliogon_aplus.routes" in plugin_imports, "relative 'from .routes import' not resolved"
    assert len(_plugin_packages(_REPO_ROOT)) >= 10


def test_detector_names_the_unimported_module_of_a_synthetic_plugin(tmp_path: Path) -> None:
    """Self-contained red pin: a package whose entry point imports one
    sibling and ignores another must report exactly the ignored one."""
    package = tmp_path / "plugins" / "bibliogon-plugin-fake" / "bibliogon_fake"
    package.mkdir(parents=True)
    (package.parent / "pyproject.toml").write_text(
        '[tool.poetry.plugins."bibliogon.plugins"]\nfake = "bibliogon_fake.plugin:FakePlugin"\n',
        encoding="utf-8",
    )
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "plugin.py").write_text("from .used import helper\n", encoding="utf-8")
    (package / "used.py").write_text("from bibliogon_fake import deeper\n", encoding="utf-8")
    (package / "deeper.py").write_text("def helper():\n    return 1\n", encoding="utf-8")
    (package / "unused.py").write_text("def nothing():\n    return 0\n", encoding="utf-8")
    (package / "tests").mkdir()
    (package / "tests" / "test_unused.py").write_text(
        "from bibliogon_fake import unused\n", encoding="utf-8"
    )

    assert set(unwired_plugin_modules(tmp_path)) == {"bibliogon_fake.unused"}
