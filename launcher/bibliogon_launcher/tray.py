"""Optional system-tray support for the persistent launcher window.

``pystray`` + ``Pillow`` are an OPTIONAL dependency, installed on demand
with ``pip install pystray Pillow``. When they are NOT installed the
launcher behaves exactly as before - the window's X button closes it - and
nothing here crashes. When they ARE installed AND the app is running, the
window minimizes to the system tray instead, exposing a right-click menu
and click-to-restore.

This module owns ONLY the tray-icon lifecycle. Every menu action routes
back through the callbacks the caller supplies (which in turn go through
:mod:`bibliogon_launcher.actions` or the Tk window); no business logic
lives here. It is import-safe without the extra so the rest of the
launcher - and its tests - never depend on ``pystray`` being present.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger("bibliogon_launcher.tray")

try:
    import pystray
    from PIL import Image

    HAS_TRAY = True
except Exception:  # noqa: BLE001 - see below
    # Not just ImportError: on Linux, importing pystray eagerly selects a
    # backend, which can raise non-ImportError errors when no usable tray is
    # present (e.g. Xlib.error.DisplayNameError on a headless box, or a GTK
    # init failure). Any such failure must DISABLE the tray, never crash the
    # launcher on startup - the launcher_app module imports this one.
    pystray = None  # type: ignore[assignment]
    Image = None  # type: ignore[assignment]
    HAS_TRAY = False

# Icon source priority: the launcher's own bundled icon files. A missing or
# unreadable icon disables the tray (the caller falls back to a plain
# close), never a crash.
_ICON_CANDIDATES = (
    Path(__file__).parents[1] / "bibliogon.png",
    Path(__file__).parents[1] / "bibliogon.ico",
    Path(__file__).parent / "bibliogon.png",
)

# pystray backend modules that do NOT reliably dock on modern Linux
# desktops. The legacy X11 XEmbed backend (``pystray._xorg``) fires its
# ``setup`` callback (so ``icon.visible`` becomes True) but then silently
# fails to dock on GNOME/Wayland - the icon never actually appears. Hiding
# the window in that case would leave no way to bring it back, so we refuse
# this backend and fall back to a plain close. AppIndicator
# (gir1.2-ayatanaappindicator3-0.1) is the reliable path on Ubuntu.
_UNRELIABLE_BACKENDS = ("pystray._xorg",)

# The tray menu, in display order: (action_id, i18n_label_key). action_id
# maps 1:1 to a caller-supplied callback. Pure data so the composition is
# unit-testable without pystray.
MENU_SPEC: tuple[tuple[str, str], ...] = (
    ("open", "tray.open"),
    ("open_browser", "tray.open_browser"),
    ("stop", "tray.stop"),
    ("quit", "tray.quit"),
)


def tray_available() -> bool:
    """True when ``pystray`` + ``Pillow`` are importable (the ``tray`` extra)."""
    return HAS_TRAY


def menu_action_ids() -> list[str]:
    """Return the tray menu action ids in display order. Pure (no pystray)."""
    return [action_id for action_id, _ in MENU_SPEC]


def _load_icon_image():
    """Load the tray icon as a PIL image, or ``None`` when unavailable.

    Best-effort: returns ``None`` (rather than raising) when the extra is
    absent or no icon file can be read, so the caller can fall back to a
    plain window close.
    """
    if not HAS_TRAY:
        return None
    for candidate in _ICON_CANDIDATES:
        if not candidate.is_file():
            continue
        try:
            # Convert to RGBA so every backend (notably GTK/AppIndicator)
            # gets a format it can render regardless of the source mode.
            return Image.open(str(candidate)).convert("RGBA")
        except Exception as exc:  # noqa: BLE001 - icon is best-effort
            logger.debug("could not load tray icon %s: %s", candidate, exc)
    logger.warning("no tray icon image found in %s", [str(c) for c in _ICON_CANDIDATES])
    return None


class TrayController:
    """Owns the ``pystray`` icon lifecycle for the launcher window.

    Construct with the port (tooltip + browser action), the localized menu
    ``labels`` (keyed by action id), and one callback per action id. Each
    callback is invoked on the pystray thread, so a callback that touches
    Tk must marshal onto the Tk thread itself (the window passes
    ``root.after``-wrapped callbacks).

    A no-op when the ``tray`` extra is not installed: :meth:`start` returns
    ``False`` and :meth:`stop` does nothing.

    Example:
        tray = TrayController(
            port=7880,
            tooltip="Bibliogon is running on port 7880",
            labels={"open": "Open", "open_browser": "Open in browser",
                    "stop": "Stop", "quit": "Quit"},
            callbacks={"open": restore, "open_browser": open_browser,
                       "stop": stop, "quit": quit},
        )
        if tray.start():
            root.withdraw()
    """

    def __init__(
        self,
        *,
        port: int,
        tooltip: str,
        labels: dict[str, str],
        callbacks: dict[str, Callable[[], None]],
    ) -> None:
        self._port = port
        self._tooltip = tooltip
        self._labels = labels
        self._callbacks = callbacks
        self._icon = None
        self._thread: threading.Thread | None = None

    # How long to wait for the platform tray to actually show the icon
    # before giving up and falling back to a plain window close.
    _READY_TIMEOUT_SECONDS = 5.0

    def start(self) -> bool:
        """Show the tray icon. Returns ``True`` only once the icon is
        actually visible in the system tray.

        Returns ``False`` when the extra is missing, no icon image is
        available, or the platform tray never appeared. In every False case
        the caller falls back to closing the window, so the window is never
        hidden with no tray icon to bring it back.

        ``pystray.Icon.run()`` blocks on the platform tray loop, so it MUST
        run in its own thread. It is deliberately NOT ``run_detached()``:
        that is unimplemented on the Linux GTK/AppIndicator backend.
        """
        if not HAS_TRAY:
            logger.info(
                "system tray unavailable: the 'tray' extra (pystray + Pillow) is not installed"
            )
            return False
        image = _load_icon_image()
        if image is None:
            return False
        backend = getattr(pystray.Icon, "__module__", "")
        if backend in _UNRELIABLE_BACKENDS:
            logger.info(
                "system tray disabled: backend %s does not dock on modern "
                "desktops; install gir1.2-ayatanaappindicator3-0.1 for AppIndicator support",
                backend,
            )
            return False
        self._icon = pystray.Icon(
            "bibliogon",
            image,
            self._tooltip,
            self._build_menu(),
        )
        ready = threading.Event()

        def _on_setup(icon) -> None:
            # Invoked by pystray once the tray loop is running. Make the
            # icon visible and signal that the tray actually appeared.
            icon.visible = True
            ready.set()

        def _run_loop() -> None:
            try:
                self._icon.run(setup=_on_setup)
            except Exception as exc:  # noqa: BLE001 - surface, then fall back to close
                logger.warning(
                    "system tray loop failed (on Linux, install "
                    "gir1.2-ayatanaappindicator3-0.1): %s",
                    exc,
                )
                ready.set()  # unblock the waiter so it can detect the failure

        self._thread = threading.Thread(target=_run_loop, name="bg-tray", daemon=True)
        self._thread.start()

        if not ready.wait(timeout=self._READY_TIMEOUT_SECONDS) or not getattr(
            self._icon, "visible", False
        ):
            logger.warning(
                "system tray did not appear; falling back to closing the window"
            )
            self.stop()
            return False
        logger.info("minimized to system tray (port %d)", self._port)
        return True

    def stop(self) -> None:
        """Remove the tray icon and end its loop. Safe to call when not started."""
        if self._icon is None:
            return
        try:
            self._icon.stop()
        except Exception as exc:  # noqa: BLE001 - teardown must never raise
            logger.debug("tray icon stop failed: %s", exc)
        self._icon = None
        self._thread = None

    def _build_menu(self):
        items = []
        for action_id, _label_key in MENU_SPEC:
            callback = self._callbacks.get(action_id)
            if callback is None:
                continue
            items.append(
                pystray.MenuItem(
                    self._labels.get(action_id, action_id),
                    _as_menu_handler(callback),
                    # Make "open" the default item so a single/double click
                    # on the tray icon restores the window.
                    default=(action_id == "open"),
                )
            )
        return pystray.Menu(*items)


def _as_menu_handler(callback: Callable[[], None]) -> Callable[..., None]:
    """Adapt a zero-arg callback to pystray's ``handler(icon, item)`` shape."""

    def _handler(_icon=None, _item=None) -> None:
        callback()

    return _handler
