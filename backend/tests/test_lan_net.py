"""Tests for LAN networking helpers (LAN-MODE-PHASE-1 C4a)."""

from __future__ import annotations

import ipaddress

import pytest

from app.lan_net import access_url, detect_lan_ip, lan_port, render_terminal_banner


def test_detect_lan_ip_returns_valid_ipv4() -> None:
    ip = detect_lan_ip()
    # Must always parse as an IPv4 address (real LAN IP or the fallback).
    ipaddress.IPv4Address(ip)


def test_lan_port_default_and_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BIBLIOGON_LAN_PORT", raising=False)
    assert lan_port() == 8000
    monkeypatch.setenv("BIBLIOGON_LAN_PORT", "9123")
    assert lan_port() == 9123
    monkeypatch.setenv("BIBLIOGON_LAN_PORT", "not-a-number")
    assert lan_port() == 8000  # non-numeric falls back to the default


def test_access_url_with_and_without_pin() -> None:
    assert access_url("192.168.1.5", 8000) == "http://192.168.1.5:8000"
    assert access_url("192.168.1.5", 8000, "424242") == "http://192.168.1.5:8000/?pin=424242"


def test_banner_contains_url_pin_and_qr() -> None:
    banner = render_terminal_banner("424242", "192.168.1.5", 8000)
    assert "http://192.168.1.5:8000" in banner
    assert "424242" in banner
    # segno's compact terminal output uses half-block glyphs for the QR.
    assert "▀" in banner or "▄" in banner or "█" in banner
    assert banner.count("\n") > 5  # multi-line block, not a one-liner
