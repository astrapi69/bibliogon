"""Optional system-tray support for the launcher.

pystray + Pillow are an OPTIONAL extra (``pip install
bibliogon-launcher[tray]``). When they are not installed the launcher
falls back to normal behaviour (the window's X button closes it); nothing
here ever raises on a missing dependency.

The tray icon is only meaningful while Bibliogon is running: minimizing
the window then keeps the stack running in the background, reachable from
the tray menu. All menu actions delegate to callbacks supplied by the
GUI; this module holds no business logic.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger("bibliogon_launcher.tray")

try:  # pragma: no cover - import availability is environment-dependent
    import pystray
    from PIL import Image
    HAS_TRAY = True
except ImportError:  # pragma: no cover
    pystray = None  # type: ignore[assignment]
    Image = None  # type: ignore[assignment]
    HAS_TRAY = False


def tray_available() -> bool:
    """True when pystray + Pillow are importable (tray can be shown)."""
    return HAS_TRAY


def build_menu_spec(
    *,
    open_label: str,
    open_browser_label: str,
    stop_label: str,
    quit_label: str,
) -> list[tuple[str, str]]:
    """Return the ordered ``(label, action_key)`` list for the tray menu.

    Pure helper so the menu contents are unit-testable without pystray.
    The GUI maps each ``action_key`` to a callback.
    """
    return [
        (open_label, "open"),
        (open_browser_label, "open_browser"),
        (stop_label, "stop"),
        (quit_label, "quit"),
    ]


def _load_icon_image(icon_path: Path | None):  # pragma: no cover - needs Pillow
    """Load the tray icon from ``icon_path`` or build a plain fallback."""
    if Image is None:
        return None
    if icon_path is not None and icon_path.is_file():
        try:
            return Image.open(icon_path)
        except (OSError, ValueError) as exc:
            logger.warning("could not load tray icon %s: %s", icon_path, exc)
    # Fallback: a small solid square so the tray always has an icon.
    return Image.new("RGB", (64, 64), (47, 110, 79))


class SystemTray:  # pragma: no cover - exercised manually (needs a tray host)
    """Thin wrapper over a pystray icon running on its own thread.

    ``callbacks`` maps the action keys from :func:`build_menu_spec` to
    zero-arg functions. The GUI is responsible for marshalling any
    tkinter work back onto the main thread inside those callbacks.
    """

    def __init__(
        self,
        *,
        menu_spec: list[tuple[str, str]],
        callbacks: dict[str, Callable[[], None]],
        tooltip: str,
        icon_path: Path | None = None,
    ) -> None:
        if not HAS_TRAY:
            raise RuntimeError("pystray is not installed")
        image = _load_icon_image(icon_path)
        items = [
            pystray.MenuItem(label, self._wrap(callbacks.get(key, lambda: None)))
            for label, key in menu_spec
        ]
        self._icon = pystray.Icon("bibliogon", image, tooltip, pystray.Menu(*items))
        self._thread: threading.Thread | None = None

    @staticmethod
    def _wrap(fn: Callable[[], None]) -> Callable[[object, object], None]:
        def handler(_icon: object, _item: object) -> None:
            fn()
        return handler

    def start(self) -> None:
        """Run the tray icon on a daemon thread."""
        self._thread = threading.Thread(target=self._icon.run, daemon=True, name="bibliogon-tray")
        self._thread.start()

    def update_tooltip(self, tooltip: str) -> None:
        self._icon.title = tooltip

    def stop(self) -> None:
        try:
            self._icon.stop()
        except Exception as exc:  # noqa: BLE001 - tray teardown must never crash
            logger.warning("tray stop failed: %s", exc)
