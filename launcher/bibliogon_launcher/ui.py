"""Tkinter UI helpers. Thin layer over tkinter.messagebox and a tiny status window.

Kept minimal on purpose: Tkinter ships with Python, so the PyInstaller
bundle stays small. UI code is NOT unit-tested; logic lives in the
other modules and UI is a thin render of their return values.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import filedialog, messagebox


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
