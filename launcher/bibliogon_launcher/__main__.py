"""Launcher entry point. Orchestrates docker check, repo resolve, compose up,
health wait, browser open, user-controlled stop, compose down.

The flow is intentionally linear: each step has a concrete error dialog
on failure so the user always knows what to do next. Heavy work runs on
a background thread so the Tk event loop stays responsive.
"""

from __future__ import annotations

import logging
import shutil
import sys
import webbrowser
from pathlib import Path

from bibliogon_launcher import __version__, config, docker, health, lockfile, ui


logger = logging.getLogger("bibliogon_launcher")


def main() -> int:
    _setup_logging()
    logger.info("Bibliogon launcher v%s starting", __version__)

    lock_path = config.lockfile_path()
    if lockfile.another_instance_alive(lock_path):
        _handle_already_running()
        return 0
    lockfile.write_lock(lock_path)
    try:
        return _run_launcher()
    finally:
        lockfile.clear_lock(lock_path)


def _run_launcher() -> int:
    # 1. Docker installed?
    ok, detail = docker.docker_installed()
    if not ok:
        ui.error_box(
            "Docker is required",
            "Bibliogon needs Docker Desktop to run.\n\n"
            "Install from https://docs.docker.com/desktop/install/windows-install/\n"
            "and then start Bibliogon again.\n\n"
            f"Details: {detail}",
        )
        return 1

    # 2. Docker daemon running? Retry loop: user may need to start Docker Desktop.
    for attempt in range(3):
        ok, detail = docker.docker_daemon_running()
        if ok:
            break
        retry = ui.ask_retry_quit(
            "Docker Desktop is not running",
            "Docker Desktop does not appear to be running.\n\n"
            "Start Docker Desktop, wait for it to finish starting, then click Retry.\n\n"
            f"Details: {detail}",
        )
        if not retry:
            return 1
    else:
        ui.error_box("Docker Desktop is not running", "Giving up after 3 attempts. Start Docker Desktop and try again.")
        return 1

    # 3. Locate repo. If missing, ask the user to pick the folder once.
    repo = config.resolve_repo_path()
    if not config.is_valid_repo(repo):
        repo = _first_run_repo_picker(repo)
        if repo is None:
            return 1

    # 4. Ensure .env exists (copy from .env.example, generate secret).
    ok, detail = _ensure_env_file(repo)
    if not ok:
        ui.error_box("Configuration failed", detail)
        return 1

    port = config.read_port(repo)

    # 5. Launch status window, run docker compose + health wait + browser on a
    # background thread so the UI stays responsive.
    window = ui.StatusWindow()
    window.set_starting("Starting Docker containers...")

    def worker() -> None:
        ok, up_detail = docker.compose_up(repo, config.COMPOSE_FILENAME)
        if not ok:
            window.after(0, lambda: _handle_compose_failure(window, up_detail))
            return

        window.after(0, lambda: window.set_starting("Waiting for Bibliogon to answer..."))
        if not health.wait_for_healthy(port, timeout_seconds=60.0):
            tail = docker.compose_logs_tail(repo, config.COMPOSE_FILENAME, lines=20)
            window.after(0, lambda: _handle_health_timeout(window, repo, port, tail))
            return

        url = f"http://localhost:{port}"
        try:
            opened = webbrowser.open(url)
        except OSError:
            opened = False
        if not opened:
            window.after(0, lambda: ui.ask_copyable_url(url))

        window.after(0, lambda: window.set_running(port, on_stop=lambda: _shutdown(window, repo)))

    window.run_in_background(worker)

    # User-triggered close also runs shutdown (handler wired in StatusWindow).
    window.run_mainloop()
    return 0


# --- Step helpers ---


def _first_run_repo_picker(initial: Path) -> Path | None:
    """Ask the user to pick the repo folder and persist the choice."""
    ui.info_box(
        "Bibliogon install not found",
        f"Bibliogon is not installed at the default location:\n  {initial}\n\n"
        "Click OK and pick the folder where you installed Bibliogon (the folder that contains "
        f"{config.COMPOSE_FILENAME}).",
    )
    for _ in range(3):
        picked = ui.pick_folder("Pick the Bibliogon folder")
        if picked is None:
            return None
        repo = Path(picked)
        if config.is_valid_repo(repo):
            cfg = config.load_launcher_config()
            cfg["repo_path"] = str(repo)
            config.save_launcher_config(cfg)
            return repo
        retry = ui.ask_retry_quit(
            "Not a Bibliogon folder",
            f"{picked}\n\ndoes not contain {config.COMPOSE_FILENAME}. Pick the folder you installed "
            "Bibliogon into, typically %USERPROFILE%\\bibliogon.",
        )
        if not retry:
            return None
    return None


def _ensure_env_file(repo: Path) -> tuple[bool, str]:
    """Copy .env.example to .env if missing; generate a random secret."""
    env_file = repo / config.ENV_FILENAME
    if env_file.is_file():
        return True, "ok"
    example = repo / config.ENV_EXAMPLE_FILENAME
    if not example.is_file():
        return False, f"Neither .env nor .env.example exist in {repo}"
    try:
        shutil.copyfile(example, env_file)
    except OSError as exc:
        return False, f"Could not copy .env.example to .env: {exc}"
    try:
        _replace_secret_placeholder(env_file)
    except OSError as exc:
        return False, f"Could not write generated secret into .env: {exc}"
    return True, "created"


def _replace_secret_placeholder(env_file: Path) -> None:
    import secrets
    text = env_file.read_text(encoding="utf-8")
    text = text.replace("change-me-to-a-random-secret", secrets.token_hex(32))
    env_file.write_text(text, encoding="utf-8")


def _handle_compose_failure(window: ui.StatusWindow, detail: str) -> None:
    ui.error_box(
        "Could not start Bibliogon",
        "docker compose up failed. This is often caused by a port conflict or a Docker daemon problem.\n\n"
        f"Last output:\n{detail}",
    )
    window.close()


def _handle_health_timeout(window: ui.StatusWindow, repo: Path, port: int, tail: str) -> None:
    retry = ui.ask_retry_quit(
        "Bibliogon did not start in time",
        f"Bibliogon did not answer on localhost:{port} within 60 seconds.\n\n"
        f"Last 20 log lines:\n{tail}\n\n"
        "Click Retry to keep waiting another 60 seconds, or Cancel to shut down.",
    )
    if retry:
        if health.wait_for_healthy(port, timeout_seconds=60.0):
            url = f"http://localhost:{port}"
            webbrowser.open(url)
            window.set_running(port, on_stop=lambda: _shutdown(window, repo))
            return
    docker.compose_down(repo, config.COMPOSE_FILENAME)
    window.close()


def _shutdown(window: ui.StatusWindow, repo: Path) -> None:
    window.set_stopping()
    ok, detail = docker.compose_down(repo, config.COMPOSE_FILENAME)
    if not ok:
        logger.warning("compose down failed: %s", detail)
    window.close()


def _handle_already_running() -> None:
    repo = config.resolve_repo_path()
    port = config.read_port(repo) if config.is_valid_repo(repo) else config.DEFAULT_PORT
    url = f"http://localhost:{port}"
    ui.info_box(
        "Bibliogon is already running",
        f"Another launcher instance is running. Opening browser at {url} instead.",
    )
    try:
        webbrowser.open(url)
    except OSError:
        pass


def _setup_logging() -> None:
    log_path = config.logfile_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(log_path),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


if __name__ == "__main__":
    sys.exit(main())
