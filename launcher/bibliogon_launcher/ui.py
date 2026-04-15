"""Tkinter UI helpers. Thin layer over tkinter.messagebox and a tiny status window.

Kept minimal on purpose: Tkinter ships with Python, so the PyInstaller
bundle stays small. UI code is NOT unit-tested; logic lives in the
other modules and UI is a thin render of their return values.
"""

from __future__ import annotations

import datetime
import locale
import threading
import tkinter as tk
import webbrowser
from tkinter import filedialog, messagebox, scrolledtext


# Minimal DE/EN strings baked into the launcher so the .exe does not
# need to ship the backend i18n YAML. Other locales fall back to EN
# until we wire up a fuller translation path.
_I18N: dict[str, dict[str, str]] = {
    "show_details": {"en": "Show details", "de": "Details anzeigen"},
    "hide_details": {"en": "Hide details", "de": "Details verbergen"},
    "save_log": {"en": "Save log to file...", "de": "Log in Datei speichern..."},
    "copy_clipboard": {"en": "Copy to clipboard", "de": "In Zwischenablage kopieren"},
    "copied": {"en": "Copied.", "de": "Kopiert."},
    "technical_details": {"en": "Technical details", "de": "Technische Details"},
    "help": {"en": "Help", "de": "Hilfe"},
    "save_default_filename": {
        "en": "bibliogon-launcher-error-{ts}.log",
        "de": "bibliogon-launcher-fehler-{ts}.log",
    },
}


def _current_lang() -> str:
    """Return ``"de"`` if the OS locale is German, else ``"en"``."""
    try:
        code, _ = locale.getlocale()
    except (TypeError, ValueError):
        code = None
    if code is None:
        try:
            code = locale.getdefaultlocale()[0]
        except (ValueError, IndexError, TypeError):
            code = None
    if code and code.lower().startswith("de"):
        return "de"
    return "en"


def _t(key: str) -> str:
    lang = _current_lang()
    bucket = _I18N.get(key, {})
    return bucket.get(lang) or bucket.get("en") or key


def error_box(title: str, message: str) -> None:
    _ensure_root()
    messagebox.showerror(title, message)


def info_box(title: str, message: str) -> None:
    _ensure_root()
    messagebox.showinfo(title, message)


def ask_retry_quit(title: str, message: str) -> bool:
    """Show Retry/Quit dialog. True for Retry, False for Quit."""
    _ensure_root()
    return messagebox.askretrycancel(title, message)


def ask_copyable_url(url: str) -> None:
    """Popup a small window showing a URL the user can copy/paste."""
    _ensure_root()
    win = tk.Toplevel()
    win.title("Bibliogon URL")
    tk.Label(win, text="Copy this URL and paste into your browser:").pack(padx=16, pady=(16, 4))
    entry = tk.Entry(win, width=40)
    entry.insert(0, url)
    entry.configure(state="readonly")
    entry.pack(padx=16, pady=4)
    tk.Button(win, text="OK", command=win.destroy).pack(padx=16, pady=(4, 16))
    win.grab_set()
    win.wait_window()


def pick_folder(title: str) -> str | None:
    """Show a folder picker. Returns the selected path or None if cancelled."""
    _ensure_root()
    result = filedialog.askdirectory(title=title, mustexist=True)
    return result or None


def error_dialog(
    title: str,
    message: str,
    *,
    actions: list[tuple[str, str]],
    details: str = "",
    help_url: str | None = None,
    initial_show_details: bool = False,
) -> str:
    """Error dialog with optional collapsible technical details.

    ``message`` is the user-friendly explanation and recommended action
    (kept free of internal file names, ports, raw stderr).

    ``details`` is the technical block revealed by the Show-details
    toggle. Supports multi-line text; includes Save-log and
    Copy-clipboard helpers when non-empty.

    ``actions`` is a list of ``(label, return_value)`` tuples. The first
    entry is the default (Enter-activated) button. The cancel-equivalent
    is always the last entry; Escape / window-X map to its
    ``return_value``.

    ``help_url`` adds a Help button that opens the URL in the default
    browser. Independent of the action buttons.

    ``initial_show_details`` defaults to False so end users see the
    plain-language view first. Set True via the launcher config to
    auto-expand for developers.
    """
    assert actions, "error_dialog requires at least one action"
    _ensure_root()
    dlg = _ErrorDialog(
        title=title,
        message=message,
        actions=actions,
        details=details,
        help_url=help_url,
        initial_show_details=initial_show_details,
    )
    return dlg.show()


class _ErrorDialog:
    """Internal impl of error_dialog. Separate class so the widget
    references can be captured by closures and the test surface is
    narrower (public callers only see ``error_dialog``).
    """

    PAD = 16

    def __init__(
        self,
        *,
        title: str,
        message: str,
        actions: list[tuple[str, str]],
        details: str,
        help_url: str | None,
        initial_show_details: bool,
    ) -> None:
        self._actions = actions
        self._details = details
        self._help_url = help_url
        self._result = actions[-1][1]  # default to cancel-equivalent
        self._details_visible = False

        self._win = tk.Toplevel()
        self._win.title(title)
        self._win.resizable(False, False)

        tk.Label(
            self._win,
            text=message,
            justify="left",
            wraplength=460,
            padx=self.PAD,
            pady=self.PAD,
        ).pack(fill="x")

        self._buttons_frame = tk.Frame(self._win)
        self._buttons_frame.pack(fill="x", padx=self.PAD, pady=(0, self.PAD))
        self._build_action_buttons()

        self._details_frame = tk.Frame(self._win)
        self._details_text: tk.Text | None = None
        if details:
            self._build_details_frame()
        if initial_show_details and details:
            self._toggle_details()

        self._win.bind("<Return>", lambda _e: self._handle_action(self._actions[0][1]))
        self._win.bind("<Escape>", lambda _e: self._handle_action(self._actions[-1][1]))
        self._win.protocol("WM_DELETE_WINDOW", lambda: self._handle_action(self._actions[-1][1]))
        _center_over_root(self._win)

    # --- Construction ---

    def _build_action_buttons(self) -> None:
        # Primary and secondary action buttons. Leftmost is the default.
        for index, (label, value) in enumerate(self._actions):
            width = 14 if index == 0 else 10
            tk.Button(
                self._buttons_frame,
                text=label,
                width=width,
                command=lambda v=value: self._handle_action(v),
            ).pack(side="left", padx=(0, 6))

        # Spacer pushes the auxiliary buttons to the right.
        tk.Frame(self._buttons_frame).pack(side="left", expand=True, fill="x")

        if self._help_url:
            tk.Button(
                self._buttons_frame,
                text=_t("help"),
                width=8,
                command=self._open_help,
            ).pack(side="left", padx=(0, 6))
        if self._details:
            self._toggle_button = tk.Button(
                self._buttons_frame,
                text=_t("show_details"),
                width=16,
                command=self._toggle_details,
            )
            self._toggle_button.pack(side="left")

    def _build_details_frame(self) -> None:
        tk.Label(
            self._details_frame,
            text=_t("technical_details"),
            anchor="w",
            font=("Segoe UI", 9, "bold"),
            padx=self.PAD,
        ).pack(fill="x", pady=(0, 4))

        text_widget = tk.Text(
            self._details_frame,
            height=10,
            width=70,
            wrap="none",
            font=("Consolas", 9),
            borderwidth=1,
            relief="solid",
        )
        text_widget.insert("1.0", self._details)
        text_widget.configure(state="disabled")
        text_widget.pack(fill="both", expand=True, padx=self.PAD)

        tools = tk.Frame(self._details_frame)
        tools.pack(fill="x", padx=self.PAD, pady=(6, self.PAD))
        tk.Button(tools, text=_t("save_log"), command=self._save_log).pack(side="left", padx=(0, 6))
        tk.Button(tools, text=_t("copy_clipboard"), command=self._copy_clipboard).pack(side="left")

        self._details_text = text_widget

    # --- Events ---

    def _toggle_details(self) -> None:
        if self._details_visible:
            self._details_frame.pack_forget()
            self._toggle_button.configure(text=_t("show_details"))
        else:
            self._details_frame.pack(fill="both", expand=True)
            self._toggle_button.configure(text=_t("hide_details"))
        self._details_visible = not self._details_visible
        self._win.update_idletasks()
        _center_over_root(self._win)

    def _open_help(self) -> None:
        if not self._help_url:
            return
        try:
            webbrowser.open(self._help_url)
        except OSError:
            pass

    def _save_log(self) -> None:
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        default_name = _t("save_default_filename").format(ts=ts)
        path = filedialog.asksaveasfilename(
            title=_t("save_log"),
            defaultextension=".log",
            initialfile=default_name,
            filetypes=[("Log files", "*.log"), ("All files", "*.*")],
        )
        if not path:
            return
        try:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(self._details)
        except OSError:
            messagebox.showerror(_t("save_log"), _t("save_log"))

    def _copy_clipboard(self) -> None:
        root = _ensure_root()
        try:
            root.clipboard_clear()
            root.clipboard_append(self._details)
            root.update()
        except tk.TclError:
            return
        # Transient confirmation via the window title so we do not spawn a
        # second modal for a one-click action.
        original = self._win.title()
        self._win.title(f"{original}  —  {_t('copied')}")
        self._win.after(1500, lambda: self._win.title(original))

    def _handle_action(self, value: str) -> None:
        self._result = value
        self._win.destroy()

    # --- Public ---

    def show(self) -> str:
        self._win.grab_set()
        self._win.wait_window()
        return self._result


def three_button_dialog(
    title: str,
    message: str,
    primary_label: str,
    secondary_label: str,
    cancel_label: str = "Cancel",
) -> str:
    """Show a message with three labeled buttons. Returns ``primary``,
    ``secondary``, or ``cancel`` depending on which button the user clicks.

    Closing the window via the X returns ``cancel``. The primary button
    is the default (Enter), the cancel button maps to Escape.
    """
    _ensure_root()
    win = tk.Toplevel()
    win.title(title)
    win.resizable(False, False)

    result = {"choice": "cancel"}

    label = tk.Label(win, text=message, justify="left", wraplength=420, padx=20, pady=16)
    label.pack()

    buttons = tk.Frame(win)
    buttons.pack(padx=20, pady=(0, 16))

    def _click(choice: str) -> None:
        result["choice"] = choice
        win.destroy()

    primary = tk.Button(buttons, text=primary_label, width=20, command=lambda: _click("primary"))
    primary.pack(side="left", padx=(0, 8))
    tk.Button(buttons, text=secondary_label, width=20, command=lambda: _click("secondary")).pack(side="left", padx=(0, 8))
    tk.Button(buttons, text=cancel_label, width=10, command=lambda: _click("cancel")).pack(side="left")

    primary.focus_set()
    win.bind("<Return>", lambda _e: _click("primary"))
    win.bind("<Escape>", lambda _e: _click("cancel"))
    win.protocol("WM_DELETE_WINDOW", lambda: _click("cancel"))

    _center_over_root(win)
    win.grab_set()
    win.wait_window()
    return result["choice"]


def _center_over_root(win: tk.Toplevel) -> None:
    win.update_idletasks()
    try:
        root = _root_singleton
        if root is None:
            return
        x = root.winfo_rootx() + (root.winfo_width() - win.winfo_width()) // 2
        y = root.winfo_rooty() + (root.winfo_height() - win.winfo_height()) // 2
        win.geometry(f"+{max(x, 0)}+{max(y, 0)}")
    except tk.TclError:
        pass


class StatusWindow:
    """A tiny window that shows current state and a Stop button.

    Usage:
        win = StatusWindow()
        win.set_starting()
        ...
        win.set_running(port, on_stop=callback)
        win.run_mainloop()  # blocks until stop
    """

    def __init__(self, on_close: callable | None = None) -> None:
        self._root = _ensure_root()
        self._root.title("Bibliogon")
        self._root.geometry("360x160")
        self._root.protocol("WM_DELETE_WINDOW", self._handle_close)

        self._label = tk.Label(self._root, text="Starting Bibliogon...", font=("Segoe UI", 11))
        self._label.pack(pady=(24, 12))

        self._detail = tk.Label(self._root, text="", font=("Segoe UI", 9), fg="#555")
        self._detail.pack(pady=(0, 12))

        self._button = tk.Button(self._root, text="", state="disabled", width=20)
        self._button.pack(pady=(0, 16))

        self._on_close_cb = on_close
        self._stop_cb: callable | None = None

    def set_starting(self, detail: str = "") -> None:
        self._label.configure(text="Starting Bibliogon...")
        self._detail.configure(text=detail)
        self._button.configure(text="", state="disabled")
        self._root.update_idletasks()

    def set_running(self, port: int, on_stop: callable) -> None:
        self._label.configure(text=f"Bibliogon is running on localhost:{port}")
        self._detail.configure(text="Browser opened. Close this window or click Stop to shut down.")
        self._stop_cb = on_stop
        self._button.configure(text="Stop Bibliogon", state="normal", command=self._handle_stop)
        self._root.update_idletasks()

    def set_stopping(self) -> None:
        self._label.configure(text="Stopping Bibliogon...")
        self._detail.configure(text="Waiting for docker compose down to finish.")
        self._button.configure(text="", state="disabled")
        self._root.update_idletasks()

    def close(self) -> None:
        try:
            self._root.destroy()
        except tk.TclError:
            pass

    def run_mainloop(self) -> None:
        self._root.mainloop()

    def after(self, delay_ms: int, callback: callable) -> None:
        self._root.after(delay_ms, callback)

    def run_in_background(self, target: callable, *args: object) -> threading.Thread:
        """Run ``target`` in a daemon thread so the Tk event loop stays responsive."""
        thread = threading.Thread(target=target, args=args, daemon=True)
        thread.start()
        return thread

    def _handle_stop(self) -> None:
        if self._stop_cb:
            self._stop_cb()

    def _handle_close(self) -> None:
        if self._on_close_cb:
            self._on_close_cb()
        else:
            self._root.destroy()


_root_singleton: tk.Tk | None = None


def _ensure_root() -> tk.Tk:
    """Lazily create the hidden root Tk instance used by all dialogs."""
    global _root_singleton
    if _root_singleton is None or not _is_root_alive(_root_singleton):
        _root_singleton = tk.Tk()
        _root_singleton.withdraw()
    return _root_singleton


def _is_root_alive(root: tk.Tk) -> bool:
    try:
        root.winfo_exists()
    except tk.TclError:
        return False
    return True
