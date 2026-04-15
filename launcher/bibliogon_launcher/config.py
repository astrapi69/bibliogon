"""Launcher config: repo path, port, user config file, lockfile paths.

Single source of truth for where things live on disk. Pure functions so
they are unit-testable without touching the real filesystem.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path


APP_NAME = "Bibliogon"
DEFAULT_PORT = 7880
DEFAULT_REPO_DIR_NAME = "bibliogon"
COMPOSE_FILENAME = "docker-compose.prod.yml"
ENV_FILENAME = ".env"
ENV_EXAMPLE_FILENAME = ".env.example"

_PORT_LINE_RE = re.compile(r"^\s*BIBLIOGON_PORT\s*=\s*(\d+)\s*$", re.MULTILINE)


def appdata_dir(env: dict[str, str] | None = None) -> Path:
    """Return the user's per-app config directory.

    On Windows this is ``%APPDATA%\\Bibliogon``. On non-Windows (used by
    tests running on CI or Linux devs), fall back to
    ``~/.config/Bibliogon`` so the same code path exercises in unit tests.
    """
    env = env if env is not None else dict(os.environ)
    appdata = env.get("APPDATA")
    if appdata:
        return Path(appdata) / APP_NAME
    home = Path(env.get("HOME", "~")).expanduser()
    return home / ".config" / APP_NAME


def launcher_config_path(env: dict[str, str] | None = None) -> Path:
    return appdata_dir(env) / "launcher.json"


def lockfile_path(env: dict[str, str] | None = None) -> Path:
    return appdata_dir(env) / "launcher.lock"


def logfile_path(env: dict[str, str] | None = None) -> Path:
    return appdata_dir(env) / "launcher.log"


def default_repo_path(env: dict[str, str] | None = None) -> Path:
    """Default install location used when the user has not configured one."""
    env = env if env is not None else dict(os.environ)
    profile = env.get("USERPROFILE") or env.get("HOME") or "~"
    return Path(profile).expanduser() / DEFAULT_REPO_DIR_NAME


def load_launcher_config(env: dict[str, str] | None = None) -> dict:
    """Load persisted launcher config, empty dict on first run or parse error."""
    path = launcher_config_path(env)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_launcher_config(data: dict, env: dict[str, str] | None = None) -> None:
    path = launcher_config_path(env)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def resolve_repo_path(env: dict[str, str] | None = None) -> Path:
    """Return the configured repo path or the default. Does not verify existence."""
    cfg = load_launcher_config(env)
    configured = cfg.get("repo_path")
    if configured:
        return Path(configured).expanduser()
    return default_repo_path(env)


def is_valid_repo(repo: Path) -> bool:
    """A valid repo has the production compose file we invoke."""
    return (repo / COMPOSE_FILENAME).is_file()


def read_port(repo: Path) -> int:
    """Read ``BIBLIOGON_PORT`` from ``.env`` in the repo; fall back to default.

    Used so the launcher opens the browser on the user's configured port
    rather than hardcoding 7880.
    """
    env_file = repo / ENV_FILENAME
    if not env_file.is_file():
        return DEFAULT_PORT
    try:
        match = _PORT_LINE_RE.search(env_file.read_text(encoding="utf-8"))
    except OSError:
        return DEFAULT_PORT
    if not match:
        return DEFAULT_PORT
    try:
        port = int(match.group(1))
    except ValueError:
        return DEFAULT_PORT
    return port if 1 <= port <= 65535 else DEFAULT_PORT
