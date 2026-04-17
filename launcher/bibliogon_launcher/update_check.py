"""Background update check against the GitHub Releases API.

Fails completely silently on any error (no network, GitHub down,
rate limit, malformed response). The launcher must never be blocked
or interrupted by the update check. The user sees a notification
only when a strictly newer release is actually available.

Stdlib only (urllib, json, threading). No additional dependencies.
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.request
from collections.abc import Callable

logger = logging.getLogger("bibliogon_launcher.update_check")

RELEASES_URL = "https://api.github.com/repos/astrapi69/bibliogon/releases/latest"
TIMEOUT_SECONDS = 5.0


def is_newer(current: str, latest: str) -> bool:
    """True if ``latest`` is a strictly greater version than ``current``.

    Both arguments accept an optional leading ``v``. Components are
    compared as integers. Any parse error returns False so the
    launcher does not flag a bogus update on a malformed tag.
    """
    def parse(v: str) -> tuple[int, ...]:
        return tuple(int(x) for x in v.lstrip("v").split("."))
    try:
        return parse(latest) > parse(current)
    except (ValueError, AttributeError):
        return False


def fetch_latest_version() -> tuple[str, str] | None:
    """Return ``(tag_name, html_url)`` of the latest release, or ``None``.

    Silent on any failure: network error, timeout, rate limit, JSON
    parse error, missing fields. The caller treats None as "no update
    information available, proceed as usual".
    """
    try:
        req = urllib.request.Request(
            RELEASES_URL,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "bibliogon-launcher",
            },
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            data = json.loads(resp.read())
        tag = data.get("tag_name")
        url = data.get("html_url")
        if not tag or not url:
            return None
        return tag, url
    except Exception as exc:  # noqa: BLE001 - genuinely want to swallow everything
        logger.info("update check failed silently: %s", exc)
        return None


def check_for_update_async(
    current_version: str,
    on_update_available: Callable[[str, str], None],
) -> None:
    """Run the version check in a background daemon thread.

    Invokes ``on_update_available(tag, html_url)`` on a worker thread
    only when a strictly newer release is found. The callback is
    responsible for marshalling the UI update back to the main
    thread via ``window.after(0, ...)`` - this module never touches
    tkinter directly.
    """
    def _run() -> None:
        result = fetch_latest_version()
        if result is None:
            return
        tag, url = result
        if is_newer(current_version, tag):
            try:
                on_update_available(tag, url)
            except Exception as exc:  # noqa: BLE001
                logger.warning("update notification callback raised: %s", exc)

    thread = threading.Thread(target=_run, daemon=True, name="bibliogon-update-check")
    thread.start()
