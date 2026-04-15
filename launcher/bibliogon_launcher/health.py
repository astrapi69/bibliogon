"""Health-check polling for the Bibliogon backend.

Uses ``urllib`` from the standard library so the PyInstaller bundle stays
dependency-free. Intentionally forgiving: any HTTP 200 with JSON
``status == "ok"`` counts as healthy, but we do not require specific
version fields.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


HEALTH_PATH = "/api/health"


def is_healthy(port: int, *, timeout: float = 2.0) -> bool:
    """One shot: True if the backend answers healthy, False otherwise."""
    url = f"http://localhost:{port}{HEALTH_PATH}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = resp.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return False
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return False
    return data.get("status") == "ok"


def wait_for_healthy(
    port: int,
    *,
    timeout_seconds: float = 60.0,
    interval_seconds: float = 0.5,
    clock: callable = time.monotonic,
    sleep: callable = time.sleep,
) -> bool:
    """Poll ``is_healthy`` until it returns True or ``timeout_seconds`` elapses.

    ``clock`` and ``sleep`` are injectable for unit tests that need
    deterministic control over time.
    """
    deadline = clock() + timeout_seconds
    while clock() < deadline:
        if is_healthy(port):
            return True
        sleep(interval_seconds)
    return False
