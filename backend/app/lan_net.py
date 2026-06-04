"""LAN networking helpers: own-IP detection and the startup QR banner.

LAN-MODE-PHASE-1 C4a. Kept separate from ``app.lan_auth`` (which owns the
PIN/session logic) so the auth state has no networking concerns and this
module stays trivially testable.

The QR encodes the access URL WITH the PIN as a ``?pin=`` query param so
scanning it on a phone lands on the PIN page pre-filled and auto-submits
(see ``render_pin_page`` in ``app.lan_auth``). The human-readable URL
shown alongside omits the PIN, so it can also be typed by hand.
"""

from __future__ import annotations

import io
import os
import socket

import segno

_DEFAULT_PORT = 8000


def lan_port() -> int:
    """The port LAN mode serves on (``BIBLIOGON_LAN_PORT``, default 8000)."""
    raw = os.getenv("BIBLIOGON_LAN_PORT", "").strip()
    if raw.isdigit():
        return int(raw)
    return _DEFAULT_PORT


def detect_lan_ip() -> str:
    """Best-effort primary LAN IPv4 of this host.

    Opens a UDP socket toward a public address and reads the local socket
    name; no packet is actually sent. Falls back to ``127.0.0.1`` when no
    route can be determined (offline host, unusual network stack).
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return str(sock.getsockname()[0])
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def access_url(ip: str, port: int, pin: str | None = None) -> str:
    """The phone-facing URL; include ``pin`` to make the QR auto-submit."""
    base = f"http://{ip}:{port}"
    return f"{base}/?pin={pin}" if pin else base


def _qr_terminal(data: str) -> str:
    """Render ``data`` as a compact terminal QR string."""
    buf = io.StringIO()
    segno.make(data, error="m").terminal(out=buf, compact=True)
    return buf.getvalue()


def qr_svg(data: str, scale: int = 5) -> bytes:
    """Render ``data`` as an SVG QR code (bytes), for serving to the UI."""
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="svg", scale=scale, border=2)
    return buf.getvalue()


def render_terminal_banner(pin: str, ip: str, port: int) -> str:
    """A multi-line startup banner: URLs, PIN, and a scannable QR code."""
    qr = _qr_terminal(access_url(ip, port, pin))
    lines = [
        "",
        "  Bibliogon LAN mode -- scan to connect a phone:",
        "",
        qr.rstrip("\n"),
        "",
        f"  URL : http://{ip}:{port}",
        f"  PIN : {pin}",
        "",
        "  (Scanning the QR fills the PIN automatically. Trusted networks only.)",
        "",
    ]
    return "\n".join(lines)
