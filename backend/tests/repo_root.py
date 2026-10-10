"""Repository root, resolved the same way in the real tree and in
mutmut's ``mutants/`` copy.

``Path(__file__).resolve().parents[2]`` is the obvious computation and it
is wrong under mutmut. The mutants tree is ``backend/mutants/``, so
``backend/mutants/tests/x.py`` sits two levels below ``backend/``, not
three, and every repo-root-relative path a test builds lands inside
``backend/`` instead of at the root. ``tests/conftest.py`` papers over
part of that by symlinking ``docs/`` and ``plugins/`` next to
``mutants/``, which works only for the names someone remembered to add -
``frontend/`` and ``scripts/`` are not among them, and ``backend/app``
cannot be a symlink there at all because ``mutants/`` lives inside
``backend/``.

Walking up for a structural marker lands on the real root from either
tree, so a test using this needs no symlink and no copy. The marker is
"has both a ``backend/`` and a ``frontend/`` directory", which only the
repository root satisfies: ``backend/`` has no ``frontend/``, and
``mutants/`` has no ``backend/``.

@example
    from tests.repo_root import find_repo_root

    REPO_ROOT = find_repo_root(Path(__file__))
    FIXTURE = REPO_ROOT / "frontend" / "src" / "lib" / "x.json"
"""

from __future__ import annotations

from pathlib import Path


def find_repo_root(start: Path) -> Path:
    """The nearest ancestor of ``start`` holding both ``backend/`` and
    ``frontend/``.

    ``start`` may be a file (a test's ``__file__``) or a directory; it is
    resolved first, so a symlinked path lands in the real tree.
    """
    resolved = start.resolve()
    first = resolved if resolved.is_dir() else resolved.parent
    for candidate in (first, *first.parents):
        if (candidate / "backend").is_dir() and (candidate / "frontend").is_dir():
            return candidate
    raise RuntimeError(
        f"No repository root above {start}: no ancestor holds both a "
        "'backend' and a 'frontend' directory. If the layout changed, "
        "update tests/repo_root.py rather than reintroducing "
        "Path(__file__).parents[N] at the call sites."
    )
