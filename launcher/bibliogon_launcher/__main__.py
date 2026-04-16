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

from bibliogon_launcher import __version__, config, docker, health, installer, lockfile, manifest, ui


logger = logging.getLogger("bibliogon_launcher")

INSTALL_GUIDE_URL = "https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/launcher-windows.md"
DOCKER_INSTALL_URL = "https://docs.docker.com/desktop/install/windows-install/"


def main() -> int:
    _setup_logging()
    logger.info("Bibliogon launcher v%s starting", __version__)

    lock_path = config.lockfile_path()
    try:
        if lockfile.another_instance_alive(lock_path):
            _handle_already_running()
            return 0
    except Exception as exc:
        # Fail open: if the lockfile check crashes for any reason
        # (stdout=None on Windows locale edge case, file encoding,
        # unexpected OS state), assume no other instance and proceed.
        # A false negative (two launchers running) is recoverable;
        # a crash that blocks every single launch is not.
        logger.warning("lockfile check failed, proceeding anyway: %s", exc)
    try:
        lockfile.write_lock(lock_path)
    except Exception as exc:
        logger.warning("could not write lockfile: %s", exc)
    try:
        return _run_launcher()
    finally:
        lockfile.clear_lock(lock_path)


def _run_launcher() -> int:
    show_details = config.get_show_details_default()

    # 0. Retry pending cleanup from a previously interrupted uninstall.
    _retry_pending_cleanup()

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

    # 3. Locate repo via manifest or legacy launcher.json.
    #    Priority: manifest (written by installer) > launcher.json (legacy).
    #    Three cases:
    #    a) manifest exists + install_dir valid -> proceed
    #    b) manifest exists + install_dir missing -> treat as not installed
    #    c) no manifest -> check legacy launcher.json, else show install UI
    mdata = manifest.read_manifest()
    if mdata and mdata.get("install_dir"):
        repo = Path(mdata["install_dir"])
        if not config.is_valid_repo(repo):
            logger.warning("Manifest points at %s but it is not a valid repo", repo)
            mdata = None  # fall through to install UI

    if mdata is None:
        # Try legacy launcher.json
        repo = config.resolve_repo_path()
        if config.is_valid_repo(repo):
            # Migrate: write manifest so future starts skip legacy path
            try:
                manifest.write_manifest(repo, installer.COMPATIBLE_VERSION)
            except Exception as exc:
                logger.warning("Could not write manifest during migration: %s", exc)
            mdata = manifest.read_manifest()
        else:
            had_previous_install = config.launcher_config_path().is_file()
            if had_previous_install:
                repo = _installation_moved_picker()
            else:
                repo = _install_or_welcome()
            if repo is None:
                return 0
            mdata = manifest.read_manifest()

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


def _retry_pending_cleanup() -> None:
    """Silently retry any incomplete uninstall from a previous session.

    Reads cleanup.json. For each step still marked False, retries it.
    Updates cleanup.json after each successful retry. Deletes the file
    when all steps are done. Never blocks or shows dialogs except a
    one-time warning if rmtree still fails (the user may need to
    delete the directory manually).
    """
    pending = manifest.read_cleanup_pending()
    if pending is None:
        return

    steps = pending.get("steps", {})
    install_dir = Path(pending.get("install_dir", ""))
    logger.info("Pending cleanup found from %s, retrying...", pending.get("pending_since", "?"))

    if not steps.get("compose_down"):
        ok, _ = docker.compose_down(install_dir, config.COMPOSE_FILENAME)
        manifest.update_cleanup_step("compose_down", ok)

    if not steps.get("remove_volumes"):
        ok, _ = docker.remove_volumes()
        manifest.update_cleanup_step("remove_volumes", ok)

    if not steps.get("remove_images"):
        ok, _ = docker.remove_images()
        manifest.update_cleanup_step("remove_images", ok)

    if not steps.get("rmtree"):
        ok, detail = installer.remove_install(install_dir)
        manifest.update_cleanup_step("rmtree", ok)
        if not ok and install_dir.exists():
            logger.warning("Pending rmtree still failed: %s", detail)
            ui.error_dialog(
                title="Previous uninstall incomplete",
                message=(
                    f"Bibliogon could not be fully removed from:\n{install_dir}\n\n"
                    "You may need to delete this folder manually."
                ),
                actions=[("OK", "ok")],
                details=detail,
                initial_show_details=config.get_show_details_default(),
            )

    if not steps.get("delete_manifest"):
        manifest.delete_manifest()
        manifest.update_cleanup_step("delete_manifest", True)

    # Check if everything is now done
    updated = manifest.read_cleanup_pending()
    if manifest.all_cleanup_done(updated):
        manifest.delete_cleanup_pending()
        logger.info("Pending cleanup completed successfully.")
    else:
        logger.warning("Pending cleanup still has incomplete steps.")


def _install_or_welcome() -> Path | None:
    """First-run welcome: offer to install Bibliogon or open the guide.

    Returns the install directory on success, or None if the user
    cancelled or only opened the guide.
    """
    choice = ui.three_button_dialog(
        title="Welcome to Bibliogon",
        message=(
            "Bibliogon is not installed on this computer yet.\n\n"
            "Click 'Install' to download and set up Bibliogon automatically, "
            "or 'Open install guide' for manual installation instructions."
        ),
        primary_label="Install",
        secondary_label="Open install guide",
        cancel_label="Close",
    )
    if choice == "cancel":
        return None
    if choice == "secondary":
        try:
            webbrowser.open(INSTALL_GUIDE_URL)
        except OSError as exc:
            logger.warning("opening install guide failed: %s", exc)
        return None

    # User chose "Install" -> pick folder, download, extract
    return _run_install_flow()


def _run_install_flow() -> Path | None:
    """Download and install Bibliogon, returning the install dir on success."""
    show_details = config.get_show_details_default()
    target = config.default_repo_path()

    # Let user pick a custom folder (pre-filled with default)
    picked = ui.pick_folder("Choose installation folder", initial_dir=str(target.parent))
    if picked is None:
        return None
    target = Path(picked) if picked else target

    # Show status window during download + extract
    window = ui.StatusWindow()
    window.set_starting(f"Downloading Bibliogon v{installer.COMPATIBLE_VERSION}...")

    result: dict = {}

    def worker() -> None:
        # Phase 1: Download and extract
        ok, detail = installer.download_release(target)
        if not ok:
            result["error"] = detail
            window.after(0, window.destroy)
            return
        window.after(0, lambda: window.set_starting("Preparing configuration..."))
        ok2, detail2 = installer.create_env_file(target)
        if not ok2:
            logger.warning("env file creation: %s", detail2)
        # Write manifest
        try:
            manifest.write_manifest(target, installer.COMPATIBLE_VERSION)
        except Exception as exc:
            result["error"] = f"Could not write manifest: {exc}"
            window.after(0, window.destroy)
            return
        # Save to legacy config too for backward compat
        cfg = config.load_launcher_config()
        cfg["repo_path"] = str(target)
        config.save_launcher_config(cfg)

        # Phase 2: Build and start Docker stack
        window.after(0, lambda: window.set_starting("Building Docker images (first time, may take a few minutes)..."))
        ok3, detail3 = docker.compose_build(target, config.COMPOSE_FILENAME)
        if not ok3:
            result["error"] = f"Docker build failed:\n{detail3}"
            window.after(0, window.destroy)
            return

        # Phase 3: Wait for health
        window.after(0, lambda: window.set_starting("Waiting for Bibliogon to be ready..."))
        port = config.read_port(target)
        if not health.wait_for_healthy(port, timeout_seconds=120.0):
            # Not fatal: stack may still be starting
            result["slow_start"] = True

        result["ok"] = True
        result["port"] = port
        window.after(0, window.destroy)

    window.run_in_background(worker)
    window.run_mainloop()

    if result.get("error"):
        ui.error_dialog(
            title="Installation failed",
            message=(
                "Bibliogon could not be installed. Check your internet "
                "connection and try again."
            ),
            actions=[("OK", "ok")],
            details=result["error"],
            initial_show_details=show_details,
        )
        return None

    if result.get("ok"):
        port = result.get("port", config.DEFAULT_PORT)
        if result.get("slow_start"):
            choice = ui.two_button_dialog(
                title="Installation complete",
                message=(
                    f"Bibliogon v{installer.COMPATIBLE_VERSION} has been installed.\n\n"
                    "The application is taking longer than expected to start. "
                    "It may still be starting in the background.\n\n"
                    "Open in browser anyway?"
                ),
                primary_label="Open browser",
                secondary_label="Close",
            )
        else:
            choice = ui.two_button_dialog(
                title="Installation complete",
                message=(
                    f"Bibliogon v{installer.COMPATIBLE_VERSION} is installed and running.\n\n"
                    f"Opening http://localhost:{port} in your browser."
                ),
                primary_label="Open browser",
                secondary_label="Close",
            )
        if choice == "primary":
            try:
                webbrowser.open(f"http://localhost:{port}")
            except OSError as exc:
                logger.warning("browser open failed: %s", exc)
        return target

    return None


def _run_uninstall_flow(install_dir: Path) -> bool:
    """Uninstall Bibliogon after user confirmation. Returns True if uninstalled."""
    show_details = config.get_show_details_default()
    choice = ui.two_button_dialog(
        title="Uninstall Bibliogon",
        message=(
            f"This will remove Bibliogon from:\n{install_dir}\n\n"
            "This also removes all Docker containers, volumes (book data), "
            "and images.\n\n"
            "Export your books first if you want to keep them.\n"
            "Continue?"
        ),
        primary_label="Uninstall",
        secondary_label="Cancel",
    )
    if choice != "primary":
        return False

    # Write cleanup state BEFORE any destructive operation so a crash
    # or abort mid-uninstall can be retried on next launcher start.
    manifest.write_cleanup_pending(install_dir)

    # Phase 1: Stop Docker stack (best-effort, continue if Docker is not running)
    window = ui.StatusWindow()
    window.set_starting("Stopping Bibliogon...")

    def uninstall_worker() -> None:
        ok, detail = docker.compose_down(install_dir, config.COMPOSE_FILENAME)
        manifest.update_cleanup_step("compose_down", ok)
        if not ok:
            logger.warning("compose down: %s", detail)

        window.after(0, lambda: window.set_starting("Removing data volumes..."))
        ok2, detail2 = docker.remove_volumes()
        manifest.update_cleanup_step("remove_volumes", ok2)
        if not ok2:
            logger.warning("remove volumes: %s", detail2)

        window.after(0, lambda: window.set_starting("Removing Docker images..."))
        ok3, detail3 = docker.remove_images()
        manifest.update_cleanup_step("remove_images", ok3)
        if not ok3:
            logger.warning("remove images: %s", detail3)

        window.after(0, window.destroy)

    window.run_in_background(uninstall_worker)
    window.run_mainloop()

    # Phase 2: Remove install directory
    ok, detail = installer.remove_install(install_dir)
    manifest.update_cleanup_step("rmtree", ok)
    if not ok:
        ui.error_dialog(
            title="Uninstall failed",
            message=(
                "Bibliogon could not be fully removed. Please stop Docker "
                "Desktop and close any programs using the Bibliogon folder, "
                "then try again."
            ),
            actions=[("OK", "ok")],
            details=detail,
            initial_show_details=show_details,
        )
        return False

    # Phase 3: Clean up manifest and legacy config
    manifest.delete_manifest()
    manifest.update_cleanup_step("delete_manifest", True)
    try:
        cfg = config.load_launcher_config()
        cfg.pop("repo_path", None)
        config.save_launcher_config(cfg)
    except Exception:
        pass

    # All steps done: remove cleanup state file
    manifest.delete_cleanup_pending()

    ui.two_button_dialog(
        title="Uninstall complete",
        message="Bibliogon has been uninstalled.",
        primary_label="OK",
        secondary_label="",
    )
    return True


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
    from logging.handlers import RotatingFileHandler

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")

    # Handler 1: legacy launcher.log under APPDATA/Bibliogon/
    legacy_path = config.logfile_path()
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_handler = logging.FileHandler(str(legacy_path), encoding="utf-8")
    legacy_handler.setFormatter(fmt)
    root.addHandler(legacy_handler)

    # Handler 2: install.log under platformdirs config dir (lowercase
    # "bibliogon"), rotated at 1 MB. This is the activity log that
    # records install/uninstall events for troubleshooting.
    try:
        activity_path = manifest.manifest_path().parent / "install.log"
        activity_path.parent.mkdir(parents=True, exist_ok=True)
        activity_handler = RotatingFileHandler(
            str(activity_path), maxBytes=1_000_000, backupCount=1, encoding="utf-8",
        )
        activity_handler.setFormatter(fmt)
        root.addHandler(activity_handler)
    except OSError:
        pass  # Never crash because activity logging setup failed


if __name__ == "__main__":
    sys.exit(main())
