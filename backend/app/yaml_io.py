"""Round-trip YAML helpers.

PyYAML's ``dump`` silently strips comments, blank lines, and quote styles.
For user-facing config files (plugin settings, app.yaml) that may contain
``# INTERNAL`` markers per the architecture rules, we use ruamel.yaml in
round-trip mode so comments and formatting survive a save through the UI.
"""

from __future__ import annotations

import os
import tempfile
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
    with open(path, encoding="utf-8") as f:
        return _yaml().load(f) or {}


def write_yaml_roundtrip(path: Path, data: Any) -> None:
    """Write a YAML file preserving the formatting of the original load.

    ``data`` must come from :func:`read_yaml_roundtrip` (or be a plain dict/list
    that ruamel can serialize). Plain dicts from elsewhere still round-trip
    correctly, just without preserved comments the caller never loaded.

    The write is atomic: ``data`` is serialized to a temporary file in the
    same directory and then :func:`os.replace`-d into place (atomic on POSIX
    and Windows). Two concurrent read-modify-write requests against the same
    config file (e.g. overlapping ``PATCH /settings/app`` calls) therefore
    never see or produce a truncated / interleaved file — each writer emits a
    complete document and the last rename wins, instead of corrupting the YAML
    mid-dump.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            _yaml().dump(data, f)
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
