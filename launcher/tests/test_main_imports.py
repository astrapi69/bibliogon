"""Regression pin for PyInstaller-compatible imports.

PyInstaller compiles bibliogon_launcher/__main__.py as the entry script,
which strips the package context: ``__package__`` is empty and relative
imports raise ``ImportError: attempted relative import with no known
parent package``. Running __main__.py directly as a script reproduces
the same failure mode, so that is what we test.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


MAIN_PATH = (
    Path(__file__).resolve().parent.parent / "bibliogon_launcher" / "__main__.py"
)


def test_main_module_imports_clean_when_run_as_script() -> None:
    """Import __main__.py as a top-level script; must not raise ImportError.

    We execute in a subprocess with --version style quick exit via a
    snippet that only imports the module, so the Tk event loop never
    starts. Any ImportError shows up as a non-zero exit and is
    surfaced in the captured stderr.
    """
    code = (
        "import importlib.util, sys\n"
        f"spec = importlib.util.spec_from_file_location('__main__', r'{MAIN_PATH}')\n"
        "module = importlib.util.module_from_spec(spec)\n"
        "sys.modules['__main__'] = module\n"
        "# Replace main() with a no-op BEFORE exec so the loader does not\n"
        "# start Tk. We only care that imports resolve.\n"
        "spec.loader.exec_module.__self__.__class__  # sanity: attribute access\n"
        "try:\n"
        "    spec.loader.source_to_code(open(spec.origin, 'rb').read(), spec.origin)\n"
        "    import ast, types\n"
        "    src = open(spec.origin, 'r', encoding='utf-8').read()\n"
        "    tree = ast.parse(src)\n"
        "    # Strip the trailing `if __name__ == \"__main__\": sys.exit(main())` so\n"
        "    # we only run the top-level imports + defs.\n"
        "    tree.body = [n for n in tree.body if not isinstance(n, ast.If)]\n"
        "    exec(compile(tree, spec.origin, 'exec'), module.__dict__)\n"
        "except Exception as exc:\n"
        "    print(type(exc).__name__ + ': ' + str(exc), file=sys.stderr)\n"
        "    sys.exit(1)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, (
        f"Running __main__.py as a script failed.\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert "ImportError" not in result.stderr
