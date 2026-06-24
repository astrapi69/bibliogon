"""Shared fixtures for the thin Bibliogon launcher wrapper.

The launcher now delegates to ``docker_app_launcher``; these fixtures keep
``main()`` calls hermetic (no real HOME writes, no leaked root-log handlers,
no leaked working-directory change).
"""

from __future__ import annotations

import contextlib
import logging
import os

import pytest


@pytest.fixture(autouse=True)
def restore_cwd():
    """Restore the working directory after each test.

    ``main()`` chdir's into the resolved Compose-stack dir; a test driving it
    must not leak that change to sibling tests.
    """
    cwd = os.getcwd()
    yield
    with contextlib.suppress(OSError):
        os.chdir(cwd)


@pytest.fixture(autouse=True)
def isolate_home(tmp_path, monkeypatch):
    """Point HOME at a tmp dir so launcher.log / install.log stay isolated."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.delenv("APPDATA", raising=False)
    return home


@pytest.fixture(autouse=True)
def reset_root_logging():
    """Restore root-logger handlers after each test (the package's logging
    setup adds them)."""
    root = logging.getLogger()
    saved = root.handlers[:]
    level = root.level
    yield
    for handler in root.handlers[:]:
        if handler not in saved:
            root.removeHandler(handler)
            with contextlib.suppress(Exception):
                handler.close()
    root.setLevel(level)
