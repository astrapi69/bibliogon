#!/usr/bin/env python3
"""Plugin-discovery smoke helper.

Constructs a fresh ``PluginManager`` against an isolated tmp data
directory, runs ``discover_plugins()``, and reports the
``DiscoveryResult`` shape. Useful for:

- Ad-hoc verification after a plugin-loading change (the same
  probe used at the PLUGINFORGE-V070-ADOPTION-01 checkpoint).
- Generating data for the v0.7.0 adoption-signal handover back
  to the PluginForge maintainer side.
- Diagnosing a "plugin not loading" report without spinning up
  the full FastAPI stack.

Run from the repository root::

    python3 scripts/plugin_discovery_smoke.py [--json]

The ``--json`` flag emits the result as machine-readable JSON
(for downstream consumption); otherwise a human-readable
summary is printed.

Test isolation: ``BIBLIOGON_TEST=1`` plus a per-run tmpdir for
``BIBLIOGON_DATA_DIR``, so the probe NEVER touches production
data. The tmpdir is cleaned up on exit.

Known limitation: plugins that import from ``app.*`` during
``activate()`` (e.g. ``git-sync`` reading from
``app.database``) FAIL in standalone-probe mode because no
FastAPI app is loaded. They surface as ``filter_reason=
"load_failed"`` with ``phase="activation"``. This is a real
diagnostic signal, not a probe bug — it tells you which plugins
are tightly coupled to the lifespan context. For the full
12/12 activation picture, run via the FastAPI lifespan
(``TestClient(app)`` in
``backend/tests/test_plugin_admin_rediscover.py``).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND = _REPO_ROOT / "backend"


def _setup_isolated_env() -> str:
    """Set required env vars + create a tmp data dir. Returns the
    tmpdir path so callers can clean up on exit. Mirrors the
    bibliogon test-isolation discipline (see CLAUDE.md "Test
    isolation"); never points at production data."""
    os.environ["BIBLIOGON_TEST"] = "1"
    os.environ["BIBLIOGON_DATABASE_URL"] = "sqlite:///:memory:"
    tmp = tempfile.mkdtemp(prefix="bibliogon-discovery-smoke-")
    os.environ["BIBLIOGON_DATA_DIR"] = tmp
    # Locate backend/config/ relative to THIS script, not the cwd —
    # the script can be invoked from anywhere.
    backend_config = _BACKEND / "config"
    if not backend_config.exists():
        raise SystemExit(
            f"Cannot find {backend_config}; the script expects to live in "
            "<repo>/scripts/ next to <repo>/backend/."
        )
    shutil.copytree(backend_config, Path(tmp) / "config", dirs_exist_ok=True)
    return tmp


def _build_manager(tmp: str):
    """Construct a fresh PluginManager mirroring backend/app/main.py.

    Reads from the tmp-copied config tree (set up by
    ``_setup_isolated_env``) so the probe never touches production
    YAML."""
    from pluginforge import PluginManager

    def _pre_activate(_plugin, _config) -> bool:
        # Smoke probe accepts every plugin; production wires the
        # license check here.
        return True

    return PluginManager(
        config_path=str(Path(tmp) / "config" / "app.yaml"),
        pre_activate=_pre_activate,
        api_version="1",
        app_id="bibliogon",
    )


def _result_to_dict(result) -> dict:
    """Serialize a DiscoveryResult into JSON-friendly shape."""
    return {
        "activated": sorted(result.activated),
        "activated_count": len(result.activated),
        "errors": [
            {
                "name": err.name,
                "phase": err.phase,
                "severity": err.severity,
                "user_facing_message": err.user_facing_message,
            }
            for err in result.errors
        ],
        "states": {
            name: {
                "discovered": state.discovered,
                "enabled_in_config": state.enabled_in_config,
                "disabled_in_config": state.disabled_in_config,
                "activated": state.activated,
                "filter_reason": state.filter_reason,
            }
            for name, state in result.states.items()
        },
    }


def _print_human_summary(payload: dict) -> None:
    print(f"Activated: {payload['activated_count']} plugins")
    print(f"  {sorted(payload['activated'])}")
    errors = [e for e in payload["errors"] if e["severity"] == "error"]
    warnings = [e for e in payload["errors"] if e["severity"] == "warning"]
    print(f"Errors: {len(errors)} (severity=error)")
    for err in errors:
        print(f"  - {err['name']} [{err['phase']}]: {err['user_facing_message']}")
    print(f"Notices: {len(warnings)} (severity=warning)")
    for warn in warnings:
        print(f"  - {warn['name']} [{warn['phase']}]: {warn['user_facing_message']}")
    filtered = {
        name: state["filter_reason"]
        for name, state in payload["states"].items()
        if state["filter_reason"] is not None
    }
    print(f"Filtered: {len(filtered)} plugins")
    for name, reason in sorted(filtered.items()):
        print(f"  - {name}: {reason}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument(
        "--json", action="store_true", help="Emit machine-readable JSON instead of text."
    )
    args = parser.parse_args()

    tmp = _setup_isolated_env()
    try:
        manager = _build_manager(tmp)
        result = manager.discover_plugins()
        payload = _result_to_dict(result)
        if args.json:
            json.dump(payload, sys.stdout, indent=2, sort_keys=True)
            print()
        else:
            _print_human_summary(payload)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
