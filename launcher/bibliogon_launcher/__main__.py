"""Launcher entry point: dispatch to the CLI or the single-window GUI.

The launcher has three layers (see ``launcher/SPEC.md``): the pure
``actions`` core, the ``cli`` layer, and the single-window ``gui``. This
module is the thin dispatcher between them:

- any CLI action flag (``--check``, ``--status``, ``--install``, ...) runs
  the headless :func:`cli.run`;
- otherwise the persistent GUI window opens via :func:`gui.run`.

``--debug`` is a modifier (verbose logging to stdout + the log file) that
works with either path. ``gui`` is imported lazily so the CLI runs on
machines without tkinter.
"""

from __future__ import annotations

import logging
import sys

from bibliogon_launcher import __version__, cleanup, cli, config, i18n, lockfile, manifest, settings

logger = logging.getLogger("bibliogon_launcher")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    debug = "--debug" in args
    _setup_logging(debug=debug)
    logger.info("Bibliogon launcher v%s starting", __version__)

    try:
        i18n.init(settings.get("language"))
    except Exception as exc:  # noqa: BLE001 - never block startup on i18n
        logger.warning("i18n init failed, continuing in English: %s", exc)

    if cli.is_cli_invocation(args):
        return cli.run(args)
    return _run_gui()


def _run_gui() -> int:
    """Open the single persistent launcher window.

    Resumes any interrupted uninstall first (silent), then takes the
    single-instance lock around the GUI lifetime. ``gui`` is imported
    here, not at module top, so the CLI path never needs tkinter.
    """
    _retry_pending_cleanup()

    lock_path = config.lockfile_path()
    try:
        if lockfile.another_instance_alive(lock_path):
            logger.info("another launcher instance appears to be running; opening anyway")
    except Exception as exc:  # noqa: BLE001 - fail open: a crashed check must not block launch
        logger.warning("lockfile check failed, proceeding anyway: %s", exc)
    try:
        lockfile.write_lock(lock_path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not write lockfile: %s", exc)

    try:
        from bibliogon_launcher import gui

        return gui.run()
    finally:
        lockfile.clear_lock(lock_path)


def _retry_pending_cleanup() -> None:
    """Silently resume an interrupted uninstall from a prior session."""
    try:
        cleanup.retry_pending_cleanup()
    except Exception as exc:  # noqa: BLE001 - cleanup retry must never block launch
        logger.warning("pending cleanup retry failed: %s", exc)


def _setup_logging(*, debug: bool = False) -> None:
    from logging.handlers import RotatingFileHandler

    root = logging.getLogger()
    root.setLevel(logging.DEBUG if debug else logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")

    if debug:
        stream = logging.StreamHandler(sys.stdout)
        stream.setFormatter(fmt)
        root.addHandler(stream)

    legacy_path = config.logfile_path()
    try:
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_handler = logging.FileHandler(str(legacy_path), encoding="utf-8")
        legacy_handler.setFormatter(fmt)
        root.addHandler(legacy_handler)
    except OSError as exc:
        logger.warning("could not open log file: %s", exc)

    try:
        activity_path = manifest.manifest_path().parent / "install.log"
        activity_path.parent.mkdir(parents=True, exist_ok=True)
        activity_handler = RotatingFileHandler(
            str(activity_path), maxBytes=1_000_000, backupCount=1, encoding="utf-8",
        )
        activity_handler.setFormatter(fmt)
        root.addHandler(activity_handler)
    except OSError:
        pass


if __name__ == "__main__":
    sys.exit(main())
