"""Reusable, UI-agnostic uninstall and cleanup logic.

:func:`uninstall_bibliogon` performs the full teardown - stop the stack,
remove Docker volumes + images, delete the install directory, remove
desktop shortcuts, delete the install manifest, and finally remove the
per-user config/data directories. Progress is tracked in the manifest
cleanup-state file so an interrupted run resumes on the next launcher
start via :func:`retry_pending_cleanup`.

The module is free of any tkinter dependency so it is callable from both
the GUI flow and a headless CLI path, and unit-testable by mocking the
docker + filesystem helpers. A ``status_callback`` lets a GUI render
per-step progress without this module knowing anything about the UI.
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

from bibliogon_launcher import config, docker, installer, manifest

logger = logging.getLogger("bibliogon_launcher.cleanup")

# The config-dir removal is special-cased: it deletes the directory that
# holds the cleanup-state file itself, so it must run last and only once
# every other step has succeeded. Otherwise a failed earlier step would
# lose its retry breadcrumb.
STEP_REMOVE_CONFIG_DIRS = "remove_config_dirs"

# Callback invoked with the step key before each step runs, so a GUI can
# update a label. Never required; failures inside it are swallowed.
StatusCallback = Callable[[str], None]


def config_data_dirs(env: dict[str, str] | None = None) -> list[Path]:
    """Return the per-user config/data directories to remove on uninstall.

    Covers the launcher's own config dir, the platform manifest dir, and
    the legacy data dirs a user may carry:

    - Windows: ``%APPDATA%\\Bibliogon``, ``%APPDATA%\\bibliogon``,
      ``%USERPROFILE%\\.bibliogon``
    - Linux/macOS: ``~/.config/Bibliogon``, ``~/.config/bibliogon``,
      ``~/.bibliogon``

    Deduplicated by resolved path, order preserved.
    """
    env = env if env is not None else dict(os.environ)
    dirs: list[Path] = [manifest.manifest_path().parent, config.appdata_dir(env)]
    if sys.platform == "win32":
        profile = env.get("USERPROFILE")
        if profile:
            dirs.append(Path(profile) / ".bibliogon")
        appdata = env.get("APPDATA")
        if appdata:
            dirs.append(Path(appdata) / "bibliogon")
    else:
        home = Path(env.get("HOME", "~")).expanduser()
        dirs.append(home / ".bibliogon")
        dirs.append(home / ".config" / "bibliogon")

    seen: set[str] = set()
    unique: list[Path] = []
    for directory in dirs:
        try:
            key = str(directory.resolve())
        except OSError:
            key = str(directory)
        if key not in seen:
            seen.add(key)
            unique.append(directory)
    return unique


def desktop_shortcut_paths(env: dict[str, str] | None = None) -> list[Path]:
    """Return candidate desktop / start-menu shortcut files to remove."""
    env = env if env is not None else dict(os.environ)
    paths: list[Path] = []
    if sys.platform == "win32":
        profile = env.get("USERPROFILE")
        if profile:
            paths.append(Path(profile) / "Desktop" / "Bibliogon.lnk")
        public = env.get("PUBLIC")
        if public:
            paths.append(Path(public) / "Desktop" / "Bibliogon.lnk")
        appdata = env.get("APPDATA")
        if appdata:
            paths.append(
                Path(appdata)
                / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Bibliogon.lnk"
            )
    else:
        home = Path(env.get("HOME", "~")).expanduser()
        paths.append(home / "Desktop" / "bibliogon.desktop")
        paths.append(home / ".local" / "share" / "applications" / "bibliogon.desktop")
    return paths


def remove_desktop_shortcuts(env: dict[str, str] | None = None) -> tuple[bool, str]:
    """Delete known Bibliogon desktop shortcuts. Best-effort, never raises."""
    removed = 0
    for path in desktop_shortcut_paths(env):
        try:
            if path.is_file():
                path.unlink()
                removed += 1
        except OSError as exc:
            logger.warning("could not remove shortcut %s: %s", path, exc)
    return True, f"removed {removed} shortcut(s)"


def remove_config_dirs(env: dict[str, str] | None = None) -> tuple[bool, str]:
    """Remove the per-user config/data directories. Best-effort.

    Uses ``ignore_errors`` so a directory holding a file locked by the
    running launcher (e.g. its own open log on Windows) never aborts the
    uninstall; any residue is logged and left for the OS to reclaim.
    """
    removed: list[str] = []
    remained: list[str] = []
    for directory in config_data_dirs(env):
        if not directory.exists():
            continue
        shutil.rmtree(directory, ignore_errors=True)
        if directory.exists():
            remained.append(str(directory))
        else:
            removed.append(str(directory))
    if remained:
        logger.warning("config dirs not fully removed: %s", remained)
    return True, f"removed {len(removed)} dir(s); {len(remained)} remained"


def _delete_manifest_step() -> tuple[bool, str]:
    manifest.delete_manifest()
    return True, "deleted"


def _ordered_steps(install_dir: Path) -> list[tuple[str, Callable[[], tuple[bool, str]]]]:
    """Single source of the ordered cleanup steps.

    The order matches :data:`manifest.CLEANUP_STEPS` so the manifest
    state file and this runner never drift.
    """
    return [
        ("compose_down", lambda: docker.compose_down(install_dir, config.COMPOSE_FILENAME)),
        ("remove_volumes", docker.remove_volumes),
        ("remove_images", docker.remove_images),
        ("rmtree", lambda: installer.remove_install(install_dir)),
        ("remove_shortcuts", remove_desktop_shortcuts),
        ("delete_manifest", _delete_manifest_step),
        (STEP_REMOVE_CONFIG_DIRS, remove_config_dirs),
    ]


def _prior_steps_done(results: dict[str, bool]) -> bool:
    """True if every step except the config-dir removal has succeeded."""
    return all(
        results.get(step, False)
        for step in manifest.CLEANUP_STEPS
        if step != STEP_REMOVE_CONFIG_DIRS
    )


def _run_steps(
    install_dir: Path,
    results: dict[str, bool],
    *,
    status_callback: StatusCallback | None,
) -> dict[str, bool]:
    """Run every not-yet-done step in order, updating ``results`` in place.

    The config-dir removal is gated on all prior steps having succeeded
    (see :data:`STEP_REMOVE_CONFIG_DIRS`). Each step's outcome is
    persisted to the manifest cleanup-state so an interrupted run can be
    resumed by :func:`retry_pending_cleanup`.
    """
    for step_key, step_fn in _ordered_steps(install_dir):
        if results.get(step_key):
            continue
        if step_key == STEP_REMOVE_CONFIG_DIRS and not _prior_steps_done(results):
            continue
        if status_callback is not None:
            try:
                status_callback(step_key)
            except Exception as exc:  # noqa: BLE001 - observer must never break cleanup
                logger.warning("cleanup status_callback failed: %s", exc)
        try:
            ok, detail = step_fn()
        except Exception as exc:  # noqa: BLE001 - one bad step must not crash the run
            ok, detail = False, str(exc)
        if not ok:
            logger.warning("cleanup step '%s' failed: %s", step_key, detail)
        manifest.update_cleanup_step(step_key, ok)
        results[step_key] = ok
    return results


def uninstall_bibliogon(
    install_dir: Path,
    *,
    status_callback: StatusCallback | None = None,
) -> dict[str, bool]:
    """Perform a full Bibliogon uninstall. Returns ``{step: success}``.

    Writes a fresh cleanup-state file before any destructive step so an
    interrupted run is resumable, runs every step, and deletes the
    cleanup-state file when all steps succeed. Reusable from the GUI
    (with a ``status_callback`` updating a status window) and from a
    headless CLI path.
    """
    logger.info("Uninstalling Bibliogon from %s", install_dir)
    manifest.write_cleanup_pending(install_dir)
    results = {step: False for step in manifest.CLEANUP_STEPS}
    _run_steps(install_dir, results, status_callback=status_callback)
    if all(results.get(step, False) for step in manifest.CLEANUP_STEPS):
        manifest.delete_cleanup_pending()
        logger.info("Uninstall completed.")
    else:
        logger.warning("Uninstall incomplete: %s", results)
    return results


def retry_pending_cleanup(
    *,
    status_callback: StatusCallback | None = None,
) -> dict[str, bool] | None:
    """Resume an interrupted uninstall recorded in the cleanup-state file.

    Returns None when there is nothing pending, otherwise the per-step
    result map after retrying the steps still marked incomplete.
    """
    data = manifest.read_cleanup_pending()
    if data is None:
        return None
    install_dir = Path(str(data.get("install_dir", "")))
    saved_steps = data.get("steps", {})
    results = {step: bool(saved_steps.get(step, False)) for step in manifest.CLEANUP_STEPS}
    logger.info("Resuming pending cleanup from %s", data.get("pending_since", "?"))
    _run_steps(install_dir, results, status_callback=status_callback)
    if all(results.get(step, False) for step in manifest.CLEANUP_STEPS):
        manifest.delete_cleanup_pending()
        logger.info("Pending cleanup completed.")
    else:
        logger.warning("Pending cleanup still incomplete: %s", results)
    return results
