"""Launcher config: repo path, port, user config file, lockfile paths.

Single source of truth for where things live on disk. Pure functions so
they are unit-testable without touching the real filesystem.
"""

from __future__ import annotations

import json
import os
import re
import socket
from pathlib import Path


APP_NAME = "Bibliogon"
DEFAULT_PORT = 7880
DEFAULT_REPO_DIR_NAME = "bibliogon"
COMPOSE_FILENAME = "docker-compose.prod.yml"
ENV_FILENAME = ".env"
ENV_EXAMPLE_FILENAME = ".env.example"

_PORT_LINE_RE = re.compile(r"^\s*BIBLIOGON_PORT\s*=\s*(\d+)\s*$", re.MULTILINE)
_PORT_ASSIGN_RE = re.compile(r"^(\s*BIBLIOGON_PORT\s*=\s*)\d+(\s*)$", re.MULTILINE)


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


def get_show_details_default(env: dict[str, str] | None = None) -> bool:
    """Return the persisted "always show technical details" toggle.

    Default is False so end users see the plain-language view first.
    Developers can set this to True in ``launcher.json`` to auto-expand
    the details block on every error dialog.
    """
    cfg = load_launcher_config(env)
    return bool(cfg.get("show_details_by_default", False))


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


def source_checkout_repo() -> Path | None:
    """Return the Bibliogon repo root IF the launcher is running from a
    source checkout, else ``None``.

    ``__file__`` is ``<repo>/launcher/bibliogon_launcher/config.py``, so
    ``parents[2]`` is the repo root. When that root carries the production
    compose file, the launcher is running from a real checkout and should
    use it directly - never a stale downloaded release in a tmp dir. In a
    PyInstaller bundle or a pip install, ``parents[2]`` is not a valid repo,
    so this returns ``None`` and the classic download flow is used (end
    users are unaffected).
    """
    try:
        candidate = Path(__file__).resolve().parents[2]
    except IndexError:  # pragma: no cover - path too shallow
        return None
    return candidate if is_valid_repo(candidate) else None


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


def is_port_free(port: int, host: str = "127.0.0.1") -> bool:
    """True if ``port`` can be bound on ``host`` right now.

    Used to detect a conflict before ``docker compose up`` maps the
    port. A bind that succeeds means no other process holds the port;
    a bind that fails (``OSError``) means it is taken. We bind rather
    than connect because a free port has nothing to connect to.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def find_free_port(start_port: int, host: str = "127.0.0.1", max_tries: int = 100) -> int:
    """Return the first free port at or after ``start_port``.

    Scans ``start_port, start_port + 1, ...`` up to ``max_tries``
    candidates, clamping to the valid 1-65535 range. Falls back to
    ``start_port`` if nothing free is found within the window (the
    caller then surfaces the original conflict rather than silently
    looping forever).
    """
    candidate = start_port
    for _ in range(max_tries):
        if candidate > 65535:
            break
        if 1 <= candidate <= 65535 and is_port_free(candidate, host):
            return candidate
        candidate += 1
    return start_port


def write_port(repo: Path, port: int) -> bool:
    """Persist ``port`` as ``BIBLIOGON_PORT`` in the repo's ``.env``.

    Also rewrites any ``localhost:<old-port>`` occurrence in the file
    (e.g. ``BIBLIOGON_CORS_ORIGINS``) so the CORS origin keeps matching
    the served port. Returns True on success, False if the ``.env`` is
    missing or cannot be written. The persisted value is what
    :func:`read_port` reads on the next launch, so a resolved port
    sticks across restarts.
    """
    env_file = repo / ENV_FILENAME
    if not env_file.is_file():
        return False
    try:
        text = env_file.read_text(encoding="utf-8")
    except OSError:
        return False
    old_port = read_port(repo)
    new_text, count = _PORT_ASSIGN_RE.subn(rf"\g<1>{port}\g<2>", text)
    if count == 0:
        # No existing assignment: append one so the value is honoured.
        if new_text and not new_text.endswith("\n"):
            new_text += "\n"
        new_text += f"BIBLIOGON_PORT={port}\n"
    if old_port != port:
        new_text = new_text.replace(f"localhost:{old_port}", f"localhost:{port}")
    try:
        env_file.write_text(new_text, encoding="utf-8")
    except OSError:
        return False
    return True
