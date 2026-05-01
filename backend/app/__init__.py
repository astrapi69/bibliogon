"""Bibliogon backend app package.

The ``__version__`` constant is the single source of truth for the
running app's version. ``backend/pyproject.toml`` carries the
package-build version (kept in sync with this string at release
time); routers and the OpenAPI metadata read this constant rather
than hardcoding the number.
"""

__version__ = "0.25.0"
