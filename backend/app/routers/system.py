"""System-info endpoint for the About-Dialog feature.

Returns app identity (name + version + license + authors + URLs)
+ Python runtime info + bundled-dependency versions. Consumed by
the Settings > About tab.

Per the 2026-05-18 About-Dialog pre-inspection (D1.A): single
cohesive endpoint serving the entire About payload, separate from
``/api/health`` (which intentionally stays minimal for Docker
healthchecks).
"""

from __future__ import annotations

import platform
import sys
import tomllib
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from app import __version__

router = APIRouter(prefix="/system", tags=["system"])

_PYPROJECT = Path(__file__).resolve().parent.parent.parent / "pyproject.toml"

# Canonical project URLs. Static; no remote fetch. Hardcoded once
# here rather than in pyproject.toml's [tool.poetry] block because
# Bibliogon ships `package-mode = false` so `[tool.poetry.urls]`
# would be parsed but not enforced by tooling. Single home for the
# About payload is good enough.
_REPOSITORY_URL = "https://github.com/astrapi69/bibliogon"
_ISSUES_URL = "https://github.com/astrapi69/bibliogon/issues"


def _read_pyproject_field(field: str, default: Any = None) -> Any:
    try:
        with _PYPROJECT.open("rb") as handle:
            data = tomllib.load(handle)
        return data.get("tool", {}).get("poetry", {}).get(field, default)
    except (OSError, tomllib.TOMLDecodeError):
        return default


def _safe_module_version(module_name: str) -> str | None:
    """Resolve a bundled dependency's __version__ without crashing.

    Returns None when the module isn't importable (e.g. optional
    extras), so the About payload can render the row as "unknown"
    or hide it.
    """
    try:
        module = __import__(module_name)
        version = getattr(module, "__version__", None)
        return version if isinstance(version, str) else None
    except ImportError:
        return None


@router.get("/info")
def get_system_info() -> dict[str, Any]:
    """Aggregate app + runtime + dependencies metadata for About.

    Stable shape through About v1:
    - ``app``: name, version, license, authors, urls
    - ``runtime``: python_version, platform_system, platform_release,
      platform_machine
    - ``dependencies``: fastapi, sqlalchemy, pydantic (and other
      bundled libs as they get added to the About panel)

    Each section's missing fields surface as ``None`` so the
    frontend can degrade gracefully. Tests assert SHAPE, not exact
    values, because Python + platform vary per environment.
    """
    authors = _read_pyproject_field("authors", []) or []
    if not isinstance(authors, list):
        authors = []
    license_str = _read_pyproject_field("license", "MIT") or "MIT"
    if not isinstance(license_str, str):
        license_str = "MIT"

    return {
        "app": {
            "name": "Bibliogon",
            "version": __version__,
            "license": license_str,
            "authors": authors,
            "repository_url": _REPOSITORY_URL,
            "issues_url": _ISSUES_URL,
        },
        "runtime": {
            "python_version": sys.version.split()[0],
            "platform_system": platform.system(),
            "platform_release": platform.release(),
            "platform_machine": platform.machine(),
        },
        "dependencies": {
            "fastapi": _safe_module_version("fastapi"),
            "sqlalchemy": _safe_module_version("sqlalchemy"),
            "pydantic": _safe_module_version("pydantic"),
            "pluginforge": _safe_module_version("pluginforge"),
        },
    }
