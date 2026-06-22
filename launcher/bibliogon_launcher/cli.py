"""Command-line interface for the Bibliogon launcher.

Schicht 3 of the launcher architecture: a thin argparse layer that gives
every GUI action a headless equivalent (CLI<->GUI parity per the spec).
Each flag delegates to :mod:`bibliogon_launcher.actions`; the only extra
logic here is resolving the compose file and the effective port, and
acquiring (downloading) Bibliogon for a first ``--install`` when no local
checkout exists.

Exit codes: 0 success, 1 action failed, 2 usage error (no action).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from bibliogon_launcher import actions, cleanup, config, installer, manifest

logger = logging.getLogger("bibliogon_launcher.cli")

PROJECT_NAME = actions.PROJECT_NAME


def build_parser() -> argparse.ArgumentParser:
    """Build the launcher CLI argument parser (one flag per GUI action)."""
    parser = argparse.ArgumentParser(
        prog="bibliogon-launcher",
        description="Manage the Bibliogon Docker stack from the command line.",
    )
    parser.add_argument("--version", action="store_true", help="Print the launcher version and exit.")
    parser.add_argument("--debug", action="store_true", help="Verbose logging to stdout and the log file.")
    parser.add_argument("--check", action="store_true", help="Check that Docker is installed and running.")
    parser.add_argument("--status", action="store_true", help="Print the launcher state.")
    parser.add_argument("--install", action="store_true", help="Install (download if needed) and start the stack.")
    parser.add_argument("--start", action="store_true", help="Start an installed stack.")
    parser.add_argument("--stop", action="store_true", help="Stop the running stack.")
    parser.add_argument("--uninstall", action="store_true", help="Uninstall Bibliogon (containers, volumes, files).")
    parser.add_argument("--open", action="store_true", help="Open the app in the default browser.")
    parser.add_argument("--port", type=int, metavar="PORT", help="Set/override the port (1024-65535).")
    return parser


def is_cli_invocation(argv: list[str]) -> bool:
    """True if a CLI action flag is present (so __main__ skips the GUI).

    ``--debug`` is intentionally excluded: it is a modifier that also
    applies to the GUI path, so ``--debug`` alone opens the window with
    verbose logging rather than running headless.
    """
    flags = {
        "--version", "--check", "--status", "--install",
        "--start", "--stop", "--uninstall", "--open", "--port",
    }
    return any(arg.split("=")[0] in flags for arg in argv)


def _effective_port(args: argparse.Namespace) -> int:
    """Resolve the port: explicit flag, then launcher.json, then .env/default."""
    if args.port:
        return args.port
    cfg = config.load_launcher_config()
    stored = cfg.get("port")
    if isinstance(stored, int) and actions.valid_port(stored):
        return stored
    compose = actions.resolve_compose_file()
    if compose is not None:
        return config.read_port(compose.parent)
    return config.DEFAULT_PORT


def _ensure_compose(port: int) -> tuple[bool, Path | None, str]:
    """Return a usable compose file, downloading Bibliogon if necessary."""
    compose = actions.resolve_compose_file()
    if compose is not None:
        return True, compose, "found"
    target = config.default_repo_path()
    print(f"Downloading Bibliogon to {target} ...")
    ok, detail = installer.download_release(target)
    if not ok:
        return False, None, detail
    installer.create_env_file(target)
    try:
        manifest.write_manifest(target, installer.BIBLIOGON_TARGET_VERSION)
    except OSError as exc:
        return False, None, f"could not write manifest: {exc}"
    compose = target / config.COMPOSE_FILENAME
    if not compose.is_file():
        return False, None, "compose file missing after download"
    return True, compose, "downloaded"


def _cli_uninstall() -> int:
    """Headless uninstall with stdout progress. 0 on full success, else 1."""
    install_dir = manifest.install_dir_from_manifest() or config.resolve_repo_path()
    print(f"Uninstalling Bibliogon from {install_dir} ...")
    results = cleanup.uninstall_bibliogon(install_dir, status_callback=lambda step: print(f"  - {step}"))
    if all(results.values()):
        print("Uninstall complete.")
        return 0
    print(f"Uninstall incomplete: {results}")
    return 1


def _do_install(port: int) -> int:
    ok, compose, detail = _ensure_compose(port)
    if not ok or compose is None:
        print(f"Install failed: {detail}")
        return 1
    print("Building images and starting the stack (first run can take minutes) ...")
    ok, detail = actions.install(str(compose), PROJECT_NAME, port)
    print(detail if ok else f"Install failed: {detail}")
    return 0 if ok else 1


def _do_start(port: int) -> int:
    compose = actions.resolve_compose_file()
    if compose is None:
        print("Start failed: Bibliogon is not installed (no compose file found).")
        return 1
    actions.set_repo_port(compose.parent, port)
    ok, detail = actions.start(str(compose), PROJECT_NAME)
    print(detail if ok else f"Start failed: {detail}")
    return 0 if ok else 1


def run(argv: list[str] | None = None) -> int:
    """Dispatch the CLI. Returns the process exit code."""
    args = build_parser().parse_args(argv)

    if args.debug:
        logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(name)s %(message)s")
        logger.debug("debug logging enabled")

    if args.version:
        print(actions.get_version())
        return 0

    # A bare --port with no action just persists the chosen port.
    action_requested = any([
        args.check, args.status, args.install, args.start,
        args.stop, args.uninstall, args.open,
    ])

    if args.port is not None and not actions.valid_port(args.port):
        print(f"Invalid port {args.port}: must be between {actions.MIN_PORT} and {actions.MAX_PORT}.")
        return 1

    if args.port is not None and not action_requested:
        ok, detail = actions.set_port(config.launcher_config_path(), args.port)
        if ok:
            compose = actions.resolve_compose_file()
            if compose is not None:
                actions.set_repo_port(compose.parent, args.port)
        print(f"Port set to {detail}" if ok else f"Could not set port: {detail}")
        return 0 if ok else 1

    port = _effective_port(args)

    if args.check:
        ok, detail = actions.check_docker()
        print("Docker is ready." if ok else f"Docker not ready: {detail}")
        return 0 if ok else 1

    if args.status:
        print(actions.get_state(PROJECT_NAME))
        return 0

    if args.open:
        actions.open_browser(port, "/")
        print(f"Opened http://localhost:{port}/")
        return 0

    if args.install:
        return _do_install(port)

    if args.start:
        return _do_start(port)

    if args.stop:
        ok, detail = actions.stop(PROJECT_NAME)
        print(detail if ok else f"Stop failed: {detail}")
        return 0 if ok else 1

    if args.uninstall:
        return _cli_uninstall()

    build_parser().print_help()
    return 2


if __name__ == "__main__":
    sys.exit(run())
