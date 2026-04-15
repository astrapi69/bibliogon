"""Docker + compose interaction. Kept as thin subprocess wrappers.

Every function returns a ``tuple[ok: bool, detail: str]`` so UI code can
render a concrete error message rather than re-inventing failure strings.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


# Windows-specific: hide the flashing black cmd.exe window when launched
# from a --windowed PyInstaller build. On non-Windows this is a no-op.
_CREATE_NO_WINDOW = 0x08000000


def _creation_flags() -> int:
    import sys
    if sys.platform == "win32":
        return _CREATE_NO_WINDOW
    return 0


def _run(cmd: list[str], *, cwd: Path | None = None, timeout: float = 10.0) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=_creation_flags(),
    )


def docker_installed() -> tuple[bool, str]:
    """True if ``docker --version`` succeeds."""
    try:
        result = _run(["docker", "--version"])
    except FileNotFoundError:
        return False, "docker command not found on PATH"
    except subprocess.TimeoutExpired:
        return False, "docker --version timed out"
    if result.returncode != 0:
        return False, result.stderr.strip() or "docker --version exited non-zero"
    return True, result.stdout.strip()


def docker_daemon_running() -> tuple[bool, str]:
    """True if ``docker info`` succeeds, i.e. the daemon is reachable."""
    try:
        result = _run(["docker", "info"], timeout=15.0)
    except FileNotFoundError:
        return False, "docker command not found on PATH"
    except subprocess.TimeoutExpired:
        return False, "docker info timed out; Docker Desktop may be starting"
    if result.returncode != 0:
        stderr = result.stderr.strip()
        return False, stderr.splitlines()[0] if stderr else "daemon not reachable"
    return True, "running"


def compose_up(repo: Path, compose_file: str) -> tuple[bool, str]:
    """Start the stack detached. Returns the compose output on failure."""
    try:
        result = _run(
            ["docker", "compose", "-f", compose_file, "up", "-d"],
            cwd=repo,
            timeout=120.0,
        )
    except FileNotFoundError:
        return False, "docker command not found on PATH"
    except subprocess.TimeoutExpired:
        return False, "docker compose up timed out after 120s"
    if result.returncode != 0:
        return False, _tail_output(result)
    return True, "started"


def compose_down(repo: Path, compose_file: str) -> tuple[bool, str]:
    try:
        result = _run(
            ["docker", "compose", "-f", compose_file, "down"],
            cwd=repo,
            timeout=60.0,
        )
    except FileNotFoundError:
        return False, "docker command not found on PATH"
    except subprocess.TimeoutExpired:
        return False, "docker compose down timed out after 60s"
    if result.returncode != 0:
        return False, _tail_output(result)
    return True, "stopped"


def compose_logs_tail(repo: Path, compose_file: str, lines: int = 20) -> str:
    """Return the last ``lines`` of container output for error reporting."""
    try:
        result = _run(
            ["docker", "compose", "-f", compose_file, "logs", "--tail", str(lines)],
            cwd=repo,
            timeout=15.0,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return "(logs unavailable)"
    return (result.stdout or result.stderr or "(no output)").strip()


def _tail_output(result: subprocess.CompletedProcess) -> str:
    """Surface the last diagnostic lines, preferring stderr over stdout."""
    text = result.stderr.strip() or result.stdout.strip()
    lines = text.splitlines()
    return "\n".join(lines[-10:]) or "(no output)"
