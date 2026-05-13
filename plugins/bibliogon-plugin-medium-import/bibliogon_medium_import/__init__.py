"""Bibliogon Medium-import plugin.

Converts a Medium HTML export archive (the ZIP delivered by
Medium's Settings → "Download your information") into Bibliogon
Articles + Publications, with provenance recorded in
ArticleImportSource so re-imports can detect duplicates.

The plugin's ``__version__`` derives from its own pyproject.toml
via ``importlib.metadata`` so the value cannot drift from the
packaging metadata. ``pyproject.toml`` is the only file to edit at
release time.
"""

from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:
    __version__ = _pkg_version("bibliogon-plugin-medium-import")
except PackageNotFoundError:
    __version__ = "0.0.0+unknown"
