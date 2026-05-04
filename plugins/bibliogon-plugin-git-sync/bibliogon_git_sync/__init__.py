"""Bibliogon git-sync plugin: clone a public write-book-template
git URL and import it via the core import orchestrator.

The plugin's ``__version__`` derives from its own pyproject.toml
via ``importlib.metadata`` so the value cannot drift from the
packaging metadata. ``pyproject.toml`` is the only file to edit at
release time.
"""

from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:
    __version__ = _pkg_version("bibliogon-plugin-git-sync")
except PackageNotFoundError:
    __version__ = "0.0.0+unknown"
