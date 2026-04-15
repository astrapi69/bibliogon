"""Launcher entry point. Orchestrates docker check, repo resolve, compose up,
health wait, browser open, user-controlled stop, compose down.

The flow is intentionally linear: each step has a concrete error dialog
on failure so the user always knows what to do next. Heavy work runs on
a background thread so the Tk event loop stays responsive.

User-facing text in this file is intentionally free of internal file
names, config keys, and raw subprocess output. When a user sees a
dialog they should see plain-language guidance, not developer traces.
Raw details go to launcher.log under %APPDATA%\\Bibliogon so
troubleshooting is possible without leaking complexity into the UI.
"""

from __future__ import annotations

import logging
import shutil
import sys
import webbrowser
from pathlib import Path

from bibliogon_launcher import __version__, config, docker, health, lockfile, ui


logger = logging.getLogger("bibliogon_launcher")

INSTALL_GUIDE_URL = "https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/launcher-windows.md"
DOCKER_INSTALL_URL = "https://docs.docker.com/desktop/install/windows-install/"


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
    show_details = config.get_show_details_default()

    # 1. Docker installed?
    ok, detail = docker.docker_installed()
    if not ok:
        logger.error("docker --version failed: %s", detail)
        ui.error_dialog(
            title="Docker Desktop is required",
            message=(
                "Bibliogon needs Docker Desktop to run.\n\n"
                f"You can download it from:\n{DOCKER_INSTALL_URL}\n\n"
                "Install Docker Desktop, start it, then open Bibliogon again."
            ),
            actions=[("OK", "ok")],
            details=f"docker --version check failed:\n{detail}",
            help_url=DOCKER_INSTALL_URL,
            initial_show_details=show_details,
        )
        return 1

    # 2. Docker daemon running? Retry loop: user may need to start Docker Desktop.
    for attempt in range(3):
        ok, detail = docker.docker_daemon_running()
        if ok:
            break
        logger.warning("docker info failed (attempt %d): %s", attempt + 1, detail)
        choice = ui.error_dialog(
            title="Docker Desktop is not running",
            message=(
                "Docker Desktop needs to be running before Bibliogon can start.\n\n"
                "Open Docker Desktop, wait for it to finish starting, then click Retry."
            ),
            actions=[("Retry", "retry"), ("Cancel", "cancel")],
            details=f"docker info attempt {attempt + 1} failed:\n{detail}",
            help_url=INSTALL_GUIDE_URL,
            initial_show_details=show_details,
        )
        if choice != "retry":
            return 1
    else:
        ui.error_dialog(
            title="Docker Desktop is not running",
            message=(
                "Docker Desktop is still not running after several attempts.\n\n"
                "Please start Docker Desktop and open Bibliogon again."
            ),
            actions=[("OK", "ok")],
            details="docker info failed on three consecutive retries.",
            help_url=INSTALL_GUIDE_URL,
            initial_show_details=show_details,
        )
        return 1

    # 3. Locate repo. Two distinct cases on "not found":
    #    a) launcher.json does not exist  -> Bibliogon has likely never
    #       been installed on this machine; show a welcome dialog that
    #       points at the install guide (no folder picker; it would be
    #       a dead end for a user who has nothing to pick).
    #    b) launcher.json exists with a repo_path that no longer
    #       resolves -> the installation moved or was deleted; offer
    #       the three-button folder-picker-or-install-guide dialog.
    repo = config.resolve_repo_path()
    if not config.is_valid_repo(repo):
        had_previous_install = config.launcher_config_path().is_file()
        if had_previous_install:
            repo = _installation_moved_picker()
        else:
            _welcome_not_installed()
            return 0
        if repo is None:
            return 1

    # 4. Ensure configuration file exists (generated on first run).
    ok, detail = _ensure_env_file(repo)
    if not ok:
        logger.error("env-file preparation failed: %s", detail)
        ui.error_dialog(
            title="Could not prepare Bibliogon",
            message=(
                "Bibliogon's configuration could not be prepared. This is usually a "
                "file-permissions problem with the Bibliogon folder.\n\n"
                "Check that you have write access to the Bibliogon folder and try again."
            ),
            actions=[("OK", "ok")],
            details=(
                f"Preparation of configuration in {repo} failed:\n{detail}\n\n"
                f"Expected template: {config.ENV_EXAMPLE_FILENAME}\n"
                f"Target: {config.ENV_FILENAME}"
            ),
            help_url=INSTALL_GUIDE_URL,
            initial_show_details=show_details,
        )
        return 1

    port = config.read_port(repo)

    # 5. Launch status window, run docker compose + health wait + browser on a
    # background thread so the UI stays responsive.
    window = ui.StatusWindow()
    window.set_starting("Starting Bibliogon...")

    def worker() -> None:
        ok, up_detail = docker.compose_up(repo, config.COMPOSE_FILENAME)
        if not ok:
            logger.error("compose up failed: %s", up_detail)
            window.after(0, lambda: _handle_compose_failure(window, port, up_detail, show_details))
            return

        window.after(0, lambda: window.set_starting("Almost ready..."))
        if not health.wait_for_healthy(port, timeout_seconds=60.0):
            tail = docker.compose_logs_tail(repo, config.COMPOSE_FILENAME, lines=20)
            logger.error("health timeout; last lines:\n%s", tail)
            window.after(0, lambda: _handle_health_timeout(window, repo, port, tail, show_details))
            return

        url = f"http://localhost:{port}"
        try:
            opened = webbrowser.open(url)
        except OSError as exc:
            logger.warning("webbrowser.open failed: %s", exc)
            opened = False
        if not opened:
            window.after(0, lambda: ui.ask_copyable_url(url))

        window.after(0, lambda: window.set_running(port, on_stop=lambda: _shutdown(window, repo)))

    window.run_in_background(worker)

    # User-triggered close also runs shutdown (handler wired in StatusWindow).
    window.run_mainloop()
    return 0


# --- Step helpers ---


def _welcome_not_installed() -> None:
    """First-run welcome: Bibliogon has never been installed here.

    The launcher is a start/stop wrapper; it cannot install Bibliogon
    for the user. Offering a folder picker in this state is a dead end
    because the user has nothing to pick. Instead, explain that and
    point them at the install guide. If they really did install to a
    custom location, they can hand-edit launcher.json or re-run the
    launcher after installing to the default location.
    """
    choice = ui.two_button_dialog(
        title="Welcome to Bibliogon",
        message=(
            "Bibliogon is not installed on this computer yet.\n\n"
            "The launcher starts Bibliogon for you once it is installed. "
            "Follow the installation guide first, then run the launcher "
            "again."
        ),
        primary_label="Open install guide",
        secondary_label="Close",
    )
    if choice == "primary":
        try:
            webbrowser.open(INSTALL_GUIDE_URL)
        except OSError as exc:
            logger.warning("opening install guide failed: %s", exc)


def _installation_moved_picker() -> Path | None:
    """Bibliogon was launched here before but the remembered folder no
    longer resolves. Offer folder picker or install guide.

    Three buttons: Choose folder / Open install guide / Cancel.
    """
    message = (
        "Bibliogon could not be found at the folder we remembered from "
        "last time.\n\n"
        "If you moved or renamed the Bibliogon folder, click 'Choose "
        "folder' and point to the new location.\n\n"
        "If you removed Bibliogon and have not reinstalled it yet, "
        "click 'Open install guide'."
    )
    while True:
        choice = ui.three_button_dialog(
            title="Bibliogon installation moved",
            message=message,
            primary_label="Choose folder",
            secondary_label="Open install guide",
            cancel_label="Cancel",
        )
        if choice == "cancel":
            return None
        if choice == "secondary":
            try:
                webbrowser.open(INSTALL_GUIDE_URL)
            except OSError as exc:
                logger.warning("opening install guide failed: %s", exc)
            return None
        picked = ui.pick_folder("Choose the Bibliogon folder")
        if picked is None:
            continue  # back to the three-button dialog
        repo = Path(picked)
        if config.is_valid_repo(repo):
            cfg = config.load_launcher_config()
            cfg["repo_path"] = str(repo)
            config.save_launcher_config(cfg)
            return repo
        retry = ui.ask_retry_quit(
            "Not a Bibliogon folder",
            "This folder does not look like a Bibliogon installation.\n\n"
            "Please choose the folder where you installed Bibliogon.",
        )
        if not retry:
            return None


def _ensure_env_file(repo: Path) -> tuple[bool, str]:
    """Create the configuration file on first run. Details go to the log."""
    env_file = repo / config.ENV_FILENAME
    if env_file.is_file():
        return True, "ok"
    example = repo / config.ENV_EXAMPLE_FILENAME
    if not example.is_file():
        return False, f"neither {config.ENV_FILENAME} nor {config.ENV_EXAMPLE_FILENAME} exist in {repo}"
    try:
        shutil.copyfile(example, env_file)
    except OSError as exc:
        return False, f"copy failed: {exc}"
    try:
        _replace_secret_placeholder(env_file)
    except OSError as exc:
        return False, f"secret generation failed: {exc}"
    return True, "created"


def _replace_secret_placeholder(env_file: Path) -> None:
    import secrets
    text = env_file.read_text(encoding="utf-8")
    text = text.replace("change-me-to-a-random-secret", secrets.token_hex(32))
    env_file.write_text(text, encoding="utf-8")


def _handle_compose_failure(window: ui.StatusWindow, port: int, detail: str, show_details: bool) -> None:
    ui.error_dialog(
        title="Could not start Bibliogon",
        message=(
            "Bibliogon could not start. This usually happens when another "
            f"program is using port {port}, or when Docker Desktop is having "
            "trouble.\n\n"
            "Try the following: close other programs that might use the same "
            "port, restart Docker Desktop, then open Bibliogon again."
        ),
        actions=[("OK", "ok")],
        details=f"docker compose -f {config.COMPOSE_FILENAME} up -d failed:\n{detail}",
        help_url=INSTALL_GUIDE_URL,
        initial_show_details=show_details,
    )
    window.close()


def _handle_health_timeout(
    window: ui.StatusWindow,
    repo: Path,
    port: int,
    tail: str,
    show_details: bool,
) -> None:
    choice = ui.error_dialog(
        title="Bibliogon is taking longer than expected",
        message=(
            "Bibliogon did not finish starting within a minute.\n\n"
            "This can happen on the first start when Docker needs to prepare "
            "the application for the first time.\n\n"
            "Click Retry to wait another minute, or Cancel to shut down."
        ),
        actions=[("Retry", "retry"), ("Cancel", "cancel")],
        details=(
            f"GET http://localhost:{port}/api/health did not respond in 60 s.\n\n"
            f"Last 20 log lines from docker compose -f {config.COMPOSE_FILENAME}:\n{tail}"
        ),
        help_url=INSTALL_GUIDE_URL,
        initial_show_details=show_details,
    )
    if choice == "retry":
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
        logger.warning("shutdown failed: %s", detail)
    window.close()


def _handle_already_running() -> None:
    repo = config.resolve_repo_path()
    port = config.read_port(repo) if config.is_valid_repo(repo) else config.DEFAULT_PORT
    url = f"http://localhost:{port}"
    ui.info_box(
        "Bibliogon is already open",
        "Bibliogon is already running. Your browser will switch to it.",
    )
    try:
        webbrowser.open(url)
    except OSError as exc:
        logger.warning("webbrowser.open failed: %s", exc)


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
