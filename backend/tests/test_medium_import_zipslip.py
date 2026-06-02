"""Integration regression for QA finding M1 on the medium-import path.

f4b825fb routed the medium-import preview extraction through
``safe_extractall`` (Zip-Slip / CWE-22 guard) but shipped WITHOUT a
test that exercises the real endpoint with a malicious archive — a
gap surfaced by the v0.45.0 test-quality retrospective. ``safe_extractall``
itself is unit-tested in ``test_archive_safety.py``; this test proves
the wiring: a crafted ``..`` member uploaded to the real
``POST /api/medium-import/preview`` endpoint is rejected (HTTP 400) and
nothing escapes the extraction sandbox.

No mocks on the critical path: real TestClient, real route, real
extraction.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

_REPO_ROOT = next(
    p
    for p in Path(__file__).resolve().parents
    if (p / "plugins" / "bibliogon-plugin-medium-import").is_dir()
)
_FIXTURE = (
    _REPO_ROOT
    / "plugins"
    / "bibliogon-plugin-medium-import"
    / "tests"
    / "fixtures"
    / "01_oldest_tech.html"
)


def _malicious_zip() -> bytes:
    """A Medium-shaped archive carrying one Zip-Slip member."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("posts/01_oldest_tech.html", _FIXTURE.read_bytes())
        # The exploit: a parent-traversal member that, without the guard,
        # would be written outside the extraction directory.
        zf.writestr("../zipslip_probe.txt", b"pwned")
    return buf.getvalue()


def test_preview_rejects_zip_slip_archive() -> None:
    sentinel = _REPO_ROOT / "zipslip_probe.txt"
    if sentinel.exists():
        sentinel.unlink()
    with TestClient(app) as client:
        files = {"file": ("medium-export.zip", io.BytesIO(_malicious_zip()), "application/zip")}
        resp = client.post("/api/medium-import/preview", files=files)
    # ValidationError from safe_extractall maps to HTTP 400 via the global
    # exception handler. Pre-fix (raw extractall) this returned 200 and
    # wrote the probe outside the sandbox.
    assert resp.status_code == 400, f"expected 400, got {resp.status_code}: {resp.text[:200]}"
    assert "Traversal" in resp.text or "traversal" in resp.text.lower()
    # Nothing escaped the extraction sandbox.
    assert not sentinel.exists(), "Zip-Slip member escaped the extraction directory"
