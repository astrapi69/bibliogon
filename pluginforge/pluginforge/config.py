"""YAML configuration loader and validation."""

from pathlib import Path
from typing import Any

import yaml


class ConfigLoader:
    """Loads and manages YAML configuration files."""

    def __init__(self, base_dir: str | Path = ".") -> None:
        self.base_dir = Path(base_dir)
        self._cache: dict[str, dict[str, Any]] = {}

    def load(self, path: str | Path) -> dict[str, Any]:
        """Load a YAML config file. Returns empty dict if file does not exist."""
        resolved = self._resolve_path(path)
        str_key = str(resolved)
        if str_key in self._cache:
            return self._cache[str_key]
        if not resolved.exists():
            return {}
        data = self._read_yaml(resolved)
        self._cache[str_key] = data
        return data

    def load_app_config(self, path: str | Path = "config/app.yaml") -> dict[str, Any]:
        """Load the main application config."""
        return self.load(path)

    def load_plugin_config(self, plugin_name: str, config_dir: str | Path = "config/plugins") -> dict[str, Any]:
        """Load config for a specific plugin."""
        plugin_path = Path(config_dir) / f"{plugin_name}.yaml"
        return self.load(plugin_path)

    def invalidate(self, path: str | Path | None = None) -> None:
        """Clear cached config. If path is None, clear all."""
        if path is None:
            self._cache.clear()
        else:
            resolved = self._resolve_path(path)
            self._cache.pop(str(resolved), None)

    def _resolve_path(self, path: str | Path) -> Path:
        """Resolve a path relative to base_dir."""
        p = Path(path)
        if p.is_absolute():
            return p
        return self.base_dir / p

    @staticmethod
    def _read_yaml(path: Path) -> dict[str, Any]:
        """Read and parse a YAML file."""
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
