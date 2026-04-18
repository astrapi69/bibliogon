"""Round-trip YAML helpers.

PyYAML's ``dump`` silently strips comments, blank lines, and quote styles.
For user-facing config files (plugin settings, app.yaml) that may contain
``# INTERNAL`` markers per the architecture rules, we use ruamel.yaml in
round-trip mode so comments and formatting survive a save through the UI.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from ruamel.yaml import YAML


def _yaml() -> YAML:
    y = YAML(typ="rt")
    y.preserve_quotes = True
    y.width = 4096  # don't line-wrap long strings
    y.indent(mapping=2, sequence=4, offset=2)
    return y


def read_yaml_roundtrip(path: Path) -> Any:
    """Load a YAML file preserving comments and formatting for a later write."""
    with open(path, "r", encoding="utf-8") as f:
        return _yaml().load(f) or {}


def write_yaml_roundtrip(path: Path, data: Any) -> None:
    """Write a YAML file preserving the formatting of the original load.

    ``data`` must come from :func:`read_yaml_roundtrip` (or be a plain dict/list
    that ruamel can serialize). Plain dicts from elsewhere still round-trip
    correctly, just without preserved comments the caller never loaded.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        _yaml().dump(data, f)
