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

from bibliogon_launcher import __version__, cleanup, config, docker, health, i18n, installer, lockfile, manifest, settings, ui, update_check


logger = logging.getLogger("bibliogon_launcher")

INSTALL_GUIDE_URL = "https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/launcher-windows.md"
DOCKER_INSTALL_URL = "https://docs.docker.com/desktop/install/windows-install/"
DOCKER_GUIDE_URL_EN = "https://github.com/astrapi69/bibliogon/blob/main/docs/help/en/install/docker-desktop.md"
DOCKER_GUIDE_URL_DE = "https://github.com/astrapi69/bibliogon/blob/main/docs/help/de/install/docker-desktop.md"
DOCKER_SECURITY_ANCHOR_EN = DOCKER_GUIDE_URL_EN + "#is-docker-safe-to-install"
DOCKER_SECURITY_ANCHOR_DE = DOCKER_GUIDE_URL_DE + "#ist-docker-sicher-zu-installieren"


def _docker_guide_url() -> str:
    return DOCKER_GUIDE_URL_DE if i18n.active_language() == "de" else DOCKER_GUIDE_URL_EN


def _docker_security_url() -> str:
    return DOCKER_SECURITY_ANCHOR_DE if i18n.active_language() == "de" else DOCKER_SECURITY_ANCHOR_EN


def main() -> int:
    _setup_logging()
    logger.info("Bibliogon launcher v%s starting", __version__)

    # i18n must be live before the welcome dialog or any other UI
    # string is rendered. Reads settings.language; falls back to OS
    # locale detection via ui._current_lang() inside i18n itself.
    try:
        i18n.init(settings.get("language"))
    except Exception as exc:
        logger.warning("i18n init failed, continuing in English: %s", exc)

    # Headless CLI uninstall: same reusable cleanup as the GUI path, no
    # window. Useful for scripts and for users who want a one-shot teardown.
    if "--uninstall" in sys.argv:
        return _cli_uninstall()

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
    #    Silent in the normal case; no dialog before the Docker check.
    _retry_pending_cleanup()

    # 1. Docker readiness is the FIRST thing the user sees a dialog about.
    #    Bibliogon cannot do anything without a running Docker daemon, so
    #    we check installed + running before the welcome / install prompts.
    #    A failure here shows a clear "start Docker Desktop, then re-check"
    #    message with a Retry button - no other dialog precedes it.
    if not _ensure_docker_ready(show_details):
        return 1

    # 2. First-ever-launch welcome. Tells the user what Bibliogon needs
    #    (Docker, ~800 MB) and what the first run looks like (~2 GB /
    #    5-10 min). Shown only after Docker is confirmed ready, so the
    #    user never reads "you need Docker" guidance while Docker is
    #    actually fine.
    if not bool(settings.get("welcomed")):
        ui.welcome_dialog(
            guide_url=_docker_guide_url(),
            security_url=_docker_security_url(),
        )
        settings.update("welcomed", True)

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
                manifest.write_manifest(repo, installer.BIBLIOGON_TARGET_VERSION)
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
            title=i18n.t("env_prep.title"),
            message=i18n.t("env_prep.message"),
            actions=[(i18n.t("common.ok"), "ok")],
            details=(
                f"Preparation of configuration in {repo} failed:\n{detail}\n\n"
                f"Expected template: {config.ENV_EXAMPLE_FILENAME}\n"
                f"Target: {config.ENV_FILENAME}"
            ),
            help_url=INSTALL_GUIDE_URL,
            initial_show_details=show_details,
        )
        return 1

    # 4.5 Resolve the port. If the configured port is held by a foreign
    #     process (e.g. another local app on 7880), pick the next free
    #     port and persist it to .env so the next start reuses it. If the
    #     port already serves a healthy Bibliogon, reuse it as-is.
    port, previous_port = _resolve_port(repo)
    if previous_port is not None:
        ui.info_box(
            i18n.t("port.switched.title"),
            i18n.t("port.switched.message", old=previous_port, new=port),
        )
    elif health.is_healthy(port):
        # Bibliogon is already serving on this port (e.g. a container left
        # running by a previous session). Offer the management dialog
        # (open / stop / uninstall) instead of starting a second time.
        return _run_management(repo, port)

    # 5. Launch status window, run docker compose + health wait + browser on a
    # background thread so the UI stays responsive.
    window = ui.StatusWindow()
    window.set_title(i18n.t("status.starting"))

    start_steps = (
        ("docker", i18n.t("checklist.docker_ready")),
        ("containers", i18n.t("checklist.starting_containers")),
        ("ready", i18n.t("checklist.waiting_ready")),
    )

    def worker() -> None:
        window.after(0, lambda: window.set_progress(None))
        window.after(0, lambda: window.set_checklist(
            _checklist_states(start_steps, done={"docker"}, active="containers")
        ))
        ok, up_detail = docker.compose_up(repo, config.COMPOSE_FILENAME)
        if not ok:
            logger.error("compose up failed: %s", up_detail)
            window.after(0, lambda: _handle_compose_failure(window, port, up_detail, show_details))
            return

        window.after(0, lambda: window.set_checklist(
            _checklist_states(start_steps, done={"docker", "containers"}, active="ready")
        ))
        window.after(0, lambda: window.set_progress(None, i18n.t("status.almost_ready")))
        if not health.wait_for_healthy(port, timeout_seconds=60.0):
            tail = docker.compose_logs_tail(repo, config.COMPOSE_FILENAME, lines=20)
            logger.error("health timeout; last lines:\n%s", tail)
            window.after(0, lambda: _handle_health_timeout(window, repo, port, tail, show_details))
            return

        window.after(0, lambda: window.set_checklist(
            _checklist_states(start_steps, done={"docker", "containers", "ready"}, active=None)
        ))
        url = f"http://localhost:{port}"
        try:
            opened = webbrowser.open(url)
        except OSError as exc:
            logger.warning("webbrowser.open failed: %s", exc)
            opened = False
        if not opened:
            window.after(0, lambda: ui.ask_copyable_url(url))

        window.after(0, lambda: window.set_running(
            port,
            on_stop=lambda: _shutdown(window, repo),
            on_settings=_open_settings_dialog,
        ))
        # Non-blocking update check: fires after the main UI is running.
        # Any failure is swallowed inside update_check; the callback
        # schedules the notification on the main thread via window.after.
        _schedule_update_check(window, mdata)

    window.run_in_background(worker)

    # User-triggered close also runs shutdown (handler wired in StatusWindow).
    window.run_mainloop()
    return 0


# --- Step helpers ---


def _ensure_docker_ready(show_details: bool) -> bool:
    """Check Docker is installed and the daemon is running.

    This is the launcher's first interactive step (Problem 1): nothing
    else can work without Docker, so we confirm it before any welcome
    or install dialog. Returns True when Docker is ready, False when the
    user gave up (the caller then exits).

    On "not installed" we offer download / guide / quit. On "not running"
    we loop up to three times with a Retry button so the user can start
    Docker Desktop and re-check without relaunching.
    """
    ok, detail = docker.docker_installed()
    if not ok:
        logger.error("docker --version failed: %s", detail)
        choice = ui.three_button_dialog(
            title=i18n.t("docker.missing.title"),
            message=(
                f"{i18n.t('docker.missing.heading')}\n\n"
                f"{i18n.t('docker.missing.explanation')}\n\n"
                f"{i18n.t('docker.missing.next_step')}"
            ),
            primary_label=i18n.t("docker.missing.install_button"),
            secondary_label=i18n.t("docker.missing.guide_button"),
            cancel_label=i18n.t("docker.missing.quit_button"),
        )
        if choice == "primary":
            try:
                webbrowser.open(DOCKER_INSTALL_URL)
            except OSError as exc:
                logger.warning("opening Docker download page failed: %s", exc)
        elif choice == "secondary":
            try:
                webbrowser.open(_docker_guide_url())
            except OSError as exc:
                logger.warning("opening Bibliogon Docker guide failed: %s", exc)
        return False

    # Daemon running? Retry loop: the user may need to start Docker Desktop
    # and click Re-check.
    for attempt in range(3):
        ok, detail = docker.docker_daemon_running()
        if ok:
            return True
        logger.warning("docker info failed (attempt %d): %s", attempt + 1, detail)
        choice = ui.error_dialog(
            title=i18n.t("docker.daemon.title"),
            message=i18n.t("docker.daemon.message"),
            actions=[(i18n.t("docker.daemon.recheck"), "retry"), (i18n.t("common.cancel"), "cancel")],
            details=f"docker info attempt {attempt + 1} failed:\n{detail}",
            help_url=INSTALL_GUIDE_URL,
            initial_show_details=show_details,
        )
        if choice != "retry":
            return False
    ui.error_dialog(
        title=i18n.t("docker.daemon.title"),
        message=i18n.t("docker.daemon.exhausted_message"),
        actions=[(i18n.t("common.ok"), "ok")],
        details="docker info failed on three consecutive retries.",
        help_url=INSTALL_GUIDE_URL,
        initial_show_details=show_details,
    )
    return False


def _resolve_port(repo: Path) -> tuple[int, int | None]:
    """Return the port Bibliogon should bind, plus the previous port if switched.

    Resolution order:
      1. The port configured in ``.env`` is free -> use it (no switch).
      2. It is busy but already serves a healthy Bibliogon -> reuse it
         (our own container from a prior session; no switch).
      3. It is busy with a foreign process -> find the next free port,
         persist it to ``.env``, and report the switch so the caller can
         inform the user.

    Returns ``(port, None)`` when no switch happened, or
    ``(new_port, old_port)`` when the port was changed.
    """
    configured = config.read_port(repo)
    if config.is_port_free(configured):
        return configured, None
    if health.is_healthy(configured):
        logger.info("port %d already serves Bibliogon; reusing it", configured)
        return configured, None
    new_port = config.find_free_port(configured + 1)
    if new_port == configured:
        logger.warning("no free port found near %d; proceeding with it", configured)
        return configured, None
    if not config.write_port(repo, new_port):
        logger.warning("could not persist port %d to .env; proceeding with %d", new_port, configured)
        return configured, None
    logger.info("port %d busy; switched Bibliogon to %d", configured, new_port)
    return new_port, configured


def _checklist_states(
    steps: tuple[tuple[str, str], ...],
    *,
    done: set[str],
    active: str | None,
) -> list[tuple[str, str]]:
    """Build the ``(label, status)`` list for ``StatusWindow.set_checklist``.

    ``steps`` is an ordered ``(key, label)`` tuple. A key in ``done`` is
    rendered done, the ``active`` key is rendered active, everything else
    is pending. Pure function so the step-state transitions are unit
    testable without a Tk window.
    """
    items: list[tuple[str, str]] = []
    for key, label in steps:
        if key in done:
            status = "done"
        elif key == active:
            status = "active"
        else:
            status = "pending"
        items.append((label, status))
    return items


def _schedule_update_check(window: ui.StatusWindow, mdata: dict | None) -> None:
    """Kick off a background update check and surface a notification.

    Skipped silently if no manifest (Bibliogon not installed) or the
    manifest has no version field. The update_check module handles
    all failure modes silently - this helper's only job is to wire
    the callback through window.after so the tkinter UI update runs
    on the main thread.
    """
    if not mdata:
        return
    current = mdata.get("version")
    if not current:
        return
    # User opt-out: respect the auto_update_check setting.
    if not settings.get("auto_update_check"):
        logger.info("Update check disabled by user setting.")
        return

    def on_update(tag: str, url: str) -> None:
        # Called on a background thread. Marshal the UI call to the
        # main thread via window.after so tkinter stays thread-safe.
        logger.info("Update available: %s (current: %s)", tag, current)
        window.after(0, lambda: _show_update_notification(tag, url, current))

    update_check.check_for_update_async(
        current_version=current,
        on_update_available=on_update,
    )


def _open_settings_dialog() -> None:
    """Open the Settings dialog, persist changes on Save."""
    current = settings.read_settings()
    updated = ui.settings_dialog(current)
    if updated is None:
        return  # user cancelled
    settings.write_settings(updated)
    logger.info("Settings saved: %s", {k: v for k, v in updated.items() if k in settings.DEFAULTS})


def _show_update_notification(tag: str, url: str, current: str) -> None:
    """Present the "new version available" dialog. Main thread only.

    Three choices: Open release page (primary) / Dismiss (secondary)
    / Don't check for updates (cancel - turns off auto_update_check).
    """
    choice = ui.three_button_dialog(
        title=i18n.t("update.title"),
        message=i18n.t("update.message", current=current, tag=tag),
        primary_label=i18n.t("update.primary"),
        secondary_label=i18n.t("update.dismiss"),
        cancel_label=i18n.t("update.disable"),
    )
    if choice == "primary":
        try:
            webbrowser.open(url)
        except OSError as exc:
            logger.warning("update release page open failed: %s", exc)
    elif choice == "cancel":
        # User opted out of future update checks.
        settings.update("auto_update_check", False)
        logger.info("Auto-update check disabled by user.")


def _retry_pending_cleanup() -> None:
    """Silently retry any incomplete uninstall from a previous session.

    Delegates the step logic to :func:`cleanup.retry_pending_cleanup`
    (shared with the fresh uninstall path). Shows a one-time warning
    only if the install directory still cannot be removed (the user may
    need to delete it manually). Never blocks otherwise.
    """
    results = cleanup.retry_pending_cleanup()
    if results is None:
        return
    if not results.get("rmtree", False):
        pending = manifest.read_cleanup_pending() or {}
        path = pending.get("install_dir", "")
        if path and Path(path).exists():
            logger.warning("Pending rmtree still failed for %s", path)
            ui.error_dialog(
                title=i18n.t("cleanup.title"),
                message=i18n.t("cleanup.message", path=path),
                actions=[(i18n.t("common.ok"), "ok")],
                details=f"Pending cleanup steps incomplete: {results}",
                initial_show_details=config.get_show_details_default(),
            )


def _check_launcher_target_stale() -> bool:
    """Pre-install safeguard: warn the user if this launcher targets
    an older Bibliogon than the latest published release.

    Returns True if the install flow may proceed (target is current,
    or the user explicitly chose "Continue with older version", or
    the network check failed open). Returns False if the install
    must abort (user chose "Open download page" or "Cancel").

    Always runs regardless of the ``auto_update_check`` toggle: the
    toggle governs only the post-install notification check.
    First-install on a fresh machine is special; a stale target
    here causes destructive misalignment (user gets an outdated
    Bibliogon).

    Strict-newer comparison: any newer release fires the dialog.
    The "Continue with older version" button preserves agency for
    users who deliberately want the older version (e.g. testing,
    pinned compatibility). Network failure is fail-open so a
    GitHub outage cannot block fresh installs.
    """
    latest = update_check.fetch_latest_version()
    if latest is None:
        return True  # fail-open

    tag, url = latest
    if not update_check.is_newer(installer.BIBLIOGON_TARGET_VERSION, tag):
        return True  # in sync (or this launcher is ahead, weird but proceed)

    choice = ui.three_button_dialog(
        title=i18n.t("stale.title"),
        message=i18n.t(
            "stale.message",
            target=installer.BIBLIOGON_TARGET_VERSION,
            latest=tag,
        ),
        primary_label=i18n.t("stale.download"),
        secondary_label=i18n.t("stale.continue_old"),
        cancel_label=i18n.t("common.cancel"),
    )
    if choice == "primary":
        try:
            webbrowser.open(url)
        except OSError as exc:
            logger.warning("opening release page failed: %s", exc)
        return False  # abort install
    if choice == "cancel":
        return False  # abort install
    # secondary: user knows what they're doing, proceed
    return True


def _install_or_welcome() -> Path | None:
    """Offer to install Bibliogon or open the install guide.

    Used for the no-manifest case: either a brand-new install or a
    re-install after the user removed the previous one. The pre-
    requisites story (Docker, sizes, trust anchor) was already
    delivered by the welcome dialog at the top of ``_run_launcher``,
    so this prompt is intentionally short - just an Install / Open
    guide / Cancel choice.

    Returns the install directory on success, or None if the user
    cancelled or only opened the guide.
    """
    if not _check_launcher_target_stale():
        return None  # user opted to abort due to outdated launcher

    choice = ui.three_button_dialog(
        title=i18n.t("install_prompt.title"),
        message=i18n.t("install_prompt.message"),
        primary_label=i18n.t("install_prompt.install_button"),
        secondary_label=i18n.t("install_prompt.guide_button"),
        cancel_label=i18n.t("install_prompt.cancel_button"),
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
    picked = ui.pick_folder(i18n.t("install.choose_folder"), initial_dir=str(target.parent))
    if picked is None:
        return None
    target = Path(picked) if picked else target

    # Show status window with a step checklist + progress bar during the
    # install. Each phase flips its checklist row to done so the user can
    # see the install is alive (Problem 2).
    window = ui.StatusWindow()
    window.set_title(i18n.t("install.title"))

    install_steps = (
        ("download", i18n.t("checklist.download")),
        ("config", i18n.t("checklist.prepare_config")),
        ("build", i18n.t("checklist.build_images")),
        ("start", i18n.t("checklist.starting_app")),
    )

    def _render(done: set[str], active: str | None) -> None:
        window.after(0, lambda: window.set_checklist(
            _checklist_states(install_steps, done=done, active=active)
        ))

    result: dict = {}

    def worker() -> None:
        # Phase 1: Download and extract (with byte-level progress).
        _render(done=set(), active="download")
        last_percent = {"value": -1}

        def on_progress(downloaded: int, total: int) -> None:
            if total > 0:
                fraction = downloaded / total
                percent = int(fraction * 100)
                if percent == last_percent["value"]:
                    return  # throttle: only repaint on a whole-percent change
                last_percent["value"] = percent
                label = f"{installer.human_size(downloaded)} / {installer.human_size(total)}"
                window.after(0, lambda: window.set_progress(fraction, label))
            else:
                label = installer.human_size(downloaded)
                window.after(0, lambda: window.set_progress(None, label))

        ok, detail = installer.download_release(target, progress_callback=on_progress)
        if not ok:
            result["error"] = detail
            window.after(0, window.destroy)
            return

        # Phase 2: Prepare configuration + manifest.
        _render(done={"download"}, active="config")
        window.after(0, lambda: window.set_progress(None, i18n.t("install.preparing_config")))
        ok2, detail2 = installer.create_env_file(target)
        if not ok2:
            logger.warning("env file creation: %s", detail2)
        try:
            manifest.write_manifest(target, installer.BIBLIOGON_TARGET_VERSION)
        except Exception as exc:
            result["error"] = f"Could not write manifest: {exc}"
            window.after(0, window.destroy)
            return
        # Save to legacy config too for backward compat
        cfg = config.load_launcher_config()
        cfg["repo_path"] = str(target)
        config.save_launcher_config(cfg)

        # Resolve the port before the build so the stack maps a free one.
        port, _previous = _resolve_port(target)

        # Phase 3: Build and start Docker stack (length unknown -> spinner).
        _render(done={"download", "config"}, active="build")
        window.after(0, lambda: window.set_progress(None, i18n.t("install.building_images")))
        ok3, detail3 = docker.compose_build(target, config.COMPOSE_FILENAME)
        if not ok3:
            result["error"] = f"Docker build failed:\n{detail3}"
            window.after(0, window.destroy)
            return

        # Phase 4: Wait for health.
        _render(done={"download", "config", "build"}, active="start")
        window.after(0, lambda: window.set_progress(None, i18n.t("install.waiting_health")))
        if not health.wait_for_healthy(port, timeout_seconds=120.0):
            # Not fatal: stack may still be starting
            result["slow_start"] = True

        _render(done={"download", "config", "build", "start"}, active=None)
        result["ok"] = True
        result["port"] = port
        window.after(0, window.destroy)

    window.run_in_background(worker)
    window.run_mainloop()

    if result.get("error"):
        ui.error_dialog(
            title=i18n.t("install.failed.title"),
            message=i18n.t("install.failed.message"),
            actions=[(i18n.t("common.ok"), "ok")],
            details=result["error"],
            initial_show_details=show_details,
        )
        return None

    if result.get("ok"):
        port = result.get("port", config.DEFAULT_PORT)
        version_label = f"v{installer.BIBLIOGON_TARGET_VERSION}"
        if result.get("slow_start"):
            choice = ui.two_button_dialog(
                title=i18n.t("install.complete.title"),
                message=i18n.t(
                    "install.complete.slow_message", version=version_label
                ),
                primary_label=i18n.t("common.open_browser"),
                secondary_label=i18n.t("common.close"),
            )
        else:
            choice = ui.two_button_dialog(
                title=i18n.t("install.complete.title"),
                message=i18n.t(
                    "install.complete.ok_message",
                    version=version_label,
                    port=port,
                ),
                primary_label=i18n.t("common.open_browser"),
                secondary_label=i18n.t("common.close"),
            )
        if choice == "primary":
            try:
                webbrowser.open(f"http://localhost:{port}")
            except OSError as exc:
                logger.warning("browser open failed: %s", exc)
        return target

    return None


_UNINSTALL_STEP_LABELS = {
    "compose_down": "uninstall.stopping",
    "remove_volumes": "uninstall.removing_volumes",
    "remove_images": "uninstall.removing_images",
    "rmtree": "uninstall.removing_files",
    "remove_shortcuts": "uninstall.removing_shortcuts",
    "delete_manifest": "uninstall.removing_config",
    "remove_config_dirs": "uninstall.removing_config",
}


def _run_uninstall_flow(install_dir: Path) -> bool:
    """Uninstall Bibliogon after user confirmation. Returns True if uninstalled.

    Confirms, then runs the reusable :func:`cleanup.uninstall_bibliogon`
    on a background thread, mapping each step to a status-window label so
    the user sees live progress (Problem 2 applied to uninstall). The
    cleanup itself is crash-safe and resumable on the next launch.
    """
    show_details = config.get_show_details_default()
    choice = ui.two_button_dialog(
        title=i18n.t("uninstall.title"),
        message=i18n.t("uninstall.message", path=str(install_dir)),
        primary_label=i18n.t("uninstall.confirm"),
        secondary_label=i18n.t("common.cancel"),
    )
    if choice != "primary":
        return False

    window = ui.StatusWindow()
    window.set_title(i18n.t("uninstall.title"))
    window.set_starting(i18n.t("uninstall.stopping"))

    result: dict = {}

    def on_step(step_key: str) -> None:
        label = i18n.t(_UNINSTALL_STEP_LABELS.get(step_key, "uninstall.stopping"))
        window.after(0, lambda: window.set_starting(label))

    def uninstall_worker() -> None:
        result["steps"] = cleanup.uninstall_bibliogon(install_dir, status_callback=on_step)
        window.after(0, window.destroy)

    window.run_in_background(uninstall_worker)
    window.run_mainloop()

    steps = result.get("steps", {})
    if not steps.get("rmtree", False) and install_dir.exists():
        ui.error_dialog(
            title=i18n.t("uninstall.failed.title"),
            message=i18n.t("uninstall.failed.message"),
            actions=[(i18n.t("common.ok"), "ok")],
            details=f"Some uninstall steps did not complete: {steps}",
            initial_show_details=show_details,
        )
        return False

    ui.two_button_dialog(
        title=i18n.t("uninstall.complete.title"),
        message=i18n.t("uninstall.complete.message"),
        primary_label=i18n.t("common.ok"),
        secondary_label="",
    )
    return True


def _run_management(repo: Path, port: int) -> int:
    """Show the management dialog for an already-running Bibliogon.

    Loops on the four-button dialog: Open in browser / Stop / Uninstall /
    Close. ``open`` re-shows the dialog (a convenience action); ``stop``,
    ``uninstall``, and ``close`` each end the launcher. Returns 0.

    This is the launcher acting as a management tool, not just an
    installer (Problem 5): the previously unreachable uninstall flow is
    now wired here.
    """
    while True:
        choice = ui.management_dialog(port)
        if choice == "open":
            url = f"http://localhost:{port}"
            try:
                webbrowser.open(url)
            except OSError as exc:
                logger.warning("webbrowser.open failed: %s", exc)
            continue
        if choice == "stop":
            ok, detail = docker.compose_down(repo, config.COMPOSE_FILENAME)
            if not ok:
                logger.warning("stop via management dialog failed: %s", detail)
            ui.info_box(i18n.t("manage.stopped.title"), i18n.t("manage.stopped.message"))
            return 0
        if choice == "uninstall":
            _run_uninstall_flow(repo)
            return 0
        return 0  # close: leave the container running


def _cli_uninstall() -> int:
    """Headless uninstall for the ``--uninstall`` CLI flag.

    Resolves the install directory from the manifest (falling back to the
    legacy config), runs the shared cleanup with stdout progress, and
    returns 0 on full success, 1 otherwise.
    """
    install_dir = manifest.install_dir_from_manifest() or config.resolve_repo_path()
    logger.info("CLI uninstall starting for %s", install_dir)
    print(f"Uninstalling Bibliogon from {install_dir} ...")

    def on_step(step_key: str) -> None:
        print(f"  - {step_key}")

    results = cleanup.uninstall_bibliogon(install_dir, status_callback=on_step)
    if all(results.values()):
        print("Uninstall complete.")
        return 0
    print(f"Uninstall incomplete: {results}")
    return 1


def _installation_moved_picker() -> Path | None:
    """Bibliogon was launched here before but the remembered folder no
    longer resolves. Offer folder picker or install guide.

    Three buttons: Choose folder / Open install guide / Cancel.
    """
    while True:
        choice = ui.three_button_dialog(
            title=i18n.t("moved.title"),
            message=i18n.t("moved.message"),
            primary_label=i18n.t("moved.choose_folder"),
            secondary_label=i18n.t("install_prompt.guide_button"),
            cancel_label=i18n.t("common.cancel"),
        )
        if choice == "cancel":
            return None
        if choice == "secondary":
            try:
                webbrowser.open(INSTALL_GUIDE_URL)
            except OSError as exc:
                logger.warning("opening install guide failed: %s", exc)
            return None
        picked = ui.pick_folder(i18n.t("moved.choose_folder_picker"))
        if picked is None:
            continue  # back to the three-button dialog
        repo = Path(picked)
        if config.is_valid_repo(repo):
            cfg = config.load_launcher_config()
            cfg["repo_path"] = str(repo)
            config.save_launcher_config(cfg)
            return repo
        retry = ui.ask_retry_quit(
            i18n.t("moved.invalid_title"),
            i18n.t("moved.invalid_message"),
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
        title=i18n.t("start.compose_failed.title"),
        message=i18n.t("start.compose_failed.message", port=port),
        actions=[(i18n.t("common.ok"), "ok")],
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
        title=i18n.t("start.health_timeout.title"),
        message=i18n.t("start.health_timeout.message"),
        actions=[(i18n.t("common.retry"), "retry"), (i18n.t("common.cancel"), "cancel")],
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
    """Another launcher instance holds the lock. Offer management.

    When the install is resolvable, show the management dialog (Open /
    Stop / Uninstall / Close) so the launcher is a management tool rather
    than only reporting "already open" (Problem 5). Falls back to the
    plain info box + browser-open when no valid install is found.
    """
    repo = config.resolve_repo_path()
    if config.is_valid_repo(repo):
        port = config.read_port(repo)
        _run_management(repo, port)
        return
    url = f"http://localhost:{config.DEFAULT_PORT}"
    ui.info_box(
        i18n.t("already_running.title"),
        i18n.t("already_running.message"),
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
