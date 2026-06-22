"""Pure-Python action layer for the Bibliogon launcher.

Schicht 1 of the launcher architecture (see ``launcher/SPEC.md``): every
function takes simple parameters, returns a ``(ok: bool, detail: str)``
tuple (or a plain value for the read-only helpers), and verifies its
result. No tkinter, no argparse - so the GUI and CLI layers are thin
renderers over this module, and every action is unit-testable by mocking
the docker/filesystem boundary.

The functions delegate to the proven primitive modules (``docker``,
``config``, ``health``, ``installer``, ``cleanup``, ``manifest``) and add
the verification + project-name-parameter shape the spec mandates.
"""

from __future__ import annotations

import json
import logging
import webbrowser
from pathlib import Path

from bibliogon_launcher import __version__, cleanup, config, docker, health, manifest

logger = logging.getLogger("bibliogon_launcher.actions")

# Default Compose project name. The GUI/CLI pass this explicitly so the
# action signatures match the spec, but every caller in this codebase
# uses the same value as docker.PROJECT_NAME.
PROJECT_NAME = docker.PROJECT_NAME

# Valid user-selectable port range. The spec restricts the GUI port
# field to 1024-65535 (ports below 1024 need elevated privileges).
MIN_PORT = 1024
MAX_PORT = 65535

# Launcher states returned by :func:`get_state`.
STATE_NO_DOCKER = "no_docker"
STATE_NOT_INSTALLED = "not_installed"
STATE_RUNNING = "running"
STATE_STOPPED = "stopped"

DEFAULT_HEALTH_PATH = health.HEALTH_PATH


# --- Docker + state ---------------------------------------------------


def check_docker() -> tuple[bool, str]:
    """True only if docker is installed AND its daemon is reachable.

    Returns the first failing reason so the GUI can show the right
    "install Docker" vs "start Docker" guidance.
    """
    installed, detail = docker.docker_installed()
    if not installed:
        return False, detail
    running, detail = docker.docker_daemon_running()
    if not running:
        return False, detail
    return True, "running"


def get_state(project: str = PROJECT_NAME) -> str:
    """Resolve the launcher state for ``project``.

    One of :data:`STATE_NO_DOCKER`, :data:`STATE_RUNNING`,
    :data:`STATE_STOPPED`, :data:`STATE_NOT_INSTALLED`. The decision:

    - daemon unreachable -> ``no_docker``
    - any running container for the project -> ``running``
    - a stopped container OR an install manifest -> ``stopped``
    - otherwise -> ``not_installed``
    """
    ok, _ = check_docker()
    if not ok:
        return STATE_NO_DOCKER
    if docker.project_container_ids(project):
        return STATE_RUNNING
    if docker.project_container_ids(project, all_states=True):
        return STATE_STOPPED
    if manifest.install_dir_from_manifest() is not None:
        return STATE_STOPPED
    return STATE_NOT_INSTALLED


# --- Ports ------------------------------------------------------------


def valid_port(port: int) -> bool:
    """True if ``port`` is an int inside the user-selectable range."""
    return isinstance(port, int) and MIN_PORT <= port <= MAX_PORT


def check_port(port: int) -> tuple[bool, str]:
    """Report whether ``port`` is free to bind right now.

    A taken port is ``(False, ...)`` so the caller can warn before
    ``docker compose up`` maps it. Out-of-range ports fail fast.
    """
    if not valid_port(port):
        return False, f"port must be between {MIN_PORT} and {MAX_PORT}"
    if config.is_port_free(port):
        return True, "free"
    return False, "in use"


def find_free_port(start: int) -> tuple[bool, int, str]:
    """Return the first free port at or after ``start``.

    ``(True, port, "free")`` when one is found, ``(False, start,
    detail)`` when the scan exhausts the range without success.
    """
    if not isinstance(start, int) or start < 1:
        return False, start, "invalid start port"
    candidate = config.find_free_port(start)
    if config.is_port_free(candidate):
        return True, candidate, "free"
    return False, start, "no free port found"


# --- Install / start / stop -------------------------------------------


def install(compose_file: str, project: str = PROJECT_NAME, port: int = config.DEFAULT_PORT) -> tuple[bool, str]:
    """Build images and start the stack from ``compose_file``.

    Writes ``port`` into the ``.env`` next to the compose file first so
    the container maps the requested port, then runs
    ``docker compose up --build -d`` and verifies a container is
    actually running afterwards (a build that "succeeds" but starts
    nothing is reported as a failure, not silently as done).
    """
    compose_path = Path(compose_file)
    if not compose_path.is_file():
        return False, f"compose file not found: {compose_file}"
    if not valid_port(port):
        return False, f"port must be between {MIN_PORT} and {MAX_PORT}"

    set_repo_port(compose_path.parent, port)
    ok, detail = docker.project_up_build(compose_file, project)
    if not ok:
        return False, detail
    if not docker.project_container_ids(project):
        return False, "compose reported success but no container is running"
    return True, "installed"


def start(compose_file: str, project: str = PROJECT_NAME) -> tuple[bool, str]:
    """Start an already-installed (built) stack and verify it is up."""
    compose_path = Path(compose_file)
    if not compose_path.is_file():
        return False, f"compose file not found: {compose_file}"
    ok, detail = docker.project_up(compose_file, project)
    if not ok:
        return False, detail
    if not docker.project_container_ids(project):
        return False, "compose reported success but no container is running"
    return True, "started"


def stop(project: str = PROJECT_NAME) -> tuple[bool, str]:
    """Stop the running stack for ``project`` and verify it is down."""
    ok, detail = docker.project_down(project)
    if not ok:
        return False, detail
    if docker.project_container_ids(project):
        return False, "compose down reported success but a container is still running"
    return True, "stopped"


def uninstall(project: str = PROJECT_NAME) -> tuple[bool, str]:
    """Full teardown: stop the stack, remove volumes/images/files/config.

    Delegates to :func:`cleanup.uninstall_bibliogon` (the single
    reusable teardown shared with the CLI) and reports a precise
    failure listing the steps that did not complete - never claims
    "done" when a step failed.
    """
    install_dir = manifest.install_dir_from_manifest() or config.resolve_repo_path()
    results = cleanup.uninstall_bibliogon(install_dir)
    failed = [step for step, ok in results.items() if not ok]
    if failed:
        return False, "uninstall incomplete: " + ", ".join(failed)
    return True, "uninstalled"


# --- Health / browser -------------------------------------------------


def health_check(port: int, path: str = DEFAULT_HEALTH_PATH, timeout: int = 60) -> tuple[bool, str]:
    """Poll the backend until healthy or ``timeout`` seconds elapse."""
    if health.wait_for_healthy(port, timeout_seconds=float(timeout)):
        return True, "healthy"
    if health.is_healthy(port, path=path):
        return True, "healthy"
    return False, f"not healthy within {timeout}s"


def open_browser(port: int, path: str = "/") -> None:
    """Open the app in the default browser. Never closes any window."""
    url = f"http://localhost:{port}{path}"
    logger.info("opening browser at %s", url)
    webbrowser.open(url)


# --- Version + config -------------------------------------------------


def get_version() -> str:
    """Return the launcher version (synced with the app at release)."""
    return __version__


def load_config(path: Path) -> dict:
    """Read a launcher JSON config file; empty dict on missing/corrupt."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_config(path: Path, data: dict) -> None:
    """Persist a launcher JSON config file, creating parent dirs."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def set_port(path: Path, port: int) -> tuple[bool, str]:
    """Validate and persist the chosen port into the launcher config.

    Stores the port under the ``port`` key in the launcher JSON config
    at ``path`` (read-modify-write so other keys survive). The repo
    ``.env`` is updated separately via :func:`set_repo_port` at
    install/start time; together they satisfy the spec's "saved in
    launcher.json AND .env".
    """
    if not valid_port(port):
        return False, f"port must be between {MIN_PORT} and {MAX_PORT}"
    data = load_config(path)
    data["port"] = port
    save_config(path, data)
    return True, str(port)


def set_repo_port(repo: Path, port: int) -> tuple[bool, str]:
    """Write ``port`` into the repo's ``.env`` (what compose maps)."""
    if not valid_port(port):
        return False, f"port must be between {MIN_PORT} and {MAX_PORT}"
    if config.write_port(Path(repo), port):
        return True, str(port)
    return False, "could not write .env"
