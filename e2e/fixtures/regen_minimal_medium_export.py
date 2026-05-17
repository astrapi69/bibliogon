"""Regenerate e2e/fixtures/minimal-medium-export.zip.

Run from the repo root:
    python3 e2e/fixtures/regen_minimal_medium_export.py

The generated archive bundles 2 of the existing 4 medium-import
plugin HTML fixtures under ``posts/`` — enough rows for the v2
preview-smoke spec to exercise select/deselect behaviour, small
enough to keep the test fast. The plugin's full test suite already
covers the 4-file matrix; the smoke is a UI regression pin, not a
parser audit.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

FIXTURES = [
    "01_oldest_tech.html",
    "03_english_recent_with_code.html",
]


def _plugin_fixtures_dir() -> Path:
    here = Path(__file__).resolve()
    repo_root = here.parents[2]
    return (
        repo_root
        / "plugins"
        / "bibliogon-plugin-medium-import"
        / "tests"
        / "fixtures"
    )


def build() -> bytes:
    src = _plugin_fixtures_dir()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in FIXTURES:
            html = (src / name).read_bytes()
            zf.writestr(f"posts/{name}", html)
    return buf.getvalue()


def main() -> None:
    target = Path(__file__).parent / "minimal-medium-export.zip"
    target.write_bytes(build())
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
