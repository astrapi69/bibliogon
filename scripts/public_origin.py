#!/usr/bin/env python3
"""Print a field of ``frontend/public-origin.json`` (#1102).

The external-host gate takes the published origin as an argument, in the
Makefile and again in the deploy workflow. Both read it from here, so the
host is declared once: the file the app itself reads.

``VITE_PUBLIC_ORIGIN`` / ``VITE_PUBLIC_APP_PATH`` override the declared
values, the same way they override them for the bundle, so a build that
publishes to a second host is scanned against ITS own origin.

How much that matters, measured rather than assumed: today's bundle puts
the published URL only in ``rel=canonical``, Open-Graph metadata and the
JSON-LD block, all of which the scanner treats as strings and not as
fetches - so the wrong origin currently changes nothing. It starts
mattering the moment an absolute self-reference lands somewhere the
scanner DOES read: a manifest icon, a service-worker precache entry, an
``<img src>`` built from ``publicUrl``. Planting one of those in a
second-host artifact is reported as a third-party fetch against the
declared origin and is silent against the resolved one.

Usage::

    python3 scripts/public_origin.py             # the origin
    python3 scripts/public_origin.py --field appPath
    python3 scripts/public_origin.py --field host    # derived, not stored
    VITE_PUBLIC_ORIGIN=https://example.com python3 scripts/public_origin.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

CONFIG_PATH = Path(__file__).resolve().parent.parent / "frontend" / "public-origin.json"


#: Fields a build may override, and the env-var that overrides each.
OVERRIDES = {"origin": "VITE_PUBLIC_ORIGIN", "appPath": "VITE_PUBLIC_APP_PATH"}


def read_field(
    field: str,
    config_path: Path = CONFIG_PATH,
    env: dict[str, str] | None = None,
) -> str:
    """The named field, as the build would resolve it.

    An override that is absent, empty or blank is not an override, matching
    ``resolveOriginConfig`` on the TypeScript side - an unset env-var
    reaches a script as an empty string.

    Args:
        field: a key of the config, or ``host``.
        config_path: the config to read; the repo's by default.
        env: the environment to read overrides from; ``os.environ`` by
            default.

    Returns:
        The field's value as a string.

    Raises:
        KeyError: when the field is not in the config and not derivable.
    """
    environ = os.environ if env is None else env
    config: dict[str, object] = json.loads(config_path.read_text(encoding="utf-8"))

    def resolved(name: str) -> str:
        override = environ.get(OVERRIDES.get(name, ""), "").strip()
        if override:
            return override.rstrip("/") if name == "origin" else override
        value = config.get(name)
        if not isinstance(value, str):
            raise KeyError(f"{name!r} is not a string field of {config_path.name}")
        return value

    if field == "host":
        return urlparse(resolved("origin")).netloc
    return resolved(field)


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
