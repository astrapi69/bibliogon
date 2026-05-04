"""Bibliogon backend app package.

The running app's version is derived at import time from
``backend/pyproject.toml``, the canonical Python source-of-truth.
Routers and the OpenAPI metadata read ``__version__`` rather than
hardcoding the number; ``pyproject.toml`` is the only file that
needs to be edited at release time.

The backend is intentionally ``package-mode = false`` (Poetry does
not publish it as a distribution), so ``importlib.metadata`` is
not available for it - hence the tomllib parse below.
"""

from __future__ import annotations

import logging
import tomllib
from pathlib import Path

logger = logging.getLogger(__name__)

_PYPROJECT = Path(__file__).resolve().parent.parent / "pyproject.toml"


def _read_version() -> str:
    try:
        with _PYPROJECT.open("rb") as handle:
            data = tomllib.load(handle)
        return data["tool"]["poetry"]["version"]
    except (OSError, KeyError, tomllib.TOMLDecodeError) as exc:
        logger.warning(
            "Could not read version from %s: %s. Falling back to sentinel.",
            _PYPROJECT,
            exc,
        )
        return "0.0.0+unknown"


__version__ = _read_version()
