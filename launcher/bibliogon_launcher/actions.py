"""Launcher Actions - the single business-logic layer.

Every launcher operation is an isolated action here. The persistent
window (:mod:`bibliogon_launcher.launcher_app`) and the headless CLI
(:mod:`bibliogon_launcher.__main__`) call ONLY these functions; this
module imports NO tkinter and contains no GUI code, so every action is
unit-testable with pytest without a display.

Contract for every action:

- Takes plain parameters (``str`` / ``int`` / ``Path``).
- Returns ``(success: bool, message: str)`` (a few return richer tuples
  where documented, e.g. :func:`find_free_port`).
- VERIFIES its result rather than blindly reporting success (e.g.
  :func:`uninstall` confirms the containers are actually gone).

Long-running actions (:func:`install`, :func:`start`) accept an optional
``on_step(label: str)`` progress callback, and both also take an
``on_output(line: str)`` callback that streams the Docker build's output
line-by-line as it happens. Both are plain Python callables - the GUI
passes ones that marshal onto the Tk thread, but the action neither knows
nor cares.

The persistent-window architecture is tuned for Bibliogon's project
name, default port, health endpoint, and production compose stack.
"""

from __future__ import annotations

import json
import logging
import socket
import subprocess
import threading
import time
import urllib.request
import webbrowser
from collections.abc import Callable
from pathlib import Path

from bibliogon_launcher import __version__

logger = logging.getLogger("bibliogon_launcher.actions")

DEFAULT_PROJECT = "bibliogon"
DEFAULT_PORT = 7880
HEALTH_PATH = "/api/health"
MIN_PORT = 1024
MAX_PORT = 65535

# Container-name filter: the compose project ``bibliogon`` names its
# containers ``bibliogon-<service>-<n>``, so a single ``name=bibliogon``
# filter matches them all.
_NAME_FILTERS = ("name=bibliogon",)

ProgressFn = Callable[[str], None]
# Per-line output callback for a streamed command (e.g. the Docker build).
OutputFn = Callable[[str], None]


def _run(cmd: list[str], *, timeout: float = 15.0, cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Run a docker command, capturing output. Logs the call for --debug."""
    logger.debug("exec: %s (cwd=%s, timeout=%ss)", " ".join(cmd), cwd, timeout)
    result = subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        cwd=str(cwd) if cwd else None,
    )
    logger.debug("exit=%s stdout=%r stderr=%r", result.returncode,
                 (result.stdout or "")[-1500:], (result.stderr or "")[-1500:])
    return result


def _notify(on_step: ProgressFn | None, label: str) -> None:
    if on_step is not None:
        try:
            on_step(label)
        except Exception as exc:  # noqa: BLE001 - progress UI must never break an action
            logger.debug("progress callback failed: %s", exc)


# --- Docker + state -------------------------------------------------------

def docker_installed() -> tuple[bool, str]:
    """Return (installed, message). True if the ``docker`` binary exists.

    Distinct from :func:`check_docker`: this only checks the CLI is
    present (``docker --version``), not whether the daemon is running -
    so callers can tell "not installed" from "installed but stopped".
    """
    try:
        result = _run(["docker", "--version"], timeout=10.0)
    except FileNotFoundError:
        return False, "Docker is not installed (docker not on PATH)."
    except subprocess.TimeoutExpired:
        return False, "Docker is not responding."
    if result.returncode != 0:
        return False, (result.stderr or "").strip() or "docker --version failed."
    return True, (result.stdout or "").strip() or "Docker is installed."


def check_docker() -> tuple[bool, str]:
    """Return (running, message). True only when the daemon is reachable.

    Covers the installed-check too: FileNotFoundError -> not installed;
    a non-zero ``docker info`` -> installed but the daemon is not started.
    """
    try:
        result = _run(["docker", "info"], timeout=10.0)
    except FileNotFoundError:
        return False, "Docker is not installed (docker not on PATH)."
    except subprocess.TimeoutExpired:
        return False, "Docker is not responding (Docker Desktop may still be starting)."
    if result.returncode != 0:
        return False, "Docker Desktop is not running."
    return True, "Docker is running."


def _project_container_ids(*, running_only: bool) -> list[str]:
    cmd = ["docker", "ps", "-q"] if running_only else ["docker", "ps", "-aq"]
    for flt in _NAME_FILTERS:
        cmd += ["--filter", flt]
    try:
        result = _run(cmd, timeout=15.0)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    return [cid for cid in (result.stdout or "").strip().splitlines() if cid]


def get_state(project: str = DEFAULT_PROJECT) -> str:
    """Return 'no_docker' | 'not_installed' | 'running' | 'stopped'."""
    docker_ok, _ = check_docker()
    if not docker_ok:
        return "no_docker"
    if _project_container_ids(running_only=True):
        return "running"
    if _project_container_ids(running_only=False):
        return "stopped"
    return "not_installed"


# --- Ports ----------------------------------------------------------------

def check_port(port: int, *, host: str = "") -> tuple[bool, str]:
    """Return (free, message). Validates the range, then probes by BIND.

    Bind (not connect) is the correct check for "can docker publish this
    port": Docker publishes by binding all interfaces, so we bind the same
    way. ``SO_REUSEADDR`` is intentionally not set so a live conflict
    surfaces instead of being masked.

    On Windows a plain bind probe is too permissive - it succeeds even when
    another socket already holds the port, so we set ``SO_EXCLUSIVEADDRUSE``
    there (the Windows-only option that makes the bind fail on any
    overlapping bind). It does not exist on Linux/macOS, so those keep the
    plain-bind behaviour.
    """
    valid, reason = _validate_port(port)
    if not valid:
        return False, reason
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):  # Windows only
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        sock.bind((host, port))
    except OSError:
        return False, f"Port {port} is in use."
    finally:
        sock.close()
    return True, f"Port {port} is free."


def find_free_port(start: int, *, max_tries: int = 100) -> tuple[bool, int, str]:
    """Return (found, port, message), scanning up to ``max_tries`` ports
    from ``start``. Returns ``(False, 0, ...)`` on an invalid start or
    when no free port is found."""
    valid, _ = _validate_port(start)
    if not valid:
        return False, 0, f"Invalid start port: {start}."
    last = min(start + max_tries - 1, MAX_PORT)
    for candidate in range(start, last + 1):
        free, _ = check_port(candidate)
        if free:
            return True, candidate, f"Free port found: {candidate}."
    return False, 0, "No free port found."


# --- Lifecycle (install / start / stop / uninstall) -----------------------

def _compose(project: str, compose_file: str, *args: str, timeout: float) -> subprocess.CompletedProcess:
    return _run(
        ["docker", "compose", "-p", project, "-f", compose_file, *args],
        timeout=timeout, cwd=Path(compose_file).parent,
    )


def _stream(
    cmd: list[str],
    *,
    on_output: OutputFn | None = None,
    timeout: float,
    cwd: Path | None = None,
    tail_lines: int = 15,
    keep: int = 400,
) -> tuple[int, str]:
    """Run ``cmd``, streaming combined stdout+stderr line-by-line to
    ``on_output`` as each line arrives. Returns ``(returncode, tail)`` where
    ``tail`` is the last ``tail_lines`` lines (for an error message).

    Unlike :func:`_run` (which blocks until the process exits and only then
    returns the whole output), this surfaces progress live - the Docker
    build prints for minutes, and the user must see it move. A watchdog
    timer kills the process after ``timeout`` and the call then raises
    :class:`subprocess.TimeoutExpired`, matching ``_run``'s contract.
    Tk-free: ``on_output`` is a plain callable the GUI marshals onto its
    own thread.
    """
    logger.debug("stream: %s (cwd=%s, timeout=%ss)", " ".join(cmd), cwd, timeout)
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, cwd=str(cwd) if cwd else None,
    )
    lines: list[str] = []
    killed = {"v": False}

    def _kill() -> None:
        killed["v"] = True
        proc.kill()

    timer = threading.Timer(timeout, _kill)
    timer.start()
    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip("\n")
            lines.append(line)
            if len(lines) > keep:
                lines.pop(0)
            if on_output is not None:
                try:
                    on_output(line)
                except Exception as exc:  # noqa: BLE001 - output UI must never break the build
                    logger.debug("output callback failed: %s", exc)
        proc.wait()
    finally:
        timer.cancel()
    if killed["v"]:
        raise subprocess.TimeoutExpired(cmd, timeout)
    return proc.returncode, "\n".join(lines[-tail_lines:])


def _stream_compose(
    project: str, compose_file: str, *args: str,
    on_output: OutputFn | None = None, timeout: float,
) -> tuple[int, str]:
    """Stream a ``docker compose`` subcommand (see :func:`_stream`)."""
    return _stream(
        ["docker", "compose", "-p", project, "-f", compose_file, *args],
        on_output=on_output, timeout=timeout, cwd=Path(compose_file).parent,
    )


_DOCKER_UNAVAILABLE = "Docker is not available (not started)."


def install(compose_file: str, project: str = DEFAULT_PROJECT, port: int = DEFAULT_PORT,
            *, on_step: ProgressFn | None = None,
            on_output: OutputFn | None = None) -> tuple[bool, str]:
    """Build + start the stack, then VERIFY it is running and healthy.

    Guards (each returns ``(False, ...)``): invalid port, Docker down,
    missing compose file, occupied port. If the app is already running it
    returns ``(True, ...)``.

    Emits step labels through ``on_step`` and streams the Docker build's
    output line-by-line through ``on_output`` (the first build takes
    minutes, so the user must see it move). Both callbacks are optional
    and Tk-free; the GUI marshals them onto its own thread.
    """
    valid, reason = _validate_port(port)
    if not valid:
        return False, reason
    _notify(on_step, "Checking Docker...")
    docker_ok, _ = check_docker()
    if not docker_ok:
        return False, _DOCKER_UNAVAILABLE
    if get_state(project) == "running":
        return True, "Bibliogon is already installed and running."
    if not Path(compose_file).is_file():
        return False, f"Compose file not found: {compose_file}"
    port_free, port_msg = check_port(port)
    if not port_free:
        return False, port_msg
    _notify(on_step, "Docker is running")

    _notify(on_step, "Building images... (the first build can take several minutes)")
    try:
        build_rc, build_tail = _stream_compose(
            project, compose_file, "build", on_output=on_output, timeout=1800.0)
    except FileNotFoundError:
        return False, _DOCKER_UNAVAILABLE
    except subprocess.TimeoutExpired:
        return False, "The Docker build exceeded the time limit (30 min)."
    if build_rc != 0:
        return False, f"Docker build failed:\n{build_tail}"
    _notify(on_step, "Images built")

    _notify(on_step, "Starting containers...")
    try:
        up_rc, up_tail = _stream_compose(
            project, compose_file, "up", "-d", on_output=on_output, timeout=180.0)
    except FileNotFoundError:
        return False, _DOCKER_UNAVAILABLE
    except subprocess.TimeoutExpired:
        return False, "Start exceeded the time limit."
    if up_rc != 0:
        return False, f"Start failed:\n{up_tail}"
    _notify(on_step, "Containers started")

    _notify(on_step, "Checking readiness...")
    if get_state(project) != "running":
        return False, "Containers were built but are not running."
    healthy, health_msg = health_check(port, HEALTH_PATH, timeout=120)
    if not healthy:
        return False, f"Installed, but Bibliogon is not reachable: {health_msg}"
    _notify(on_step, "Readiness confirmed")
    return True, "Installation complete. Bibliogon is ready."


def start(compose_file: str, project: str = DEFAULT_PROJECT,
          *, on_step: ProgressFn | None = None,
          on_output: OutputFn | None = None) -> tuple[bool, str]:
    """Start the stack via ``compose up --build -d``, then VERIFY it runs.

    Always passes ``--build`` so a ``git pull`` / code change is picked up
    automatically on the next start; Docker's layer cache makes an
    UNCHANGED rebuild near-instant (a few seconds), so this is cheap. The
    build output streams live through ``on_output`` like :func:`install`.

    ``up --build -d`` also creates the containers if they do not exist yet,
    so it works from BOTH 'stopped' (containers present) AND a removed
    state (containers gone after a remove, images still present). A truly
    missing compose file/images surfaces as the real compose error.
    """
    docker_ok, _ = check_docker()
    if not docker_ok:
        return False, _DOCKER_UNAVAILABLE
    if get_state(project) == "running":
        return True, "Bibliogon is already running."
    _notify(on_step, "Updating images... (minutes after code changes, otherwise seconds)")
    try:
        rc, tail = _stream_compose(
            project, compose_file, "up", "--build", "-d",
            on_output=on_output, timeout=1800.0)
    except FileNotFoundError:
        return False, _DOCKER_UNAVAILABLE
    except subprocess.TimeoutExpired:
        return False, "Start exceeded the time limit."
    if rc != 0:
        return False, f"Start failed:\n{tail}"
    if get_state(project) != "running":
        return False, "The start command ran, but no container is running."
    return True, "Bibliogon started."


def stop(project: str = DEFAULT_PROJECT) -> tuple[bool, str]:
    """Stop the running containers, then VERIFY none are running.

    Uses ``docker stop`` by id so the containers REMAIN (state -> stopped),
    keeping data + images for a fast restart. Verified.
    """
    docker_ok, _ = check_docker()
    if not docker_ok:
        return False, _DOCKER_UNAVAILABLE
    state = get_state(project)
    if state == "not_installed":
        return False, "Bibliogon is not installed."
    if state == "stopped":
        return True, "Bibliogon was already stopped."
    running = _project_container_ids(running_only=True)
    try:
        _run(["docker", "stop", *running], timeout=60.0)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, f"Stop failed: {exc}"
    if _project_container_ids(running_only=True):
        return False, "A container is still running after the stop command."
    return True, "Bibliogon stopped."


def uninstall(project: str = DEFAULT_PROJECT) -> tuple[bool, str]:
    """Force-remove containers (and images), then VERIFY they are gone.

    Removes by id (``docker rm -f``) so it works regardless of the compose
    directory, and re-lists to confirm - never claims success while a
    container survives. Volumes are PRESERVED (book data survives a
    reinstall).
    """
    docker_ok, _ = check_docker()
    if not docker_ok:
        return False, _DOCKER_UNAVAILABLE
    ids = _project_container_ids(running_only=False)
    if not ids:
        return True, "Nothing to uninstall (no container present)."
    try:
        _run(["docker", "rm", "-f", *ids], timeout=60.0)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, f"Removal failed: {exc}"
    remaining = _project_container_ids(running_only=False)
    if remaining:
        return False, f"Partially removed: {len(remaining)} container(s) could not be removed."
    _remove_images()  # best-effort, frees disk; never blocks success
    return True, "Uninstall complete. Your book data is preserved."


def _remove_images() -> None:
    ok, detail = remove_images()
    if not ok:
        logger.warning("image removal failed: %s", detail)


def remove_images() -> tuple[bool, str]:
    """Remove all Bibliogon Docker images."""
    try:
        result = _run([
            "docker", "images",
            "--filter", "reference=*bibliogon*",
            "-q",
        ])
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True, "Docker unavailable, skipped."
    images = [i for i in (result.stdout or "").strip().splitlines() if i]
    if not images:
        return True, "No images found."
    try:
        _run(["docker", "image", "rm", "--force", *images], timeout=60.0)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, f"Image removal failed: {exc}"
    return True, f"{len(images)} image(s) removed."


def remove_volumes() -> tuple[bool, str]:
    """Remove the Bibliogon Docker volumes.

    DESTRUCTIVE - deletes book data. Only a full-reset path calls this; the
    normal uninstall preserves volumes.
    """
    try:
        result = _run([
            "docker", "volume", "ls",
            "--filter", "name=bibliogon",
            "-q",
        ])
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True, "Docker unavailable, skipped."
    volumes = [v for v in (result.stdout or "").strip().splitlines() if v]
    if not volumes:
        return True, "No volumes found."
    try:
        _run(["docker", "volume", "rm", *volumes], timeout=30.0)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, f"Volume removal failed: {exc}"
    return True, f"{len(volumes)} volume(s) removed."


def compose_logs_tail(repo: Path, compose_file: str, lines: int = 20) -> str:
    """Return the last ``lines`` of compose output, for error diagnostics."""
    try:
        result = _run(
            ["docker", "compose", "-f", compose_file, "logs", "--tail", str(lines)],
            cwd=repo, timeout=15.0,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    return (result.stdout or "").strip() or (result.stderr or "").strip()


# --- Health + browser -----------------------------------------------------

def _health_probe(port: int, path: str = HEALTH_PATH) -> tuple[bool, str]:
    """One shot: (healthy, detail). Healthy == HTTP 200 AND JSON
    ``status == "ok"`` (strict). A 5xx is surfaced as a server error."""
    url = f"http://localhost:{port}{path}"
    try:
        with urllib.request.urlopen(url, timeout=3.0) as resp:
            status = resp.status
            body = resp.read().decode("utf-8") if status == 200 else ""
    except Exception as exc:  # noqa: BLE001 - any failure means not-ready-yet
        return False, str(exc)
    if status == 200:
        try:
            if json.loads(body).get("status") == "ok":
                return True, "Bibliogon is reachable and healthy (status=ok)."
            return False, "Response received, but status != ok"
        except json.JSONDecodeError:
            return False, "invalid JSON response"
    if 500 <= status < 600:
        return False, f"Server error (HTTP {status})"
    return False, f"HTTP {status}"


def is_healthy(port: int, path: str = HEALTH_PATH) -> bool:
    """One-shot health check (no polling). True == healthy now."""
    return _health_probe(port, path)[0]


def health_check(port: int, path: str = HEALTH_PATH, timeout: int = 30) -> tuple[bool, str]:
    """Poll :func:`_health_probe` until healthy or ``timeout`` elapses."""
    deadline = time.monotonic() + timeout
    last = "no response"
    while time.monotonic() < deadline:
        ok, detail = _health_probe(port, path)
        if ok:
            return True, detail
        last = detail
        time.sleep(1.0)
    return False, f"Bibliogon not reachable after {timeout}s ({last})."


def open_browser(port: int, path: str = "/") -> None:
    """Open the app in the default browser. Never raises."""
    url = f"http://localhost:{port}{path}"
    logger.debug("open browser: %s", url)
    try:
        webbrowser.open(url)
    except OSError as exc:
        logger.warning("could not open browser: %s", exc)


# --- Version + config -----------------------------------------------------

def get_version() -> str:
    """Return the launcher/app version string."""
    return __version__


def load_config(path: Path) -> dict:
    """Load JSON config from ``path``; return ``{}`` when absent/unreadable."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_config(path: Path, config: dict) -> None:
    """Write ``config`` as pretty JSON to ``path`` (creating parent dirs)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, sort_keys=True), encoding="utf-8")


def _validate_port(port: int) -> tuple[bool, str]:
    if not isinstance(port, int) or not (MIN_PORT <= port <= MAX_PORT):
        return False, f"Port must be between {MIN_PORT} and {MAX_PORT}."
    return True, ""


def set_port(path: Path, port: int) -> tuple[bool, str]:
    """Validate (1024-65535) and persist ``port`` into the JSON config."""
    valid, reason = _validate_port(port)
    if not valid:
        return False, reason
    config = load_config(path)
    config["port"] = port
    save_config(path, config)
    return True, f"Port set to {port}."
