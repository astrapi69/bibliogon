"""Single-window GUI for the Bibliogon launcher (Schicht 2).

The whole launcher lives in ONE persistent tkinter window. It opens on
start, shows the Docker check, the install/run/stop state, a port field,
live progress, and the uninstall confirmation - all in place. Nothing
here closes the window programmatically and no action opens a second
window; the only ways the window goes away are the user's X button (which
minimizes to the system tray while Bibliogon is running, if pystray is
available) and the tray "Quit" action.

This module is a thin renderer over :mod:`bibliogon_launcher.actions`.
The pure presentation helpers (:func:`classify_port`,
:func:`buttons_for_state`) are unit-tested; the tkinter rendering itself
is exercised manually per ``launcher/TESTPLAN.md``.
"""

from __future__ import annotations

import logging
import threading
import tkinter as tk
from collections.abc import Callable
from pathlib import Path
from tkinter import ttk

from bibliogon_launcher import (
    __version__,
    actions,
    cleanup,
    config,
    i18n,
    installer,
    manifest,
    tray,
)

logger = logging.getLogger("bibliogon_launcher.gui")

PROJECT_NAME = actions.PROJECT_NAME

_OK_COLOR = "#2e7d32"
_BUSY_COLOR = "#c62828"
_NEUTRAL_COLOR = "#666666"

# Action keys per state -> the button row the user sees.
_STATE_BUTTONS = {
    actions.STATE_NOT_INSTALLED: ["install"],
    actions.STATE_RUNNING: ["open", "stop", "uninstall"],
    actions.STATE_STOPPED: ["start", "uninstall"],
    actions.STATE_NO_DOCKER: ["recheck"],
}


def buttons_for_state(state: str) -> list[str]:
    """Return the ordered action-button keys to show for ``state``."""
    return list(_STATE_BUTTONS.get(state, ["recheck"]))


def classify_port(text: str, *, free: bool | None = None, running: bool = False) -> str:
    """Classify a port-field value for the inline validation indicator.

    Returns one of ``"invalid"`` (out of range / not a number),
    ``"own"`` (held by Bibliogon - shown green while running),
    ``"free"``, ``"busy"``, or ``"unknown"`` (no freeness info). Pure so
    the indicator logic is unit-testable without a Tk widget.
    """
    try:
        port = int(text)
    except (TypeError, ValueError):
        return "invalid"
    if not actions.valid_port(port):
        return "invalid"
    if running:
        return "own"
    if free is True:
        return "free"
    if free is False:
        return "busy"
    return "unknown"


def _icon_path() -> Path | None:
    """Best-effort path to the launcher icon for the window + tray."""
    candidate = Path(__file__).resolve().parent.parent / "bibliogon.ico"
    return candidate if candidate.is_file() else None


class LauncherApp(tk.Tk):  # pragma: no cover - tkinter UI, manually tested
    """The single persistent launcher window."""

    def __init__(self, project: str = PROJECT_NAME) -> None:
        super().__init__()
        self._project = project
        self._state: str = actions.STATE_NO_DOCKER
        self._port = config.DEFAULT_PORT
        self._busy = False
        self._tray: tray.SystemTray | None = None

        self.title("Bibliogon")
        self._apply_icon()
        self.geometry("520x440")
        self.minsize(460, 380)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._build_widgets()
        self.after(50, self.refresh)

    # --- widget construction ---

    def _build_widgets(self) -> None:
        outer = ttk.Frame(self, padding=16)
        outer.pack(fill=tk.BOTH, expand=True)

        header = ttk.Label(outer, text="Bibliogon", font=("", 18, "bold"))
        header.pack(anchor=tk.W)
        ttk.Label(outer, text=f"v{__version__}", foreground=_NEUTRAL_COLOR).pack(anchor=tk.W)

        self._status_var = tk.StringVar(value=i18n.t("state.checking"))
        self._status_label = ttk.Label(outer, textvariable=self._status_var, wraplength=480, font=("", 11))
        self._status_label.pack(anchor=tk.W, pady=(14, 8))

        port_row = ttk.Frame(outer)
        port_row.pack(anchor=tk.W, pady=(0, 8), fill=tk.X)
        ttk.Label(port_row, text=i18n.t("port.label")).pack(side=tk.LEFT)
        self._port_var = tk.StringVar(value=str(self._port))
        self._port_var.trace_add("write", lambda *_: self._on_port_change())
        self._port_entry = ttk.Entry(port_row, width=8, textvariable=self._port_var)
        self._port_entry.pack(side=tk.LEFT, padx=(6, 6))
        self._port_indicator = ttk.Label(port_row, text="")
        self._port_indicator.pack(side=tk.LEFT)

        self._button_row = ttk.Frame(outer)
        self._button_row.pack(anchor=tk.W, pady=(4, 10), fill=tk.X)

        prog_frame = ttk.Frame(outer)
        prog_frame.pack(fill=tk.BOTH, expand=True, pady=(4, 0))
        self._progress = tk.Text(prog_frame, height=8, wrap=tk.WORD, state=tk.DISABLED)
        scroll = ttk.Scrollbar(prog_frame, command=self._progress.yview)
        self._progress.configure(yscrollcommand=scroll.set)
        self._progress.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)

    def _apply_icon(self) -> None:
        path = _icon_path()
        if path is None:
            return
        try:
            self.iconbitmap(str(path))
        except tk.TclError:
            logger.debug("iconbitmap unsupported on this platform")

    # --- progress + status helpers ---

    def _append_progress(self, line: str) -> None:
        self._progress.configure(state=tk.NORMAL)
        self._progress.insert(tk.END, line + "\n")
        self._progress.see(tk.END)
        self._progress.configure(state=tk.DISABLED)

    def _set_status(self, text: str, color: str = "") -> None:
        self._status_var.set(text)
        self._status_label.configure(foreground=color or self.cget("foreground"))

    # --- state rendering ---

    def refresh(self) -> None:
        """Re-detect docker + state on a worker thread, then re-render."""
        self._set_status(i18n.t("state.checking"))
        self._run_bg(self._detect_and_render)

    def _detect_and_render(self) -> None:
        state = actions.get_state(self._project)
        self.after(0, lambda: self._render(state))

    def _render(self, state: str) -> None:
        self._state = state
        if state == actions.STATE_RUNNING:
            self._port = config.read_port(self._compose_dir() or Path("."))
            self._port_var.set(str(self._port))
            self._set_status(i18n.t("state.running", port=self._port), _OK_COLOR)
            self._set_port_editable(False)
        elif state == actions.STATE_STOPPED:
            self._set_status(i18n.t("state.stopped"))
            self._set_port_editable(True)
        elif state == actions.STATE_NOT_INSTALLED:
            self._set_status(i18n.t("state.not_installed"))
            self._set_port_editable(True)
        else:
            ok, detail = actions.check_docker()
            heading = i18n.t("docker.missing.heading") if "PATH" in detail else i18n.t("docker.daemon.title")
            self._set_status(heading, _BUSY_COLOR)
            self._set_port_editable(False)
        self._render_buttons()
        self._on_port_change()

    def _set_port_editable(self, editable: bool) -> None:
        self._port_entry.configure(state=tk.NORMAL if editable else tk.DISABLED)

    def _render_buttons(self) -> None:
        for child in self._button_row.winfo_children():
            child.destroy()
        labels = {
            "install": i18n.t("install_prompt.install_button"),
            "start": i18n.t("button.start"),
            "stop": i18n.t("manage.stop"),
            "uninstall": i18n.t("manage.uninstall"),
            "open": i18n.t("common.open_browser"),
            "recheck": i18n.t("docker.daemon.recheck"),
        }
        handlers: dict[str, Callable[[], None]] = {
            "install": self._do_install,
            "start": self._do_start,
            "stop": self._do_stop,
            "uninstall": self._confirm_uninstall,
            "open": self._do_open,
            "recheck": self.refresh,
        }
        for key in buttons_for_state(self._state):
            btn = ttk.Button(self._button_row, text=labels[key], command=handlers[key])
            btn.pack(side=tk.LEFT, padx=(0, 8))
            if self._busy:
                btn.configure(state=tk.DISABLED)

    # --- port field validation ---

    def _on_port_change(self) -> None:
        running = self._state == actions.STATE_RUNNING
        free = None
        text = self._port_var.get()
        try:
            port = int(text)
            if actions.valid_port(port) and not running:
                free = config.is_port_free(port)
        except (TypeError, ValueError):
            pass
        status = classify_port(text, free=free, running=running)
        self._port_indicator.configure(**_port_indicator_style(status))

    def _current_port(self) -> int:
        try:
            port = int(self._port_var.get())
        except (TypeError, ValueError):
            return config.DEFAULT_PORT
        return port if actions.valid_port(port) else config.DEFAULT_PORT

    # --- actions (each runs on a worker thread) ---

    def _run_bg(self, work: Callable[[], None]) -> None:
        threading.Thread(target=work, daemon=True).start()

    def _begin_op(self) -> None:
        self._busy = True
        self._render_buttons()

    def _end_op(self) -> None:
        self._busy = False
        self.refresh()

    def _do_open(self) -> None:
        actions.open_browser(self._current_port(), "/")

    def _do_install(self) -> None:
        port = self._current_port()
        self._begin_op()
        self._append_progress(i18n.t("status.starting"))

        def work() -> None:
            compose = actions.resolve_compose_file()
            if compose is None:
                target = config.default_repo_path()
                self.after(0, lambda: self._append_progress(i18n.t("install.downloading", version=installer.BIBLIOGON_TARGET_VERSION)))
                ok, detail = installer.download_release(target, progress_callback=self._download_progress)
                if not ok:
                    self.after(0, lambda: self._append_progress(f"{i18n.t('install.failed.title')}: {detail}"))
                    self.after(0, self._end_op)
                    return
                installer.create_env_file(target)
                try:
                    manifest.write_manifest(target, installer.BIBLIOGON_TARGET_VERSION)
                except OSError as exc:
                    logger.warning("manifest write failed: %s", exc)
                compose = target / config.COMPOSE_FILENAME
            actions.set_port(config.launcher_config_path(), port)
            self.after(0, lambda: self._append_progress(i18n.t("install.building_images")))
            ok, detail = actions.install(str(compose), self._project, port)
            msg = i18n.t("progress.install_done") if ok else f"{i18n.t('install.failed.title')}: {detail}"
            self.after(0, lambda: self._append_progress(msg))
            self.after(0, self._end_op)

        self._run_bg(work)

    def _download_progress(self, downloaded: int, total: int) -> None:
        if total > 0:
            pct = int(downloaded / total * 100)
            label = f"{installer.human_size(downloaded)} / {installer.human_size(total)} ({pct}%)"
        else:
            label = installer.human_size(downloaded)
        self.after(0, lambda: self._replace_last_progress(label))

    def _replace_last_progress(self, line: str) -> None:
        self._progress.configure(state=tk.NORMAL)
        self._progress.delete("end-2l", "end-1l")
        self._progress.insert(tk.END, line + "\n")
        self._progress.see(tk.END)
        self._progress.configure(state=tk.DISABLED)

    def _do_start(self) -> None:
        port = self._current_port()
        self._begin_op()
        self._append_progress(i18n.t("status.starting"))

        def work() -> None:
            compose = actions.resolve_compose_file()
            if compose is None:
                self.after(0, lambda: self._append_progress(i18n.t("install_prompt.message")))
                self.after(0, self._end_op)
                return
            actions.set_repo_port(compose.parent, port)
            ok, detail = actions.start(str(compose), self._project)
            msg = i18n.t("progress.start_done") if ok else f"{i18n.t('start.compose_failed.title')}: {detail}"
            self.after(0, lambda: self._append_progress(msg))
            self.after(0, self._end_op)

        self._run_bg(work)

    def _do_stop(self) -> None:
        self._begin_op()
        self._append_progress(i18n.t("uninstall.stopping"))

        def work() -> None:
            ok, detail = actions.stop(self._project)
            msg = i18n.t("manage.stopped.message") if ok else detail
            self.after(0, lambda: self._append_progress(msg))
            self.after(0, self._end_op)

        self._run_bg(work)

    # --- in-window uninstall confirmation (no second window) ---

    def _confirm_uninstall(self) -> None:
        install_dir = self._compose_dir() or config.resolve_repo_path()
        self._append_progress(i18n.t("uninstall.message", path=str(install_dir)))
        for child in self._button_row.winfo_children():
            child.destroy()
        ttk.Button(
            self._button_row,
            text=i18n.t("uninstall.confirm"),
            command=self._do_uninstall,
        ).pack(side=tk.LEFT, padx=(0, 8))
        ttk.Button(
            self._button_row,
            text=i18n.t("common.cancel"),
            command=self._render_buttons,
        ).pack(side=tk.LEFT)

    def _do_uninstall(self) -> None:
        self._begin_op()

        def on_step(step: str) -> None:
            self.after(0, lambda: self._append_progress(f"  - {step}"))

        def work() -> None:
            install_dir = self._compose_dir() or config.resolve_repo_path()
            results = cleanup.uninstall_bibliogon(install_dir, status_callback=on_step)
            ok = all(results.values()) if results else False
            msg = i18n.t("progress.uninstall_done") if ok else i18n.t("uninstall.failed.message")
            self.after(0, lambda: self._append_progress(msg))
            self.after(0, self._end_op)

        self._run_bg(work)

    # --- helpers ---

    def _compose_dir(self) -> Path | None:
        compose = actions.resolve_compose_file()
        return compose.parent if compose is not None else None

    # --- window close / system tray ---

    def _on_close(self) -> None:
        """X button: minimize to tray while running, else quit.

        Per the spec the window never closes itself; this handler runs
        only on an explicit user X-click. While Bibliogon is running and
        pystray is available we hide to the tray (keeping the stack up);
        otherwise we genuinely quit the launcher.
        """
        if self._state == actions.STATE_RUNNING and tray.tray_available():
            self._minimize_to_tray()
            return
        self.destroy()

    def _minimize_to_tray(self) -> None:
        self.withdraw()
        if self._tray is None:
            menu = tray.build_menu_spec(
                open_label=i18n.t("tray.open"),
                open_browser_label=i18n.t("common.open_browser"),
                stop_label=i18n.t("manage.stop"),
                quit_label=i18n.t("docker.missing.quit_button"),
            )
            self._tray = tray.SystemTray(
                menu_spec=menu,
                callbacks={
                    "open": lambda: self.after(0, self._restore_from_tray),
                    "open_browser": self._do_open,
                    "stop": lambda: self.after(0, self._do_stop),
                    "quit": lambda: self.after(0, self._quit_from_tray),
                },
                tooltip=i18n.t("tray.tooltip", port=self._port),
                icon_path=_icon_path(),
            )
            self._tray.start()

    def _restore_from_tray(self) -> None:
        self.deiconify()
        self.lift()

    def _quit_from_tray(self) -> None:
        if self._tray is not None:
            self._tray.stop()
        self.destroy()


def _port_indicator_style(status: str) -> dict[str, str]:
    """Map a :func:`classify_port` status to a label style dict."""
    text = {
        "free": i18n.t("port.free"),
        "busy": i18n.t("port.in_use"),
        "own": i18n.t("port.own"),
        "invalid": i18n.t("port.invalid_hint"),
        "unknown": "",
    }.get(status, "")
    color = {
        "free": _OK_COLOR,
        "own": _OK_COLOR,
        "busy": _BUSY_COLOR,
        "invalid": _BUSY_COLOR,
        "unknown": _NEUTRAL_COLOR,
    }.get(status, _NEUTRAL_COLOR)
    return {"text": text, "foreground": color}


def run() -> int:
    """Construct and run the single launcher window. Returns 0 on close."""
    app = LauncherApp()
    app.mainloop()
    return 0
