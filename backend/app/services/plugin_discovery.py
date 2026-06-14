"""Plugin availability discovery.

Extracted from ``routers/settings.py`` (God-file split #4, 2026-06-14).
Collects plugin names from three sources: the manager's entry-point
registry, ZIP-installed plugins under the installed dir, and the bundled
``plugins/`` tree. The DI state (manager + base_dir) is passed in by the
caller so this stays free of module-level globals and unit-testable.
"""

from pathlib import Path
from typing import Any


def collect_available_plugins(active: set[str], manager: Any, base_dir: Path) -> set[str]:
    """Collect all available plugin names from entry points, ZIP installs,
    and bundled dirs.

    Args:
        active: Currently active plugin names (always included).
        manager: PluginForge manager exposing ``list_available_plugins()``.
        base_dir: The configured base dir; bundled plugins live at
            ``base_dir.parent / "plugins"``.
    """
    try:
        available = set(manager.list_available_plugins())
    except Exception:
        available = set()
    available |= active

    from app.routers.plugin_install import get_installed_plugins_dir

    installed_dir = get_installed_plugins_dir()
    if installed_dir.exists():
        for d in installed_dir.iterdir():
            if d.is_dir() and (d / "plugin.yaml").exists():
                available.add(d.name)

    bundled_dir = base_dir.parent / "plugins"
    if bundled_dir.exists():
        for d in bundled_dir.iterdir():
            if d.is_dir() and d.name.startswith("bibliogon-plugin-"):
                plugin_name = d.name.replace("bibliogon-plugin-", "")
                pkg_dir = d / f"bibliogon_{plugin_name.replace('-', '_')}"
                if (pkg_dir / "plugin.py").exists():
                    available.add(plugin_name)
    return available
