#!/usr/bin/env python3
"""Print a field of ``frontend/public-origin.json`` (#1102).

The external-host gate takes the published origin as an argument, in the
Makefile and again in the deploy workflow. Both read it from here, so the
host is declared once: the file the app itself reads.

Usage::

    python3 scripts/public_origin.py             # the origin
    python3 scripts/public_origin.py --field appPath
    python3 scripts/public_origin.py --field host    # derived, not stored
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

CONFIG_PATH = Path(__file__).resolve().parent.parent / "frontend" / "public-origin.json"


def read_field(field: str, config_path: Path = CONFIG_PATH) -> str:
    """The named field, with ``host`` derived from the origin.

    Args:
        field: a key of the config, or ``host``.
        config_path: the config to read; the repo's by default.

    Returns:
        The field's value as a string.

    Raises:
        KeyError: when the field is not in the config and not derivable.
    """
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if field == "host":
        return urlparse(config["origin"]).netloc
    value = config.get(field)
    if not isinstance(value, str):
        raise KeyError(f"{field!r} is not a string field of {config_path.name}")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--field", default="origin", help="which field to print")
    args = parser.parse_args(argv)
    try:
        print(read_field(args.field))
    except (KeyError, FileNotFoundError) as exc:
        print(f"public_origin: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
