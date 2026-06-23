"""Persistent launcher window (LauncherApp) + inline port field.

A single long-lived window (instead of the dialog chain) that shows the
current state and lets the user act. The Tk layer is intentionally thin:
all business logic goes through :mod:`bibliogon_launcher.actions`, and the
pure helpers below (``port_editable`` / ``buttons_for_state`` /
``dispatch_action``) carry the behaviour so they are unit-testable without
a display.

This is the default when the launcher runs from a source checkout (the
repo + production compose file are present, so install = build). End-user
frozen installs that still need to DOWNLOAD a release keep the classic
dialog flow in :mod:`bibliogon_launcher.__main__` until the window grows a
download step.
"""

from __future__ import annotations

import logging
import threading
import tkinter as tk

from bibliogon_launcher import actions, config, i18n, manifest, tray, ui

logger = logging.getLogger("bibliogon_launcher.launcher_app")

# action_id -> i18n label key, per state. action_id drives dispatch_action.
_BUTTONS: dict[str, list[tuple[str, str]]] = {
    # No "cancel" / close button anywhere: the ONLY way to close the single
    # window is its X (WM_DELETE_WINDOW).
    "no_docker": [("recheck", "common.retry")],
    "not_installed": [("install", "install_prompt.install_button")],
    "stopped": [("start", "manage.start"), ("uninstall", "manage.uninstall")],
    "running": [("open", "common.open_browser"), ("stop", "manage.stop"), ("uninstall", "manage.uninstall")],
}


# Window sizing. The running/stopped state shows three width-18 buttons in a
# single row; minsize keeps the button row + scrollable status area fully
# visible if the user shrinks the window.
WINDOW_GEOMETRY = "640x480"
MIN_WIDTH = 600
MIN_HEIGHT = 420


def state_label(state: str) -> str:
    """Localized heading for ``state`` (falls back to the raw state id)."""
    return i18n.t(f"window.state.{state}")


def port_editable(state: str) -> bool:
    """The port field is editable only before the app is running."""
    return state in ("not_installed", "stopped")


def buttons_for_state(state: str) -> list[tuple[str, str]]:
    """Return ``[(action_id, i18n_label_key), ...]`` for ``state``."""
    return list(_BUTTONS.get(state, []))


def dispatch_action(action_id: str, *, compose_file: str, project: str, port: int, on_step=None, on_output=None) -> tuple[bool, str] | None:
    """Run the action for ``action_id`` through the actions layer.

    Returns ``(ok, message)`` for actions that report a result, or ``None``
    for fire-and-forget / navigational ids (open, recheck). ``on_step``
    streams step labels; ``on_output`` streams the build's output
    line-by-line. Pure (no Tk) so it is unit-testable by mocking
    ``actions``.
    """
    if action_id == "install":
        return actions.install(compose_file, project, port, on_step=on_step, on_output=on_output)
    if action_id == "start":
        return actions.start(compose_file, project, on_step=on_step, on_output=on_output)
    if action_id == "stop":
        return actions.stop(project)
    if action_id == "uninstall":
        return actions.uninstall(project)
    if action_id == "open":
        actions.open_browser(port)
        return None
    if action_id == "recheck":
        return None
    logger.warning("unknown action_id: %s", action_id)
    return None


def should_minimize_to_tray(state: str, *, tray_available: bool) -> bool:
    """Whether closing the window should minimize to the tray.

    Minimize only when the app is RUNNING and the system-tray extra is
    available; otherwise the X closes the launcher. Pure (no Tk) so it is
    unit-testable.
    """
    return state == "running" and tray_available


def tray_menu_labels() -> dict[str, str]:
    """Localized tray-menu labels keyed by action id."""
    return {action_id: i18n.t(label_key) for action_id, label_key in tray.MENU_SPEC}


class LauncherApp:
    """The persistent window. Thin Tk over the helpers above."""

    def __init__(self, *, project: str = actions.DEFAULT_PROJECT) -> None:
        self._project = project
        self._config_path = config.launcher_config_path()
        repo = config.source_checkout_repo() or manifest.install_dir_from_manifest() or config.resolve_repo_path()
        self._compose_file = str(repo / config.COMPOSE_FILENAME)
        self._port = config.read_port(repo) if repo else actions.DEFAULT_PORT
        self._tray: tray.TrayController | None = None

        self._root = tk.Tk()
        self._root.title("Bibliogon")
        self._root.geometry(WINDOW_GEOMETRY)
        self._root.minsize(MIN_WIDTH, MIN_HEIGHT)  # button row never clips
        ui._set_window_icon(self._root)  # crash-safe
        # Closing the window minimizes to the system tray while the app is
        # running (if the tray extra is installed); otherwise it closes the
        # launcher.
        self._root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._state_label = tk.Label(self._root, font=("Segoe UI", 12, "bold"))
        self._state_label.pack(pady=(18, 8))

        port_row = tk.Frame(self._root)
        port_row.pack(pady=(0, 8))
        tk.Label(port_row, text="Port:").pack(side="left", padx=(0, 6))
        self._port_var = tk.StringVar(value=str(self._port))
        self._port_entry = tk.Entry(port_row, textvariable=self._port_var, width=8)
        self._port_entry.pack(side="left")
        self._port_indicator = tk.Label(port_row, text="", width=2)
        self._port_indicator.pack(side="left", padx=(6, 0))
        self._port_entry.bind("<KeyRelease>", lambda _e: self._validate_port())

        self._button_row = tk.Frame(self._root)
        self._button_row.pack(pady=(4, 0))

        # In-window status/progress/error area (scrollable). Everything is
        # shown HERE - no separate dialog, no close-and-reopen.
        status_frame = tk.Frame(self._root)
        status_frame.pack(fill="both", expand=True, padx=12, pady=(8, 12))
        scrollbar = tk.Scrollbar(status_frame, orient="vertical")
        scrollbar.pack(side="right", fill="y")
        self._status = tk.Text(
            status_frame, height=8, wrap="word", state="disabled",
            relief="flat", font=("Consolas", 9), yscrollcommand=scrollbar.set,
        )
        self._status.pack(side="left", fill="both", expand=True)
        scrollbar.configure(command=self._status.yview)
        self._status.tag_configure("ok", foreground="#188038")
        self._status.tag_configure("err", foreground="#c5221f")
        self._status.tag_configure("info", foreground="#555")

        self._refresh()

    def _log(self, line: str, *, tag: str = "info") -> None:
        self._status.configure(state="normal")
        self._status.insert("end", line + "\n", tag)
        self._status.see("end")
        self._status.configure(state="disabled")

    def _clear_status(self) -> None:
        self._status.configure(state="normal")
        self._status.delete("1.0", "end")
        self._status.configure(state="disabled")

    # --- rendering ---

    def _refresh(self) -> None:
        state = actions.get_state(self._project)
        self._state_label.configure(text=state_label(state))
        editable = port_editable(state)
        self._port_entry.configure(state="normal" if editable else "disabled")
        self._validate_port()
        for child in self._button_row.winfo_children():
            child.destroy()
        for action_id, label_key in buttons_for_state(state):
            tk.Button(
                self._button_row, text=i18n.t(label_key), width=18,
                command=lambda a=action_id: self._on_action(a),
            ).pack(side="left", padx=4)

    def _validate_port(self) -> None:
        raw = self._port_var.get().strip()
        if not raw.isdigit():
            self._port_indicator.configure(text="✗", fg="#c5221f")
            return
        free, _ = actions.check_port(int(raw))
        self._port_indicator.configure(
            text="✓" if free else "✗",
            fg="#188038" if free else "#c5221f",
        )

    # --- actions (threaded) ---

    def _on_action(self, action_id: str) -> None:
        # NOTE: no programmatic window close anywhere - only the X closes
        # the window. Persist an edited port before a lifecycle action uses
        # it.
        raw = self._port_var.get().strip()
        if raw.isdigit():
            ok, _ = actions.set_port(self._config_path, int(raw))
            if ok:
                self._port = int(raw)
        self._set_busy(True)

        def step(label: str) -> None:
            self._root.after(0, lambda: self._log(label))

        def output(line: str) -> None:
            # Stream each build line into the scrollable log on the Tk thread.
            self._root.after(0, lambda raw=line: self._log(raw))

        def worker() -> None:
            result = dispatch_action(
                action_id, compose_file=self._compose_file,
                project=self._project, port=self._port,
                on_step=step, on_output=output,
            )
            self._root.after(0, lambda: self._on_result(action_id, result))

        threading.Thread(target=worker, daemon=True).start()

    def _on_result(self, action_id: str, result: tuple[bool, str] | None) -> None:
        self._set_busy(False)
        if result is not None:
            ok, msg = result
            self._log(msg, tag="ok" if ok else "err")
        self._refresh()  # updates state heading + buttons; window stays open

    def _set_busy(self, busy: bool) -> None:
        for child in self._button_row.winfo_children():
            child.configure(state="disabled" if busy else "normal")
        if busy:
            self._clear_status()
            self._log(i18n.t("status.starting"))

    # --- close / system tray ---

    def _on_close(self) -> None:
        """WM_DELETE_WINDOW handler: minimize to tray or close the launcher.

        Minimizes to the system tray only while the app is running AND the
        tray extra is available; in every other case (app stopped, no
        pystray, tray failed to start) it closes the launcher.
        """
        if should_minimize_to_tray(actions.get_state(self._project), tray_available=tray.tray_available()):
            if self._minimize_to_tray():
                return
        self._quit()

    def _minimize_to_tray(self) -> bool:
        """Show the tray icon and hide the window. Returns False on failure
        (the caller then closes the launcher instead)."""
        controller = tray.TrayController(
            port=self._port,
            tooltip=i18n.t("tray.tooltip", port=self._port),
            labels=tray_menu_labels(),
            callbacks={
                # open / quit touch Tk, so marshal onto the Tk thread;
                # open_browser is thread-safe. stop reuses the existing
                # action handler (no new business logic).
                "open": lambda: self._root.after(0, self._restore_window),
                "open_browser": lambda: actions.open_browser(self._port),
                "stop": lambda: self._root.after(0, lambda: self._on_action("stop")),
                "quit": lambda: self._root.after(0, self._quit),
            },
        )
        if not controller.start():
            return False
        self._tray = controller
        self._root.withdraw()
        return True

    def _restore_window(self) -> None:
        """Bring the window back from the tray."""
        self._stop_tray()
        self._root.deiconify()
        self._root.lift()
        self._refresh()

    def _stop_tray(self) -> None:
        if self._tray is not None:
            self._tray.stop()
            self._tray = None

    def _quit(self) -> None:
        """Close the launcher completely (tray icon removed if present)."""
        self._stop_tray()
        self._root.destroy()

    def run(self) -> None:
        self._root.mainloop()


def run_app(*, project: str = actions.DEFAULT_PROJECT) -> int:
    """Launch the persistent window. Returns 0 on normal close."""
    LauncherApp(project=project).run()
    return 0
