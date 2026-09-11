"""The declared Python floor must cover the syntax the code actually uses (#719).

``backend/pyproject.toml`` declared ``python = "^3.11"`` while the backend
uses PEP 695 generic syntax (``def restore_row[M](...)``), which is 3.12+
only. On 3.11 Poetry resolved and installed happily, then every import of
``app.main`` died with a ``SyntaxError`` in an unrelated-looking file - 131
collection errors and a backend that could not boot. It was invisible in CI
because every workflow pins 3.12.

The floor has since been raised, but nothing kept it there. These tests are
that pin: lowering the floor while PEP 695 syntax is present fails with an
actionable message instead of a confusing SyntaxError on a contributor's
machine.

The plugin packages deliberately stay 3.11-compatible (their CI installs and
tests each one standalone against its own lockfile), so the rule applied to
them is conditional: a plugin must declare 3.12+ only once its OWN code uses
3.12-only syntax.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_PYPROJECT = REPO_ROOT / "backend" / "pyproject.toml"
BACKEND_APP = REPO_ROOT / "backend" / "app"

# PEP 695 type-parameter syntax: `def f[T](...)`, `class C[T]:`, `type X = ...`.
# Deliberately anchored to a definition keyword so a subscripted call or an
# annotation (`list[int]`) cannot match.
PEP_695_RE = re.compile(
    r"^\s*(?:async\s+)?(?:def|class)\s+\w+\[|^\s*type\s+\w+\s*=",
    re.MULTILINE,
)


def declared_floor(pyproject: Path) -> tuple[int, int]:
    """Return the declared minimum (major, minor) for a Poetry project."""
    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    constraint = data["tool"]["poetry"]["dependencies"]["python"]
    match = re.search(r"(\d+)\.(\d+)", constraint)
    assert match is not None, f"{pyproject}: unparseable python constraint {constraint!r}"
    return int(match.group(1)), int(match.group(2))


def files_using_pep695(root: Path) -> list[Path]:
    return [
        path
        for path in sorted(root.rglob("*.py"))
        if PEP_695_RE.search(path.read_text(encoding="utf-8"))
    ]


class TestBackendFloor:
    def test_floor_is_at_least_312(self):
        assert declared_floor(BACKEND_PYPROJECT) >= (3, 12)

    def test_floor_covers_the_pep695_syntax_in_use(self):
        users = files_using_pep695(BACKEND_APP)
        if not users:
            return
        floor = declared_floor(BACKEND_PYPROJECT)
        listed = ", ".join(str(p.relative_to(REPO_ROOT)) for p in users[:5])
        assert floor >= (3, 12), (
            f"backend/pyproject.toml declares python {floor[0]}.{floor[1]} but "
            f"PEP 695 syntax (3.12+) is used in: {listed}. Raise the floor "
            "rather than rewriting the syntax."
        )

    def test_mypy_target_matches_the_declared_floor(self):
        data = tomllib.loads(BACKEND_PYPROJECT.read_text(encoding="utf-8"))
        configured = data["tool"]["mypy"]["python_version"]
        major, minor = declared_floor(BACKEND_PYPROJECT)
        assert configured == f"{major}.{minor}", (
            f"mypy python_version={configured} but the declared floor is "
            f"{major}.{minor}; type checking would target the wrong stdlib."
        )


class TestPluginFloors:
    def test_a_plugin_using_312_syntax_declares_312(self):
        """Plugins stay 3.11-compatible until their own code needs 3.12."""
        offenders: list[str] = []
        for pyproject in sorted(REPO_ROOT.glob("plugins/*/pyproject.toml")):
            package_dirs = [
                d
                for d in pyproject.parent.iterdir()
                if d.is_dir() and d.name.startswith("bibliogon_")
            ]
            users = [f for d in package_dirs for f in files_using_pep695(d)]
            if users and declared_floor(pyproject) < (3, 12):
                names = ", ".join(str(p.relative_to(REPO_ROOT)) for p in users[:3])
                offenders.append(f"{pyproject.parent.name}: {names}")
        assert not offenders, (
            "Plugins using PEP 695 syntax must declare python >= 3.12: "
            + "; ".join(offenders)
        )
